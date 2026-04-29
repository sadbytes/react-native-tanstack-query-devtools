import { useEffect, useRef, useState, type SVGProps } from "react";
import { Link, Loader2, Plus, RefreshCw, Smartphone, Monitor as MonitorIcon } from "lucide-react";
import type { AdbDevice, IosConnectionHint, IosDevice } from "../types";
import { Button } from "./ui/button";

const Android = (props: SVGProps<SVGSVGElement>) => (
  <svg {...props} preserveAspectRatio="xMidYMid" viewBox="0 0 256 150">
    <path
      fill="#34A853"
      d="M255.285 143.47c-.084-.524-.164-1.042-.251-1.56a128.119 128.119 0 0 0-12.794-38.288 128.778 128.778 0 0 0-23.45-31.86 129.166 129.166 0 0 0-22.713-18.005c.049-.08.09-.168.14-.25 2.582-4.461 5.172-8.917 7.755-13.38l7.576-13.068c1.818-3.126 3.632-6.26 5.438-9.386a11.776 11.776 0 0 0 .662-10.484 11.668 11.668 0 0 0-4.823-5.536 11.85 11.85 0 0 0-5.004-1.61 11.963 11.963 0 0 0-2.218.018 11.738 11.738 0 0 0-8.968 5.798c-1.814 3.127-3.628 6.26-5.438 9.386l-7.576 13.069c-2.583 4.462-5.173 8.918-7.755 13.38-.282.487-.567.973-.848 1.467-.392-.157-.78-.313-1.172-.462-14.24-5.43-29.688-8.4-45.836-8.4-.442 0-.879 0-1.324.006-14.357.143-28.152 2.64-41.022 7.12a119.434 119.434 0 0 0-4.42 1.642c-.262-.455-.532-.911-.79-1.367-2.583-4.462-5.173-8.918-7.755-13.38L65.123 15.25c-1.818-3.126-3.632-6.259-5.439-9.386A11.736 11.736 0 0 0 48.5.048 11.71 11.71 0 0 0 43.49 1.66a11.716 11.716 0 0 0-4.077 4.063c-.281.474-.532.967-.742 1.473a11.808 11.808 0 0 0-.365 8.188c.259.786.594 1.554 1.023 2.296a3973.32 3973.32 0 0 1 5.439 9.386c2.53 4.357 5.054 8.713 7.58 13.069 2.582 4.462 5.168 8.918 7.75 13.38.02.038.046.075.065.112A129.184 129.184 0 0 0 45.32 64.38a129.693 129.693 0 0 0-22.2 24.015 127.737 127.737 0 0 0-9.34 15.24 128.238 128.238 0 0 0-10.843 28.764 130.743 130.743 0 0 0-1.951 9.524c-.087.518-.167 1.042-.247 1.56A124.978 124.978 0 0 0 0 149.118h256c-.205-1.891-.449-3.77-.734-5.636l.019-.012Z"
    />
    <path
      fill="#202124"
      d="M194.59 113.712c5.122-3.41 5.867-11.3 1.661-17.62-4.203-6.323-11.763-8.682-16.883-5.273-5.122 3.41-5.868 11.3-1.662 17.621 4.203 6.322 11.764 8.682 16.883 5.272ZM78.518 108.462c4.206-6.321 3.46-14.21-1.662-17.62-5.123-3.41-12.68-1.05-16.886 5.27-4.203 6.323-3.458 14.212 1.662 17.622 5.122 3.41 12.683 1.05 16.886-5.272Z"
    />
  </svg>
);

const Apple = (props: SVGProps<SVGSVGElement>) => (
  <svg {...props} xmlSpace="preserve" viewBox="0 0 814 1000">
    <path
      fill="currentColor"
      d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"
    />
  </svg>
);

/* ── ADB helpers ── */

function getDeviceLabel(device: AdbDevice) {
  const modelMatch = device.details.match(/(?:^|\s)model:([^\s]+)/i);
  if (modelMatch?.[1]) return modelMatch[1].replace(/_/g, " ");
  return device.serial;
}

function isAppleDevice(device: AdbDevice) {
  const value = `${device.serial} ${device.details}`.toLowerCase();
  return /iphone|ipad|ipod|ios|apple/.test(value);
}

/* ── iOS helpers ── */

function findHint(deviceId: string, hints: IosConnectionHint[]) {
  return hints.find((hint) => hint.deviceId === deviceId);
}

function iosSubtitle(device: IosDevice) {
  const parts: string[] = [device.kind, device.connection];
  if (device.runtime) parts.push(device.runtime);
  if (device.state) parts.push(device.state);
  return parts.join(" · ");
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-2 py-3 text-xs text-[var(--muted)]">
      <Loader2 className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function useMinimumSpinner(loading: boolean, minimumMs = 500) {
  const [showSpinner, setShowSpinner] = useState(loading);
  const startedAtRef = useRef<number | null>(loading ? Date.now() : null);

  useEffect(() => {
    if (loading) {
      startedAtRef.current = Date.now();
      setShowSpinner(true);
      return;
    }

    const startedAt = startedAtRef.current;
    if (startedAt == null) {
      setShowSpinner(false);
      return;
    }

    const remaining = Math.max(0, minimumMs - (Date.now() - startedAt));
    const timeout = window.setTimeout(() => {
      startedAtRef.current = null;
      setShowSpinner(false);
    }, remaining);

    return () => window.clearTimeout(timeout);
  }, [loading, minimumMs]);

  return showSpinner;
}

/* ── Component ── */

type DevicesPanelProps = {
  /* iOS */
  iosEnabled: boolean;
  iosSupported: boolean;
  iosReason?: string;
  iosDevices: IosDevice[];
  iosHints: IosConnectionHint[];
  iosLoading: boolean;
  onRefreshIos(): void;
  /* ADB */
  adbEnabled: boolean;
  adbDevices: AdbDevice[];
  adbLoading: boolean;
  busyDeviceSerial: string | null;
  hasPendingVerification: boolean;
  onRefreshAdb(): void;
  onOpenConnectModal(): void;
  onReconnect(device: AdbDevice): void;
};

export function DevicesPanel({
  iosEnabled,
  iosSupported,
  iosReason,
  iosDevices,
  iosHints,
  iosLoading,
  onRefreshIos,
  adbEnabled,
  adbDevices,
  adbLoading,
  busyDeviceSerial,
  hasPendingVerification,
  onRefreshAdb,
  onOpenConnectModal,
  onReconnect,
}: DevicesPanelProps) {
  const anyLoading = iosLoading || adbLoading;
  const showIosSpinner = useMinimumSpinner(iosLoading);
  const showAdbSpinner = useMinimumSpinner(adbLoading);
  const reconnectLabel = (serial: string) => `Restore localhost websocket tunnel for ${serial}`;

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface)]">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 p-3.5 pb-0">
        <div>
          <h2 className="text-[11px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">Devices</h2>
          <p className="mt-0.5 text-xs leading-[1.4] text-[var(--muted)]">
            iOS simulators and Android devices.
          </p>
        </div>
        <div className="inline-flex gap-0.5 rounded-md bg-[var(--surface)] p-0.5">
          <Button
            aria-label="Refresh all devices"
            className="size-7 border-0 text-[var(--muted)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
            disabled={anyLoading}
            onClick={() => {
              onRefreshIos();
              onRefreshAdb();
            }}
            type="button"
            size="icon-sm"
            variant="ghost"
          >
            <RefreshCw className={anyLoading ? "icon-spin" : undefined} size={16} />
          </Button>
          <Button
            aria-label="Open wireless connection options"
            className="size-7 border-0 text-[color:color-mix(in_srgb,var(--accent-strong)_70%,var(--text))] hover:border-[color:color-mix(in_srgb,var(--accent)_30%,var(--border-subtle))] hover:bg-[color:color-mix(in_srgb,var(--accent)_10%,var(--surface-hover))] hover:text-[var(--accent-strong)]"
            disabled={!adbEnabled}
            onClick={onOpenConnectModal}
            type="button"
            size="icon-sm"
            variant="ghost"
          >
            <Plus size={16} />
          </Button>
        </div>
      </div>

      {/* ── iOS section ── */}
      <div className="flex flex-col gap-1.5 p-3.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">
          <Apple className="size-3" />
          iOS
        </div>

        {!iosEnabled ? (
          <div className="px-2 py-1.5 text-center text-xs text-[var(--muted)]">iOS tooling is disabled.</div>
        ) : !iosSupported ? (
          <div className="rounded-md bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--muted)]">
            {iosReason ?? "iOS discovery tooling is unavailable on this machine."}
          </div>
        ) : showIosSpinner ? (
          <LoadingState label="Searching for iOS devices..." />
        ) : iosDevices.length === 0 ? (
          <div className="px-2 py-1.5 text-center text-xs text-[var(--muted)]">No iOS simulators or physical devices found.</div>
        ) : null}

        {!showIosSpinner && iosDevices.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {iosDevices.map((device) => {
              const hint = findHint(device.id, iosHints);
              return (
                <div className="flex flex-col gap-2 rounded-md bg-[var(--surface-muted)] p-2.5" key={device.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-strong)]">
                        {device.kind === "simulator" ? <MonitorIcon size={16} /> : <Smartphone size={16} />}
                      </div>
                      <div className="min-w-0">
                        <strong className="block break-words text-[13px] font-semibold text-[var(--text-strong)]">{device.name}</strong>
                        <span className="block break-words text-[11px] text-[var(--muted)]">{iosSubtitle(device)}</span>
                      </div>
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

      {/* ── Divider ── */}
      <div className="border-t border-[var(--border-subtle)]" />

      {/* ── Android section ── */}
      <div className="flex flex-col gap-1.5 p-3.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.06em] text-[var(--muted)] uppercase">
          <Android className="size-3" />
          Android
        </div>

        {!adbEnabled ? (
          <div className="px-2 py-1.5 text-center text-xs text-[var(--muted)]">Android device support is disabled.</div>
        ) : showAdbSpinner ? (
          <LoadingState label="Searching for Android devices..." />
        ) : adbDevices.length === 0 ? (
          <div className="px-2 py-1.5 text-center text-xs text-[var(--muted)]">
            No devices found. Connect a device or start an emulator.
          </div>
        ) : null}

        {!showAdbSpinner && adbDevices.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {adbDevices.map((device) => {
              const appleDevice = isAppleDevice(device);

              return (
                <div className="flex flex-col gap-2 rounded-md bg-[var(--surface-muted)] p-2.5" key={device.serial}>
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-strong)] data-[platform=android]:bg-[color:color-mix(in_srgb,#34a853_10%,var(--surface-raised))]"
                        data-platform={appleDevice ? "ios" : "android"}
                      >
                        {appleDevice ? <Apple className="block size-[18px]" /> : <Android className="block size-[18px]" />}
                      </div>
                      <strong className="block break-words text-[13px] font-semibold text-[var(--text-strong)]">
                        {getDeviceLabel(device)}
                      </strong>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        aria-label={reconnectLabel(device.serial)}
                        className="size-7 border-0 text-[var(--muted)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-strong)]"
                        onClick={() => onReconnect(device)}
                        disabled={hasPendingVerification || busyDeviceSerial === device.serial}
                        title={reconnectLabel(device.serial)}
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Link size={14} />
                      </Button>
                    </div>
                  </div>
                  <span className="block break-words text-[11px] text-[var(--muted)]">
                    {device.state}
                    {device.details ? ` · ${device.details}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
