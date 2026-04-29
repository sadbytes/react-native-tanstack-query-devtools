import {
  QueryObserver,
  type DefaultError,
  type MutationOptions,
  type MutationState,
  type Query,
  type QueryClient,
  type QueryObserverOptions,
  type QueryOptions,
} from "@tanstack/react-query";
import type { DevtoolsSnapshot, SerializedObserver } from "./types";

const mockQueryFn = () => {
  throw new Error("Mirror query client: refetch is not supported on mirrored queries");
};

type TransformerFn = (data: unknown) => unknown;

export type MirrorHydrateOptions = {
  defaultOptions?: {
    deserializeData?: TransformerFn;
    queries?: QueryOptions;
    mutations?: MutationOptions<unknown, DefaultError, unknown, unknown>;
  };
};

function cleanUpObservers(query: Query) {
  for (const observer of [...query.observers]) {
    query.removeObserver(observer);
  }
}

function recreateObservers(queryClient: QueryClient, query: Query, observers: SerializedObserver[]) {
  for (const serializedObserver of observers) {
    const { initialPageParam: _, ...rest } = serializedObserver.options as QueryObserverOptions & { initialPageParam?: unknown };
    const nextOptions = rest as Record<string, unknown>;
    delete nextOptions.behavior;
    nextOptions.queryFn = mockQueryFn;
    const observer = new QueryObserver(queryClient, nextOptions as unknown as QueryObserverOptions);
    query.addObserver(observer);
  }
}

export function applySnapshotToMirror(
  queryClient: QueryClient,
  snapshot: DevtoolsSnapshot,
  options?: MirrorHydrateOptions,
) {
  const deserializeData = options?.defaultOptions?.deserializeData ?? ((value: unknown) => value);
  const queryCache = queryClient.getQueryCache();
  const mutationCache = queryClient.getMutationCache();

  queryClient.clear();

  for (const serializedMutation of snapshot.mutations) {
    mutationCache.build(
      queryClient,
      {
        ...options?.defaultOptions?.mutations,
        mutationKey: serializedMutation.mutationKey,
        meta: serializedMutation.meta,
        scope: serializedMutation.scope,
        gcTime: serializedMutation.gcTime,
        mutationId: serializedMutation.mutationId,
      } as MutationOptions,
      serializedMutation.state as MutationState<unknown, DefaultError, void, unknown>,
    );
  }

  for (const serializedQuery of snapshot.queries) {
    const data =
      serializedQuery.state.data === undefined
        ? undefined
        : deserializeData(serializedQuery.state.data);

    const query = queryCache.build(
      queryClient,
      {
        ...options?.defaultOptions?.queries,
        queryKey: serializedQuery.queryKey,
        queryHash: serializedQuery.queryHash,
        meta: serializedQuery.meta,
        queryFn: mockQueryFn,
        retry: 0,
        gcTime: serializedQuery.gcTime ?? 0,
      },
      {
        ...serializedQuery.state,
        data,
      },
    );

    cleanUpObservers(query);
    recreateObservers(queryClient, query, serializedQuery.observers);
  }
}
