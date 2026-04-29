import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeviceSummary, MirrorSyncManualUpdate } from "react-native-tanstack-query-devtools-core";
import { toast } from "sonner";
import type { AppView, PendingVerification } from "../types";
import { logDashboardEvent } from "../lib/logger";
import { useDevtoolsEventBridge } from "./useDevtoolsEventBridge";
import { useMirrorQueryClient } from "./useMirrorQueryClient";
import type { useBridgeDashboard } from "./useBridgeDashboard";

type BridgeDashboardState = ReturnType<typeof useBridgeDashboard>;

type UseDeviceSessionOptions = {
  dashboard: BridgeDashboardState;
};

let nextVerificationId = 1;

export function useDeviceSession({ dashboard }: UseDeviceSessionOptions) {
  const [view, setView] = useState<AppView>("home");
  const [selectedDevice, setSelectedDevice] = useState<DeviceSummary | null>(null);
  const [pendingVerification, setPendingVerification] = useState<PendingVerification | null>(null);
  const verificationToastRef = useRef<string | number | null>(null);
  const handleManualMirrorUpdate = useCallback(
    (update: MirrorSyncManualUpdate) => {
      if (!selectedDevice) {
        return;
      }

      dashboard.sendAction({
        targetDeviceId: selectedDevice.deviceId,
        action: "setData",
        queryHash: update.queryHash,
        queryKey: update.queryKey,
        data: update.data,
      });
      logDashboardEvent("query.manual_update_sent", {
        device_id: selectedDevice.deviceId,
        query_hash: update.queryHash,
      });
    },
    [dashboard, selectedDevice],
  );
  const { queryClient, applySnapshot, clear } = useMirrorQueryClient({
    onManualUpdate: handleManualMirrorUpdate,
  });

  const clearVerificationToast = useCallback(() => {
    if (verificationToastRef.current != null) {
      toast.dismiss(verificationToastRef.current);
      verificationToastRef.current = null;
    }
  }, []);

  const completeSelection = useCallback(
    (device: DeviceSummary, queryCount: number, mutationCount: number) => {
      setSelectedDevice(device);
      setView("devtools");
      setPendingVerification(null);
      clearVerificationToast();
      logDashboardEvent("verification.completed", {
        device_id: device.deviceId,
        device_name: device.deviceName,
        query_count: queryCount,
        mutation_count: mutationCount,
      });
    },
    [clearVerificationToast],
  );

  const closeDevice = useCallback(() => {
    clearVerificationToast();
    setPendingVerification(null);
    setSelectedDevice(null);
    setView("home");
    clear();
  }, [clear, clearVerificationToast]);

  useEffect(() => {
    if (selectedDevice && !dashboard.devices.some((device) => device.deviceId === selectedDevice.deviceId)) {
      logDashboardEvent("device.selected_disconnected", {
        device_id: selectedDevice.deviceId,
        device_name: selectedDevice.deviceName,
      });
      closeDevice();
      toast.error("The selected app disconnected from the bridge.");
    }
  }, [closeDevice, dashboard.devices, selectedDevice]);

  useEffect(() => {
    if (!selectedDevice || view !== "devtools") {
      return;
    }

    logDashboardEvent("snapshot.requested_for_selected_device", {
      device_id: selectedDevice.deviceId,
      device_name: selectedDevice.deviceName,
    });
    dashboard.requestSnapshot(selectedDevice.deviceId);
  }, [dashboard.requestSnapshot, selectedDevice, view]);

  useEffect(() => {
    if (!dashboard.latestSnapshot || !selectedDevice || view !== "devtools") {
      return;
    }

    if (dashboard.latestSnapshot.deviceId !== selectedDevice.deviceId) {
      logDashboardEvent("snapshot.ignored_for_unselected_device", {
        snapshot_device_id: dashboard.latestSnapshot.deviceId,
        selected_device_id: selectedDevice.deviceId,
      });
      return;
    }

    applySnapshot(dashboard.latestSnapshot);
    logDashboardEvent("snapshot.applied_to_mirror", {
      device_id: dashboard.latestSnapshot.deviceId,
      query_count: dashboard.latestSnapshot.queries.length,
      mutation_count: dashboard.latestSnapshot.mutations.length,
    });
  }, [applySnapshot, dashboard.latestSnapshot, selectedDevice, view]);

  useEffect(() => {
    if (!pendingVerification) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPendingVerification((current) => {
        if (!current || current.id !== pendingVerification.id) {
          return current;
        }

        clearVerificationToast();
        toast.error(
          `Timed out waiting for ${current.label}. Make sure the app is running and connectReactQueryDevtools is mounted.`,
        );
        logDashboardEvent(
          "verification.timed_out",
          {
            verification_id: current.id,
            device_id: current.deviceId,
            label: current.label,
          },
          "error",
        );
        return null;
      });
    }, 12000);

    return () => window.clearTimeout(timeout);
  }, [clearVerificationToast, pendingVerification]);

  useEffect(() => {
    if (!pendingVerification || !dashboard.latestSnapshot) {
      return;
    }

    if (dashboard.latestSnapshotReceivedAt < pendingVerification.startedAt) {
      return;
    }

    if (pendingVerification.deviceId && dashboard.latestSnapshot.deviceId !== pendingVerification.deviceId) {
      return;
    }

    const device = dashboard.devices.find((entry) => entry.deviceId === dashboard.latestSnapshot?.deviceId);
    if (!device) {
      logDashboardEvent("verification.snapshot_device_missing", {
        snapshot_device_id: dashboard.latestSnapshot.deviceId,
      });
      return;
    }

    clear();
    applySnapshot(dashboard.latestSnapshot);
    completeSelection(device, dashboard.latestSnapshot.queries.length, dashboard.latestSnapshot.mutations.length);
  }, [
    clear,
    applySnapshot,
    completeSelection,
    dashboard.devices,
    dashboard.latestSnapshot,
    dashboard.latestSnapshotReceivedAt,
    pendingVerification,
  ]);

  useDevtoolsEventBridge({
    selectedDevice,
    sendAction: dashboard.sendAction,
  });

  const selectedMeta = useMemo(() => {
    if (!selectedDevice) {
      return "No device selected";
    }

    return `${selectedDevice.deviceName} · ${selectedDevice.platform ?? "unknown"} · ${selectedDevice.deviceId}`;
  }, [selectedDevice]);

  const openDevice = useCallback(
    (device: DeviceSummary) => {
      if (dashboard.latestSnapshot?.deviceId === device.deviceId) {
        clear();
        applySnapshot(dashboard.latestSnapshot);
        setPendingVerification(null);
        clearVerificationToast();
        setSelectedDevice(device);
        setView("devtools");
        logDashboardEvent("verification.completed_from_cache", {
          device_id: device.deviceId,
          device_name: device.deviceName,
          query_count: dashboard.latestSnapshot.queries.length,
          mutation_count: dashboard.latestSnapshot.mutations.length,
        });
        dashboard.requestSnapshot(device.deviceId);
        return;
      }

      const id = nextVerificationId++;
      const startedAt = Date.now();
      setPendingVerification({
        id,
        deviceId: device.deviceId,
        label: device.deviceName,
        startedAt,
      });
      verificationToastRef.current = toast.loading(
        `Verifying ${device.deviceName}. The devtools page opens after a live snapshot arrives.`,
      );
      dashboard.requestSnapshot(device.deviceId);
      logDashboardEvent("verification.started", {
        verification_id: id,
        device_id: device.deviceId,
        device_name: device.deviceName,
      });
    },
    [applySnapshot, clear, clearVerificationToast, dashboard],
  );

  const latestSnapshot =
    selectedDevice && dashboard.latestSnapshot?.deviceId === selectedDevice.deviceId ? dashboard.latestSnapshot : null;

  return {
    view,
    selectedDevice,
    selectedMeta,
    pendingVerification,
    queryClient,
    latestSnapshot,
    queryCount: latestSnapshot?.queries.length ?? 0,
    mutationCount: latestSnapshot?.mutations.length ?? 0,
    openDevice,
    closeDevice,
  };
}

export type DeviceSession = ReturnType<typeof useDeviceSession>;
