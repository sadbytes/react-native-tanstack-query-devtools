# Package Reference

This monorepo contains three packages that work together.

## react-native-tanstack-query-devtools-core

**Location**: `packages/core`

Shared protocol definitions and runtime utilities used by both the bridge and dashboard.

### Exports

| Export | Description |
|--------|-------------|
| `PROTOCOL_VERSION` | Current protocol version (`1`) |
| `createSnapshot()` | Serialize a `QueryClient` to a snapshot |
| `applySnapshotToMirror()` | Hydrate a mirror `QueryClient` from a snapshot |
| `createBridgeClient()` | Low-level WebSocket client for the bridge protocol |
| `createBridgeRuntime()` | Auto-reconnecting bridge runtime built on top of the transport client |
| `createMirrorSync()` | Mirror `QueryClient` helper that also reports manual edits |
| `createLogger()` | Structured logger used by the bridge and dashboard |
| `dashboardEventToAction` | Maps TanStack devtools events to protocol action names |
| `DEVTOOLS_INTERNAL_EVENT` | Window event name used by the dashboard event bridge |

### Common types

- `DevtoolsSnapshot` - Serialized `QueryClient` state
- `BridgeEnvelope` - Union of protocol message types
- `DevtoolsAction` - Valid remote action names
- `DeviceSummary` - Connected device metadata
- `DevicePlatform` - Platform identifiers (`android`, `ios`, `macos`, `web`, `windows`)
- `LogLevel` - Structured logging level (`none`, `error`, `info`, `debug`)

### Source files

| File | Purpose |
|------|---------|
| `types.ts` | Protocol types and message envelopes |
| `actions.ts` | Dashboard event mapping |
| `dehydrate.ts` | Snapshot serialization |
| `hydrate.ts` | Snapshot hydration into a mirror client |
| `transport.ts` | Typed WebSocket transport client |
| `runtime.ts` | Reconnection and handshake runtime |
| `mirrorSync.ts` | Mirror `QueryClient` synchronization helper |
| `logger.ts` | Structured logging primitives |

---

## react-native-tanstack-query-devtools-bridge

**Location**: `packages/bridge`

The app-side package that connects a `QueryClient` to the dashboard bridge server.

### Exports

| Export | Description |
|--------|-------------|
| `connectReactQueryDevtools()` | Connect a `QueryClient` to the bridge imperatively |
| `ReactQueryDevtoolsBridge` | React component wrapper around the same bridge connection |
| `ConnectReactQueryDevtoolsOptions` | Bridge configuration type |
| `DevtoolsConnection` | Returned connection handle with `connect`, `disconnect`, `sendSnapshot`, and `isConnected` |

### Key options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `queryClient` | `QueryClient` | required | `QueryClient` to observe and control |
| `enabled` | `boolean` | `process.env.NODE_ENV !== "production"` | Enable or disable the bridge |
| `logLevel` | `LogLevel` | `"none"` | Structured bridge log level |
| `autoConnect` | `boolean` | `true` | Connect immediately on creation |
| `name` | `string` | `"React Native"` | Display name shown in the dashboard |
| `deviceId` | `string` | auto-generated | Stable device identifier |
| `host` | `string` | Metro host when available, otherwise `"localhost"` | WebSocket host |
| `port` | `number` | `9090` | WebSocket port |
| `secure` | `boolean` | `false` | Use `wss://` instead of `ws://` |
| `throttleMs` | `number` | `100` | Minimum delay between cache-driven snapshot sends |
| `includeMutations` | `boolean` | `false` | Include mutation cache in snapshots |
| `logger` | `LoggerOutput` | `console` | Custom log sink implementing `log` and `error` |

### Source files

| File | Purpose |
|------|---------|
| `connectReactQueryDevtools.ts` | Main bridge implementation |
| `createQueryClientBridgeAdapter.ts` | Adapts `QueryClient` cache changes and actions |
| `inferHost.ts` | Infers host from Metro when possible |
| `production.ts` | No-op exports for production-only imports |

---

## react-native-tanstack-query-devtools-dashboard

**Location**: `packages/dashboard`

CLI and browser dashboard for inspecting connected React Native apps.

### CLI usage

```bash
npx react-native-tanstack-query-devtools-dashboard [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--host` | `0.0.0.0` | Bind address |
| `--port` | `42831` | HTTP port for the dashboard |
| `--ws-port` | `9090` | WebSocket port for the bridge |
| `--log-level` | `info` | Structured log level |
| `--no-android-tools` | `false` | Disable Android tooling |
| `--no-ios-tools` | `false` | Disable iOS tooling |

Environment variables: `RN_TQ_DEVTOOLS_HOST`, `RN_TQ_DEVTOOLS_PORT`, `RN_TQ_DEVTOOLS_WS_PORT`, `RN_TQ_DEVTOOLS_LOG_LEVEL`

### Backend components

| File | Purpose |
|------|---------|
| `index.tsx` | Production CLI entry point |
| `dev.ts` | Development-mode entry with Vite middleware |
| `cli-utils.ts` | Shared CLI helpers |
| `backend/createBridgeServer.ts` | HTTP server + WebSocket bridge bootstrap |
| `backend/bridgeSocketServer.ts` | Low-level WebSocket server |
| `backend/createBridgeRegistry.ts` | Tracks connected devices and dashboards |
| `backend/createAndroidToolsBackend.ts` | Android reconnect and pairing backend |
| `backend/createIosToolsBackend.ts` | iOS discovery and connection hints |
| `backend/createDashboardApiRouter.ts` | REST API router used by the SPA |

### Frontend components

| Component | Purpose |
|-----------|---------|
| `App.tsx` | Root application shell |
| `HomeView.tsx` | Dashboard landing view |
| `DevtoolsWorkspace.tsx` | TanStack Query Devtools workspace |
| `ConnectedAppsPanel.tsx` | Connected app list |
| `DevicesPanel.tsx` | Combined mobile tooling surface |
| `AdbDevicesPanel.tsx` | Android device list and reconnect controls |
| `AdbConnectionModal.tsx` | Wireless ADB pairing and direct connect UI |
| `IosDevicesPanel.tsx` | iOS simulators, devices, and host hints |
| `DirectConnectPanel.tsx` | Manual Android target connection form |

### Frontend hooks

| Hook | Purpose |
|------|---------|
| `useDashboardController` | Top-level dashboard state composition |
| `useBridgeDashboard` | WebSocket connection to the bridge server |
| `useDeviceSession` | Device selection and snapshot verification workflow |
| `useMirrorQueryClient` | Mirror `QueryClient` lifecycle |
| `useDevtoolsEventBridge` | Forward TanStack devtools actions back to the app |
| `useTanStackDevtoolsTheme` | Theme handling for the embedded devtools |

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config.json` | Dashboard configuration |
| GET | `/api/status` | Dashboard/server config payload |
| GET | `/api/adb/devices` | List Android ADB devices |
| POST | `/api/adb/reconnect` | Connect/reconnect a device and refresh reverse rules |
| POST | `/api/adb/connect` | Connect to a wireless ADB target |
| POST | `/api/adb/pairing/start` | Start a QR pairing session |
| GET | `/api/adb/pairing/:id` | Poll pairing session status |
| GET | `/api/ios/status` | iOS tooling availability |
| GET | `/api/ios/devices` | List discovered iOS devices |
| GET | `/api/ios/connection-hints` | Host guidance per iOS device |
| POST | `/api/ios/refresh` | Refresh iOS discovery data |
