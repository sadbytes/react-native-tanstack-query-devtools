import { useState } from "react";
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import type { DashboardController } from "../hooks/useDashboardController";
import { Badge } from "./ui/badge";
import { AdbConnectionModal } from "./AdbConnectionModal";
import { ConnectedAppsPanel } from "./ConnectedAppsPanel";
import { DevicesPanel } from "./DevicesPanel";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type HomeViewProps = {
  dashboard: DashboardController;
};

export function HomeView({ dashboard }: HomeViewProps) {
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const adbEnabled = dashboard.config?.adbEnabled !== false;

  const ThemeIcon = dashboard.resolvedTheme === "dark" ? Moon : Sun;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 pb-8 max-[900px]:px-3.5 max-[900px]:pb-6">
      <header className="flex items-end justify-between gap-5 border-t-[3px] border-t-[var(--accent)] py-6 max-[900px]:flex-col max-[900px]:items-start max-[900px]:gap-3">
        <div>
          <span className="text-[11px] leading-none font-semibold tracking-[0.04em] text-[var(--muted)] uppercase">
            Remote TanStack Query Devtools
          </span>
          <h1 className="mt-1.5 text-2xl leading-tight font-bold text-[var(--text-strong)]">Dashboard</h1>
          <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-[var(--muted)]">
            <span>
              Bridge <code className="font-mono text-xs text-[var(--text)]">{dashboard.wsUrl}</code>
            </span>
            <span>
              Dashboard <code className="font-mono text-xs text-[var(--text)]">{dashboard.dashboardUrl}</code>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5 max-[900px]:flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="outline" aria-label="Change theme">
                <ThemeIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                onValueChange={(value) => dashboard.setThemePreference(value as "light" | "dark" | "system")}
                value={dashboard.themePreference}
              >
                <DropdownMenuRadioItem value="light">
                  <Sun className="size-3.5" />
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon className="size-3.5" />
                  Dark
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <Monitor className="size-3.5" />
                  System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Badge className="h-6 rounded-full px-2.5" variant="secondary">
            {dashboard.dashboard.devices.length} App{dashboard.dashboard.devices.length !== 1 ? "s" : ""}
          </Badge>
          <Badge className="h-6 rounded-full px-2.5" variant="outline">
            {adbEnabled ? `${dashboard.mobileTools.android.devices.length} Android` : "Android Off"}
          </Badge>
          <Badge className="h-6 rounded-full px-2.5" variant="outline">
            {dashboard.mobileTools.ios.devices.length} iOS
          </Badge>
        </div>
      </header>

      <div className="grid items-start gap-5 [grid-template-columns:minmax(0,1fr)_340px] max-[900px]:grid-cols-1">
        <ConnectedAppsPanel
          devices={dashboard.dashboard.devices}
          hasPendingVerification={Boolean(dashboard.deviceSession.pendingVerification)}
          onOpenDevtools={dashboard.deviceSession.openDevice}
        />
        <DevicesPanel
          iosEnabled={dashboard.config?.iosToolsEnabled !== false}
          iosSupported={dashboard.config?.iosSupported !== false}
          iosReason={dashboard.config?.iosReason}
          iosDevices={dashboard.mobileTools.ios.devices}
          iosHints={dashboard.mobileTools.ios.hints}
          iosLoading={dashboard.mobileTools.ios.loading}
          onRefreshIos={() => void dashboard.mobileTools.ios.refreshDiscovery()}
          adbEnabled={adbEnabled}
          adbDevices={dashboard.mobileTools.android.devices}
          adbLoading={dashboard.mobileTools.android.loading}
          busyDeviceSerial={dashboard.mobileTools.android.busyDeviceSerial}
          hasPendingVerification={Boolean(dashboard.deviceSession.pendingVerification)}
          onRefreshAdb={() => void dashboard.mobileTools.android.refreshDevices()}
          onOpenConnectModal={() => setIsConnectionModalOpen(true)}
          onReconnect={(device) => void dashboard.mobileTools.android.reconnectDevice(device)}
        />
      </div>

      <AdbConnectionModal
        adbEnabled={adbEnabled}
        adbMdnsSupported={dashboard.config?.adbMdnsSupported !== false}
        adbLoading={dashboard.mobileTools.android.loading}
        directPairCode={dashboard.mobileTools.android.directPairCode}
        directTarget={dashboard.mobileTools.android.directTarget}
        onClose={() => {
          setIsConnectionModalOpen(false);
          dashboard.mobileTools.pairing.clearSession();
        }}
        onDirectPairCodeChange={dashboard.mobileTools.android.setDirectPairCode}
        onConnectTarget={() => void dashboard.mobileTools.android.connectTarget()}
        onDirectTargetChange={dashboard.mobileTools.android.setDirectTarget}
        onRequestPairing={dashboard.mobileTools.pairing.startSession}
        open={isConnectionModalOpen}
        pairingBusy={dashboard.mobileTools.pairing.loading}
        pairingSession={dashboard.mobileTools.pairing.session}
      />
    </main>
  );
}
