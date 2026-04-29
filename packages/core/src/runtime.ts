import { createBridgeClient, type BridgeClient, type BridgeClientOptions } from "./transport";
import type { BridgeEnvelope } from "./types";

type MaybePromise<T> = T | Promise<T>;

export type BridgeRuntimeTrigger = "auto" | "manual" | "retry";

export type BridgeRuntimeOptions = Pick<
  BridgeClientOptions,
  "createSocket" | "hello" | "host" | "port" | "secure" | "logger"
> & {
  autoConnect?: boolean;
  handshakeTimeoutMs?: number;
  reconnectDelayMs?: number;
  onCommand?(frame: BridgeEnvelope): MaybePromise<void>;
  onSocketOpen?(): MaybePromise<void>;
  onSocketError?(error: unknown): MaybePromise<void>;
  onSocketClosed?(details: { wasConnected: boolean }): MaybePromise<void>;
  onConnect?(): MaybePromise<void>;
  onDisconnect?(): MaybePromise<void>;
  onConnectStart?(details: { trigger: BridgeRuntimeTrigger; attempt: number }): MaybePromise<void>;
  onConnectRequested?(): MaybePromise<void>;
  onAwaitingConnectionRequest?(): MaybePromise<void>;
  onConnectionTimeout?(details: { trigger: BridgeRuntimeTrigger; attempt: number }): MaybePromise<void>;
  onReconnectScheduled?(details: { reason: string; delayMs: number }): MaybePromise<void>;
};

export type BridgeRuntime = Pick<BridgeClient, "isConnected" | "send"> & {
  connect(): void;
  disconnect(): void;
};

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5000;
const DEFAULT_RECONNECT_DELAY_MS = 1000;

export function createBridgeRuntime(options: BridgeRuntimeOptions): BridgeRuntime {
  const autoConnect = options.autoConnect ?? true;
  const handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
  const reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;

  let connecting = false;
  let connectAttempt = 0;
  let destroyed = false;
  let handshakeTimeout: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

  function clearHandshakeTimeout() {
    clearTimeout(handshakeTimeout);
    handshakeTimeout = undefined;
  }

  function clearReconnectTimeout() {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = undefined;
  }

  function scheduleHandshakeTimeout(trigger: BridgeRuntimeTrigger, client: BridgeClient) {
    clearHandshakeTimeout();
    handshakeTimeout = setTimeout(() => {
      if (destroyed || client.isConnected()) {
        return;
      }

      void options.onConnectionTimeout?.({
        trigger,
        attempt: connectAttempt,
      });
      client.close();
    }, handshakeTimeoutMs);
  }

  function scheduleReconnect(reason: string) {
    if (destroyed || reconnectTimeout) {
      return;
    }

    void options.onReconnectScheduled?.({
      reason,
      delayMs: reconnectDelayMs,
    });

    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = undefined;
      startClient("retry");
    }, reconnectDelayMs);
  }

  const client = createBridgeClient({
    createSocket: options.createSocket,
    host: options.host,
    port: options.port,
    secure: options.secure,
    hello: options.hello,
    logger: options.logger,
    onSocketOpen() {
      return options.onSocketOpen?.();
    },
    onSocketError(error) {
      return options.onSocketError?.(error);
    },
    onSocketClose({ wasConnected }) {
      clearHandshakeTimeout();
      connecting = false;
      void options.onSocketClosed?.({ wasConnected });
      if (!destroyed) {
        scheduleReconnect(wasConnected ? "socket_closed" : "connect_failed");
      }
    },
    onMessage(frame) {
      return options.onCommand?.(frame);
    },
    onConnect() {
      clearHandshakeTimeout();
      clearReconnectTimeout();
      connecting = false;
      connectAttempt = 0;
      return options.onConnect?.();
    },
    onDisconnect() {
      clearHandshakeTimeout();
      connecting = false;
      return options.onDisconnect?.();
    },
  });

  function startClient(trigger: BridgeRuntimeTrigger) {
    if (destroyed || connecting || client.isConnected()) {
      return;
    }

    clearReconnectTimeout();
    connectAttempt += 1;
    connecting = true;
    void options.onConnectStart?.({
      trigger,
      attempt: connectAttempt,
    });
    scheduleHandshakeTimeout(trigger, client);
    client.connect();
  }

  if (autoConnect) {
    startClient("auto");
  } else {
    void options.onAwaitingConnectionRequest?.();
  }

  return {
    connect() {
      if (destroyed) {
        return;
      }

      void options.onConnectRequested?.();
      startClient("manual");
    },
    disconnect() {
      destroyed = true;
      clearHandshakeTimeout();
      clearReconnectTimeout();
      client.close();
    },
    send(type, payload) {
      client.send(type as never, payload as never);
    },
    isConnected() {
      return client.isConnected();
    },
  };
}
