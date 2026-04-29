import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "react-native",
  () => ({
    Platform: {
      OS: "ios",
    },
  }),
);

import { connectReactQueryDevtools } from "../src/connectReactQueryDevtools";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: string[] = [];

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.();
  }

  open() {
    this.onopen?.();
  }

  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe("connectReactQueryDevtools", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalWebSocket) {
      vi.stubGlobal("WebSocket", originalWebSocket);
    }
  });

  it("auto-connects by default and streams snapshots after the websocket is ready", async () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const connection = connectReactQueryDevtools({
      queryClient: new QueryClient(),
      deviceId: "device-1",
      name: "Test App",
      host: "127.0.0.1",
      port: 9090,
      throttleMs: 0,
      logLevel: "debug",
      logger,
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket?.url).toBe("ws://127.0.0.1:9090");

    socket?.open();
    socket?.receive({
      type: "rntqdevtools.ready",
      payload: {
        clientId: "client-1",
      },
    });
    socket?.receive({
      type: "rntqdevtools.requestSnapshot",
      payload: {
        targetDeviceId: "device-1",
      },
    });
    socket?.receive({
      type: "rntqdevtools.action",
      payload: {
        targetDeviceId: "device-1",
        action: "clearQueryCache",
      },
    });
    await Promise.resolve();

    connection.disconnect();
    await Promise.resolve();

    // Logger is called with ("[rn-tq-devtools]", { event, ...fields })
    const events = logger.log.mock.calls.map(([, payload]) => payload.event);
    expect(events).toEqual(
      expect.arrayContaining([
        "bridge.initialized",
        "bridge.connect_started",
        "bridge.socket_open",
        "bridge.server_connected",
        "bridge.connected",
        "bridge.snapshot_sent",
        "bridge.snapshot_requested",
        "bridge.action_received",
        "bridge.action_applied",
        "bridge.disconnect_requested",
        "bridge.socket_closed",
        "bridge.disconnected",
        "bridge.server_disconnected",
      ]),
    );

    expect(socket?.sent.map((entry) => JSON.parse(entry))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "rntqdevtools.hello",
          payload: expect.objectContaining({
            platform: "ios",
          }),
        }),
        expect.objectContaining({
          type: "rntqdevtools.snapshot",
          payload: expect.objectContaining({
            deviceId: "device-1",
          }),
        }),
      ]),
    );
  });

  it("does not emit lifecycle logs when logs are disabled", async () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const connection = connectReactQueryDevtools({
      queryClient: new QueryClient(),
      deviceId: "device-1",
      name: "Test App",
      host: "127.0.0.1",
      port: 9090,
      throttleMs: 0,
      logger,
    });

    expect(FakeWebSocket.instances).toHaveLength(1);

    const socket = FakeWebSocket.instances[0];
    socket?.open();
    socket?.receive({
      type: "rntqdevtools.ready",
      payload: {
        clientId: "client-1",
      },
    });
    await Promise.resolve();

    connection.disconnect();
    await Promise.resolve();

    expect(logger.log).not.toHaveBeenCalled();
  });

  it("retries connection attempts until the websocket server is reachable", async () => {
    vi.useFakeTimers();

    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    connectReactQueryDevtools({
      queryClient: new QueryClient(),
      deviceId: "device-1",
      name: "Test App",
      host: "127.0.0.1",
      port: 9090,
      throttleMs: 0,
      logLevel: "debug",
      logger,
    });

    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0]?.close();
    await Promise.resolve();

    // Logger is called with ("[rn-tq-devtools]", { event, ...fields })
    expect(logger.log).toHaveBeenCalledWith(
      "[rn-tq-devtools]",
      expect.objectContaining({
        event: "bridge.reconnect_scheduled",
        socket_url: "ws://127.0.0.1:9090",
      }),
    );

    vi.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(logger.log).toHaveBeenCalledWith(
      "[rn-tq-devtools]",
      expect.objectContaining({
        event: "bridge.connect_started",
        trigger: "retry",
        attempt: 2,
      }),
    );
  });

  it("still supports manual connect when autoConnect is disabled", () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const connection = connectReactQueryDevtools({
      queryClient: new QueryClient(),
      deviceId: "device-1",
      name: "Test App",
      host: "127.0.0.1",
      port: 9090,
      throttleMs: 0,
      logLevel: "debug",
      logger,
      autoConnect: false,
    });

    expect(FakeWebSocket.instances).toHaveLength(0);
    // Logger is called with ("[rn-tq-devtools]", { event, ...fields })
    expect(logger.log).toHaveBeenCalledWith(
      "[rn-tq-devtools]",
      expect.objectContaining({
        event: "bridge.awaiting_connection_request",
        socket_url: "ws://127.0.0.1:9090",
      }),
    );

    connection.connect();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.url).toBe("ws://127.0.0.1:9090");
    expect(logger.log).toHaveBeenCalledWith(
      "[rn-tq-devtools]",
      expect.objectContaining({
        event: "bridge.connect_requested",
        socket_url: "ws://127.0.0.1:9090",
      }),
    );
  });
});
