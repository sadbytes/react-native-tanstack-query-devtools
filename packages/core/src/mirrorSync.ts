import { QueryClient, type QueryKey } from "@tanstack/react-query";
import type { DevtoolsSnapshot } from "./types";
import { applySnapshotToMirror } from "./hydrate";

export type MirrorSyncManualUpdate = {
  queryHash: string;
  queryKey: QueryKey;
  data: unknown;
};

export type MirrorSyncOptions = {
  onManualUpdate?(update: MirrorSyncManualUpdate): void;
};

export type MirrorSync = {
  queryClient: QueryClient;
  applySnapshot(snapshot: DevtoolsSnapshot): void;
  clear(): void;
  setOnManualUpdate(listener?: ((update: MirrorSyncManualUpdate) => void) | null): void;
  dispose(): void;
};

export function createMirrorSync(options: MirrorSyncOptions = {}): MirrorSync {
  const queryClient = new QueryClient();
  let onManualUpdate = options.onManualUpdate ?? null;
  let applyingSnapshot = false;

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (applyingSnapshot || event.type !== "updated") {
      return;
    }

    if (event.action.type !== "success" || !(event.action as { manual?: boolean }).manual) {
      return;
    }

    onManualUpdate?.({
      queryHash: event.query.queryHash,
      queryKey: event.query.queryKey,
      data: event.query.state.data,
    });
  });

  function applySnapshot(snapshot: DevtoolsSnapshot) {
    applyingSnapshot = true;
    applySnapshotToMirror(queryClient, snapshot);
    queueMicrotask(() => {
      applyingSnapshot = false;
    });
  }

  return {
    queryClient,
    applySnapshot,
    clear() {
      queryClient.clear();
    },
    setOnManualUpdate(listener) {
      onManualUpdate = listener ?? null;
    },
    dispose() {
      unsubscribe();
      queryClient.clear();
      onManualUpdate = null;
    },
  };
}
