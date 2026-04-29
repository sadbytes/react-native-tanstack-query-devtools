export type PlatformToolingStatus = {
  enabled: boolean;
  supported: boolean;
  reason?: string;
};

export type AndroidToolingStatus = PlatformToolingStatus & {
  adbVersion: string | null;
  adbMdnsSupported: boolean;
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

export type IosStatus = PlatformToolingStatus & {
  tooling: IosToolingInfo;
};
