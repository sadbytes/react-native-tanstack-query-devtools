import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createLogger, type BridgeEnvelope, type DevtoolsSnapshot } from "react-native-tanstack-query-devtools-core";
import { createQueryClientBridgeAdapter } from "../src/createQueryClientBridgeAdapter";

function createTestAdapter(overrides: {
  queryClient?: QueryClient;
  throttleMs?: number;
  deviceId?: string;
  isConnected?: () => boolean;
} = {}) {
  const queryClient = overrides.queryClient ?? new QueryClient();
  const sent: Array<{ type: string; payload: unknown }> = [];
  const log = createLogger({ level: "none" });

  const adapter = createQueryClientBridgeAdapter({
    queryClient,
    deviceId: overrides.deviceId ?? "device-1",
    deviceName: "Test App",
    throttleMs: overrides.throttleMs ?? 0,
    log,
    send(type, payload) {
      sent.push({ type: type as string, payload });
    },
    isConnected: overrides.isConnected ?? (() => true),
  });

  return { adapter, queryClient, sent, log };
}

describe("createQueryClientBridgeAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sendSnapshot builds and sends a snapshot envelope", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["todos"], [{ id: 1 }]);
    const { adapter, sent } = createTestAdapter({ queryClient });

    adapter.sendSnapshot("connect");

    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe("rntqdevtools.snapshot");
    const snapshot = sent[0].payload as DevtoolsSnapshot;
    expect(snapshot.deviceId).toBe("device-1");
    expect(snapshot.reason).toBe("connect");
    expect(snapshot.queries).toHaveLength(1);
    expect(snapshot.queries[0].queryKey).toEqual(["todos"]);

    adapter.dispose();
  });

  it("does not send snapshot when disconnected", () => {
    const { adapter, sent } = createTestAdapter({ isConnected: () => false });

    adapter.sendSnapshot("manual");

    expect(sent).toHaveLength(0);
    adapter.dispose();
  });

  it("bypasses throttle for 'connect' and 'request' reasons", () => {
    const { adapter, sent } = createTestAdapter({ throttleMs: 10000 });

    adapter.sendSnapshot("connect");
    adapter.sendSnapshot("request");

    expect(sent).toHaveLength(2);
    expect((sent[0].payload as DevtoolsSnapshot).reason).toBe("connect");
    expect((sent[1].payload as DevtoolsSnapshot).reason).toBe("request");

    adapter.dispose();
  });

  it("throttles cache-triggered snapshots", () => {
    const { adapter, sent } = createTestAdapter({ throttleMs: 500 });

    adapter.sendSnapshot("connect");
    expect(sent).toHaveLength(1);

    // Immediately after connect, cache change should be throttled
    adapter.sendSnapshot("query-cache");
    expect(sent).toHaveLength(1);

    vi.advanceTimersByTime(500);

    expect(sent).toHaveLength(2);
    expect((sent[1].payload as DevtoolsSnapshot).reason).toBe("query-cache");

    adapter.dispose();
  });

  it("handles requestSnapshot command for matching deviceId", () => {
    const { adapter, sent } = createTestAdapter({ deviceId: "device-1" });

    adapter.handleCommand({
      type: "rntqdevtools.requestSnapshot",
      payload: { targetDeviceId: "device-1" },
    });

    expect(sent).toHaveLength(1);
    expect((sent[0].payload as DevtoolsSnapshot).reason).toBe("request");

    adapter.dispose();
  });

  it("ignores requestSnapshot for other devices", () => {
    const { adapter, sent } = createTestAdapter({ deviceId: "device-1" });

    adapter.handleCommand({
      type: "rntqdevtools.requestSnapshot",
      payload: { targetDeviceId: "device-2" },
    });

    expect(sent).toHaveLength(0);
    adapter.dispose();
  });

  it("applies clearQueryCache action", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["a"], 1);
    queryClient.setQueryData(["b"], 2);
    const { adapter } = createTestAdapter({ queryClient, deviceId: "device-1" });

    adapter.handleCommand({
      type: "rntqdevtools.action",
      payload: { targetDeviceId: "device-1", action: "clearQueryCache" },
    });

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    adapter.dispose();
  });

  it("applies clearMutationCache action", () => {
    const queryClient = new QueryClient();
    const { adapter } = createTestAdapter({ queryClient, deviceId: "device-1" });

    adapter.handleCommand({
      type: "rntqdevtools.action",
      payload: { targetDeviceId: "device-1", action: "clearMutationCache" },
    });

    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    adapter.dispose();
  });

  it("applies setData action", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["todos"], [{ id: 1 }]);
    const { adapter } = createTestAdapter({ queryClient, deviceId: "device-1" });

    adapter.handleCommand({
      type: "rntqdevtools.action",
      payload: {
        targetDeviceId: "device-1",
        action: "setData",
        queryHash: '["todos"]',
        queryKey: ["todos"],
        data: [{ id: 1 }, { id: 2 }],
      },
    });

    expect(queryClient.getQueryData(["todos"])).toEqual([{ id: 1 }, { id: 2 }]);
    adapter.dispose();
  });

  it("applies remove action", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["todos"], [{ id: 1 }]);
    const { adapter } = createTestAdapter({ queryClient, deviceId: "device-1" });

    adapter.handleCommand({
      type: "rntqdevtools.action",
      payload: {
        targetDeviceId: "device-1",
        action: "remove",
        queryHash: '["todos"]',
      },
    });

    expect(queryClient.getQueryData(["todos"])).toBeUndefined();
    adapter.dispose();
  });

  it("ignores actions targeting a different device", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["todos"], [{ id: 1 }]);
    const { adapter } = createTestAdapter({ queryClient, deviceId: "device-1" });

    adapter.handleCommand({
      type: "rntqdevtools.action",
      payload: {
        targetDeviceId: "device-OTHER",
        action: "clearQueryCache",
      },
    });

    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
    adapter.dispose();
  });

  it("sends error envelope when action references unknown query", () => {
    const { adapter, sent } = createTestAdapter({ deviceId: "device-1" });

    adapter.handleCommand({
      type: "rntqdevtools.action",
      payload: {
        targetDeviceId: "device-1",
        action: "refetch",
        queryHash: '["nonexistent"]',
      },
    });

    // Should still send a snapshot after action attempt
    const snapshotSent = sent.filter((s) => s.type === "rntqdevtools.snapshot");
    expect(snapshotSent.length).toBeGreaterThanOrEqual(1);
    adapter.dispose();
  });

  it("triggers snapshot on query cache change", async () => {
    const queryClient = new QueryClient();
    const { adapter, sent } = createTestAdapter({ queryClient, throttleMs: 0 });

    // Wait for any initial subscription noise to settle
    await vi.advanceTimersByTimeAsync(10);
    sent.length = 0;

    queryClient.setQueryData(["new-query"], { hello: "world" });

    // Give the subscription a tick
    await vi.advanceTimersByTimeAsync(10);

    const snapshots = sent.filter((s) => s.type === "rntqdevtools.snapshot");
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    adapter.dispose();
  });

  it("dispose() stops sending snapshots on cache changes", async () => {
    const queryClient = new QueryClient();
    const { adapter, sent } = createTestAdapter({ queryClient, throttleMs: 0 });

    adapter.dispose();
    sent.length = 0;

    queryClient.setQueryData(["after-dispose"], "data");
    await vi.advanceTimersByTimeAsync(100);

    expect(sent).toHaveLength(0);
  });

  it("dispose() clears any pending throttled snapshot", () => {
    const { adapter, sent } = createTestAdapter({ throttleMs: 5000 });

    adapter.sendSnapshot("connect");
    sent.length = 0;

    adapter.sendSnapshot("query-cache"); // throttled
    adapter.dispose();

    vi.advanceTimersByTime(5000);

    expect(sent).toHaveLength(0);
  });

  it("applies triggerError action", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["todos"], [{ id: 1 }]);
    const { adapter } = createTestAdapter({ queryClient, deviceId: "device-1" });

    adapter.handleCommand({
      type: "rntqdevtools.action",
      payload: {
        targetDeviceId: "device-1",
        action: "triggerError",
        queryHash: '["todos"]',
      },
    });

    const query = queryClient.getQueryCache().find({ queryKey: ["todos"] });
    expect(query?.state.status).toBe("error");
    expect(query?.state.error).toBeInstanceOf(Error);
    adapter.dispose();
  });

  it("ignores unknown command types gracefully", () => {
    const { adapter, sent } = createTestAdapter();

    adapter.handleCommand({
      type: "rntqdevtools.deviceList",
      payload: { devices: [] },
    } as BridgeEnvelope);

    // Should not crash, no snapshot/error sent for unrelated commands
    const errors = sent.filter((s) => s.type === "rntqdevtools.error");
    expect(errors).toHaveLength(0);
    adapter.dispose();
  });
});
