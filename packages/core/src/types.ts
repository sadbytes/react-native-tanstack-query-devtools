import type {
  MutationKey,
  MutationMeta,
  MutationScope,
  MutationState,
  QueryKey,
  QueryMeta,
  QueryObserverOptions,
  QueryState,
} from "@tanstack/react-query";

export const PROTOCOL_VERSION = 1;

/**
 * Log levels for the devtools bridge and dashboard.
 *
 * - `none`: No logging
 * - `error`: Only errors
 * - `info`: Errors + important lifecycle events (connect, disconnect, init)
 * - `debug`: Everything including snapshots, actions, and internal events
 */
export type LogLevel = "none" | "error" | "info" | "debug";

export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  none: 0,
  error: 1,
  info: 2,
  debug: 3,
};

export type DashboardRole = "react-query-device" | "react-query-dashboard";
export type DeviceSessionStatus = "available" | "pending" | "active";
export type DevicePlatform = "android" | "ios" | "macos" | "web" | "windows";

export type DeviceSummary = {
  clientId: string;
  deviceId: string;
  deviceName: string;
  platform?: DevicePlatform;
  connectedAt: number;
  lastSeenAt: number;
  sessionStatus: DeviceSessionStatus;
  sessionId?: string;
};

export type SnapshotReason = "connect" | "request" | "query-cache" | "mutation-cache" | "manual";

export type DevtoolsSnapshotEnvelope = {
  type: "rntqdevtools.snapshot";
  payload: DevtoolsSnapshot;
};

export type RequestSnapshotEnvelope = {
  type: "rntqdevtools.requestSnapshot";
  payload: {
    targetDeviceId: string;
    sessionId?: string;
  };
};

export type SessionRequestEnvelope = {
  type: "rntqdevtools.sessionRequest";
  payload: {
    targetDeviceId: string;
    sessionId?: string;
  };
};

export type SessionAcceptEnvelope = {
  type: "rntqdevtools.sessionAccept";
  payload: {
    targetDeviceId: string;
    sessionId: string;
  };
};

export type SessionRejectEnvelope = {
  type: "rntqdevtools.sessionReject";
  payload: {
    targetDeviceId: string;
    sessionId: string;
    reason: string;
  };
};

export type SessionStartedEnvelope = {
  type: "rntqdevtools.sessionStarted";
  payload: {
    deviceId: string;
    deviceName: string;
    sessionId: string;
  };
};

export type SessionEndedEnvelope = {
  type: "rntqdevtools.sessionEnded";
  payload: {
    deviceId: string;
    sessionId: string;
    reason: string;
  };
};

export type DeviceListEnvelope = {
  type: "rntqdevtools.deviceList";
  payload: {
    devices: DeviceSummary[];
  };
};

export type ErrorEnvelope = {
  type: "rntqdevtools.error";
  payload: {
    targetDeviceId?: string;
    sessionId?: string;
    message: string;
  };
};

export type OnlineEnvelope = {
  type: "rntqdevtools.online";
  payload: {
    targetDeviceId: string;
    online: boolean;
  };
};

export type ActionEnvelope = {
  type: "rntqdevtools.action";
  payload: DevtoolsActionPayload;
};

export type BridgeEnvelope =
  | DevtoolsSnapshotEnvelope
  | RequestSnapshotEnvelope
  | SessionRequestEnvelope
  | SessionAcceptEnvelope
  | SessionRejectEnvelope
  | SessionStartedEnvelope
  | SessionEndedEnvelope
  | DeviceListEnvelope
  | ErrorEnvelope
  | OnlineEnvelope
  | ActionEnvelope;

export type DevtoolsSnapshot = {
  protocolVersion: typeof PROTOCOL_VERSION;
  deviceId: string;
  deviceName: string;
  sessionId?: string;
  tanstackQueryVersion: "5";
  timestamp: number;
  online: boolean;
  reason: SnapshotReason;
  queries: SerializedQuery[];
  mutations: SerializedMutation[];
};

export type SerializedQuery = {
  queryHash: string;
  queryKey: QueryKey;
  state: QueryState;
  observers: SerializedObserver[];
  gcTime?: number;
  meta?: QueryMeta;
};

export type SerializedObserver = {
  queryHash: string;
  options: QueryObserverOptions;
};

export type SerializedMutation = {
  mutationId: number;
  mutationKey?: MutationKey;
  state: MutationState;
  meta?: MutationMeta;
  scope?: MutationScope;
  gcTime?: number;
};

export type DevtoolsAction =
  | "refetch"
  | "invalidate"
  | "reset"
  | "remove"
  | "setData"
  | "triggerError"
  | "restoreError"
  | "triggerLoading"
  | "restoreLoading"
  | "clearQueryCache"
  | "clearMutationCache"
  | "setOnline";

export type DevtoolsActionPayload = {
  targetDeviceId: string;
  sessionId?: string;
  action: DevtoolsAction;
  queryHash?: string;
  queryKey?: QueryKey;
  data?: unknown;
  online?: boolean;
};

export type DashboardDevtoolsEvent =
  | "REFETCH"
  | "INVALIDATE"
  | "RESET"
  | "REMOVE"
  | "TRIGGER_ERROR"
  | "RESTORE_ERROR"
  | "TRIGGER_LOADING"
  | "RESTORE_LOADING"
  | "CLEAR_MUTATION_CACHE"
  | "CLEAR_QUERY_CACHE";
