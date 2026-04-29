# React Native TanStack Query Devtools

Remote devtools for [`@tanstack/react-query`](https://tanstack.com/query) in React Native. Inspect queries, mutations, and cache state from a browser dashboard while your app runs on a device or emulator.

## Quick start

### 1. Start the dashboard

```bash
pnpm dlx react-native-tanstack-query-devtools-dashboard
```

This starts an HTTP server on port `42831` (dashboard UI) and a WebSocket server on port `9090` (bridge).

### 2. Connect your app

Install the bridge:

```bash
npm install react-native-tanstack-query-devtools-bridge
```

Create a setup file that runs only in development:

```ts
// react-query-devtools.ts
import { connectReactQueryDevtools } from "react-native-tanstack-query-devtools-bridge";
import { queryClient } from "./queryClient";

connectReactQueryDevtools({
  queryClient,
  // name: "My App",       // display name in the dashboard
  // host: "localhost",     // WebSocket host (default: localhost)
  // port: 9090,            // WebSocket port (default: 9090)
});
```

Import it conditionally:

```ts
if (__DEV__) {
  require("./react-query-devtools");
}
```

### 3. Open the dashboard

Navigate to `http://localhost:42831` in your browser. Connected apps appear automatically. Click **View devtools** to inspect a device.

## Packages

| Package | Description |
|---|---|
| [`react-native-tanstack-query-devtools-core`](./packages/core) | Shared protocol types, snapshot serialization/hydration, and transport client |
| [`react-native-tanstack-query-devtools-bridge`](./packages/bridge) | App-side plugin that connects a `QueryClient` to the dashboard |
| [`react-native-tanstack-query-devtools-dashboard`](./packages/dashboard) | CLI + web dashboard that renders the devtools UI |

## How it works

```
React Native App                Dashboard (browser)
+-----------------+             +------------------+
| QueryClient     |  snapshots  | TanStack Query   |
| + bridge plugin | ----------> | Devtools panel   |
+-----------------+  WebSocket  +------------------+
                         ^
                         |
                   Bridge Server
                   (ws://localhost:9090)
```

The **bridge** subscribes to your app's `QueryClient`, serializes cache snapshots, and streams them over a WebSocket to the **dashboard server**. The dashboard hydrates a mirror `QueryClient` and renders the official TanStack Query Devtools panel. Actions (refetch, invalidate, remove, etc.) flow back to the app in real time.

## Android emulator

The Android emulator can't reach `localhost` on the host machine directly. The dashboard handles this automatically via ADB port reversal from its UI, or you can do it manually:

```bash
adb reverse tcp:9090 tcp:9090
```

## iOS simulator

The iOS simulator can reach the host machine through `localhost`, so the default bridge settings usually work without any extra configuration.

## iOS physical device

Physical iOS devices need a host address they can reach over the local network. The bridge tries to infer that from the Metro bundle URL, and the dashboard now exposes iOS device discovery plus recommended host guidance. The iOS flow does not currently provide Android-style USB reverse tunneling.

## Configuration

### Dashboard CLI

```
rn-tanstack-query-devtools [--host 0.0.0.0] [--port 42831] [--ws-port 9090] [--log-level info] [--no-android-tools] [--no-ios-tools]
```

| Flag | Default | Description |
|---|---|---|
| `--host` | `0.0.0.0` | Bind address for both HTTP and WebSocket servers |
| `--port` | `42831` | HTTP port for the dashboard UI |
| `--ws-port` | `9090` | WebSocket port for the bridge |
| `--log-level` | `info` | Structured log level: `none`, `error`, `info`, `debug` |
| `--no-android-tools` | `false` | Disable Android device discovery and port setup |
| `--no-ios-tools` | `false` | Disable iOS simulator and physical-device discovery |

Environment variables `RN_TQ_DEVTOOLS_HOST`, `RN_TQ_DEVTOOLS_PORT`, `RN_TQ_DEVTOOLS_WS_PORT`, and `RN_TQ_DEVTOOLS_LOG_LEVEL` are also supported.

### Bridge options

See [`ConnectReactQueryDevtoolsOptions`](./packages/bridge/README.md#options) for the full list.

## Workspace commands

This monorepo uses [pnpm](https://pnpm.io) workspaces and [Turborepo](https://turbo.build):

```bash
pnpm build       # Build all packages
pnpm typecheck   # Type-check all packages
pnpm test        # Run tests (core + bridge)
pnpm dev         # Start dashboard in dev mode
pnpm clean       # Remove dist/ from all packages
```

## License

MIT
