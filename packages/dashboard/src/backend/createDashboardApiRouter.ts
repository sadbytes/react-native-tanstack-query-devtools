import http from "node:http";
import type { DevtoolsLogger } from "react-native-tanstack-query-devtools-core";
import { errorMessage } from "../cli-utils";
import { optionalString, readJsonBody, requireString, sendJson } from "./shared";

type MobileToolsBackend = ReturnType<typeof import("./createMobileToolsBackend").createMobileToolsBackend>;

type CreateDashboardApiRouterOptions = {
  mobileTools: MobileToolsBackend;
  log: DevtoolsLogger;
};

export function createDashboardApiRouter(options: CreateDashboardApiRouterOptions) {
  return {
    async handleRequest(request: http.IncomingMessage, response: http.ServerResponse, url: URL) {
      const startedAt = Date.now();
      let statusCode = 200;
      let error: string | undefined;
      const sendApiJson = (status: number, payload: unknown) => {
        statusCode = status;
        sendJson(response, status, payload);
      };

      try {
        if (request.method === "GET" && url.pathname === "/api/status") {
          sendApiJson(200, {
            config: await options.mobileTools.getDashboardConfig(request),
          });
          return;
        }

        if (request.method === "GET" && url.pathname === "/api/ios/status") {
          sendApiJson(200, await options.mobileTools.getIosStatus());
          return;
        }

        if (request.method === "GET" && url.pathname === "/api/ios/devices") {
          sendApiJson(200, await options.mobileTools.listIosDevices());
          return;
        }

        if (request.method === "GET" && url.pathname === "/api/ios/connection-hints") {
          sendApiJson(200, await options.mobileTools.listIosConnectionHints());
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/ios/refresh") {
          sendApiJson(200, await options.mobileTools.refreshIosDiscovery());
          return;
        }

        if (request.method === "GET" && url.pathname === "/api/adb/devices") {
          sendApiJson(200, await options.mobileTools.refreshAndroidDevices());
          return;
        }

        if (url.pathname === "/api/adb/reconnect" && request.method === "POST") {
          const body = await readJsonBody(request);
          const serial = requireString(body.serial, "serial");
          sendApiJson(200, await options.mobileTools.reconnectAndroidDevice(serial));
          return;
        }

        if (url.pathname === "/api/adb/reverse" && request.method === "POST") {
          sendApiJson(404, { error: "Use /api/adb/reconnect" });
          return;
        }

        if (url.pathname === "/api/adb/remove-reverse" && request.method === "POST") {
          sendApiJson(404, { error: "Use /api/adb/reconnect" });
          return;
        }

        if (url.pathname === "/api/adb/connect" && request.method === "POST") {
          const body = await readJsonBody(request);
          const target = requireString(body.target, "target");
          const pairCode = optionalString(body.pairCode);
          sendApiJson(200, await options.mobileTools.connectAndroidTarget(target, pairCode));
          return;
        }

        if (url.pathname === "/api/adb/pairing/start" && request.method === "POST") {
          sendApiJson(200, await options.mobileTools.startPairingSession());
          return;
        }

        if (request.method === "GET" && url.pathname.startsWith("/api/adb/pairing/")) {
          const sessionId = decodeURIComponent(url.pathname.slice("/api/adb/pairing/".length));
          const session = options.mobileTools.pollPairingSession(sessionId);
          if (!session) {
            sendApiJson(404, { error: "Pairing session not found" });
            return;
          }

          sendApiJson(200, session);
          return;
        }

        sendApiJson(404, { error: "Not found" });
      } catch (caughtError) {
        error = errorMessage(caughtError);
        sendApiJson(400, { error });
      } finally {
        const logFn = statusCode >= 400 ? options.log.error : options.log.log;
        logFn("api.request_completed", {
          method: request.method,
          path: url.pathname,
          status_code: statusCode,
          adb_enabled: true,
          duration_ms: Date.now() - startedAt,
          error,
        });
      }
    },
  };
}
