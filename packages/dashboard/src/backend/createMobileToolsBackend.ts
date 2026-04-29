import http from "node:http";
import type { DeviceSummary } from "react-native-tanstack-query-devtools-core";
import { createAndroidToolsBackend } from "./createAndroidToolsBackend";
import { createIosToolsBackend } from "./createIosToolsBackend";

type AndroidToolsBackend = ReturnType<typeof createAndroidToolsBackend>;
type IosToolsBackend = ReturnType<typeof createIosToolsBackend>;

type CreateMobileToolsBackendOptions = {
  androidTools: AndroidToolsBackend;
  iosTools: IosToolsBackend;
  host: string;
  port: number;
  wsPort: number;
  currentDevices(): DeviceSummary[];
};

export function createMobileToolsBackend(options: CreateMobileToolsBackendOptions) {
  return {
    async getDashboardConfig(request: http.IncomingMessage) {
      const androidStatus = await options.androidTools.getStatus();
      const iosStatus = await options.iosTools.getStatus();

      return {
        wsHost: request.headers.host?.split(":")[0] ?? "localhost",
        wsPort: options.wsPort,
        wsSecure: false,
        dashboardHost: options.host,
        dashboardPort: options.port,
        ...androidStatus,
        iosToolsEnabled: options.iosTools.isEnabled(),
        iosSupported: iosStatus.supported,
        iosSimulatorDiscoverySupported: iosStatus.tooling.supportsSimulatorDiscovery,
        iosPhysicalDiscoverySupported: iosStatus.tooling.supportsPhysicalDiscovery,
        iosTooling: iosStatus.tooling,
        iosReason: iosStatus.reason,
      };
    },
    async refreshAndroidDevices() {
      return {
        devices: await options.androidTools.listDevices(),
        adbEnabled: options.androidTools.isEnabled(),
      };
    },
    async reconnectAndroidDevice(serial: string) {
      const result = await options.androidTools.reconnect(serial);
      return {
        ...result,
        bridgeDevices: options.currentDevices(),
      };
    },
    async connectAndroidTarget(target: string, pairCode?: string) {
      return options.androidTools.connect(target, pairCode);
    },
    async startPairingSession() {
      return options.androidTools.startPairing();
    },
    pollPairingSession(sessionId: string) {
      return options.androidTools.getPairingSession(sessionId);
    },
    async getIosStatus() {
      return options.iosTools.getStatus();
    },
    async listIosDevices() {
      const status = await options.iosTools.getStatus();
      const devices = await options.iosTools.listDevices();
      return { devices, status };
    },
    async listIosConnectionHints() {
      return {
        hints: await options.iosTools.listConnectionHints(),
      };
    },
    async refreshIosDiscovery() {
      return options.iosTools.refresh();
    },
  };
}
