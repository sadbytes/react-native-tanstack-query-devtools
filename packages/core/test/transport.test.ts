import { describe, expect, it, vi } from "vitest";
import { createBridgeClient, type BridgeFrame, type BridgeSocketLike } from "../src";

class FakeSocket implements BridgeSocketLike {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.();
  }

  open() {
    this.onopen?.();
  }

  receive(frame: BridgeFrame) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

describe("createBridgeClient", () => {
  it("builds the secure websocket url and sends hello on open", () => {
    const socket = new FakeSocket();
    const createSocket = vi.fn(() => socket);
    const client = createBridgeClient({
      createSocket,
      host: "bridge.local",
      port: 9393,
      secure: true,
      hello: {
        role: "react-query-dashboard",
        name: "Dashboard",
      },
    });

    client.connect();
    socket.open();

    expect(createSocket).toHaveBeenCalledWith("wss://bridge.local:9393");
    expect(socket.sent).toEqual([
      JSON.stringify({
        type: "rntqdevtools.hello",
        payload: {
          role: "react-query-dashboard",
          name: "Dashboard",
        },
      }),
    ]);
  });

  it("queues messages until the ready frame arrives", async () => {
    const socket = new FakeSocket();
    const onConnect = vi.fn();
    const client = createBridgeClient({
      createSocket: () => socket,
      host: "localhost",
      port: 9090,
      hello: {
        role: "react-query-device",
        name: "App",
        deviceId: "device-1",
      },
      onConnect,
    });

    client.connect();
    socket.open();
    client.send("rntqdevtools.requestSnapshot", { targetDeviceId: "device-1", sessionId: "session-1" });

    expect(socket.sent).toHaveLength(1);

    socket.receive({
      type: "rntqdevtools.ready",
      payload: { clientId: "client-1" },
    });

    await Promise.resolve();

    expect(onConnect).toHaveBeenCalledOnce();
    expect(socket.sent[1]).toBe(
      JSON.stringify({
        type: "rntqdevtools.requestSnapshot",
        payload: { targetDeviceId: "device-1", sessionId: "session-1" },
      }),
    );
    expect(client.isConnected()).toBe(true);
  });

  it("forwards incoming project frames and reports disconnects", async () => {
    const socket = new FakeSocket();
    const onMessage = vi.fn();
    const onDisconnect = vi.fn();
    const onSocketOpen = vi.fn();
    const onSocketClose = vi.fn();
    const onSocketError = vi.fn();
    const client = createBridgeClient({
      createSocket: () => socket,
      host: "localhost",
      port: 9090,
      hello: {
        role: "react-query-dashboard",
        name: "Dashboard",
      },
      onMessage,
      onSocketOpen,
      onSocketClose,
      onSocketError,
      onDisconnect,
    });

    client.connect();
    socket.open();
    expect(onSocketOpen).toHaveBeenCalledOnce();
    socket.receive({
      type: "rntqdevtools.ready",
      payload: { clientId: "client-1" },
    });
    await Promise.resolve();

    socket.receive({
      type: "rntqdevtools.deviceList",
      payload: {
        devices: [],
      },
    });

    expect(onMessage).toHaveBeenCalledWith({
      type: "rntqdevtools.deviceList",
      payload: { devices: [] },
    });

    socket.close();
    await Promise.resolve();

    expect(onSocketClose).toHaveBeenCalledWith({ wasConnected: true });
    expect(onSocketError).not.toHaveBeenCalled();
    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(client.isConnected()).toBe(false);
  });
});
