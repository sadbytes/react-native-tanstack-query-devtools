import { createLogger, type LogLevel } from "react-native-tanstack-query-devtools-core";

// Singleton logger for dashboard frontend
export const dashboardLogger = createLogger({
  level: (typeof window !== "undefined" && (window as { __RN_TQ_DEVTOOLS_LOG_LEVEL__?: LogLevel }).__RN_TQ_DEVTOOLS_LOG_LEVEL__) || "none",
});

// Legacy wrapper for existing code - prefer using dashboardLogger directly
export function logDashboardEvent(event: string, fields: Record<string, unknown> = {}, level: "info" | "error" = "info") {
  if (level === "error") {
    dashboardLogger.error(event, fields);
  } else {
    dashboardLogger.log(event, fields);
  }
}
