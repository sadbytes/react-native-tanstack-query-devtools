import { RefreshCw } from "lucide-react";
import type { IosConnectionHint, IosDevice } from "../types";
import { Button } from "./ui/button";

type IosDevicesPanelProps = {
  iosEnabled: boolean;
  iosSupported: boolean;
  iosReason?: string;
  iosDevices: IosDevice[];
  iosHints: IosConnectionHint[];
  iosLoading: boolean;
  onRefresh(): void;
};

function findHint(deviceId: string, hints: IosConnectionHint[]) {
  return hints.find((hint) => hint.deviceId === deviceId);
}

function subtitle(device: IosDevice) {
  const parts: string[] = [device.kind, device.connection];
  if (device.runtime) parts.push(device.runtime);
  if (device.state) parts.push(device.state);
  return parts.join(" · ");
}

export function IosDevicesPanel({
  iosEnabled,
  iosSupported,
  iosReason,
  iosDevices,
  iosHints,
  iosLoading,
  onRefresh,
}: IosDevicesPanelProps) {
  return (
    <div className="flex flex-col gap-3 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">iOS Devices</h2>
          <p className="mt-0.5 text-xs leading-[1.4] text-[var(--muted)]">Simulator discovery and physical-device host guidance.</p>
        </div>
        <Button
          aria-label="Refresh iOS devices"
          className="size-7 border-0 text-[var(--muted)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
          disabled={iosLoading || !iosEnabled}
          onClick={onRefresh}
          type="button"
          size="icon-sm"
          variant="ghost"
        >
          <RefreshCw className={iosLoading ? "icon-spin" : undefined} size={16} />
        </Button>
      </div>

      {!iosEnabled ? <div className="px-3 py-2 text-center text-xs text-[var(--muted)]">iOS tooling is disabled.</div> : null}
      {iosEnabled && !iosSupported ? (
        <div className="rounded-md bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--muted)]">
          {iosReason ?? "iOS discovery tooling is unavailable on this machine."}
        </div>
      ) : null}
      {iosEnabled && iosSupported && !iosLoading && iosDevices.length === 0 ? (
        <div className="px-3 py-2 text-center text-xs text-[var(--muted)]">No iOS simulators or physical devices found.</div>
      ) : null}

      {iosDevices.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {iosDevices.map((device) => {
            const hint = findHint(device.id, iosHints);
            return (
              <div className="flex flex-col gap-2 rounded-md bg-[var(--surface-muted)] p-2.5" key={device.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <strong className="block break-words text-[13px] font-semibold text-[var(--text-strong)]">{device.name}</strong>
                    <span className="block break-words text-[11px] text-[var(--muted)]">{subtitle(device)}</span>
                  </div>
                  <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] uppercase tracking-[0.04em] text-[var(--muted)]">
                    {device.kind}
                  </span>
                </div>
                {hint ? (
                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5 py-2 text-[11px] text-[var(--muted)]">
                    <div className="font-medium text-[var(--text-strong)]">
                      {hint.recommendedHost ? `Use host ${hint.recommendedHost}` : "Host reconfiguration required"}
                    </div>
                    <div className="mt-1">{hint.explanation}</div>
                    {hint.candidateHosts.length > 0 ? (
                      <div className="mt-1.5 break-words">
                        Candidate LAN hosts: <code>{hint.candidateHosts.join(", ")}</code>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
