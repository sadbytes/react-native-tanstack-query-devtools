import { randomBytes } from "node:crypto";
import type { DevtoolsLogger } from "react-native-tanstack-query-devtools-core";
import { errorMessage } from "../cli-utils";
import {
  connectAdbTarget,
  isAdbNetworkSerial,
  isAdbNotFoundError,
  listAdbDevices,
  listAdbMdnsServices,
  pairAdbTarget,
  removeReverseRules,
  resolveAdb,
  reverseDevicePorts,
  type AdbDevice,
  type AdbInfo,
  type AdbMdnsService,
} from "./platforms/android";

type AdbPairingSessionStatus = "waiting-for-scan" | "pairing" | "connecting" | "connected" | "failed" | "expired";

type AdbPairingSession = {
  id: string;
  createdAt: number;
  expiresAt: number;
  serviceName: string;
  password: string;
  qrValue: string;
  status: AdbPairingSessionStatus;
  output?: string;
  error?: string;
  endpoint?: string;
  target?: string;
  devices?: AdbDevice[];
};

type CreateAndroidToolsBackendOptions = {
  enabled: boolean;
  port: number;
  wsPort: number;
  log: DevtoolsLogger;
};

function randomToken(length: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  let token = "";

  for (const value of bytes) {
    token += alphabet[value % alphabet.length];
  }

  return token;
}

function createAdbPairingSession(): AdbPairingSession {
  const createdAt = Date.now();
  const serviceName = `studio-${randomToken(10)}`;
  const password = randomToken(12);

  return {
    id: randomToken(16),
    createdAt,
    expiresAt: createdAt + 90_000,
    serviceName,
    password,
    qrValue: `WIFI:T:ADB;S:${serviceName};P:${password};;`,
    status: "waiting-for-scan",
  };
}

function serializeAdbPairingSession(session: AdbPairingSession) {
  return {
    id: session.id,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    serviceName: session.serviceName,
    qrValue: session.qrValue,
    status: session.status,
    output: session.output,
    error: session.error,
    endpoint: session.endpoint,
    target: session.target,
    devices: session.devices,
  };
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function createAndroidToolsBackend(options: CreateAndroidToolsBackendOptions) {
  const pairingSessions = new Map<string, AdbPairingSession>();

  function assertEnabled() {
    if (!options.enabled) {
      throw new Error("ADB support is disabled");
    }
  }

  function cleanupPairingSessions() {
    const cutoff = Date.now() - 5 * 60_000;
    for (const [sessionId, session] of pairingSessions.entries()) {
      const isTerminal = session.status === "connected" || session.status === "failed" || session.status === "expired";
      if (session.expiresAt < Date.now() || (isTerminal && session.createdAt < cutoff)) {
        pairingSessions.delete(sessionId);
      }
    }
  }

  function updatePairingSession(sessionId: string, patch: Partial<AdbPairingSession>) {
    const current = pairingSessions.get(sessionId);
    if (!current) {
      return null;
    }

    const next = { ...current, ...patch };
    pairingSessions.set(sessionId, next);
    return next;
  }

  async function waitForMdnsService(
    serviceType: string,
    matcher: (service: AdbMdnsService) => boolean,
    timeoutMs: number,
    pollIntervalMs: number,
  ) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      try {
        const services = await listAdbMdnsServices();
        const match = services.find((service) => service.serviceType === serviceType && matcher(service));
        if (match) {
          return match;
        }
      } catch (error) {
        options.log.error("adb.mdns_poll_error", { error: errorMessage(error) });
      }

      await delay(pollIntervalMs);
    }

    return null;
  }

  async function runAdbPairingSession(sessionId: string) {
    const session = pairingSessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      const remainingScanWindow = Math.max(session.expiresAt - Date.now(), 1_000);
      const pairingService = await waitForMdnsService(
        "_adb-tls-pairing._tcp",
        (service) => service.instanceName === session.serviceName,
        remainingScanWindow,
        1_000,
      );

      if (!pairingService) {
        updatePairingSession(sessionId, {
          status: "expired",
          error: "No device scanned the QR code before it expired.",
        });
        return;
      }

      const pairingEndpoint = `${pairingService.address}:${pairingService.port}`;
      updatePairingSession(sessionId, {
        status: "pairing",
        endpoint: pairingEndpoint,
        target: pairingService.address,
      });

      const pairOutput = await pairAdbTarget(pairingEndpoint, session.password);
      updatePairingSession(sessionId, {
        status: "connecting",
        output: pairOutput,
        endpoint: pairingEndpoint,
        target: pairingService.address,
      });

      const connectService = await waitForMdnsService(
        "_adb-tls-connect._tcp",
        (service) => service.address === pairingService.address,
        15_000,
        1_000,
      );

      if (connectService) {
        const connectTarget = `${connectService.address}:${connectService.port}`;
        const connectOutput = await connectAdbTarget(connectTarget);
        const devices = await listAdbDevices();
        updatePairingSession(sessionId, {
          status: "connected",
          output: [pairOutput, connectOutput].filter(Boolean).join("\n"),
          endpoint: connectTarget,
          target: connectTarget,
          devices,
        });
        return;
      }

      const devices = await listAdbDevices();
      const connectedDevice = devices.find((device) => device.serial.startsWith(`${pairingService.address}:`));
      if (connectedDevice) {
        updatePairingSession(sessionId, {
          status: "connected",
          output: pairOutput,
          endpoint: connectedDevice.serial,
          target: connectedDevice.serial,
          devices,
        });
        return;
      }

      updatePairingSession(sessionId, {
        status: "failed",
        output: pairOutput,
        target: pairingService.address,
        error: "Pairing completed, but no wireless ADB endpoint became available.",
      });
    } catch (error) {
      updatePairingSession(sessionId, {
        status: "failed",
        error: errorMessage(error),
      });
    }
  }

  async function reconnectDevice(serial: string) {
    let connectOutput = "";

    if (isAdbNetworkSerial(serial)) {
      connectOutput = await connectAdbTarget(serial);
    }

    try {
      await removeReverseRules(serial);
    } catch (error) {
      if (!isAdbNotFoundError(error)) {
        throw error;
      }
    }

    try {
      await reverseDevicePorts(serial, { port: options.port, wsPort: options.wsPort });
    } catch (error) {
      if (!isAdbNetworkSerial(serial) || !isAdbNotFoundError(error)) {
        throw error;
      }

      connectOutput = await connectAdbTarget(serial);
      await reverseDevicePorts(serial, { port: options.port, wsPort: options.wsPort });
    }

    return {
      ok: true as const,
      serial,
      reversedPorts: [options.wsPort, options.port],
      output: connectOutput,
    };
  }

  return {
    isEnabled() {
      return options.enabled;
    },
    async getStatus() {
      let adbVersion: string | null = null;
      let adbMdnsSupported = false;

      if (options.enabled) {
        try {
          const info = await resolveAdb();
          adbVersion = info.version;
          adbMdnsSupported = info.mdnsSupported;
        } catch {
          // adb not found
        }
      }

      return {
        adbEnabled: options.enabled,
        androidToolsEnabled: options.enabled,
        adbVersion,
        adbMdnsSupported,
      };
    },
    async listDevices() {
      if (!options.enabled) {
        return [];
      }
      return listAdbDevices();
    },
    async reverse(serial: string) {
      assertEnabled();
      await reverseDevicePorts(serial, { port: options.port, wsPort: options.wsPort });
      return {
        ok: true as const,
        serial,
        reversedPorts: [options.wsPort, options.port],
      };
    },
    async reconnect(serial: string) {
      assertEnabled();
      return reconnectDevice(serial);
    },
    async removeReverse(serial: string) {
      assertEnabled();
      await removeReverseRules(serial);
      return { ok: true as const, serial };
    },
    async connect(target: string, pairCode?: string) {
      assertEnabled();
      let output = "";

      if (pairCode) {
        let adbInfo: AdbInfo;
        try {
          adbInfo = await resolveAdb();
        } catch {
          throw new Error("adb not found in PATH");
        }

        if (!adbInfo.mdnsSupported) {
          throw new Error(
            `Pairing by code requires ADB >= 37.0.0 (installed: ${adbInfo.version ?? "unknown"}). Update Android platform-tools so the dashboard can discover the wireless connect endpoint after pairing.`,
          );
        }

        const pairOutput = await pairAdbTarget(target, pairCode);
        const targetAddress = target.match(/^(.+):\d+$/)?.[1] ?? target;
        const connectService = await waitForMdnsService(
          "_adb-tls-connect._tcp",
          (service) => service.address === targetAddress,
          15_000,
          1_000,
        );

        if (!connectService) {
          throw new Error(
            `Pairing succeeded, but no wireless ADB connect endpoint was discovered for ${targetAddress}. Keep Wireless debugging open on the device and try again.`,
          );
        }

        const connectTarget = `${connectService.address}:${connectService.port}`;
        const connectOutput = await connectAdbTarget(connectTarget);
        output = [pairOutput, connectOutput].filter(Boolean).join("\n");
      } else {
        output = await connectAdbTarget(target);
      }

      const devices = await listAdbDevices();
      return {
        ok: true as const,
        target,
        output,
        devices,
      };
    },
    async startPairing() {
      assertEnabled();

      let adbInfo: AdbInfo;
      try {
        adbInfo = await resolveAdb();
      } catch {
        throw new Error("adb not found in PATH");
      }

      if (!adbInfo.mdnsSupported) {
        throw new Error(
          `QR pairing requires ADB >= 37.0.0 (installed: ${adbInfo.version ?? "unknown"}). Update Android platform-tools to use this feature.`,
        );
      }

      cleanupPairingSessions();
      const session = createAdbPairingSession();
      pairingSessions.set(session.id, session);
      void runAdbPairingSession(session.id);
      return serializeAdbPairingSession(session);
    },
    getPairingSession(sessionId: string) {
      assertEnabled();
      cleanupPairingSessions();
      const session = pairingSessions.get(sessionId);
      if (!session) {
        return null;
      }
      return serializeAdbPairingSession(session);
    },
  };
}
