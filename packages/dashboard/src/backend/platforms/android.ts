import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AndroidToolingStatus } from "./types";

const execFileAsync = promisify(execFile);

const MIN_MDNS_VERSION = [37, 0, 0] as const;

export type AdbInfo = {
  path: string;
  version: string | null;
  mdnsSupported: boolean;
};

export type AdbDevice = {
  serial: string;
  state: string;
  details: string;
};

export type AdbMdnsService = {
  instanceName: string;
  serviceType: string;
  address: string;
  port: number;
};

export function isAdbNetworkSerial(serial: string) {
  return /:\d+$/.test(serial);
}

export function isAdbNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\bnot found\b/i.test(message) || /\bno devices\/emulators found\b/i.test(message);
}

function parseVersion(output: string): string | null {
  const match = output.match(/^Version\s+(\d+\.\d+\.\d+)/m);
  return match ? match[1] : null;
}

function isVersionAtLeast(version: string, minimum: readonly [number, number, number]): boolean {
  const parts = version.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const actual = parts[i] ?? 0;
    const required = minimum[i];
    if (actual > required) return true;
    if (actual < required) return false;
  }
  return true;
}

async function findAdb(): Promise<string> {
  const command = process.platform === "win32" ? "where" : "which";
  const { stdout } = await execFileAsync(command, ["adb"], { timeout: 5000 });
  const adbPath = stdout.trim().split(/\r?\n/)[0];
  if (!adbPath) {
    throw new Error("adb not found in PATH. Install Android platform-tools and ensure adb is available.");
  }
  return adbPath;
}

async function getAdbVersion(adbPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(adbPath, ["version"], { timeout: 5000 });
    return parseVersion(stdout);
  } catch {
    return null;
  }
}

let cached: Promise<AdbInfo> | null = null;

export function resolveAdb(): Promise<AdbInfo> {
  if (!cached) {
    cached = doResolve().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

async function doResolve(): Promise<AdbInfo> {
  const adbPath = await findAdb();
  const version = await getAdbVersion(adbPath);
  const mdnsSupported = version ? isVersionAtLeast(version, MIN_MDNS_VERSION) : false;

  return { path: adbPath, version, mdnsSupported };
}

export async function getAndroidToolingStatus(enabled: boolean): Promise<AndroidToolingStatus> {
  if (!enabled) {
    return {
      enabled,
      supported: false,
      reason: "Android tooling disabled",
      adbVersion: null,
      adbMdnsSupported: false,
    };
  }

  try {
    const info = await resolveAdb();
    return {
      enabled,
      supported: true,
      adbVersion: info.version,
      adbMdnsSupported: info.mdnsSupported,
    };
  } catch (error) {
    return {
      enabled,
      supported: false,
      reason: error instanceof Error ? error.message : "ADB unavailable",
      adbVersion: null,
      adbMdnsSupported: false,
    };
  }
}

export function parseAdbDevices(output: string): AdbDevice[] {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial = "", state = "unknown", ...rest] = line.split(/\s+/);
      return {
        serial,
        state,
        details: rest.join(" "),
      };
    })
    .filter((device) => device.serial.length > 0);
}

export function parseAdbMdnsServices(output: string): AdbMdnsService[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("List of discovered mdns services"))
    .map((line) => {
      const tokens = line.split(/\s+/);
      if (tokens.length < 3) {
        return null;
      }

      const instanceName = tokens.slice(0, -2).join(" ");
      const serviceType = tokens.at(-2) ?? "";
      const endpoint = tokens.at(-1) ?? "";
      const match = endpoint.match(/^(.+):(\d+)$/);
      if (!instanceName || !serviceType || !match) {
        return null;
      }

      return {
        instanceName,
        serviceType,
        address: match[1],
        port: Number(match[2]),
      };
    })
    .filter((service): service is AdbMdnsService => service !== null);
}

export async function listAdbDevices() {
  const { path: adb } = await resolveAdb();
  const { stdout } = await execFileAsync(adb, ["devices", "-l"], { timeout: 5000 });
  return parseAdbDevices(String(stdout));
}

export async function listAdbMdnsServices() {
  const { path: adb } = await resolveAdb();
  const { stdout } = await execFileAsync(adb, ["mdns", "services"], { timeout: 5000 });
  return parseAdbMdnsServices(String(stdout));
}

export async function reverseDevicePorts(serial: string, options: { port: number; wsPort: number }) {
  const { path: adb } = await resolveAdb();
  await execFileAsync(adb, ["-s", serial, "reverse", `tcp:${options.wsPort}`, `tcp:${options.wsPort}`], {
    timeout: 5000,
  });
  await execFileAsync(adb, ["-s", serial, "reverse", `tcp:${options.port}`, `tcp:${options.port}`], {
    timeout: 5000,
  });
}

export async function removeReverseRules(serial: string) {
  const { path: adb } = await resolveAdb();
  await execFileAsync(adb, ["-s", serial, "reverse", "--remove-all"], { timeout: 5000 });
}

export async function connectAdbTarget(target: string) {
  const { path: adb } = await resolveAdb();
  const { stdout, stderr } = await execFileAsync(adb, ["connect", target], { timeout: 8000 });
  return `${stdout}${stderr}`.trim();
}

export async function pairAdbTarget(target: string, password: string) {
  const { path: adb } = await resolveAdb();
  const { stdout, stderr } = await execFileAsync(adb, ["pair", target, password], { timeout: 15000 });
  return `${stdout}${stderr}`.trim();
}
