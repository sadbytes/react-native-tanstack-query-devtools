import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "react-native-tanstack-query-devtools-core";
import { createDashboardHost } from "../src/backend/createDashboardHost";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createDashboardHost", () => {
  it("resolves bundled frontend assets relative to the package instead of the CLI shim", async () => {
    vi.spyOn(process, "cwd").mockReturnValue("/tmp/fake-cwd");
    process.argv[1] = "/tmp/fake-bin/rn-tanstack-query-devtools";

    vi.spyOn(fs, "existsSync").mockImplementation((filePath) => {
      return String(filePath).endsWith("/packages/dashboard/dist/frontend/index.html");
    });
    vi.spyOn(fs, "readFileSync").mockImplementation((filePath) => {
      if (String(filePath).endsWith("/packages/dashboard/dist/frontend/index.html")) {
        return "<!doctype html><html><body>built</body></html>";
      }
      throw new Error(`Unexpected read: ${String(filePath)}`);
    });

    const host = createDashboardHost({
      dashboard: { mode: "static" },
      log: createLogger({ level: "none" }),
    });

    await expect(host.start()).resolves.toBeUndefined();
  });
});
