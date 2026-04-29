import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createMirrorSync, createSnapshot } from "../src";

function makeSnapshot(data: Record<string, unknown> = { items: [1, 2, 3] }) {
  const source = new QueryClient();
  for (const [key, value] of Object.entries(data)) {
    source.setQueryData([key], value);
  }
  return createSnapshot({
    queryClient: source,
    deviceId: "device-1",
    deviceName: "Test",
    reason: "manual",
  });
}

describe("createMirrorSync", () => {
  it("applies a snapshot to the mirror query client", () => {
    const sync = createMirrorSync();
    const snapshot = makeSnapshot({ todos: [{ id: 1 }] });

    sync.applySnapshot(snapshot);

    expect(sync.queryClient.getQueryData(["todos"])).toEqual([{ id: 1 }]);
    sync.dispose();
  });

  it("suppresses manual update callback during snapshot application", async () => {
    const onManualUpdate = vi.fn();
    const sync = createMirrorSync({ onManualUpdate });

    sync.applySnapshot(makeSnapshot({ todos: [{ id: 1 }] }));
    await Promise.resolve();

    expect(onManualUpdate).not.toHaveBeenCalled();
    sync.dispose();
  });

  it("emits manual update for user edits after the microtask window", async () => {
    const onManualUpdate = vi.fn();
    const sync = createMirrorSync({ onManualUpdate });

    sync.applySnapshot(makeSnapshot({ todos: [{ id: 1 }] }));

    // Wait for the microtask to clear the applyingSnapshot flag
    await Promise.resolve();
    await Promise.resolve();

    sync.queryClient.setQueryData(["todos"], [{ id: 2, title: "Edited" }]);
    await Promise.resolve();

    expect(onManualUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["todos"],
        data: [{ id: 2, title: "Edited" }],
      }),
    );
    sync.dispose();
  });

  it("applies multiple snapshots sequentially", () => {
    const sync = createMirrorSync();

    sync.applySnapshot(makeSnapshot({ a: "first" }));
    expect(sync.queryClient.getQueryData(["a"])).toBe("first");

    sync.applySnapshot(makeSnapshot({ a: "second", b: "new" }));
    expect(sync.queryClient.getQueryData(["a"])).toBe("second");
    expect(sync.queryClient.getQueryData(["b"])).toBe("new");

    sync.dispose();
  });

  it("clear() empties the mirror query client", () => {
    const sync = createMirrorSync();
    sync.applySnapshot(makeSnapshot({ todos: [1, 2, 3] }));

    expect(sync.queryClient.getQueryData(["todos"])).toEqual([1, 2, 3]);

    sync.clear();

    expect(sync.queryClient.getQueryData(["todos"])).toBeUndefined();
    expect(sync.queryClient.getQueryCache().getAll()).toHaveLength(0);
    sync.dispose();
  });

  it("setOnManualUpdate() dynamically changes the callback", async () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    const sync = createMirrorSync({ onManualUpdate: firstCallback });

    sync.queryClient.setQueryData(["x"], "a");
    await Promise.resolve();
    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).not.toHaveBeenCalled();

    sync.setOnManualUpdate(secondCallback);

    sync.queryClient.setQueryData(["y"], "b");
    await Promise.resolve();
    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["y"], data: "b" }),
    );

    sync.dispose();
  });

  it("setOnManualUpdate(null) removes the callback", async () => {
    const callback = vi.fn();
    const sync = createMirrorSync({ onManualUpdate: callback });

    sync.setOnManualUpdate(null);

    sync.queryClient.setQueryData(["x"], "data");
    await Promise.resolve();

    expect(callback).not.toHaveBeenCalled();
    sync.dispose();
  });

  it("dispose() stops emitting manual updates", async () => {
    const onManualUpdate = vi.fn();
    const sync = createMirrorSync({ onManualUpdate });

    sync.dispose();

    sync.queryClient.setQueryData(["x"], "after-dispose");
    await Promise.resolve();

    expect(onManualUpdate).not.toHaveBeenCalled();
  });

  it("replaces previous queries on snapshot reapplication (clear + hydrate)", () => {
    const sync = createMirrorSync();

    sync.applySnapshot(makeSnapshot({ old: "data", shared: "v1" }));
    expect(sync.queryClient.getQueryData(["old"])).toBe("data");
    expect(sync.queryClient.getQueryData(["shared"])).toBe("v1");

    // The second snapshot has no "old" key — only "shared" and "new"
    sync.applySnapshot(makeSnapshot({ shared: "v2", fresh: "added" }));
    expect(sync.queryClient.getQueryData(["old"])).toBeUndefined();
    expect(sync.queryClient.getQueryData(["shared"])).toBe("v2");
    expect(sync.queryClient.getQueryData(["fresh"])).toBe("added");

    sync.dispose();
  });
});
