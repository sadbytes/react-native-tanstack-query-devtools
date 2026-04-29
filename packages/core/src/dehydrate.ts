import { onlineManager, type Mutation, type Query, type QueryClient, type QueryObserverOptions } from "@tanstack/react-query";
import type {
  DevtoolsSnapshot,
  SerializedMutation,
  SerializedObserver,
  SerializedQuery,
  SnapshotReason,
} from "./types";
import { PROTOCOL_VERSION } from "./types";

function sanitizeObserverOptions(observerOptions: QueryObserverOptions): Omit<QueryObserverOptions, "queryFn"> {
  const { queryFn: _, ...rest } = observerOptions;
  const next = rest as Record<string, unknown>;
  delete next.behavior;
  return rest;
}

function serializeQuery(query: Query): SerializedQuery {
  const observers: SerializedObserver[] = query.observers.map((observer) => ({
    queryHash: query.queryHash,
    options: sanitizeObserverOptions(observer.options) as SerializedObserver["options"],
  }));

  return {
    queryHash: query.queryHash,
    queryKey: query.queryKey,
    state: query.state,
    gcTime: query.gcTime,
    meta: query.meta,
    observers,
  };
}

function serializeMutation(mutation: Mutation): SerializedMutation {
  return {
    mutationId: mutation.mutationId,
    mutationKey: mutation.options.mutationKey,
    state: mutation.state,
    meta: mutation.meta,
    scope: mutation.options.scope,
    gcTime: mutation.gcTime,
  };
}

export function createSnapshot(args: {
  queryClient: QueryClient;
  deviceId: string;
  deviceName: string;
  sessionId?: string;
  reason: SnapshotReason;
  includeMutations?: boolean;
}): DevtoolsSnapshot {
  const { queryClient, deviceId, deviceName, sessionId, reason, includeMutations = true } = args;

  return {
    protocolVersion: PROTOCOL_VERSION,
    deviceId,
    deviceName,
    sessionId,
    tanstackQueryVersion: "5",
    timestamp: Date.now(),
    online: onlineManager.isOnline(),
    reason,
    queries: queryClient.getQueryCache().getAll().map((query) => serializeQuery(query)),
    mutations: includeMutations
      ? queryClient.getMutationCache().getAll().map((mutation) => serializeMutation(mutation))
      : [],
  };
}
