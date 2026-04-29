import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { postJson, readApiResponse } from "../lib/api";
import { logDashboardEvent } from "../lib/logger";
import type { AdbDevice, AdbPairingSession, Config, IosConnectionHint, IosDevice } from "../types";

type UseMobileToolsOptions = {
  config: Config | null;
};

function isNoDevicesMessage(message: string) {
  return (
    /^Not found$/i.test(message) ||
    /^No devices found\b/i.test(message) ||
    /^No device found\b/i.test(message) ||
    /^No connected device found\b/i.test(message) ||
    /^No iOS simulators or physical devices found\b/i.test(message)
  );
}

export function useMobileTools({ config }: UseMobileToolsOptions) {
  const [androidDevices, setAndroidDevices] = useState<AdbDevice[]>([]);
  const [androidLoading, setAndroidLoading] = useState(false);
  const [busyAndroidSerial, setBusyAndroidSerial] = useState<string | null>(null);
  const [iosDevices, setIosDevices] = useState<IosDevice[]>([]);
  const [iosHints, setIosHints] = useState<IosConnectionHint[]>([]);
  const [iosLoading, setIosLoading] = useState(false);
  const [pairingSession, setPairingSession] = useState<AdbPairingSession | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [directTarget, setDirectTarget] = useState("");
  const [directPairCode, setDirectPairCode] = useState("");

  const refreshAndroidDevices = useCallback(async () => {
    logDashboardEvent("adb.devices.refresh_started");
    setAndroidLoading(true);
    try {
      const response = await fetch("/api/adb/devices");
      const payload = await readApiResponse<{ devices: AdbDevice[]; adbEnabled: boolean }>(response);
      setAndroidDevices(payload.devices);
      logDashboardEvent("adb.devices.refresh_succeeded", {
        device_count: payload.devices.length,
        adb_enabled: payload.adbEnabled,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh devices";
      if (!isNoDevicesMessage(message)) {
        toast.error(message);
      }
      logDashboardEvent("adb.devices.refresh_failed", { error: message }, "error");
    } finally {
      setAndroidLoading(false);
    }
  }, []);

  const refreshIosDiscovery = useCallback(async () => {
    logDashboardEvent("ios.devices.refresh_started");
    setIosLoading(true);
    try {
      const response = await postJson<{ devices: IosDevice[]; hints: IosConnectionHint[] }>("/api/ios/refresh", {});
      setIosDevices(response.devices);
      setIosHints(response.hints);
      logDashboardEvent("ios.devices.refresh_succeeded", {
        device_count: response.devices.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh iOS devices";
      if (!isNoDevicesMessage(message)) {
        toast.error(message);
      }
      logDashboardEvent("ios.devices.refresh_failed", { error: message }, "error");
    } finally {
      setIosLoading(false);
    }
  }, []);

  const pollPairingSession = useCallback(async (sessionId: string) => {
    const response = await fetch(`/api/adb/pairing/${encodeURIComponent(sessionId)}`);
    return readApiResponse<AdbPairingSession>(response);
  }, []);

  useEffect(() => {
    if (!config?.adbEnabled) {
      return;
    }

    void refreshAndroidDevices();
  }, [config?.adbEnabled, refreshAndroidDevices]);

  useEffect(() => {
    if (config?.iosToolsEnabled === false) {
      return;
    }

    void refreshIosDiscovery();
  }, [config?.iosToolsEnabled, refreshIosDiscovery]);

  useEffect(() => {
    if (!pairingSession) {
      return;
    }

    if (pairingSession.status === "connected" || pairingSession.status === "failed" || pairingSession.status === "expired") {
      return;
    }

    const timeout = window.setTimeout(() => {
      void pollPairingSession(pairingSession.id)
        .then((session) => {
          setPairingSession(session);
          if (session.status === "connected") {
            setAndroidDevices(session.devices ?? []);
            toast.success(session.output ?? `Connected ${session.target ?? "wireless device"}`);
            logDashboardEvent("adb.qr_pairing.connected", {
              session_id: session.id,
              target: session.target,
            });
            return;
          }

          if (session.status === "failed" || session.status === "expired") {
            toast.error(session.error ?? "Wireless ADB pairing failed");
            logDashboardEvent(
              "adb.qr_pairing.failed",
              {
                session_id: session.id,
                status: session.status,
                error: session.error,
              },
              "error",
            );
          }
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Failed to refresh QR pairing status";
          toast.error(message);
          logDashboardEvent("adb.qr_pairing.poll_failed", { error: message }, "error");
        });
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [pairingSession, pollPairingSession]);

  const reconnectAndroidDevice = useCallback(async (device: AdbDevice) => {
    if (device.state !== "device") {
      const message = `${device.serial} is ${device.state}. It must be in the device state before reconnecting.`;
      toast.error(message);
      logDashboardEvent("adb.device.reconnect_blocked", { serial: device.serial, state: device.state }, "error");
      return;
    }

    logDashboardEvent("adb.device.reconnect_started", { serial: device.serial });
    setBusyAndroidSerial(device.serial);
    try {
      await postJson<{ ok: true }>("/api/adb/reconnect", { serial: device.serial });
      toast.success(`Reconnected ${device.serial} and restored the local websocket tunnel.`);
      logDashboardEvent("adb.device.reconnect_succeeded", {
        serial: device.serial,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reconnect device";
      toast.error(message);
      logDashboardEvent("adb.device.reconnect_failed", { serial: device.serial, error: message }, "error");
    } finally {
      setBusyAndroidSerial(null);
    }
  }, []);

  const connectAndroidTarget = useCallback(async () => {
    const target = directTarget.trim();
    const pairCode = directPairCode.trim();
    if (!target) {
      return;
    }

    logDashboardEvent("adb.target.connect_started", { target, has_pair_code: pairCode.length > 0 });
    setAndroidLoading(true);
    try {
      const payload = await postJson<{ devices: AdbDevice[]; output: string }>("/api/adb/connect", {
        target,
        pairCode: pairCode || undefined,
      });
      setAndroidDevices(payload.devices);
      setDirectTarget("");
      setDirectPairCode("");
      toast.success(payload.output || `Connected ${target}`);
      logDashboardEvent("adb.target.connect_succeeded", {
        target,
        has_pair_code: pairCode.length > 0,
        device_count: payload.devices.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect target";
      toast.error(message);
      logDashboardEvent("adb.target.connect_failed", { target, has_pair_code: pairCode.length > 0, error: message }, "error");
    } finally {
      setAndroidLoading(false);
    }
  }, [directPairCode, directTarget]);

  const startPairingSession = useCallback(async () => {
    logDashboardEvent("adb.qr_pairing.start_requested");
    setPairingLoading(true);
    try {
      const session = await postJson<AdbPairingSession>("/api/adb/pairing/start", {});
      setPairingSession(session);
      logDashboardEvent("adb.qr_pairing.started", {
        session_id: session.id,
        service_name: session.serviceName,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start QR pairing";
      toast.error(message);
      logDashboardEvent("adb.qr_pairing.start_failed", { error: message }, "error");
    } finally {
      setPairingLoading(false);
    }
  }, []);

  const clearPairingSession = useCallback(() => {
    setPairingSession(null);
  }, []);

  return {
    android: {
      devices: androidDevices,
      loading: androidLoading,
      busyDeviceSerial: busyAndroidSerial,
      directTarget,
      directPairCode,
      setDirectTarget,
      setDirectPairCode,
      refreshDevices: refreshAndroidDevices,
      reconnectDevice: reconnectAndroidDevice,
      connectTarget: connectAndroidTarget,
    },
    ios: {
      devices: iosDevices,
      hints: iosHints,
      loading: iosLoading,
      refreshDiscovery: refreshIosDiscovery,
    },
    pairing: {
      session: pairingSession,
      loading: pairingLoading,
      startSession: startPairingSession,
      pollSession: pollPairingSession,
      clearSession: clearPairingSession,
    },
  };
}

export type MobileTools = ReturnType<typeof useMobileTools>;
