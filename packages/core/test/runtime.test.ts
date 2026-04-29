import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createBridgeRuntime, type BridgeRuntimeOptions } from "../src/runtime";
import type { BridgeFrame, BridgeSocketLike } from "../src/transport";

class FakeSocket implements BridgeSocketLike {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  sent: string[] = [];
  closed = false;

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }

  open() {
    this.onopen?.();
  }

  receive(frame: BridgeFrame) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

function createTestOptions(overrides: Partial<BridgeRuntimeOptions> = {}) {
  const sockets: FakeSocket[] = [];
  const callbacks = {
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onSocketOpen: vi.fn(),
    onSocketError: vi.fn(),
    onSocketClosed: vi.fn(),
    onConnectStart: vi.fn(),
    onConnectRequested: vi.fn(),
    onAwaitingConnectionRequest: vi.fn(),
    onConnectionTimeout: vi.fn(),
    onReconnectScheduled: vi.fn(),
    onCommand: vi.fn(),
  };

  const options: BridgeRuntimeOptions = {
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    host: "localhost",
    port: 9090,
    hello: { role: "react-query-device", name: "Test", deviceId: "d1" },
    ...callbacks,
    ...overrides,
  };

  return { options, sockets, callbacks };
}

function completeHandshake(socket: FakeSocket) {
  socket.open();
  socket.receive({ type: "rntqdevtools.ready", payload: { clientId: "c1" } });
}

describe("createBridgeRuntime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-connects by default", async () => {
    const { sockets, callbacks } = createTestOptions();
    createBridgeRuntime(callbacks as unknown as BridgeRuntimeOptions);

    // Must re-create with proper options through createTestOptions
    const t = createTestOptions();
    createBridgeRuntime(t.options);

    expect(t.sockets).toHaveLength(1);
    expect(t.callbacks.onConnectStart).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "auto", attempt: 1 }),
    );
  });

  it("does not connect when autoConnect is false", () => {
    const { options, sockets, callbacks } = createTestOptions({ autoConnect: false });
    createBridgeRuntime(options);

    expect(sockets).toHaveLength(0);
    expect(callbacks.onAwaitingConnectionRequest).toHaveBeenCalledOnce();
  });

  it("connects manually when autoConnect is false", () => {
    const { options, sockets, callbacks } = createTestOptions({ autoConnect: false });
    const runtime = createBridgeRuntime(options);

    runtime.connect();

    expect(sockets).toHaveLength(1);
    expect(callbacks.onConnectRequested).toHaveBeenCalledOnce();
    expect(callbacks.onConnectStart).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "manual", attempt: 1 }),
    );
  });

  it("fires onConnect after successful handshake", async () => {
    const { options, sockets, callbacks } = createTestOptions();
    createBridgeRuntime(options);

    completeHandshake(sockets[0]);
    await Promise.resolve();

    expect(callbacks.onConnect).toHaveBeenCalledOnce();
  });

  it("reports connected state after handshake", async () => {
    const { options, sockets } = createTestOptions();
    const runtime = createBridgeRuntime(options);

    expect(runtime.isConnected()).toBe(false);

    completeHandshake(sockets[0]);
    await Promise.resolve();

    expect(runtime.isConnected()).toBe(true);
  });

  it("forwards commands to onCommand", async () => {
    const { options, sockets, callbacks } = createTestOptions();
    createBridgeRuntime(options);

    completeHandshake(sockets[0]);
    await Promise.resolve();

    sockets[0].receive({
      type: "rntqdevtools.requestSnapshot",
      payload: { targetDeviceId: "d1" },
    });
    await Promise.resolve();

    expect(callbacks.onCommand).toHaveBeenCalledWith({
      type: "rntqdevtools.requestSnapshot",
      payload: { targetDeviceId: "d1" },
    });
  });

  it("schedules reconnect after socket close", async () => {
    const { options, sockets, callbacks } = createTestOptions({ reconnectDelayMs: 500 });
    createBridgeRuntime(options);

    completeHandshake(sockets[0]);
    await Promise.resolve();

    sockets[0].close();
    await Promise.resolve();

    expect(callbacks.onReconnectScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "socket_closed", delayMs: 500 }),
    );

    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(sockets).toHaveLength(2);
    expect(callbacks.onConnectStart).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "retry", attempt: 2 }),
    );
  });

  it("schedules reconnect after connect failure (no handshake)", async () => {
    const { options, sockets, callbacks } = createTestOptions({ reconnectDelayMs: 200 });
    createBridgeRuntime(options);

    // Close without ever completing handshake
    sockets[0].close();
    await Promise.resolve();

    expect(callbacks.onReconnectScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "connect_failed" }),
    );

    vi.advanceTimersByTime(200);
    await Promise.resolve();

    expect(sockets).toHaveLength(2);
  });

  it("does not reconnect after explicit disconnect()", async () => {
    const { options, sockets, callbacks } = createTestOptions({ reconnectDelayMs: 100 });
    const runtime = createBridgeRuntime(options);

    completeHandshake(sockets[0]);
    await Promise.resolve();

    runtime.disconnect();
    await Promise.resolve();

    vi.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(sockets).toHaveLength(1);
    expect(callbacks.onReconnectScheduled).not.toHaveBeenCalled();
  });

  it("fires handshake timeout when server does not respond", async () => {
    const { options, sockets, callbacks } = createTestOptions({ handshakeTimeoutMs: 300 });
    createBridgeRuntime(options);

    sockets[0].open();
    // Do NOT send ready frame

    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(callbacks.onConnectionTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "auto", attempt: 1 }),
    );
  });

  it("resets attempt counter on successful connection", async () => {
    const { options, sockets, callbacks } = createTestOptions({ reconnectDelayMs: 100 });
    createBridgeRuntime(options);

    // Fail first attempt
    sockets[0].close();
    await Promise.resolve();

    vi.advanceTimersByTime(100);
    await Promise.resolve();

    // Second attempt succeeds
    completeHandshake(sockets[1]);
    await Promise.resolve();

    // Disconnect and reconnect to check counter is reset
    sockets[1].close();
    await Promise.resolve();

    vi.advanceTimersByTime(100);
    await Promise.resolve();

    // The third socket's connect start should have attempt=1 (reset)
    const connectStarts = callbacks.onConnectStart.mock.calls.map(
      ([details]: [{ trigger: string; attempt: number }]) => details,
    );
    // auto:1, retry:2, retry:1 (reset after success)
    expect(connectStarts).toEqual([
      { trigger: "auto", attempt: 1 },
      { trigger: "retry", attempt: 2 },
      { trigger: "retry", attempt: 1 },
    ]);
  });

  it("ignores duplicate connect() calls while already connecting", () => {
    const { options, sockets } = createTestOptions();
    const runtime = createBridgeRuntime(options);

    runtime.connect();
    runtime.connect();

    expect(sockets).toHaveLength(1);
  });

  it("ignores connect() after disconnect()", () => {
    const { options, sockets } = createTestOptions({ autoConnect: false });
    const runtime = createBridgeRuntime(options);

    runtime.disconnect();
    runtime.connect();

    expect(sockets).toHaveLength(0);
  });

  it("sends messages through the underlying client", async () => {
    const { options, sockets } = createTestOptions();
    const runtime = createBridgeRuntime(options);

    completeHandshake(sockets[0]);
    await Promise.resolve();

    runtime.send("rntqdevtools.requestSnapshot", { targetDeviceId: "d1" } as never);

    const sent = sockets[0].sent.map((s) => JSON.parse(s));
    expect(sent).toContainEqual({
      type: "rntqdevtools.requestSnapshot",
      payload: { targetDeviceId: "d1" },
    });
  });
});
