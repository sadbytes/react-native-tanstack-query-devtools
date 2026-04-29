import { Button } from "./ui/button";
import { Input } from "./ui/input";

type DirectConnectFormProps = {
  adbEnabled: boolean;
  adbLoading: boolean;
  directPairCode: string;
  directTarget: string;
  onDirectPairCodeChange(value: string): void;
  onDirectTargetChange(value: string): void;
  onConnectTarget(): void;
};

export function DirectConnectForm({
  adbEnabled,
  adbLoading,
  directPairCode,
  directTarget,
  onDirectPairCodeChange,
  onDirectTargetChange,
  onConnectTarget,
}: DirectConnectFormProps) {
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onConnectTarget();
      }}
    >
      <div className="flex gap-2">
        <Input
          className="h-8 flex-1 font-mono text-xs"
          value={directTarget}
          onChange={(event) => onDirectTargetChange(event.target.value)}
          placeholder="host:port"
          disabled={adbLoading || !adbEnabled}
        />
        <Button size="sm" disabled={!directTarget.trim() || adbLoading || !adbEnabled}>
          Connect
        </Button>
      </div>
      <Input
        className="h-8 font-mono text-xs"
        value={directPairCode}
        onChange={(event) => onDirectPairCodeChange(event.target.value)}
        placeholder="Pairing code (optional)"
        disabled={adbLoading || !adbEnabled}
        inputMode="numeric"
      />
    </form>
  );
}
