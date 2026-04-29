import type { BridgeEnvelope, DevicePlatform, DeviceSessionStatus, DeviceSummary, DevtoolsActionPayload, DevtoolsLogger, DevtoolsSnapshot } from "react-native-tanstack-query-devtools-core";
import { createBridgeSocketServer } from "./bridgeSocketServer";

type BridgeSocketServer = ReturnType<typeof createBridgeSocketServer>;

type ConnectionRecord = {
  clientId: string;
  deviceId: string;
  deviceName: string;
  platform?: DevicePlatform;
  connectedAt: number;
  lastSeenAt: number;
  sessionStatus: DeviceSessionStatus;
};

type BridgeConnectionEvent = Record<string, unknown>;
type BridgeCommandEvent = {
  clientId?: string;
  type: string;
  payload: unknown;
};

type CreateBridgeRegistryOptions = {
  bridge: BridgeSocketServer;
  log: DevtoolsLogger;
  onDevicesChanged?: (devices: DeviceSummary[]) => void;
};

const VALID_PLATFORMS = new Set<DevicePlatform>(["android", "ios", "macos", "web", "windows"]);

function toDevicePlatform(value: unknown): DevicePlatform | undefined {
  if (typeof value === "string" && VALID_PLATFORMS.has(value as DevicePlatform)) {
    return value as DevicePlatform;
  }
  return undefined;
}

export function createBridgeRegistry(options: CreateBridgeRegistryOptions) {
  const devices = new Map<string, ConnectionRecord>();
  const dashboards = new Map<string, { clientId: string }>();
  const snapshots = new Map<string, DevtoolsSnapshot>();

  function currentDevices(): DeviceSummary[] {
    return [...devices.values()].map((device) => ({
      clientId: device.clientId,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      platform: device.platform,
      connectedAt: device.connectedAt,
      lastSeenAt: device.lastSeenAt,
      sessionStatus: device.sessionStatus,
    }));
  }

  function sendToDashboards(envelope: BridgeEnvelope) {
    for (const dashboard of dashboards.values()) {
      options.bridge.sendEnvelope(envelope, dashboard.clientId);
    }
  }

  function sendError(message: string, targetDeviceId?: string, dashboardClientId?: string, sessionId?: string) {
    options.log.error("bridge.error_sent", {
      target_device_id: targetDeviceId,
      dashboard_client_id: dashboardClientId,
      session_id: sessionId,
      error: message,
    });
    if (dashboardClientId) {
      options.bridge.send("rntqdevtools.error", { targetDeviceId, sessionId, message }, dashboardClientId);
      return;
    }
    sendToDashboards({ type: "rntqdevtools.error", payload: { targetDeviceId, sessionId, message } });
  }

  function sendDeviceList() {
    const nextDevices = currentDevices();
    options.onDevicesChanged?.(nextDevices);
    sendToDashboards({ type: "rntqdevtools.deviceList", payload: { devices: nextDevices } });
  }

  function handleConnectionEstablished(connection: BridgeConnectionEvent) {
    const role = connection.role;
    const clientId = String(connection.clientId ?? "");

    if (role === "react-query-dashboard") {
      dashboards.set(clientId, { clientId });
      options.log.log("bridge.dashboard_connected", {
        client_id: clientId,
        remote_address: typeof connection.address === "string" ? connection.address : undefined,
        remote_port: typeof connection.port === "number" ? connection.port : undefined,
        dashboard_count: dashboards.size,
        device_count: devices.size,
      });
      sendDeviceList();
      return;
    }

    if (role !== "react-query-device") {
      options.log.log("bridge.unknown_client_ignored", { client_id: clientId, role });
      return;
    }

    const deviceId = String(connection.deviceId ?? clientId);
    const platform = toDevicePlatform(connection.platform);
    devices.set(deviceId, {
      clientId,
      deviceId,
      deviceName: String(connection.name ?? "React Native App"),
      platform,
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      sessionStatus: "active",
    });
    options.log.log("bridge.device_connected", {
      client_id: clientId,
      device_id: deviceId,
      device_name: String(connection.name ?? "React Native App"),
      platform,
      remote_address: typeof connection.address === "string" ? connection.address : undefined,
      remote_port: typeof connection.port === "number" ? connection.port : undefined,
      device_count: devices.size,
    });
    sendDeviceList();
  }

  function handleDisconnect(connection: BridgeConnectionEvent) {
    const clientId = String(connection.clientId ?? "");

    for (const [deviceId, device] of devices.entries()) {
      if (device.clientId === clientId) {
        devices.delete(deviceId);
        snapshots.delete(deviceId);
        options.log.log("bridge.device_disconnected", {
          client_id: clientId,
          device_id: deviceId,
          remote_address: typeof connection.address === "string" ? connection.address : undefined,
          remote_port: typeof connection.port === "number" ? connection.port : undefined,
          device_count: devices.size,
        });
      }
    }

    if (dashboards.delete(clientId)) {
      options.log.log("bridge.dashboard_disconnected", {
        client_id: clientId,
        remote_address: typeof connection.address === "string" ? connection.address : undefined,
        remote_port: typeof connection.port === "number" ? connection.port : undefined,
        dashboard_count: dashboards.size,
      });
    }

    sendDeviceList();
  }

  function handleCommand(command: BridgeCommandEvent) {
    if (command.type === "rntqdevtools.snapshot") {
      const snapshot = command.payload as DevtoolsSnapshot;
      const device = devices.get(snapshot.deviceId);
      if (!device || device.clientId !== command.clientId) {
        options.log.log("bridge.snapshot_rejected_unknown_device", {
          client_id: command.clientId,
          device_id: snapshot.deviceId,
        });
        return;
      }

      snapshots.set(snapshot.deviceId, snapshot);
      const now = Date.now();
      const shouldBroadcastDeviceList = now - device.lastSeenAt >= 1000;
      device.lastSeenAt = now;
      if (shouldBroadcastDeviceList) {
        sendDeviceList();
      }
      options.log.log("bridge.snapshot_received", {
        client_id: command.clientId,
        device_id: snapshot.deviceId,
        query_count: snapshot.queries.length,
        mutation_count: snapshot.mutations.length,
      });
      sendToDashboards({ type: "rntqdevtools.snapshot", payload: snapshot });
      return;
    }

    if (command.type === "rntqdevtools.requestSnapshot") {
      const payload = command.payload as Extract<BridgeEnvelope, { type: "rntqdevtools.requestSnapshot" }>["payload"];
      const dashboardClientId = String(command.clientId ?? "");
      if (!dashboards.has(dashboardClientId)) {
        return;
      }

      const device = devices.get(payload.targetDeviceId);
      if (!device) {
        sendError(`No connected device found for ${payload.targetDeviceId}`, payload.targetDeviceId, dashboardClientId, payload.sessionId);
        return;
      }

      options.log.log("bridge.snapshot_request_routed", {
        dashboard_client_id: dashboardClientId,
        target_device_id: payload.targetDeviceId,
        target_client_id: device.clientId,
      });
      options.bridge.send("rntqdevtools.requestSnapshot", payload, device.clientId);
      return;
    }

    if (command.type === "rntqdevtools.action") {
      const payload = command.payload as DevtoolsActionPayload;
      const dashboardClientId = String(command.clientId ?? "");
      if (!dashboards.has(dashboardClientId)) {
        return;
      }

      const device = devices.get(payload.targetDeviceId);
      if (!device) {
        sendError(`No connected device found for ${payload.targetDeviceId}`, payload.targetDeviceId, dashboardClientId, payload.sessionId);
        return;
      }

      options.log.log("bridge.action_routed", {
        dashboard_client_id: dashboardClientId,
        target_device_id: payload.targetDeviceId,
        target_client_id: device.clientId,
        action: payload.action,
      });
      options.bridge.send("rntqdevtools.action", payload, device.clientId);
      return;
    }

    if (command.type === "rntqdevtools.error") {
      const payload = command.payload as Extract<BridgeEnvelope, { type: "rntqdevtools.error" }>["payload"];
      options.log.error("bridge.device_error_forwarded", {
        client_id: command.clientId,
        target_device_id: payload.targetDeviceId,
      });
      sendToDashboards({ type: "rntqdevtools.error", payload });
    }
  }

  options.bridge.on("connectionEstablished", handleConnectionEstablished);
  options.bridge.on("disconnect", handleDisconnect);
  options.bridge.on("command", handleCommand);

  return {
    currentDevices,
    dispose() {
      options.bridge.off("connectionEstablished", handleConnectionEstablished);
      options.bridge.off("disconnect", handleDisconnect);
      options.bridge.off("command", handleCommand);
      devices.clear();
      dashboards.clear();
      snapshots.clear();
    },
  };
}
