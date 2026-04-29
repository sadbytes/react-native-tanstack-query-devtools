import http from "node:http";
import {
  createLogger,
  type DeviceSummary,
  type LogLevel,
} from "react-native-tanstack-query-devtools-core";
import { createAndroidToolsBackend } from "./createAndroidToolsBackend";
import { createBridgeRegistry } from "./createBridgeRegistry";
import { createBridgeSocketServer } from "./bridgeSocketServer";
import { createDashboardApiRouter } from "./createDashboardApiRouter";
import { createDashboardHost } from "./createDashboardHost";
import { createIosToolsBackend } from "./createIosToolsBackend";
import { createMobileToolsBackend } from "./createMobileToolsBackend";

type BridgeServerOptions = {
  host: string;
  port: number;
  wsPort: number;
  adb?: boolean;
  androidTools?: boolean;
  iosTools?: boolean;
  logLevel?: LogLevel;
  dashboard?: StaticDashboardOptions | ViteDashboardOptions;
  onDevicesChanged?: (devices: DeviceSummary[]) => void;
};

type StaticDashboardOptions = {
  mode?: "static";
};

type ViteDashboardOptions = {
  mode: "vite";
  root: string;
  configFile: string;
};

// CLI output that writes structured JSON to stdout/stderr
const cliOutput = {
  log: (_prefix: string, payload: unknown) => {
    process.stdout.write(`[rn-tq-devtools] ${JSON.stringify(payload)}\n`);
  },
  error: (_prefix: string, payload: unknown) => {
    process.stderr.write(`[rn-tq-devtools] ${JSON.stringify(payload)}\n`);
  },
};

export function createBridgeServer(options: BridgeServerOptions) {
  const log = createLogger({
    level: options.logLevel ?? "info",
    output: cliOutput,
  });

  const bridge = createBridgeSocketServer({ port: options.wsPort });
  const bridgeRegistry = createBridgeRegistry({
    bridge,
    log,
    onDevicesChanged: options.onDevicesChanged,
  });
  const androidTools = createAndroidToolsBackend({
    enabled: options.androidTools ?? options.adb ?? true,
    port: options.port,
    wsPort: options.wsPort,
    log,
  });
  const iosTools = createIosToolsBackend({
    enabled: options.iosTools ?? true,
    host: options.host,
  });
  const mobileTools = createMobileToolsBackend({
    androidTools,
    iosTools,
    host: options.host,
    port: options.port,
    wsPort: options.wsPort,
    currentDevices: bridgeRegistry.currentDevices,
  });
  const dashboardHost = createDashboardHost({
    dashboard: options.dashboard,
    log,
  });

  const apiRouter = createDashboardApiRouter({
    mobileTools,
    log,
  });

  const server = http.createServer((request, response) => {
    if (!request.url) {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname === "/config.json") {
      void (async () => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(await mobileTools.getDashboardConfig(request)));
      })();
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      void apiRouter.handleRequest(request, response, url);
      return;
    }

    dashboardHost.handleRequest(request, response);
  });

  return {
    async start() {
      try {
        await dashboardHost.start();
        await bridge.start();
        log.log("bridge.websocket_started", { host: options.host, port: options.wsPort });
        await new Promise<void>((resolve, reject) => {
          const handleError = (error: Error) => {
            void bridge.stop();
            log.error("server.start_failed", { error: error.message });
            reject(error);
          };

          server.once("error", handleError);
          server.listen(options.port, options.host, () => {
            server.off("error", handleError);
            log.log("server.http_started", { host: options.host, port: options.port });
            resolve();
          });
        });
      } catch (error) {
        await bridge.stop().catch(() => undefined);
        await dashboardHost.stop().catch(() => undefined);
        throw error;
      }
    },
    getDevices() {
      return bridgeRegistry.currentDevices();
    },
    async stop() {
      options.onDevicesChanged?.([]);
      log.log("server.stop_started");
      bridgeRegistry.dispose();
      await bridge.stop();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            log.error("server.stop_failed", { error: error.message });
            reject(error);
            return;
          }
          resolve();
        });
      });
      await dashboardHost.stop();
      log.log("server.stopped");
    },
  };
}
