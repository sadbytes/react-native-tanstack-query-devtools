import type { DeviceSummary } from "react-native-tanstack-query-devtools-core";

export type Config = {
  wsHost: string;
  wsPort: number;
  wsSecure: boolean;
  dashboardHost?: string;
  dashboardPort?: number;
  adbEnabled?: boolean;
  adbVersion?: string | null;
  adbMdnsSupported?: boolean;
  androidToolsEnabled?: boolean;
  iosToolsEnabled?: boolean;
  iosSupported?: boolean;
  iosSimulatorDiscoverySupported?: boolean;
  iosPhysicalDiscoverySupported?: boolean;
  iosReason?: string;
  iosTooling?: IosToolingInfo;
};

export type DevtoolsThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type AppView = "home" | "devtools";

export type AdbDevice = {
  serial: string;
  state: string;
  details: string;
};

export type IosToolingInfo = {
  xcrunAvailable: boolean;
  simctlAvailable: boolean;
  xctraceAvailable: boolean;
  ideviceIdAvailable: boolean;
  ideviceInfoAvailable: boolean;
  iproxyAvailable: boolean;
  supportsSimulatorDiscovery: boolean;
  supportsPhysicalDiscovery: boolean;
};

export type IosDevice = {
  id: string;
  kind: "simulator" | "physical";
  connection: "usb" | "network" | "simulator";
  name: string;
  model?: string;
  runtime?: string;
  state?: string;
  isBooted?: boolean;
  isPaired?: boolean;
  isReachable?: boolean;
};

export type IosConnectionHint = {
  deviceId: string;
  recommendedHost: string | null;
  candidateHosts: string[];
  shouldUseLocalhost: boolean;
  requiresSameNetwork: boolean;
  explanation: string;
};

export type AdbPairingStatus = "waiting-for-scan" | "pairing" | "connecting" | "connected" | "failed" | "expired";

export type AdbPairingSession = {
  id: string;
  serviceName: string;
  qrValue: string;
  createdAt: number;
  expiresAt: number;
  status: AdbPairingStatus;
  output?: string;
  error?: string;
  endpoint?: string;
  target?: string;
  devices?: AdbDevice[];
};

export type PendingVerification = {
  id: number;
  deviceId: string | null;
  label: string;
  startedAt: number;
};

export type SelectedDevice = DeviceSummary | null;
