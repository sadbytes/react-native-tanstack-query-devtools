import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "react-native-tanstack-query-devtools-bridge": path.resolve(__dirname, "packages/bridge/src/index.ts"),
      "react-native-tanstack-query-devtools-core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "react-native-tanstack-query-devtools-dashboard": path.resolve(__dirname, "packages/dashboard/src/index.tsx"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/*/test/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
