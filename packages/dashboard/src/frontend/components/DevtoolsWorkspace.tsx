import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools/production";
import type { DevtoolsThemePreference } from "../types";
import { StatusBox } from "./StatusBox";
import { Button } from "./ui/button";

type DevtoolsWorkspaceProps = {
  queryClient: QueryClient;
  themePreference: DevtoolsThemePreference;
  selectedMeta: string;
  queryCount: number;
  mutationCount: number;
  onBack(): void;
};

export function DevtoolsWorkspace({
  queryClient,
  themePreference,
  selectedMeta,
  queryCount,
  mutationCount,
  onBack,
}: DevtoolsWorkspaceProps) {
  return (
    <main className="grid min-h-screen min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5 bg-[var(--surface-muted)] p-3">
      <header className="grid min-w-0 items-center gap-4 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 [grid-template-columns:auto_minmax(0,1fr)_auto] max-[900px]:grid-cols-1">
        <Button onClick={onBack} variant="outline">
          Back
        </Button>
        <div>
          <div className="text-[11px] leading-none font-semibold tracking-[0.04em] text-[var(--muted)] uppercase">
            Remote TanStack Query Devtools
          </div>
          <h1 className="mt-1.5 overflow-hidden break-words font-mono text-[13px] leading-[1.35] font-medium text-[var(--text-strong)]">
            {selectedMeta}
          </h1>
        </div>
        <div className="flex shrink-0 gap-2 max-[900px]:w-full">
          <StatusBox label="Queries" value={queryCount} />
          <StatusBox label="Mutations" value={mutationCount} />
        </div>
      </header>
      <section className="devtools-stage min-h-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
        <ReactQueryDevtoolsPanel
          client={queryClient}
          theme={themePreference}
          style={{ height: "100%", width: "100%" }}
          onClose={() => undefined}
        />
      </section>
    </main>
  );
}
