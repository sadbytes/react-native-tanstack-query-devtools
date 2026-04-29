import { useEffect } from "react";
import {
  createBridgeRuntime,
  createLogger,
  PROTOCOL_VERSION,
  type DevtoolsSnapshot,
  type DevicePlatform,
  type LoggerOutput,
  type LogLevel,
} from "react-native-tanstack-query-devtools-core";
import { type QueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";
import { createQueryClientBridgeAdapter } from "./createQueryClientBridgeAdapter";
import { inferHost } from "./inferHost";

/**
 * Options for {@link connectReactQueryDevtools} and {@link ReactQueryDevtoolsBridge}.
 *
 * @example
 * ```ts
 * connectReactQueryDevtools({
 *   queryClient,
 *   name: "My App",
 *   host: "192.168.1.42",
 *   port: 9090,
 *   logLevel: "info",
 * });
 * ```
 */
export type ConnectReactQueryDevtoolsOptions = {
  /**
   * The `QueryClient` instance to observe and control from the remote devtools.
   *
   * The bridge subscribes to query and mutation cache changes on this client
   * and streams serialized snapshots to the dashboard. Actions sent from the
   * dashboard (refetch, invalidate, reset, etc.) are applied to this client.
   *
   * Must be a stable reference -- if the client changes, the bridge reconnects.
   */
  queryClient: QueryClient;

  /**
   * Whether the bridge is enabled. When `false`, all bridge functions are
   * no-ops and no WebSocket connection is established.
   *
   * @default process.env.NODE_ENV !== "production"
   */
  enabled?: boolean;

  /**
   * Log level for bridge events. Controls which events are logged.
   *
   * - `none`: No logging
   * - `error`: Only errors (connection failures, action failures)
   * - `info`: Errors + important lifecycle events (connect, disconnect)
   * - `debug`: Everything including snapshots, actions, and internal events
   *
   * @default "none"
   */
  logLevel?: LogLevel;

  /**
   * Connect to the dashboard bridge server immediately when the bridge is
   * created. When `false`, you must call `connection.connect()` manually.
   *
   * The bridge automatically retries if the server is not yet available,
   * so setting this to `true` is safe even if the dashboard starts later.
   *
   * @default true
   */
  autoConnect?: boolean;

  /**
   * Display name for this device/app shown in the dashboard's "Connected Apps"
   * panel. Helps distinguish between multiple running apps.
   *
   * @default "React Native" (or "App" if navigator.product is not ReactNative)
   */
  name?: string;

  /**
   * Stable identifier for this device. Used by the dashboard to track
   * devices across reconnections. If not provided, a random UUID-like
   * value is generated per bridge instance.
   *
   * Provide a fixed value if you want the dashboard to recognize the
   * same device after an app restart.
   *
   * @default crypto.randomUUID() or a random fallback
   */
  deviceId?: string;

  /**
   * Hostname or IP address of the dashboard bridge WebSocket server.
   *
   * For Android emulators, use `"10.0.2.2"` to reach the host machine,
   * or set up `adb reverse` and keep the default `"localhost"`.
   *
   * @default "localhost"
   */
  host?: string;

  /**
   * Port of the dashboard bridge WebSocket server.
   *
   * Must match the `--ws-port` option used when starting the dashboard CLI.
   *
   * @default 9090
   */
  port?: number;

  /**
   * Use `wss://` (TLS) instead of `ws://` for the WebSocket connection.
   *
   * Only needed if the dashboard bridge server is behind a TLS-terminating
   * proxy.
   *
   * @default false
   */
  secure?: boolean;

  /**
   * Minimum delay in milliseconds between snapshot sends triggered by
   * cache changes. Snapshots requested by the dashboard or sent on
   * connect bypass the throttle.
   *
   * Lower values give the dashboard more real-time updates but increase
   * WebSocket traffic. Higher values batch rapid cache changes.
   *
   * @default 100
   */
  throttleMs?: number;

  /**
   * Include the mutation cache in snapshots. When `false`, only the query
   * cache is serialized, reducing snapshot size.
   *
   * @default false
   */
  includeMutations?: boolean;

  /**
   * Custom output for log messages.
   *
   * Must implement `log` and `error` methods.
   *
   * @default console
   */
  logger?: LoggerOutput;
};

export type DevtoolsConnection = {
  connect(): void;
  disconnect(): void;
  sendSnapshot(reason?: DevtoolsSnapshot["reason"]): void;
  isConnected(): boolean;
};

const DEFAULT_PORT = 9090;
const DEFAULT_THROTTLE_MS = 100;
const SUPPORTED_PLATFORMS = new Set<DevicePlatform>(["android", "ios", "macos", "web", "windows"]);

function noop() {}

function resolveDefaultName() {
  const platform =
    typeof navigator !== "undefined" && navigator.product === "ReactNative"
      ? "React Native"
      : "App";
  return platform;
}

function resolvePlatform(): DevicePlatform | undefined {
  return SUPPORTED_PLATFORMS.has(Platform.OS as DevicePlatform) ? (Platform.OS as DevicePlatform) : undefined;
}

function resolveDeviceId(input?: string) {
  if (input) {
    return input;
  }

  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `rn-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Connects a React Query client to the remote React Native TanStack Query devtools bridge.
 *
 * Property-level docs and defaults are available on `ConnectReactQueryDevtoolsOptions`.
 *
 * @param options Bridge configuration.
 */
export function connectReactQueryDevtools(options: ConnectReactQueryDevtoolsOptions): DevtoolsConnection {
  const enabled = options.enabled ?? process.env.NODE_ENV !== "production";
  const logLevel = options.logLevel ?? "none";
  const deviceId = resolveDeviceId(options.deviceId);
  const deviceName = options.name ?? resolveDefaultName();
  const platform = resolvePlatform();
  const host = inferHost(options.host);
  const port = options.port ?? DEFAULT_PORT;
  const secure = options.secure ?? false;
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const autoConnect = options.autoConnect ?? true;
  const socketUrl = `${secure ? "wss" : "ws"}://${host}:${port}`;

  const log = createLogger({
    level: logLevel,
    output: options.logger,
  });

  if (!enabled) {
    log.log("bridge.disabled", {
      device_id: deviceId,
      device_name: deviceName,
    });
    return {
      connect: noop,
      disconnect: noop,
      sendSnapshot: noop,
      isConnected: () => false,
    };
  }

  log.log("bridge.initialized", {
    device_id: deviceId,
    device_name: deviceName,
    host,
    port,
    secure,
    socket_url: socketUrl,
    throttle_ms: throttleMs,
    include_mutations: options.includeMutations ?? false,
    auto_connect: autoConnect,
  });

  let connected = false;
  let destroyed = false;
  let adapter!: ReturnType<typeof createQueryClientBridgeAdapter>;

  const runtime = createBridgeRuntime({
    createSocket: (path) => new WebSocket(path),
    host,
    port,
    secure,
    autoConnect,
    hello: {
      role: "react-query-device",
      name: deviceName,
      deviceId,
      protocolVersion: PROTOCOL_VERSION,
      platform,
    },
    onSocketOpen() {
      log.log("bridge.socket_open", {
        device_id: deviceId,
        device_name: deviceName,
        host,
        port,
        secure,
        socket_url: socketUrl,
      });
    },
    onSocketError(error) {
      log.log("bridge.socket_error", {
        device_id: deviceId,
        device_name: deviceName,
        host,
        port,
        secure,
        socket_url: socketUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    },
    onSocketClosed({ wasConnected }) {
      connected = false;
      log.log("bridge.socket_closed", {
        device_id: deviceId,
        device_name: deviceName,
        host,
        port,
        secure,
        socket_url: socketUrl,
        was_connected: wasConnected,
      });

      if (wasConnected) {
        log.log("bridge.disconnected", {
          device_id: deviceId,
          device_name: deviceName,
          reason: "socket_closed",
        });
      }
    },
    onConnectionTimeout({ attempt, trigger }) {
      log.log("bridge.connection_timeout", {
        device_id: deviceId,
        device_name: deviceName,
        host,
        port,
        secure,
        socket_url: socketUrl,
        timeout_ms: 5000,
        attempt,
        trigger,
      });
    },
    onReconnectScheduled({ delayMs, reason }) {
      log.log("bridge.reconnect_scheduled", {
        device_id: deviceId,
        device_name: deviceName,
        host,
        port,
        secure,
        socket_url: socketUrl,
        reason,
        delay_ms: delayMs,
      });
    },
    onCommand(command) {
      adapter.handleCommand(command);
    },
    onConnect() {
      connected = true;
      log.log("bridge.server_connected", {
        device_id: deviceId,
        device_name: deviceName,
        host,
        port,
        secure,
        socket_url: socketUrl,
      });
      log.log("bridge.connected", {
        device_id: deviceId,
        device_name: deviceName,
        host,
        port,
        secure,
        socket_url: socketUrl,
      });
      adapter.sendSnapshot("connect");
    },
    onDisconnect() {
      connected = false;
      log.log("bridge.server_disconnected", {
        device_id: deviceId,
        device_name: deviceName,
      });
    },
    onConnectStart({ attempt, trigger }) {
      log.log("bridge.connect_started", {
        device_id: deviceId,
        device_name: deviceName,
        host,
        port,
        secure,
        socket_url: socketUrl,
        trigger,
        attempt,
      });
    },
    onConnectRequested() {
      log.log("bridge.connect_requested", {
        device_id: deviceId,
        device_name: deviceName,
        host,
        port,
        secure,
        socket_url: socketUrl,
      });
    },
    onAwaitingConnectionRequest() {
      log.log("bridge.awaiting_connection_request", {
        device_id: deviceId,
        device_name: deviceName,
        host,
        port,
        secure,
        socket_url: socketUrl,
      });
    },
  });

  adapter = createQueryClientBridgeAdapter({
    queryClient: options.queryClient,
    deviceId,
    deviceName,
    includeMutations: options.includeMutations,
    throttleMs,
    log,
    send(type, payload) {
      runtime.send(type as never, payload as never);
    },
    isConnected() {
      return runtime.isConnected();
    },
  });

  return {
    connect() {
      if (destroyed) {
        return;
      }

      runtime.connect();
    },
    disconnect() {
      destroyed = true;
      log.log("bridge.disconnect_requested", {
        device_id: deviceId,
        device_name: deviceName,
        host,
        port,
        secure,
        socket_url: socketUrl,
      });
      adapter.dispose();
      runtime.disconnect();
    },
    sendSnapshot(reason = "manual") {
      adapter.sendSnapshot(reason);
    },
    isConnected() {
      return connected;
    },
  };
}

/**
 * React component wrapper around `connectReactQueryDevtools`.
 *
 * Property-level docs and defaults are available on `ConnectReactQueryDevtoolsOptions`.
 *
 * @param props Bridge configuration.
 */
export function ReactQueryDevtoolsBridge(props: ConnectReactQueryDevtoolsOptions) {
  useEffect(() => {
    const connection = connectReactQueryDevtools(props);
    return () => {
      connection.disconnect();
    };
  }, [
    props.autoConnect,
    props.enabled,
    props.host,
    props.includeMutations,
    props.logLevel,
    props.logger,
    props.name,
    props.port,
    props.queryClient,
    props.deviceId,
    props.secure,
    props.throttleMs,
  ]);

  return null;
}
