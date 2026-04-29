import { describe, expect, it, vi } from "vitest";
import http from "node:http";
import { EventEmitter } from "node:events";
import { createLogger } from "react-native-tanstack-query-devtools-core";
import { createDashboardApiRouter } from "../src/backend/createDashboardApiRouter";

type MockResponse = http.ServerResponse & {
  _status: number;
  _headers: Record<string, string>;
  _body: string;
};

function createMockRequest(method: string, url: string, body?: unknown): http.IncomingMessage {
  const emitter = new EventEmitter();
  const req = emitter as unknown as http.IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000" };

  // If there's a body, emit it async
  if (body !== undefined) {
    process.nextTick(() => {
      emitter.emit("data", Buffer.from(JSON.stringify(body)));
      emitter.emit("end");
    });
  } else {
    process.nextTick(() => {
      emitter.emit("end");
    });
  }

  // Make the request async-iterable so readJsonBody can iterate over it
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) {
      yield Buffer.from(JSON.stringify(body));
    }
  };

  return req;
}

function createMockResponse(): MockResponse {
  const res = {
    _status: 200,
    _headers: {} as Record<string, string>,
    _body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status;
      if (headers) {
        Object.assign(res._headers, headers);
      }
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
    end(data?: string) {
      if (data) res._body = data;
    },
  } as unknown as MockResponse;

  return res;
}

function createMockMobileTools() {
  return {
    getDashboardConfig: vi.fn().mockResolvedValue({
      wsHost: "localhost",
      wsPort: 9090,
      wsSecure: false,
      adbEnabled: true,
    }),
    refreshAndroidDevices: vi.fn().mockResolvedValue({
      devices: [{ serial: "emulator-5554", state: "device", details: "" }],
      adbEnabled: true,
    }),
    reconnectAndroidDevice: vi.fn().mockResolvedValue({
      ok: true,
      serial: "emulator-5554",
      reversedPorts: [9090, 3000],
    }),
    connectAndroidTarget: vi.fn().mockResolvedValue({
      ok: true,
      target: "192.168.1.42:5555",
      output: "connected",
      devices: [],
    }),
    startPairingSession: vi.fn().mockResolvedValue({
      id: "session-1",
      serviceName: "studio-abc",
      qrValue: "WIFI:T:ADB;S:studio-abc;P:pass;;",
      status: "waiting-for-scan",
    }),
    pollPairingSession: vi.fn().mockReturnValue({
      id: "session-1",
      status: "waiting-for-scan",
    }),
    getIosStatus: vi.fn().mockResolvedValue({
      enabled: true,
      supported: true,
      tooling: {
        supportsSimulatorDiscovery: true,
        supportsPhysicalDiscovery: false,
      },
    }),
    listIosDevices: vi.fn().mockResolvedValue({
      devices: [],
      status: { enabled: true, supported: true },
    }),
    listIosConnectionHints: vi.fn().mockResolvedValue({
      hints: [],
    }),
    refreshIosDiscovery: vi.fn().mockResolvedValue({
      devices: [],
      hints: [],
    }),
  };
}

function parseBody(res: MockResponse) {
  return JSON.parse(res._body);
}

describe("createDashboardApiRouter", () => {
  it("GET /api/status returns dashboard config", async () => {
    const mobileTools = createMockMobileTools();
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("GET", "/api/status");
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/status", "http://localhost"));

    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual({
      config: expect.objectContaining({ wsHost: "localhost", wsPort: 9090 }),
    });
  });

  it("GET /api/adb/devices returns Android device list", async () => {
    const mobileTools = createMockMobileTools();
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("GET", "/api/adb/devices");
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/adb/devices", "http://localhost"));

    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual({
      devices: [{ serial: "emulator-5554", state: "device", details: "" }],
      adbEnabled: true,
    });
  });

  it("POST /api/adb/reconnect reconnects a device", async () => {
    const mobileTools = createMockMobileTools();
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("POST", "/api/adb/reconnect", { serial: "emulator-5554" });
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/adb/reconnect", "http://localhost"));

    expect(res._status).toBe(200);
    expect(mobileTools.reconnectAndroidDevice).toHaveBeenCalledWith("emulator-5554");
  });

  it("POST /api/adb/reconnect returns 400 when serial is missing", async () => {
    const mobileTools = createMockMobileTools();
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("POST", "/api/adb/reconnect", {});
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/adb/reconnect", "http://localhost"));

    expect(res._status).toBe(400);
    expect(parseBody(res)).toEqual({ error: expect.stringContaining("serial") });
  });

  it("POST /api/adb/connect sends target and optional pair code", async () => {
    const mobileTools = createMockMobileTools();
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("POST", "/api/adb/connect", {
      target: "192.168.1.42:5555",
      pairCode: "123456",
    });
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/adb/connect", "http://localhost"));

    expect(res._status).toBe(200);
    expect(mobileTools.connectAndroidTarget).toHaveBeenCalledWith("192.168.1.42:5555", "123456");
  });

  it("POST /api/adb/connect returns 400 when target is missing", async () => {
    const mobileTools = createMockMobileTools();
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("POST", "/api/adb/connect", {});
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/adb/connect", "http://localhost"));

    expect(res._status).toBe(400);
    expect(parseBody(res)).toEqual({ error: expect.stringContaining("target") });
  });

  it("POST /api/adb/pairing/start starts a pairing session", async () => {
    const mobileTools = createMockMobileTools();
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("POST", "/api/adb/pairing/start", {});
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/adb/pairing/start", "http://localhost"));

    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual(
      expect.objectContaining({ id: "session-1", status: "waiting-for-scan" }),
    );
  });

  it("GET /api/adb/pairing/:id polls a session", async () => {
    const mobileTools = createMockMobileTools();
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("GET", "/api/adb/pairing/session-1");
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/adb/pairing/session-1", "http://localhost"));

    expect(res._status).toBe(200);
    expect(mobileTools.pollPairingSession).toHaveBeenCalledWith("session-1");
  });

  it("GET /api/adb/pairing/:id returns 404 for unknown session", async () => {
    const mobileTools = createMockMobileTools();
    mobileTools.pollPairingSession.mockReturnValue(null);
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("GET", "/api/adb/pairing/unknown-session");
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/adb/pairing/unknown-session", "http://localhost"));

    expect(res._status).toBe(404);
  });

  it("GET /api/ios/status returns iOS status", async () => {
    const mobileTools = createMockMobileTools();
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("GET", "/api/ios/status");
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/ios/status", "http://localhost"));

    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual(
      expect.objectContaining({ enabled: true, supported: true }),
    );
  });

  it("GET /api/ios/devices returns iOS devices", async () => {
    const mobileTools = createMockMobileTools();
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("GET", "/api/ios/devices");
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/ios/devices", "http://localhost"));

    expect(res._status).toBe(200);
    expect(parseBody(res)).toEqual(expect.objectContaining({ devices: [] }));
  });

  it("POST /api/ios/refresh triggers iOS discovery", async () => {
    const mobileTools = createMockMobileTools();
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("POST", "/api/ios/refresh", {});
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/ios/refresh", "http://localhost"));

    expect(res._status).toBe(200);
    expect(mobileTools.refreshIosDiscovery).toHaveBeenCalledOnce();
  });

  it("returns 404 for unknown routes", async () => {
    const mobileTools = createMockMobileTools();
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("GET", "/api/unknown");
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/unknown", "http://localhost"));

    expect(res._status).toBe(404);
  });

  it("returns 400 when backend throws", async () => {
    const mobileTools = createMockMobileTools();
    mobileTools.refreshAndroidDevices.mockRejectedValue(new Error("adb not found"));
    const router = createDashboardApiRouter({
      mobileTools: mobileTools as any,
      log: createLogger({ level: "none" }),
    });

    const req = createMockRequest("GET", "/api/adb/devices");
    const res = createMockResponse();
    await router.handleRequest(req, res, new URL("/api/adb/devices", "http://localhost"));

    expect(res._status).toBe(400);
    expect(parseBody(res)).toEqual({ error: "adb not found" });
  });
});
