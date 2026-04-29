import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DevtoolsLogger } from "react-native-tanstack-query-devtools-core";

type StaticDashboardOptions = {
  mode?: "static";
};

type ViteDashboardOptions = {
  mode: "vite";
  root: string;
  configFile: string;
};

type DashboardOptions = StaticDashboardOptions | ViteDashboardOptions | undefined;

type ViteDevServer = {
  middlewares: (
    request: http.IncomingMessage,
    response: http.ServerResponse,
    next: (error?: unknown) => void,
  ) => void;
  close(): Promise<void>;
};

function readDashboardAsset(filePath: string) {
  return fs.readFileSync(filePath);
}

function dashboardDir() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const entryDir = path.dirname(process.argv[1] ?? process.cwd());
  const candidates = [
    path.resolve(moduleDir, "../../dist/frontend"),
    path.resolve(moduleDir, "frontend"),
    path.resolve(entryDir, "frontend"),
    path.resolve(entryDir, "../dist/frontend"),
    path.resolve(process.cwd(), "dist/frontend"),
    path.resolve(process.cwd(), "packages/dashboard/dist/frontend"),
  ];

  const candidate = candidates.find((dir) => fs.existsSync(path.join(dir, "index.html")));
  if (!candidate) {
    throw new Error(
      "Dashboard assets were not found. Run `pnpm --filter react-native-tanstack-query-devtools-dashboard build` before starting the server.",
    );
  }

  const indexHtml = fs.readFileSync(path.join(candidate, "index.html"), "utf8");
  if (indexHtml.includes("main.tsx")) {
    throw new Error(
      `Refusing to serve source dashboard HTML from ${candidate}. Run the dashboard package build so dist/frontend is generated.`,
    );
  }

  return candidate;
}

export function createDashboardHost(options: { dashboard: DashboardOptions; log: DevtoolsLogger }) {
  let publicDir: string | null = null;
  let viteServer: ViteDevServer | null = null;

  return {
    async start() {
      if (options.dashboard?.mode === "vite") {
        const { createServer } = await import("vite");
        viteServer = await createServer({
          configFile: options.dashboard.configFile,
          root: options.dashboard.root,
          server: {
            middlewareMode: true,
          },
          appType: "spa",
        });
        options.log.log("dashboard.server_ready", { mode: "vite", root: options.dashboard.root });
        return;
      }

      publicDir = dashboardDir();
      options.log.log("dashboard.server_ready", { mode: "static", root: publicDir });
    },
    async stop() {
      await viteServer?.close();
      viteServer = null;
    },
    handleRequest(request: http.IncomingMessage, response: http.ServerResponse) {
      if (viteServer) {
        viteServer.middlewares(request, response, (error?: unknown) => {
          if (error) {
            response.writeHead(500);
            response.end(error instanceof Error ? (error.stack ?? error.message) : String(error));
            return;
          }
          response.writeHead(404);
          response.end("Not found");
        });
        return;
      }

      const staticDir = publicDir ?? dashboardDir();
      const url = new URL(request.url ?? "/", "http://localhost");
      const urlPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = path.join(staticDir, urlPath);

      if (!filePath.startsWith(staticDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        const indexPath = path.join(staticDir, "index.html");
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(readDashboardAsset(indexPath));
        return;
      }

      const ext = path.extname(filePath);
      const contentType =
        ext === ".js"
          ? "text/javascript; charset=utf-8"
          : ext === ".css"
            ? "text/css; charset=utf-8"
            : ext === ".json"
              ? "application/json; charset=utf-8"
              : "text/html; charset=utf-8";
      response.setHeader("content-type", contentType);
      response.end(readDashboardAsset(filePath));
    },
  };
}
