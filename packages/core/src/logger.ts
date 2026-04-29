import { LOG_LEVEL_PRIORITY, type LogLevel } from "./types";

export type LogEventLevel = "error" | "info" | "debug";

export type LoggerOutput = {
  log(prefix: string, payload: unknown): void;
  error(prefix: string, payload: unknown): void;
};

/**
 * Events categorized by their minimum log level.
 */
const EVENT_LEVELS: Record<string, LogEventLevel> = {
  // Error events
  "bridge.action_failed": "error",
  "bridge.query_not_found": "error",
  "bridge.connection_timeout": "error",
  "bridge.snapshot_rejected_unknown_device": "error",
  "bridge.error_sent": "error",
  "bridge.error_received": "error",
  "bridge.device_error_forwarded": "error",
  "server.start_failed": "error",
  "server.stop_failed": "error",
  "config.load_failed_using_fallback": "error",
  "adb.mdns_poll_error": "error",
  "adb.devices.refresh_failed": "error",
  "adb.device.reconnect_blocked": "error",
  "adb.device.reconnect_failed": "error",
  "adb.target.connect_failed": "error",
  "adb.qr_pairing.failed": "error",
  "adb.qr_pairing.poll_failed": "error",
  "adb.qr_pairing.start_failed": "error",
  "verification.timed_out": "error",
  "bridge.snapshot_request_skipped_no_client": "error",
  "bridge.action_skipped_no_client": "error",
  "bridge.unknown_client_ignored": "error",

  // Info events
  "bridge.initialized": "info",
  "bridge.disabled": "info",
  "bridge.connected": "info",
  "bridge.disconnected": "info",
  "bridge.server_connected": "info",
  "bridge.server_disconnected": "info",
  "bridge.device_connected": "info",
  "bridge.device_disconnected": "info",
  "bridge.dashboard_connected": "info",
  "bridge.dashboard_disconnected": "info",
  "bridge.websocket_started": "info",
  "server.http_started": "info",
  "server.stopped": "info",
  "server.stop_started": "info",
  "dashboard.server_ready": "info",
  "config.load_started": "info",
  "config.load_succeeded": "info",
  "verification.completed": "info",
  "verification.completed_from_cache": "info",
  "adb.qr_pairing.connected": "info",
};

function getEventLevel(event: string): LogEventLevel {
  return EVENT_LEVELS[event] ?? "debug";
}

function shouldLog(configuredLevel: LogLevel, eventLevel: LogEventLevel): boolean {
  if (configuredLevel === "none") {
    return false;
  }
  return LOG_LEVEL_PRIORITY[configuredLevel] >= LOG_LEVEL_PRIORITY[eventLevel];
}

export type DevtoolsLoggerConfig = {
  level: LogLevel;
  output?: LoggerOutput;
};

export type DevtoolsLogger = {
  log(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
};

/**
 * Creates a logger for the devtools bridge/dashboard.
 *
 * @example
 * ```ts
 * const log = createLogger({ level: "info" });
 * log.log("bridge.connected", { device_id: "abc" });
 * log.error("bridge.action_failed", { error: "Query not found" });
 * ```
 */
export function createLogger(config: DevtoolsLoggerConfig): DevtoolsLogger {
  let currentLevel = config.level;
  const output = config.output ?? console;

  function emit(event: string, fields: Record<string, unknown>, forceLevel?: LogEventLevel) {
    const eventLevel = forceLevel ?? getEventLevel(event);
    if (!shouldLog(currentLevel, eventLevel)) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      event,
      ...fields,
    };

    if (eventLevel === "error") {
      output.error("[rn-tq-devtools]", payload);
    } else {
      output.log("[rn-tq-devtools]", payload);
    }
  }

  return {
    log(event, fields = {}) {
      emit(event, fields);
    },
    error(event, fields = {}) {
      emit(event, fields, "error");
    },
    setLevel(level) {
      currentLevel = level;
    },
    getLevel() {
      return currentLevel;
    },
  };
}

// Re-export for backwards compatibility
export const createStructuredLogger = createLogger;
export type StructuredLogger = DevtoolsLogger;
export type LoggerLike = LoggerOutput;
export type CreateLoggerOptions = DevtoolsLoggerConfig & { service?: string };
