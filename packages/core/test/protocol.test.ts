import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { applySnapshotToMirror, createMirrorSync, createSnapshot } from "../src";

describe("protocol", () => {
  it("serializes queries and mutations into a snapshot", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["todos"], [{ id: 1, title: "Ship bridge" }]);
    await queryClient.prefetchQuery({
      queryKey: ["profile"],
      queryFn: async () => ({ id: "u1" }),
    });

    const snapshot = createSnapshot({
      queryClient,
      deviceId: "ios-sim",
      deviceName: "iPhone 16 Pro",
      reason: "manual",
    });

    expect(snapshot.deviceId).toBe("ios-sim");
    expect(snapshot.queries).toHaveLength(2);
    expect(snapshot.queries.map((query) => query.queryHash)).toEqual(
      expect.arrayContaining([
        expect.any(String),
      ]),
    );
  });

  it("hydrates a mirror client from a snapshot", () => {
    const source = new QueryClient();
    source.setQueryData(["todos"], [{ id: 1, title: "Mirror me" }]);

    const snapshot = createSnapshot({
      queryClient: source,
      deviceId: "android-emulator",
      deviceName: "Pixel",
      reason: "manual",
    });

    const mirror = new QueryClient();
    applySnapshotToMirror(mirror, snapshot);

    expect(mirror.getQueryData(["todos"])).toEqual([{ id: 1, title: "Mirror me" }]);
  });

  it("suppresses manual update echo while applying a snapshot", async () => {
    const source = new QueryClient();
    source.setQueryData(["todos"], [{ id: 1, title: "Mirror me" }]);

    const snapshot = createSnapshot({
      queryClient: source,
      deviceId: "android-emulator",
      deviceName: "Pixel",
      reason: "manual",
    });

    const onManualUpdate = vi.fn();
    const mirrorSync = createMirrorSync({ onManualUpdate });

    mirrorSync.applySnapshot(snapshot);
    await Promise.resolve();

    expect(onManualUpdate).not.toHaveBeenCalled();
    expect(mirrorSync.queryClient.getQueryData(["todos"])).toEqual([{ id: 1, title: "Mirror me" }]);
    mirrorSync.dispose();
  });

  it("emits manual query data edits through the mirror-sync seam", async () => {
    const onManualUpdate = vi.fn();
    const mirrorSync = createMirrorSync({ onManualUpdate });

    mirrorSync.queryClient.setQueryData(["todos"], [{ id: 2, title: "Edited in mirror" }]);
    await Promise.resolve();

    expect(onManualUpdate).toHaveBeenCalledWith({
      queryHash: expect.any(String),
      queryKey: ["todos"],
      data: [{ id: 2, title: "Edited in mirror" }],
    });
    mirrorSync.dispose();
  });
});
