import { beforeEach, describe, expect, it, vi } from "vitest";

const connectAdbTarget = vi.fn();
const listAdbDevices = vi.fn();
const listAdbMdnsServices = vi.fn();
const pairAdbTarget = vi.fn();
const removeReverseRules = vi.fn();
const resolveAdb = vi.fn();
const reverseDevicePorts = vi.fn();

vi.mock("../src/backend/platforms/android", () => ({
  connectAdbTarget,
  isAdbNetworkSerial: (serial: string) => /:\d+$/.test(serial),
  isAdbNotFoundError: (error: unknown) => /\bnot found\b/i.test(error instanceof Error ? error.message : String(error)),
  listAdbDevices,
  listAdbMdnsServices,
  pairAdbTarget,
  removeReverseRules,
  resolveAdb,
  reverseDevicePorts,
}));

const log = {
  log: vi.fn(),
  error: vi.fn(),
} as const;

describe("createAndroidToolsBackend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAdb.mockResolvedValue({ path: "/usr/bin/adb", version: "37.0.0", mdnsSupported: true });
    connectAdbTarget.mockResolvedValue("connected");
    removeReverseRules.mockResolvedValue(undefined);
    reverseDevicePorts.mockResolvedValue(undefined);
    listAdbDevices.mockResolvedValue([]);
    listAdbMdnsServices.mockResolvedValue([]);
    pairAdbTarget.mockResolvedValue("paired");
  });

  it("reconnects wireless devices before restoring reverse ports", async () => {
    const { createAndroidToolsBackend } = await import("../src/backend/createAndroidToolsBackend");
    const backend = createAndroidToolsBackend({
      enabled: true,
      port: 3000,
      wsPort: 9090,
      log,
    });

    await backend.reconnect("192.168.1.42:5555");

    expect(connectAdbTarget).toHaveBeenCalledWith("192.168.1.42:5555");
    expect(removeReverseRules).toHaveBeenCalledWith("192.168.1.42:5555");
    expect(reverseDevicePorts).toHaveBeenCalledWith("192.168.1.42:5555", { port: 3000, wsPort: 9090 });
  });

  it("ignores missing reverse rules during reconnect", async () => {
    const { createAndroidToolsBackend } = await import("../src/backend/createAndroidToolsBackend");
    removeReverseRules.mockRejectedValueOnce(new Error("device '192.168.1.42:5555' not found"));

    const backend = createAndroidToolsBackend({
      enabled: true,
      port: 3000,
      wsPort: 9090,
      log,
    });

    await expect(backend.reconnect("192.168.1.42:5555")).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        serial: "192.168.1.42:5555",
        reversedPorts: [9090, 3000],
      }),
    );
    expect(reverseDevicePorts).toHaveBeenCalledWith("192.168.1.42:5555", { port: 3000, wsPort: 9090 });
  });
});
