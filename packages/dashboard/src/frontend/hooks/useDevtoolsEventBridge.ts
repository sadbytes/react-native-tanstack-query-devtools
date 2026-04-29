import { useEffect } from "react";
import {
  DEVTOOLS_INTERNAL_EVENT,
  dashboardEventToAction,
  type DevtoolsActionPayload,
  type DeviceSummary,
  type WindowDevtoolsEventDetail,
} from "react-native-tanstack-query-devtools-core";
import { logDashboardEvent } from "../lib/logger";

type UseDevtoolsEventBridgeOptions = {
  selectedDevice: DeviceSummary | null;
  sendAction: (payload: Omit<DevtoolsActionPayload, "sessionId">) => void;
};

export function useDevtoolsEventBridge(options: UseDevtoolsEventBridgeOptions) {
  useEffect(() => {
    function onEvent(event: Event) {
      const customEvent = event as CustomEvent<WindowDevtoolsEventDetail>;
      if (!options.selectedDevice) {
        logDashboardEvent("devtools_event.ignored_no_device", { event_type: customEvent.detail.type });
        return;
      }

      const action = dashboardEventToAction[customEvent.detail.type];
      if (!action) {
        logDashboardEvent("devtools_event.ignored_unknown_action", { event_type: customEvent.detail.type });
        return;
      }

      options.sendAction({
        targetDeviceId: options.selectedDevice.deviceId,
        action,
        queryHash: customEvent.detail.queryHash,
      });
      logDashboardEvent("devtools_event.forwarded", {
        device_id: options.selectedDevice.deviceId,
        action,
        query_hash: customEvent.detail.queryHash,
      });
    }

    window.addEventListener(DEVTOOLS_INTERNAL_EVENT, onEvent as EventListener);
    return () => {
      window.removeEventListener(DEVTOOLS_INTERNAL_EVENT, onEvent as EventListener);
    };
  }, [options]);
}
