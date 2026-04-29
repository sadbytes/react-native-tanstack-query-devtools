type StatusBoxProps = {
  label: string;
  value: string | number;
};

export function StatusBox({ label, value }: StatusBoxProps) {
  return (
    <div className="min-w-24 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1.5 max-[900px]:min-w-0">
      <span className="block text-xs leading-none text-[var(--muted)]">{label}</span>
      <strong className="mt-[5px] block text-sm leading-none font-semibold text-[var(--text-strong)] tabular-nums">
        {value}
      </strong>
    </div>
  );
}
