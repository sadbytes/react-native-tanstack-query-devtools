import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Info, QrCode, RefreshCw, Wifi } from "lucide-react";
import type { AdbPairingSession, AdbPairingStatus } from "../types";
import { DirectConnectForm } from "./DirectConnectPanel";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

type AdbConnectionModalProps = {
  open: boolean;
  adbEnabled: boolean;
  adbMdnsSupported: boolean;
  adbLoading: boolean;
  directPairCode: string;
  directTarget: string;
  pairingBusy: boolean;
  pairingSession: AdbPairingSession | null;
  onDirectPairCodeChange(value: string): void;
  onDirectTargetChange(value: string): void;
  onConnectTarget(): void;
  onRequestPairing(): Promise<void> | void;
  onClose(): void;
};

function statusLabel(session: AdbPairingSession | null) {
  switch (session?.status) {
    case "pairing":
      return "Pairing in progress";
    case "connecting":
      return "Connecting over ADB";
    case "connected":
      return "Connected";
    case "failed":
      return "Pairing failed";
    case "expired":
      return "QR expired";
    case "waiting-for-scan":
      return "Waiting for scan";
    default:
      return "Preparing QR";
  }
}

function statusCopy(session: AdbPairingSession | null) {
  switch (session?.status) {
    case "pairing":
      return "Scan received. The dashboard is pairing through the device's ADB pairing service.";
    case "connecting":
      return "Pairing succeeded. Waiting for the wireless ADB endpoint to accept a secure connection.";
    case "connected":
      return session.output ?? "Wireless ADB is connected.";
    case "failed":
      return session.error ?? "The pairing flow failed before a device connected.";
    case "expired":
      return session.error ?? "The QR pairing window expired. Generate a new QR code and scan again.";
    case "waiting-for-scan":
      return "Open the QR pairing option in your device's wireless debugging settings, then scan this code.";
    default:
      return "Generating a fresh pairing QR code.";
  }
}

function statusBadgeVariant(status: AdbPairingStatus | undefined): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "connected":
      return "default";
    case "pairing":
    case "connecting":
      return "secondary";
    case "failed":
    case "expired":
      return "destructive";
    default:
      return "outline";
  }
}

function AnimatedHeight({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  const updateHeight = useCallback(() => {
    if (innerRef.current) {
      setHeight(innerRef.current.scrollHeight);
    }
  }, []);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateHeight]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden transition-[height] duration-200 ease-in-out"
      style={{ height: height === "auto" ? "auto" : `${height}px` }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

export function AdbConnectionModal({
  open,
  adbEnabled,
  adbMdnsSupported,
  adbLoading,
  directPairCode,
  directTarget,
  pairingBusy,
  pairingSession,
  onDirectPairCodeChange,
  onDirectTargetChange,
  onConnectTarget,
  onRequestPairing,
  onClose,
}: AdbConnectionModalProps) {
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const pairingLabel = useMemo(() => statusLabel(pairingSession), [pairingSession]);
  const pairingCopy = useMemo(() => statusCopy(pairingSession), [pairingSession]);

  useEffect(() => {
    if (!open || !adbEnabled || !adbMdnsSupported) {
      return;
    }

    void onRequestPairing();
  }, [adbEnabled, adbMdnsSupported, onRequestPairing, open]);

  useEffect(() => {
    let cancelled = false;

    async function renderQrCode() {
      if (!pairingSession?.qrValue) {
        setQrSrc(null);
        return;
      }

      const nextQrSrc = await QRCode.toDataURL(pairingSession.qrValue, {
        errorCorrectionLevel: "M",
        margin: 1,
        scale: 8,
      });

      if (!cancelled) {
        setQrSrc(nextQrSrc);
      }
    }

    void renderQrCode();

    return () => {
      cancelled = true;
    };
  }, [pairingSession?.qrValue]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect a Device</DialogTitle>
          <DialogDescription>
            Pair via QR code or connect directly to a wireless ADB target.
          </DialogDescription>
        </DialogHeader>

        {!adbEnabled ? (
          <p className="py-4 text-center text-sm text-muted-foreground">ADB support is disabled for this dashboard.</p>
        ) : (
          <Tabs defaultValue={adbMdnsSupported ? "qr" : "direct"}>
            <TabsList variant="line">
              <TabsTrigger value="qr" disabled={!adbMdnsSupported}>
                <QrCode className="size-3.5" />
                QR Pairing
              </TabsTrigger>
              <TabsTrigger value="direct">
                <Wifi className="size-3.5" />
                Direct Connect
              </TabsTrigger>
            </TabsList>

            <AnimatedHeight>
              <TabsContent value="qr" className="flex flex-col gap-3 pt-3">
                {pairingSession?.status && pairingSession.status !== "waiting-for-scan" && (
                  <Badge className="w-fit" variant={statusBadgeVariant(pairingSession.status)}>{pairingLabel}</Badge>
                )}

                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-muted-foreground">{pairingCopy}</p>
                  <Button
                    aria-label="Generate a new ADB pairing QR code"
                    className="shrink-0"
                    disabled={pairingBusy}
                    onClick={() => void onRequestPairing()}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <RefreshCw className={pairingBusy ? "animate-spin" : undefined} />
                  </Button>
                </div>

                <div className="flex min-h-[200px] items-center justify-center rounded-lg border bg-muted/30 p-4">
                  {qrSrc ? (
                    <img
                      alt="ADB wireless debugging pairing QR code"
                      className="h-auto w-full max-w-[200px] rounded"
                      src={qrSrc}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {pairingBusy ? "Generating QR..." : "Preparing..."}
                    </span>
                  )}
                </div>

                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">mDNS name</dt>
                  <dd className="truncate font-mono">{pairingSession?.serviceName ?? "..."}</dd>
                  <dt className="text-muted-foreground">Endpoint</dt>
                  <dd className="truncate font-mono">{pairingSession?.endpoint ?? "Waiting for device..."}</dd>
                </dl>

                <Alert>
                  <Info className="size-4" />
                  <AlertDescription>
                    Use your device's built-in wireless debugging scanner to pair. Generic QR code apps won't
                    start ADB pairing.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="direct" className="flex flex-col gap-3 pt-3">
                <p className="text-sm text-muted-foreground">
                  Enter a wireless ADB address, and optionally a pairing code for first-time setup.
                </p>
                <DirectConnectForm
                  adbEnabled={adbEnabled}
                  adbLoading={adbLoading}
                  directPairCode={directPairCode}
                  directTarget={directTarget}
                  onDirectPairCodeChange={onDirectPairCodeChange}
                  onConnectTarget={onConnectTarget}
                  onDirectTargetChange={onDirectTargetChange}
                />
                <Alert>
                  <Info className="size-4" />
                  <AlertDescription>
                    Without a pairing code, this runs <code>adb connect host:port</code>. With a pairing code, it pairs
                    first and then connects to the discovered wireless debugging endpoint.
                  </AlertDescription>
                </Alert>
                {!adbMdnsSupported && (
                  <Alert>
                    <Info className="size-4" />
                    <AlertDescription>
                      QR pairing and automatic post-pair connect require ADB &gt;= 37.0.0. Update Android
                      platform-tools to enable them.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>
            </AnimatedHeight>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
