import { afterEach, describe, expect, it } from "vitest";
import { createBridgeSocketServer } from "../src/backend/bridgeSocketServer";
import { connectClient, getFreePort, waitForFrame } from "./utils";

const servers: Array<{ stop(): Promise<void> }> = [];

afterEach(async () => {
  while (servers.length > 0) {
    await servers.pop()?.stop();
  }
});

describe("createBridgeSocketServer", () => {
  it("handshakes clients, broadcasts, and targets sends", async () => {
    const port = await getFreePort();
    const server = createBridgeSocketServer({ port });
    servers.push(server);
    const established: Array<{ clientId: string; role: string; name: string }> = [];
    server.on("connectionEstablished", (connection) => {
      established.push({
        clientId: connection.clientId,
        role: connection.role,
        name: connection.name,
      });
    });

    await server.start();

    const dashboard = await connectClient(port, {
      role: "react-query-dashboard",
      name: "Dashboard",
    });
    const device = await connectClient(port, {
      role: "react-query-device",
      name: "App",
      deviceId: "device-1",
    });

    expect(established).toEqual([
      { clientId: dashboard.clientId, role: "react-query-dashboard", name: "Dashboard" },
      { clientId: device.clientId, role: "react-query-device", name: "App" },
    ]);

    const dashboardBroadcast = waitForFrame(dashboard.socket);
    const deviceBroadcast = waitForFrame(device.socket);
    server.send("rntqdevtools.error", { message: "broadcast" });

    await expect(dashboardBroadcast).resolves.toEqual({
      type: "rntqdevtools.error",
      payload: { message: "broadcast" },
    });
    await expect(deviceBroadcast).resolves.toEqual({
      type: "rntqdevtools.error",
      payload: { message: "broadcast" },
    });

    let dashboardReceivedTarget = false;
    dashboard.socket.once("message", () => {
      dashboardReceivedTarget = true;
    });
    const deviceTarget = waitForFrame(device.socket);
    server.send("rntqdevtools.requestSnapshot", { targetDeviceId: "device-1", sessionId: "session-1" }, device.clientId);

    await expect(deviceTarget).resolves.toEqual({
      type: "rntqdevtools.requestSnapshot",
      payload: { targetDeviceId: "device-1", sessionId: "session-1" },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dashboardReceivedTarget).toBe(false);

    dashboard.socket.close();
    device.socket.close();
  });

  it("emits commands from ready clients and disconnects them cleanly", async () => {
    const port = await getFreePort();
    const server = createBridgeSocketServer({ port });
    servers.push(server);
    const commands: Array<{ clientId?: string; type: string; payload: unknown }> = [];
    const disconnects: string[] = [];
    server.on("command", (command) => {
      commands.push(command);
    });
    server.on("disconnect", (connection) => {
      disconnects.push(connection.clientId);
    });

    await server.start();

    const device = await connectClient(port, {
      role: "react-query-device",
      name: "App",
      deviceId: "device-1",
    });

    device.socket.send(
      JSON.stringify({
        type: "rntqdevtools.snapshot",
        payload: {
          protocolVersion: 1,
          deviceId: "device-1",
          deviceName: "App",
          tanstackQueryVersion: "5",
          timestamp: Date.now(),
          online: true,
          reason: "manual",
          queries: [],
          mutations: [],
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(commands).toEqual([
      {
        clientId: device.clientId,
        type: "rntqdevtools.snapshot",
        payload: expect.objectContaining({
          deviceId: "device-1",
          deviceName: "App",
        }),
      },
    ]);

    device.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(disconnects).toEqual([device.clientId]);
  });
});
