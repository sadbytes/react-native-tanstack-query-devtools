import {
  createSnapshot,
  type BridgeEnvelope,
  type DevtoolsActionPayload,
  type DevtoolsLogger,
  type DevtoolsSnapshot,
} from "react-native-tanstack-query-devtools-core";
import { onlineManager, type QueryClient, type QueryKey } from "@tanstack/react-query";

type QueryClientBridgeAdapterOptions = {
  queryClient: QueryClient;
  deviceId: string;
  deviceName: string;
  includeMutations?: boolean;
  throttleMs: number;
  log: DevtoolsLogger;
  send<TType extends BridgeEnvelope["type"]>(
    type: TType,
    payload: Extract<BridgeEnvelope, { type: TType }>["payload"],
  ): void;
  isConnected(): boolean;
};

type QueryClientBridgeAdapter = {
  dispose(): void;
  handleCommand(command: BridgeEnvelope): void;
  sendSnapshot(reason?: DevtoolsSnapshot["reason"]): void;
};

function noop() {}

function findQuery(queryClient: QueryClient, queryHash?: string) {
  if (!queryHash) {
    return undefined;
  }

  return queryClient.getQueryCache().get(queryHash);
}

function applySetData(queryClient: QueryClient, queryKey: QueryKey | undefined, data: unknown) {
  if (!queryKey) {
    return;
  }

  queryClient.setQueryData(queryKey, data, { updatedAt: Date.now() });
}

function applyAction(queryClient: QueryClient, action: DevtoolsActionPayload, log: DevtoolsLogger) {
  if (action.action === "clearQueryCache") {
    queryClient.getQueryCache().clear();
    return;
  }

  if (action.action === "clearMutationCache") {
    queryClient.getMutationCache().clear();
    return;
  }

  if (action.action === "setOnline") {
    onlineManager.setOnline(Boolean(action.online));
    return;
  }

  const query = findQuery(queryClient, action.queryHash);
  if (!query) {
    log.error("bridge.query_not_found", {
      action: action.action,
      query_hash: action.queryHash,
    });
    return;
  }

  switch (action.action) {
    case "refetch":
      query.fetch().catch(noop);
      break;
    case "invalidate":
      queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true }).catch(noop);
      break;
    case "reset":
      queryClient.resetQueries({ queryKey: query.queryKey, exact: true }).catch(noop);
      break;
    case "remove":
      queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
      break;
    case "setData":
      applySetData(queryClient, action.queryKey, action.data);
      break;
    case "triggerError": {
      const previousOptions = query.options;
      query.setState({
        ...query.state,
        status: "error",
        error: new Error("Triggered from remote devtools"),
        fetchMeta: {
          ...query.state.fetchMeta,
          __previousQueryOptions: previousOptions,
        } as typeof query.state.fetchMeta,
      });
      break;
    }
    case "restoreError":
      queryClient.resetQueries({ queryKey: query.queryKey, exact: true }).catch(noop);
      break;
    case "triggerLoading": {
      const previousOptions = query.options;
      query
        .fetch({
          ...previousOptions,
          queryFn: () => new Promise(() => undefined),
          gcTime: -1,
        })
        .catch(noop);
      query.setState({
        data: undefined,
        status: "pending",
        fetchMeta: {
          ...query.state.fetchMeta,
          __previousQueryOptions: previousOptions,
        } as typeof query.state.fetchMeta,
      });
      break;
    }
    case "restoreLoading": {
      const previousState = query.state;
      const previousOptions = (query.state.fetchMeta as { __previousQueryOptions?: unknown } | null)?.__previousQueryOptions;
      query.cancel({ silent: true }).catch(noop);
      query.setState({
        ...previousState,
        fetchStatus: "idle",
        fetchMeta: null,
      });
      if (previousOptions) {
        query.fetch(previousOptions as never).catch(noop);
      }
      break;
    }
  }
}

export function createQueryClientBridgeAdapter(options: QueryClientBridgeAdapterOptions): QueryClientBridgeAdapter {
  let destroyed = false;
  let lastSentAt = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function buildSnapshot(reason: DevtoolsSnapshot["reason"]) {
    return createSnapshot({
      queryClient: options.queryClient,
      deviceId: options.deviceId,
      deviceName: options.deviceName,
      reason,
      includeMutations: options.includeMutations,
    });
  }

  function flushSnapshot(reason: DevtoolsSnapshot["reason"]) {
    if (destroyed || !options.isConnected()) {
      return;
    }

    const snapshot = buildSnapshot(reason);
    options.send("rntqdevtools.snapshot", snapshot);
    lastSentAt = Date.now();
    options.log.log("bridge.snapshot_sent", {
      reason,
      query_count: snapshot.queries.length,
      mutation_count: snapshot.mutations.length,
      online: snapshot.online,
    });
  }

  function sendSnapshot(reason: DevtoolsSnapshot["reason"] = "manual") {
    if (destroyed) {
      return;
    }

    if (reason === "connect" || reason === "request") {
      clearTimeout(timeout);
      flushSnapshot(reason);
      return;
    }

    if (!options.isConnected()) {
      return;
    }

    const now = Date.now();
    const remaining = options.throttleMs - (now - lastSentAt);

    if (remaining <= 0) {
      flushSnapshot(reason);
      return;
    }

    clearTimeout(timeout);
    options.log.log("bridge.snapshot_scheduled", {
      reason,
      delay_ms: remaining,
    });
    timeout = setTimeout(() => flushSnapshot(reason), remaining);
  }

  function handleCommand(command: BridgeEnvelope) {
    options.log.log("bridge.command_received", {
      command_type: command.type,
    });

    if (command.type === "rntqdevtools.requestSnapshot") {
      if (command.payload.targetDeviceId !== options.deviceId) {
        return;
      }

      options.log.log("bridge.snapshot_requested", {
        reason: "request",
        target_device_id: command.payload.targetDeviceId,
      });
      sendSnapshot("request");
      return;
    }

    if (command.type !== "rntqdevtools.action") {
      return;
    }

    if (command.payload.targetDeviceId !== options.deviceId) {
      return;
    }

    options.log.log("bridge.action_received", {
      action: command.payload.action,
      target_device_id: command.payload.targetDeviceId,
      session_id: command.payload.sessionId,
      query_hash: command.payload.queryHash,
    });

    try {
      applyAction(options.queryClient, command.payload, options.log);
      options.log.log("bridge.action_applied", {
        action: command.payload.action,
        target_device_id: command.payload.targetDeviceId,
        query_hash: command.payload.queryHash,
      });
      sendSnapshot("manual");
    } catch (error) {
      options.log.error("bridge.action_failed", {
        action: command.payload.action,
        target_device_id: command.payload.targetDeviceId,
        query_hash: command.payload.queryHash,
        error: error instanceof Error ? error.message : "Unknown action error",
      });
      options.send("rntqdevtools.error", {
        targetDeviceId: options.deviceId,
        sessionId: command.payload.sessionId,
        message: error instanceof Error ? error.message : "Unknown action error",
      });
    }
  }

  const unsubscribeQueryCache = options.queryClient.getQueryCache().subscribe(() => sendSnapshot("query-cache"));
  const unsubscribeMutationCache = options.queryClient
    .getMutationCache()
    .subscribe(() => sendSnapshot("mutation-cache"));

  return {
    dispose() {
      destroyed = true;
      clearTimeout(timeout);
      unsubscribeQueryCache();
      unsubscribeMutationCache();
    },
    handleCommand,
    sendSnapshot,
  };
}
