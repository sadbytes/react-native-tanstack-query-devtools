#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { createBridgeServer } from "./backend/createBridgeServer";
import { browserHost, portOption } from "./cli-utils";

const DEFAULT_PORT = 42831;
const DEFAULT_WS_PORT = 9090;
const DEFAULT_HOST = "0.0.0.0";
const envHost = process.env.RN_TQ_DEVTOOLS_HOST ?? process.env.HOST ?? DEFAULT_HOST;
const envPort = process.env.RN_TQ_DEVTOOLS_PORT ?? process.env.PORT ?? String(DEFAULT_PORT);
const envWsPort = process.env.RN_TQ_DEVTOOLS_WS_PORT ?? process.env.WS_PORT ?? String(DEFAULT_WS_PORT);

const args = process.argv.slice(2);
if (args[0] === "--") {
  args.shift();
}

const { values } = parseArgs({
  args,
  allowNegative: true,
  options: {
    host: {
      type: "string",
      default: envHost,
    },
    port: {
      type: "string",
      default: envPort,
    },
    "ws-port": {
      type: "string",
      default: envWsPort,
    },
  },
});

const host = values.host ?? envHost;
const port = portOption(values.port, DEFAULT_PORT);
const wsPort = portOption(values["ws-port"], DEFAULT_WS_PORT);

const server = createBridgeServer({
  host,
  port,
  wsPort,
  dashboard: {
    mode: "vite",
    root: path.resolve(process.cwd(), "src/frontend"),
    configFile: path.resolve(process.cwd(), "vite.config.ts"),
  },
});

async function shutdown() {
  await server.stop();
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});

await server.start();

console.log(`Dashboard: http://${browserHost(host)}:${port}`);
console.log(`WebSocket: ws://${browserHost(host)}:${wsPort}`);
