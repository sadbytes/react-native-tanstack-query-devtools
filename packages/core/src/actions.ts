import type { DashboardDevtoolsEvent, DevtoolsAction } from "./types";

export const DEVTOOLS_INTERNAL_EVENT = "@tanstack/query-devtools-event";

export const dashboardEventToAction: Record<DashboardDevtoolsEvent, DevtoolsAction> = {
  REFETCH: "refetch",
  INVALIDATE: "invalidate",
  RESET: "reset",
  REMOVE: "remove",
  TRIGGER_ERROR: "triggerError",
  RESTORE_ERROR: "restoreError",
  TRIGGER_LOADING: "triggerLoading",
  RESTORE_LOADING: "restoreLoading",
  CLEAR_MUTATION_CACHE: "clearMutationCache",
  CLEAR_QUERY_CACHE: "clearQueryCache",
};

export type WindowDevtoolsEventDetail = {
  type: DashboardDevtoolsEvent;
  queryHash?: string;
  metadata?: Record<string, unknown>;
};

