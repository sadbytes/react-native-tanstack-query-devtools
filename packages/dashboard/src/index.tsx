#!/usr/bin/env node
import { parseArgs } from "node:util";
import type { LogLevel } from "react-native-tanstack-query-devtools-core";
import { createBridgeServer } from "./backend/createBridgeServer";
import { browserHost, errorMessage, portOption } from "./cli-utils";

type CliOptions = {
  host: string;
  port: number;
  wsPort: number;
  androidTools: boolean;
  iosTools: boolean;
  logLevel: LogLevel;
};

const VALID_LOG_LEVELS = new Set<LogLevel>(["none", "error", "info", "debug"]);

const DEFAULT_PORT = 42831;
const DEFAULT_WS_PORT = 9090;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_LOG_LEVEL: LogLevel = "info";
const envHost = process.env.RN_TQ_DEVTOOLS_HOST ?? process.env.HOST ?? DEFAULT_HOST;
const envPort = process.env.RN_TQ_DEVTOOLS_PORT ?? process.env.PORT ?? String(DEFAULT_PORT);
const envWsPort = process.env.RN_TQ_DEVTOOLS_WS_PORT ?? process.env.WS_PORT ?? String(DEFAULT_WS_PORT);
const envLogLevel = process.env.RN_TQ_DEVTOOLS_LOG_LEVEL ?? DEFAULT_LOG_LEVEL;

function readCliArgs() {
  const args = process.argv.slice(2);
  if (args[0] === "--") {
    args.shift();
  }

  return parseArgs({
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
      "android-tools": {
        type: "boolean",
        default: true,
      },
      "ios-tools": {
        type: "boolean",
        default: true,
      },
      "log-level": {
        type: "string",
        default: envLogLevel,
      },
      help: {
        type: "boolean",
        short: "h",
        default: false,
      },
    },
  });
}

function toLogLevel(value: string | undefined): LogLevel {
  if (value && VALID_LOG_LEVELS.has(value as LogLevel)) {
    return value as LogLevel;
  }
  return DEFAULT_LOG_LEVEL;
}

function readOptions(values: ReturnType<typeof readCliArgs>["values"]): CliOptions {
  return {
    port: portOption(values.port, DEFAULT_PORT),
    wsPort: portOption(values["ws-port"], DEFAULT_WS_PORT),
    host: values.host ?? envHost,
    androidTools: values["android-tools"] ?? true,
    iosTools: values["ios-tools"] ?? true,
    logLevel: toLogLevel(values["log-level"]),
  };
}

function printHelp() {
  process.stdout.write(`rn-tanstack-query-devtools

Usage:
  rn-tanstack-query-devtools [options]

Options:
  --host <addr>       Bind address (default: 0.0.0.0)
  --port <port>       HTTP port for dashboard (default: 42831)
  --ws-port <port>    WebSocket port for bridge (default: 9090)
  --log-level <level> Log level: none, error, info, debug (default: info)
  --no-android-tools  Disable Android tooling
  --no-ios-tools      Disable iOS tooling
  -h, --help          Show this help message

The command starts the web dashboard. Device discovery, ADB port setup, direct
connect, iOS diagnostics, and devtools navigation are handled from the dashboard page.
`);
}

async function main() {
  const { values } = readCliArgs();

  if (values.help) {
    printHelp();
    return;
  }

  const options = readOptions(values);
  const server = createBridgeServer({
    host: options.host,
    port: options.port,
    wsPort: options.wsPort,
    androidTools: options.androidTools,
    iosTools: options.iosTools,
    logLevel: options.logLevel,
  });

  const dashboardUrl = `http://${browserHost(options.host)}:${options.port}`;
  const wsUrl = `ws://${browserHost(options.host)}:${options.wsPort}`;

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

  process.stdout.write(`Dashboard: ${dashboardUrl}\n`);
  process.stdout.write(`WebSocket: ${wsUrl}\n`);
  process.stdout.write("Device discovery and connection controls are available in the dashboard.\n");
}

main().catch((error) => {
  console.error("[rn-tq-devtools] Failed to start server");
  console.error(errorMessage(error));
  process.exit(1);
});
