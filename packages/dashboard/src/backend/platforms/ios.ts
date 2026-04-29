import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getLanIPv4Candidates } from "./network";
import type { IosConnectionHint, IosDevice, IosStatus, IosToolingInfo } from "./types";

const execFileAsync = promisify(execFile);

type ToolAvailability = {
  xcrunAvailable: boolean;
  simctlAvailable: boolean;
  xctraceAvailable: boolean;
  ideviceIdAvailable: boolean;
  ideviceInfoAvailable: boolean;
  iproxyAvailable: boolean;
};

async function commandExists(command: string) {
  const lookup = process.platform === "win32" ? "where" : "which";
  try {
    await execFileAsync(lookup, [command], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function detectTools(): Promise<ToolAvailability> {
  const [xcrunAvailable, xctraceAvailable, ideviceIdAvailable, ideviceInfoAvailable, iproxyAvailable] = await Promise.all([
    commandExists("xcrun"),
    commandExists("xctrace"),
    commandExists("idevice_id"),
    commandExists("ideviceinfo"),
    commandExists("iproxy"),
  ]);

  return {
    xcrunAvailable,
    simctlAvailable: xcrunAvailable,
    xctraceAvailable,
    ideviceIdAvailable,
    ideviceInfoAvailable,
    iproxyAvailable,
  };
}

export async function getIosStatus(enabled: boolean): Promise<IosStatus> {
  if (!enabled) {
    return {
      enabled,
      supported: false,
      reason: "iOS tooling disabled",
      tooling: {
        xcrunAvailable: false,
        simctlAvailable: false,
        xctraceAvailable: false,
        ideviceIdAvailable: false,
        ideviceInfoAvailable: false,
        iproxyAvailable: false,
        supportsSimulatorDiscovery: false,
        supportsPhysicalDiscovery: false,
      },
    };
  }

  const tools = await detectTools();
  const supportsSimulatorDiscovery = process.platform === "darwin" && tools.simctlAvailable;
  const supportsPhysicalDiscovery = tools.ideviceIdAvailable;
  const tooling: IosToolingInfo = {
    ...tools,
    supportsSimulatorDiscovery,
    supportsPhysicalDiscovery,
  };

  const supported = supportsSimulatorDiscovery || supportsPhysicalDiscovery;
  let reason: string | undefined;
  if (!supported) {
    reason =
      process.platform === "darwin"
        ? "Install Xcode command line tools for simulators or libimobiledevice for physical devices."
        : "Simulator discovery requires macOS/Xcode. Install libimobiledevice to discover physical devices.";
  }

  return { enabled, supported, reason, tooling };
}

type SimctlDevicesResponse = {
  devices?: Record<string, Array<{ udid: string; name: string; state: string; isAvailable?: boolean; availabilityError?: string }>>;
};

function parseRuntimeFromSimctlKey(key: string) {
  return key.replace(/^com\.apple\.CoreSimulator\.SimRuntime\./, "").replaceAll("-", " ");
}

async function listIosSimulators(status: IosStatus): Promise<IosDevice[]> {
  if (!status.tooling.supportsSimulatorDiscovery) {
    return [];
  }

  const { stdout } = await execFileAsync("xcrun", ["simctl", "list", "devices", "--json"], { timeout: 15000 });
  const payload = JSON.parse(String(stdout)) as SimctlDevicesResponse;
  const devices: IosDevice[] = [];

  for (const [runtimeKey, entries] of Object.entries(payload.devices ?? {})) {
    if (!runtimeKey.includes("iOS") || !Array.isArray(entries)) {
      continue;
    }

    for (const entry of entries) {
      if (entry.isAvailable === false || entry.availabilityError) {
        continue;
      }

      devices.push({
        id: entry.udid,
        kind: "simulator",
        connection: "simulator",
        name: entry.name,
        runtime: parseRuntimeFromSimctlKey(runtimeKey),
        state: entry.state,
        isBooted: entry.state === "Booted",
        isPaired: true,
        isReachable: entry.state === "Booted",
      });
    }
  }

  return devices.sort((a, b) => Number(Boolean(b.isBooted)) - Number(Boolean(a.isBooted)) || a.name.localeCompare(b.name));
}

async function listPhysicalDeviceUdids(network: boolean) {
  const args = [network ? "--network" : "--list"];
  try {
    const { stdout } = await execFileAsync("idevice_id", args, { timeout: 10000 });
    return String(stdout)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function readPhysicalDeviceInfo(udid: string, network: boolean) {
  if (!(await commandExists("ideviceinfo"))) {
    return null;
  }

  const args = network ? ["--network", "--udid", udid] : ["--udid", udid];
  try {
    const { stdout } = await execFileAsync("ideviceinfo", args, { timeout: 10000 });
    const values = new Map<string, string>();
    for (const line of String(stdout).split(/\r?\n/)) {
      const [key, ...rest] = line.split(":");
      if (!key || rest.length === 0) continue;
      values.set(key.trim(), rest.join(":").trim());
    }
    return values;
  } catch {
    return null;
  }
}

async function listIosPhysicalDevices(status: IosStatus): Promise<IosDevice[]> {
  if (!status.tooling.supportsPhysicalDiscovery) {
    return [];
  }

  const [usbUdids, networkUdids] = await Promise.all([listPhysicalDeviceUdids(false), listPhysicalDeviceUdids(true).catch(() => [])]);
  const merged = new Map<string, IosDevice>();

  for (const udid of usbUdids) {
    const info = await readPhysicalDeviceInfo(udid, false);
    merged.set(udid, {
      id: udid,
      kind: "physical",
      connection: "usb",
      name: info?.get("DeviceName") ?? udid,
      model: info?.get("ProductType"),
      runtime: info?.get("ProductVersion"),
      state: "connected",
      isPaired: info != null,
      isReachable: info != null,
    });
  }

  for (const udid of networkUdids) {
    const info = await readPhysicalDeviceInfo(udid, true);
    const existing = merged.get(udid);
    merged.set(udid, {
      id: udid,
      kind: "physical",
      connection: existing?.connection ?? "network",
      name: existing?.name ?? info?.get("DeviceName") ?? udid,
      model: existing?.model ?? info?.get("ProductType"),
      runtime: existing?.runtime ?? info?.get("ProductVersion"),
      state: "connected",
      isPaired: existing?.isPaired ?? info != null,
      isReachable: true,
    });
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listIosDevices(status: IosStatus) {
  const [simulators, physicalDevices] = await Promise.all([listIosSimulators(status), listIosPhysicalDevices(status)]);
  return [...simulators, ...physicalDevices];
}

export function buildIosConnectionHints(devices: IosDevice[], options: { host: string }) {
  const candidateHosts = getLanIPv4Candidates();

  return devices.map<IosConnectionHint>((device) => {
    if (device.kind === "simulator") {
      return {
        deviceId: device.id,
        recommendedHost: "localhost",
        candidateHosts,
        shouldUseLocalhost: true,
        requiresSameNetwork: false,
        explanation: "iOS simulators can reach services on the host through localhost.",
      };
    }

    if (options.host === "127.0.0.1" || options.host === "localhost") {
      return {
        deviceId: device.id,
        recommendedHost: null,
        candidateHosts,
        shouldUseLocalhost: false,
        requiresSameNetwork: true,
        explanation:
          "Physical iOS devices cannot connect to a localhost-only dashboard. Bind the dashboard to 0.0.0.0 or a LAN interface and use that host IP.",
      };
    }

    return {
      deviceId: device.id,
      recommendedHost: candidateHosts[0] ?? null,
      candidateHosts,
      shouldUseLocalhost: false,
      requiresSameNetwork: true,
      explanation:
        device.connection === "usb"
          ? "Physical iOS devices still connect over the network in this tool. Use the host machine's LAN IP and make sure the device is on the same network."
          : "Use the host machine's LAN IP and keep the device on the same network as the dashboard and Metro.",
    };
  });
}
