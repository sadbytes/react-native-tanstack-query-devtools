import type { DeviceSummary } from "react-native-tanstack-query-devtools-core";
import { formatTime } from "../lib/format";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";

type ConnectedAppsPanelProps = {
  devices: DeviceSummary[];
  hasPendingVerification: boolean;
  onOpenDevtools(device: DeviceSummary): void;
};

export function ConnectedAppsPanel({ devices, hasPendingVerification, onOpenDevtools }: ConnectedAppsPanelProps) {
  const sessionLabel = (status: DeviceSummary["sessionStatus"]) => {
    if (status === "active") {
      return "live stream";
    }

    if (status === "pending") {
      return "waiting";
    }

    return "connected";
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[11px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">Connected Apps</h2>
      </div>

      {devices.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-6 py-8 text-center text-[13px] text-[var(--muted)]">
          No React Native app is connected yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {devices.map((device) => (
            <Card
              className="gap-0 rounded-none border-0 border-l-[3px] border-l-[var(--accent)] bg-[var(--surface-raised)] py-0 ring-0 transition-colors hover:bg-[var(--surface-hover)] max-[900px]:grid-cols-1"
                key={device.deviceId}
              >
              <CardContent className="grid items-center gap-3 px-3.5 py-3 [grid-template-columns:minmax(0,1fr)_auto] max-[900px]:grid-cols-1">
                <div className="min-w-0">
                  <strong className="block break-words font-mono text-[13px] leading-[1.35] font-semibold text-[var(--text-strong)]">
                    {device.deviceName}
                  </strong>
                  <span className="mt-0.5 block text-xs leading-[1.35] text-[var(--muted)]">
                  {device.platform ?? "unknown"} · {device.deviceId} · {sessionLabel(device.sessionStatus)} · seen{" "}
                  {formatTime(device.lastSeenAt)}
                  </span>
                </div>
                <Button onClick={() => onOpenDevtools(device)} disabled={hasPendingVerification}>
                  View devtools
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
