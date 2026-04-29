import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { X } from "lucide-react";
import { DevtoolsWorkspace } from "./components/DevtoolsWorkspace";
import { HomeView } from "./components/HomeView";
import { Toaster } from "./components/ui/sonner";
import { useDashboardController } from "./hooks/useDashboardController";
import { cn } from "./lib/utils";

export function App() {
  const dashboard = useDashboardController();
  const [adbWarningDismissed, setAdbWarningDismissed] = useState(false);

  const showAdbWarning =
    !adbWarningDismissed &&
    dashboard.config?.adbEnabled !== false &&
    dashboard.config?.adbVersion != null &&
    dashboard.config.adbMdnsSupported === false;

  return (
    <QueryClientProvider client={dashboard.deviceSession.queryClient}>
      <div className={cn("app-shell", dashboard.resolvedTheme === "dark" && "dark")} data-theme={dashboard.resolvedTheme}>
        {showAdbWarning ? (
          <div className="flex items-center justify-center gap-3 bg-yellow-500/15 px-4 py-2 text-center text-sm text-yellow-700 dark:text-yellow-400">
            <span>
              ADB version {dashboard.config!.adbVersion} is installed. QR code pairing requires ADB &gt;= 37.0.0.
              Update Android platform-tools to enable wireless QR pairing.
            </span>
            <button
              aria-label="Dismiss ADB version warning"
              className="shrink-0 rounded p-0.5 hover:bg-yellow-500/20"
              onClick={() => setAdbWarningDismissed(true)}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}
        {dashboard.deviceSession.view === "home" ? <HomeView dashboard={dashboard} /> : null}
        {dashboard.deviceSession.view === "devtools" ? (
          <DevtoolsWorkspace
            queryClient={dashboard.deviceSession.queryClient}
            themePreference={dashboard.themePreference}
            selectedMeta={dashboard.deviceSession.selectedMeta}
            queryCount={dashboard.deviceSession.queryCount}
            mutationCount={dashboard.deviceSession.mutationCount}
            onBack={dashboard.deviceSession.closeDevice}
          />
        ) : null}
        <Toaster theme={dashboard.resolvedTheme === "dark" ? "dark" : "light"} richColors />
      </div>
    </QueryClientProvider>
  );
}
