import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createBridgeClient,
  type DeviceSummary,
  type DevtoolsActionPayload,
  type DevtoolsSnapshot,
} from "react-native-tanstack-query-devtools-core";
import { logDashboardEvent } from "../lib/logger";

type DashboardConfig = {
  wsHost: string;
  wsPort: number;
  wsSecure: boolean;
};

type DashboardState = {
  connected: boolean;
  devices: DeviceSummary[];
  latestSnapshot: DevtoolsSnapshot | null;
  latestSnapshotReceivedAt: number;
  lastError: string | null;
  requestSnapshot(deviceId: string): void;
  sendAction(payload: Omit<DevtoolsActionPayload, "sessionId">): void;
};

export function useBridgeDashboard(config: DashboardConfig | null): DashboardState {
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<DevtoolsSnapshot | null>(null);
  const [latestSnapshotReceivedAt, setLatestSnapshotReceivedAt] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  const client = useMemo(() => {
    if (!config) {
      return null;
    }

    logDashboardEvent("bridge.client_configured", {
      ws_host: config.wsHost,
      ws_port: config.wsPort,
      ws_secure: config.wsSecure,
    });

    return createBridgeClient({
      createSocket: (path) => new WebSocket(path),
      host: config.wsHost,
      port: config.wsPort,
      secure: config.wsSecure,
      hello: {
        role: "react-query-dashboard",
        name: "React Query Dashboard",
      },
      onConnect() {
        setConnected(true);
        logDashboardEvent("bridge.server_connected");
      },
      onDisconnect() {
        setConnected(false);
        logDashboardEvent("bridge.server_disconnected");
      },
      onMessage(command) {
        if (command.type === "rntqdevtools.deviceList") {
          setDevices(command.payload.devices);
          logDashboardEvent("bridge.device_list_received", { device_count: command.payload.devices.length });
        }

        if (command.type === "rntqdevtools.snapshot") {
          setLatestSnapshot(command.payload);
          setLatestSnapshotReceivedAt(Date.now());
          setLastError(null);
          logDashboardEvent("bridge.snapshot_received", {
            device_id: command.payload.deviceId,
            session_id: command.payload.sessionId,
            query_count: command.payload.queries.length,
            mutation_count: command.payload.mutations.length,
          });
        }

        if (command.type === "rntqdevtools.error") {
          setLastError(command.payload.message);
          logDashboardEvent("bridge.error_received", { error: command.payload.message }, "error");
        }
      },
    });
  }, [config]);

  useEffect(() => {
    if (!client) {
      return;
    }

    logDashboardEvent("bridge.connect_started");
    client.connect();
    return () => {
      logDashboardEvent("bridge.client_closing");
      client.close();
    };
  }, [client]);

  const requestSnapshot = useCallback(
    (deviceId: string) => {
      if (!client) {
        logDashboardEvent("bridge.snapshot_request_skipped_no_client", { device_id: deviceId }, "error");
        return;
      }
      logDashboardEvent("bridge.snapshot_request_sent", { device_id: deviceId });
      client.send("rntqdevtools.requestSnapshot", {
        targetDeviceId: deviceId,
      });
    },
    [client],
  );

  const sendAction = useCallback(
    (payload: Omit<DevtoolsActionPayload, "sessionId">) => {
      if (!client) {
        logDashboardEvent("bridge.action_skipped_no_client", { action: payload.action }, "error");
        return;
      }

      logDashboardEvent("bridge.action_sent", {
        device_id: payload.targetDeviceId,
        action: payload.action,
        query_hash: "queryHash" in payload ? payload.queryHash : undefined,
      });
      client.send("rntqdevtools.action", payload);
    },
    [client],
  );

  return useMemo(
    () => ({
      connected,
      devices,
      latestSnapshot,
      latestSnapshotReceivedAt,
      lastError,
      requestSnapshot,
      sendAction,
    }),
    [connected, devices, lastError, latestSnapshot, latestSnapshotReceivedAt, requestSnapshot, sendAction],
  );
}
