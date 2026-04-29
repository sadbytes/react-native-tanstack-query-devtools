import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createLogger, type BridgeEnvelope, type DevtoolsSnapshot } from "react-native-tanstack-query-devtools-core";
import { createBridgeRegistry } from "../src/backend/createBridgeRegistry";

function createFakeBridge() {
  const emitter = new EventEmitter();
  const sentEnvelopes: Array<{ envelope: BridgeEnvelope; clientId?: string }> = [];
  const sentTyped: Array<{ type: string; payload: unknown; clientId?: string }> = [];

  return {
    on: (event: string, listener: (...args: any[]) => void) => emitter.on(event, listener),
    off: (event: string, listener: (...args: any[]) => void) => emitter.off(event, listener),
    sendEnvelope(envelope: BridgeEnvelope, clientId?: string) {
      sentEnvelopes.push({ envelope, clientId });
    },
    send(type: string, payload: unknown, clientId?: string) {
      sentTyped.push({ type, payload, clientId });
    },
    // Test helpers
    emitConnectionEstablished(connection: Record<string, unknown>) {
      emitter.emit("connectionEstablished", connection);
    },
    emitDisconnect(connection: Record<string, unknown>) {
      emitter.emit("disconnect", connection);
    },
    emitCommand(command: { clientId?: string; type: string; payload: unknown }) {
      emitter.emit("command", command);
    },
    sentEnvelopes,
    sentTyped,
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function createTestRegistry() {
  const bridge = createFakeBridge();
  const log = createLogger({ level: "none" });
  const onDevicesChanged = vi.fn();

  const registry = createBridgeRegistry({
    bridge: bridge as any,
    log,
    onDevicesChanged,
  });

  return { bridge, registry, onDevicesChanged };
}

function makeSnapshot(deviceId: string): DevtoolsSnapshot {
  return {
    protocolVersion: 1,
    deviceId,
    deviceName: "Test",
    tanstackQueryVersion: "5",
    timestamp: Date.now(),
    online: true,
    reason: "manual",
    queries: [{ queryHash: '["a"]', queryKey: ["a"], state: {} as any, observers: [] }],
    mutations: [],
  };
}

describe("createBridgeRegistry", () => {
  it("registers a device and broadcasts deviceList to dashboards", () => {
    const { bridge, onDevicesChanged } = createTestRegistry();

    // Connect a dashboard first
    bridge.emitConnectionEstablished({
      clientId: "dash-1",
      role: "react-query-dashboard",
      name: "Dashboard",
    });

    // Clear initial sends
    bridge.sentEnvelopes.length = 0;

    // Connect a device
    bridge.emitConnectionEstablished({
      clientId: "client-1",
      role: "react-query-device",
      name: "My App",
      deviceId: "device-1",
      platform: "ios",
    });

    // Should broadcast deviceList
    const deviceListEnvelopes = bridge.sentEnvelopes.filter(
      (s) => s.envelope.type === "rntqdevtools.deviceList",
    );
    expect(deviceListEnvelopes).toHaveLength(1);
    const payload = deviceListEnvelopes[0].envelope.payload;
    expect(payload).toEqual({
      devices: [
        expect.objectContaining({
          clientId: "client-1",
          deviceId: "device-1",
          deviceName: "My App",
          platform: "ios",
          sessionStatus: "active",
        }),
      ],
    });

    // Should notify callback
    expect(onDevicesChanged).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ deviceId: "device-1" }),
      ]),
    );
  });

  it("sends current device list when a dashboard connects", () => {
    const { bridge } = createTestRegistry();

    // Connect device first
    bridge.emitConnectionEstablished({
      clientId: "client-1",
      role: "react-query-device",
      name: "App",
      deviceId: "device-1",
    });
    bridge.sentEnvelopes.length = 0;

    // Now connect dashboard
    bridge.emitConnectionEstablished({
      clientId: "dash-1",
      role: "react-query-dashboard",
      name: "Dashboard",
    });

    const deviceListEnvelopes = bridge.sentEnvelopes.filter(
      (s) => s.envelope.type === "rntqdevtools.deviceList",
    );
    expect(deviceListEnvelopes).toHaveLength(1);
    const devices = (deviceListEnvelopes[0].envelope.payload as any).devices;
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceId).toBe("device-1");
  });

  it("removes device on disconnect and broadcasts updated list", () => {
    const { bridge, registry, onDevicesChanged } = createTestRegistry();

    bridge.emitConnectionEstablished({
      clientId: "dash-1",
      role: "react-query-dashboard",
      name: "Dashboard",
    });
    bridge.emitConnectionEstablished({
      clientId: "client-1",
      role: "react-query-device",
      name: "App",
      deviceId: "device-1",
    });

    bridge.sentEnvelopes.length = 0;
    onDevicesChanged.mockClear();

    bridge.emitDisconnect({ clientId: "client-1" });

    expect(registry.currentDevices()).toHaveLength(0);
    expect(onDevicesChanged).toHaveBeenCalledWith([]);

    const deviceListEnvelopes = bridge.sentEnvelopes.filter(
      (s) => s.envelope.type === "rntqdevtools.deviceList",
    );
    expect(deviceListEnvelopes).toHaveLength(1);
    expect((deviceListEnvelopes[0].envelope.payload as any).devices).toHaveLength(0);
  });

  it("forwards snapshots from devices to all dashboards", () => {
    const { bridge } = createTestRegistry();

    bridge.emitConnectionEstablished({
      clientId: "dash-1",
      role: "react-query-dashboard",
      name: "Dashboard",
    });
    bridge.emitConnectionEstablished({
      clientId: "client-1",
      role: "react-query-device",
      name: "App",
      deviceId: "device-1",
    });
    bridge.sentEnvelopes.length = 0;

    const snapshot = makeSnapshot("device-1");
    bridge.emitCommand({
      clientId: "client-1",
      type: "rntqdevtools.snapshot",
      payload: snapshot,
    });

    const snapshotEnvelopes = bridge.sentEnvelopes.filter(
      (s) => s.envelope.type === "rntqdevtools.snapshot",
    );
    expect(snapshotEnvelopes).toHaveLength(1);
    expect(snapshotEnvelopes[0].clientId).toBe("dash-1");
    expect((snapshotEnvelopes[0].envelope.payload as DevtoolsSnapshot).deviceId).toBe("device-1");
  });

  it("rejects snapshots from unknown devices", () => {
    const { bridge } = createTestRegistry();

    bridge.emitConnectionEstablished({
      clientId: "dash-1",
      role: "react-query-dashboard",
      name: "Dashboard",
    });
    bridge.sentEnvelopes.length = 0;

    bridge.emitCommand({
      clientId: "unknown-client",
      type: "rntqdevtools.snapshot",
      payload: makeSnapshot("unknown-device"),
    });

    const snapshotEnvelopes = bridge.sentEnvelopes.filter(
      (s) => s.envelope.type === "rntqdevtools.snapshot",
    );
    expect(snapshotEnvelopes).toHaveLength(0);
  });

  it("routes snapshot requests from dashboard to correct device", () => {
    const { bridge } = createTestRegistry();

    bridge.emitConnectionEstablished({
      clientId: "dash-1",
      role: "react-query-dashboard",
      name: "Dashboard",
    });
    bridge.emitConnectionEstablished({
      clientId: "client-1",
      role: "react-query-device",
      name: "App",
      deviceId: "device-1",
    });
    bridge.sentTyped.length = 0;

    bridge.emitCommand({
      clientId: "dash-1",
      type: "rntqdevtools.requestSnapshot",
      payload: { targetDeviceId: "device-1" },
    });

    expect(bridge.sentTyped).toEqual([
      {
        type: "rntqdevtools.requestSnapshot",
        payload: { targetDeviceId: "device-1" },
        clientId: "client-1",
      },
    ]);
  });

  it("sends error when snapshot is requested for unknown device", () => {
    const { bridge } = createTestRegistry();

    bridge.emitConnectionEstablished({
      clientId: "dash-1",
      role: "react-query-dashboard",
      name: "Dashboard",
    });
    bridge.sentTyped.length = 0;

    bridge.emitCommand({
      clientId: "dash-1",
      type: "rntqdevtools.requestSnapshot",
      payload: { targetDeviceId: "nonexistent" },
    });

    expect(bridge.sentTyped).toEqual([
      expect.objectContaining({
        type: "rntqdevtools.error",
        payload: expect.objectContaining({
          targetDeviceId: "nonexistent",
          message: expect.stringContaining("nonexistent"),
        }),
        clientId: "dash-1",
      }),
    ]);
  });

  it("routes actions from dashboard to correct device", () => {
    const { bridge } = createTestRegistry();

    bridge.emitConnectionEstablished({
      clientId: "dash-1",
      role: "react-query-dashboard",
      name: "Dashboard",
    });
    bridge.emitConnectionEstablished({
      clientId: "client-1",
      role: "react-query-device",
      name: "App",
      deviceId: "device-1",
    });
    bridge.sentTyped.length = 0;

    bridge.emitCommand({
      clientId: "dash-1",
      type: "rntqdevtools.action",
      payload: {
        targetDeviceId: "device-1",
        action: "clearQueryCache",
      },
    });

    expect(bridge.sentTyped).toEqual([
      {
        type: "rntqdevtools.action",
        payload: { targetDeviceId: "device-1", action: "clearQueryCache" },
        clientId: "client-1",
      },
    ]);
  });

  it("sends error when action targets unknown device", () => {
    const { bridge } = createTestRegistry();

    bridge.emitConnectionEstablished({
      clientId: "dash-1",
      role: "react-query-dashboard",
      name: "Dashboard",
    });
    bridge.sentTyped.length = 0;

    bridge.emitCommand({
      clientId: "dash-1",
      type: "rntqdevtools.action",
      payload: { targetDeviceId: "missing", action: "refetch" },
    });

    expect(bridge.sentTyped).toEqual([
      expect.objectContaining({
        type: "rntqdevtools.error",
        payload: expect.objectContaining({
          targetDeviceId: "missing",
          message: expect.stringContaining("missing"),
        }),
      }),
    ]);
  });

  it("forwards device errors to dashboards", () => {
    const { bridge } = createTestRegistry();

    bridge.emitConnectionEstablished({
      clientId: "dash-1",
      role: "react-query-dashboard",
      name: "Dashboard",
    });
    bridge.emitConnectionEstablished({
      clientId: "client-1",
      role: "react-query-device",
      name: "App",
      deviceId: "device-1",
    });
    bridge.sentEnvelopes.length = 0;

    bridge.emitCommand({
      clientId: "client-1",
      type: "rntqdevtools.error",
      payload: { targetDeviceId: "device-1", message: "Something broke" },
    });

    const errorEnvelopes = bridge.sentEnvelopes.filter(
      (s) => s.envelope.type === "rntqdevtools.error",
    );
    expect(errorEnvelopes).toHaveLength(1);
    expect(errorEnvelopes[0].envelope.payload).toEqual({
      targetDeviceId: "device-1",
      message: "Something broke",
    });
  });

  it("ignores commands from non-dashboard clients for routed commands", () => {
    const { bridge } = createTestRegistry();

    bridge.emitConnectionEstablished({
      clientId: "client-1",
      role: "react-query-device",
      name: "App",
      deviceId: "device-1",
    });
    bridge.sentTyped.length = 0;

    // A device sending a requestSnapshot — should be ignored (only dashboards can request)
    bridge.emitCommand({
      clientId: "rogue-client",
      type: "rntqdevtools.requestSnapshot",
      payload: { targetDeviceId: "device-1" },
    });

    expect(bridge.sentTyped).toHaveLength(0);
  });

  it("handles multiple devices and routes correctly", () => {
    const { bridge, registry } = createTestRegistry();

    bridge.emitConnectionEstablished({
      clientId: "dash-1",
      role: "react-query-dashboard",
      name: "Dashboard",
    });
    bridge.emitConnectionEstablished({
      clientId: "client-1",
      role: "react-query-device",
      name: "App A",
      deviceId: "device-a",
    });
    bridge.emitConnectionEstablished({
      clientId: "client-2",
      role: "react-query-device",
      name: "App B",
      deviceId: "device-b",
    });

    expect(registry.currentDevices()).toHaveLength(2);

    bridge.sentTyped.length = 0;

    bridge.emitCommand({
      clientId: "dash-1",
      type: "rntqdevtools.action",
      payload: { targetDeviceId: "device-b", action: "invalidate" },
    });

    expect(bridge.sentTyped).toEqual([
      expect.objectContaining({
        clientId: "client-2",
        payload: expect.objectContaining({ targetDeviceId: "device-b" }),
      }),
    ]);
  });

  it("dispose() cleans up listeners and clears state", () => {
    const { bridge, registry } = createTestRegistry();

    bridge.emitConnectionEstablished({
      clientId: "client-1",
      role: "react-query-device",
      name: "App",
      deviceId: "device-1",
    });

    expect(registry.currentDevices()).toHaveLength(1);

    registry.dispose();

    expect(registry.currentDevices()).toHaveLength(0);

    // Commands after dispose should not crash
    bridge.emitConnectionEstablished({
      clientId: "client-2",
      role: "react-query-device",
      name: "App 2",
      deviceId: "device-2",
    });
    // Since listeners were removed, the new device shouldn't be registered
    expect(registry.currentDevices()).toHaveLength(0);
  });

  it("handles dashboard disconnect without affecting devices", () => {
    const { bridge, registry } = createTestRegistry();

    bridge.emitConnectionEstablished({
      clientId: "dash-1",
      role: "react-query-dashboard",
      name: "Dashboard",
    });
    bridge.emitConnectionEstablished({
      clientId: "client-1",
      role: "react-query-device",
      name: "App",
      deviceId: "device-1",
    });

    bridge.emitDisconnect({ clientId: "dash-1" });

    expect(registry.currentDevices()).toHaveLength(1);
    expect(registry.currentDevices()[0].deviceId).toBe("device-1");
  });
});
