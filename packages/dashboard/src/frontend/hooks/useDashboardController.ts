import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { logDashboardEvent } from "../lib/logger";
import type { Config } from "../types";
import { useBridgeDashboard } from "./useBridgeDashboard";
import { useDeviceSession } from "./useDeviceSession";
import { useMobileTools } from "./useMobileTools";
import { useTanStackDevtoolsTheme } from "./useTanStackDevtoolsTheme";

function isNoDevicesMessage(message: string) {
  return (
    /^Not found$/i.test(message) ||
    /^No devices found\b/i.test(message) ||
    /^No device found\b/i.test(message) ||
    /^No connected device found\b/i.test(message) ||
    /^No iOS simulators or physical devices found\b/i.test(message)
  );
}

export function useDashboardController() {
  const [config, setConfig] = useState<Config | null>(null);
  const dashboard = useBridgeDashboard(config);
  const deviceSession = useDeviceSession({ dashboard });
  const mobileTools = useMobileTools({ config });
  const { resolvedTheme, themePreference } = useTanStackDevtoolsTheme();

  useEffect(() => {
    logDashboardEvent("config.load_started");
    fetch("/config.json")
      .then((response) => response.json())
      .then((payload: Config) => {
        setConfig(payload);
        logDashboardEvent("config.load_succeeded", {
          ws_host: payload.wsHost,
          ws_port: payload.wsPort,
          ws_secure: payload.wsSecure,
          adb_enabled: payload.adbEnabled ?? true,
        });
      })
      .catch((error: unknown) => {
        const fallbackConfig = {
          wsHost: location.hostname,
          wsPort: 9090,
          wsSecure: false,
          adbEnabled: true,
        };
        setConfig(fallbackConfig);
        toast.error("Failed to load server config — using default WebSocket port 9090. Check that the dashboard server is running.");
        logDashboardEvent(
          "config.load_failed_using_fallback",
          { error: error instanceof Error ? error.message : String(error), ...fallbackConfig },
          "error",
        );
      });
  }, []);

  const wsUrl = useMemo(() => {
    if (!config) {
      return "Loading";
    }

    return `${config.wsSecure ? "wss" : "ws"}://${config.wsHost}:${config.wsPort}`;
  }, [config]);

  const dashboardUrl = useMemo(() => `${location.protocol}//${location.host}`, []);

  useEffect(() => {
    if (dashboard.lastError && !isNoDevicesMessage(dashboard.lastError)) {
      toast.error(dashboard.lastError);
    }
  }, [dashboard.lastError]);

  return {
    config,
    dashboard,
    deviceSession,
    mobileTools,
    resolvedTheme,
    themePreference,
    wsUrl,
    dashboardUrl,
  };
}

export type DashboardController = ReturnType<typeof useDashboardController>;
