import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MIN_MDNS_VERSION = [37, 0, 0] as const;

export type AdbInfo = {
  path: string;
  version: string | null;
  mdnsSupported: boolean;
};

function parseVersion(output: string): string | null {
  // Match the "Version X.Y.Z" line (platform-tools version), not the protocol version on line 1
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
