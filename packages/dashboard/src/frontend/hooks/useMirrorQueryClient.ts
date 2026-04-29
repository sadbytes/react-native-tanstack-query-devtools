import { useEffect, useMemo } from "react";
import { createMirrorSync, type MirrorSyncManualUpdate } from "react-native-tanstack-query-devtools-core";

type UseMirrorQueryClientOptions = {
  onManualUpdate?(update: MirrorSyncManualUpdate): void;
};

export function useMirrorQueryClient(options: UseMirrorQueryClientOptions = {}) {
  const mirrorSync = useMemo(() => createMirrorSync(options), []);

  useEffect(() => {
    mirrorSync.setOnManualUpdate(options.onManualUpdate);
  }, [mirrorSync, options.onManualUpdate]);

  useEffect(() => {
    return () => {
      mirrorSync.dispose();
    };
  }, [mirrorSync]);

  return {
    queryClient: mirrorSync.queryClient,
    applySnapshot: mirrorSync.applySnapshot,
    clear: mirrorSync.clear,
  };
}
