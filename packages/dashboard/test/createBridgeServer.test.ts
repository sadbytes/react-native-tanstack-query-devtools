import { afterEach, describe, expect, it } from "vitest";
import { createBridgeServer } from "../src/backend/createBridgeServer";
import { connectClient, getFreePort, waitForFrame } from "./utils";

const servers: Array<{ stop(): Promise<void> }> = [];

afterEach(async () => {
  while (servers.length > 0) {
    await servers.pop()?.stop();
  }
});

describe("createBridgeServer", () => {
  it("registers connected apps and routes snapshot and action traffic without session handshakes", async () => {
    const port = await getFreePort();
    const wsPort = await getFreePort();
    const server = createBridgeServer({
      host: "127.0.0.1",
      port,
      wsPort,
      dashboard: { mode: "static" },
    });
    servers.push(server);

    await server.start();

    const dashboard = await connectClient(wsPort, {
      role: "react-query-dashboard",
      name: "Dashboard",
    });
    const device = await connectClient(wsPort, {
      role: "react-query-device",
      name: "App",
      deviceId: "device-1",
    });

    const deviceList = await waitForFrame(
      dashboard.socket,
      (frame) => frame.type === "rntqdevtools.deviceList" && frame.payload.devices.length === 1,
    );
    if (deviceList.type !== "rntqdevtools.deviceList") {
      throw new Error(`Expected device list, got ${deviceList.type}`);
    }

    expect(deviceList.payload.devices).toEqual([
      expect.objectContaining({
        deviceId: "device-1",
        deviceName: "App",
        sessionStatus: "active",
      }),
    ]);
    expect(server.getDevices()).toEqual([
      expect.objectContaining({
        deviceId: "device-1",
        sessionStatus: "active",
      }),
    ]);

    const dashboardSnapshot = waitForFrame(dashboard.socket, (frame) => frame.type === "rntqdevtools.snapshot");
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
          reason: "connect",
          queries: [],
          mutations: [],
        },
      }),
    );

    await expect(dashboardSnapshot).resolves.toEqual({
      type: "rntqdevtools.snapshot",
      payload: expect.objectContaining({
        deviceId: "device-1",
        deviceName: "App",
      }),
    });

    const deviceSnapshotRequest = waitForFrame(device.socket, (frame) => frame.type === "rntqdevtools.requestSnapshot");
    dashboard.socket.send(
      JSON.stringify({
        type: "rntqdevtools.requestSnapshot",
        payload: {
          targetDeviceId: "device-1",
        },
      }),
    );

    await expect(deviceSnapshotRequest).resolves.toEqual({
      type: "rntqdevtools.requestSnapshot",
      payload: {
        targetDeviceId: "device-1",
      },
    });

    const deviceAction = waitForFrame(device.socket, (frame) => frame.type === "rntqdevtools.action");
    dashboard.socket.send(
      JSON.stringify({
        type: "rntqdevtools.action",
        payload: {
          targetDeviceId: "device-1",
          action: "clearQueryCache",
        },
      }),
    );

    await expect(deviceAction).resolves.toEqual({
      type: "rntqdevtools.action",
      payload: {
        targetDeviceId: "device-1",
        action: "clearQueryCache",
      },
    });

    dashboard.socket.close();
    device.socket.close();
  });

  it("exposes iOS status and discovery endpoints", async () => {
    const port = await getFreePort();
    const wsPort = await getFreePort();
    const server = createBridgeServer({
      host: "127.0.0.1",
      port,
      wsPort,
      dashboard: { mode: "static" },
    });
    servers.push(server);

    await server.start();

    const statusResponse = await fetch(`http://127.0.0.1:${port}/api/ios/status`);
    expect(statusResponse.ok).toBe(true);
    const status = (await statusResponse.json()) as {
      enabled: boolean;
      supported: boolean;
      tooling: { supportsSimulatorDiscovery: boolean; supportsPhysicalDiscovery: boolean };
    };
    expect(status.enabled).toBe(true);
    expect(status.tooling).toEqual(
      expect.objectContaining({
        supportsSimulatorDiscovery: expect.any(Boolean),
        supportsPhysicalDiscovery: expect.any(Boolean),
      }),
    );

    const devicesResponse = await fetch(`http://127.0.0.1:${port}/api/ios/devices`);
    expect(devicesResponse.ok).toBe(true);
    const devicesPayload = (await devicesResponse.json()) as { devices: unknown[] };
    expect(Array.isArray(devicesPayload.devices)).toBe(true);

    const hintsResponse = await fetch(`http://127.0.0.1:${port}/api/ios/connection-hints`);
    expect(hintsResponse.ok).toBe(true);
    const hintsPayload = (await hintsResponse.json()) as { hints: unknown[] };
    expect(Array.isArray(hintsPayload.hints)).toBe(true);
  });
});
