# react-native-tanstack-query-devtools-dashboard

Web dashboard and bridge server for React Native TanStack Query Devtools. Runs as a CLI that starts an HTTP server (dashboard UI) and a WebSocket server (bridge relay), then renders the official TanStack Query Devtools panel for connected devices.

## Usage

Run without installing:

```bash
pnpm dlx react-native-tanstack-query-devtools-dashboard
```

Or install globally:

```bash
npm install -g react-native-tanstack-query-devtools-dashboard
rn-tanstack-query-devtools
```

The command starts two servers and prints their URLs:

```
Dashboard: http://localhost:42831
WebSocket: ws://localhost:9090
```

Open the dashboard URL in your browser. Connected apps appear automatically in the **Connected Apps** panel. Click **View devtools** to open the TanStack Query Devtools panel for that device.

## CLI options

```
rn-tanstack-query-devtools [--host 0.0.0.0] [--port 42831] [--ws-port 9090] [--log-level info] [--no-android-tools] [--no-ios-tools]
```

| Flag | Default | Description |
|---|---|---|
| `--host` | `0.0.0.0` | Bind address |
| `--port` | `42831` | HTTP port for the dashboard UI |
| `--ws-port` | `9090` | WebSocket port for the bridge relay |
| `--log-level` | `info` | Structured log level: `none`, `error`, `info`, `debug` |
| `--no-android-tools` | `false` | Disable Android tooling |
| `--no-ios-tools` | `false` | Disable iOS tooling |
| `--help`, `-h` | | Print usage info |

Environment variables are also supported:

| Variable | Maps to |
|---|---|
| `RN_TQ_DEVTOOLS_HOST` / `HOST` | `--host` |
| `RN_TQ_DEVTOOLS_PORT` / `PORT` | `--port` |
| `RN_TQ_DEVTOOLS_WS_PORT` / `WS_PORT` | `--ws-port` |
| `RN_TQ_DEVTOOLS_LOG_LEVEL` | `--log-level` |

## Architecture

### Backend

- **HTTP server** -- serves the dashboard SPA and a REST API for Android and iOS device management
- **WebSocket server** -- relays messages between devices (role `react-query-device`) and dashboards (role `react-query-dashboard`) using the protocol defined in `react-native-tanstack-query-devtools-core`

### Frontend

- React 19 SPA built with Vite
- Hydrates a mirror `QueryClient` from device snapshots
- Renders the official `@tanstack/react-query-devtools` panel against the mirror client
- Forwards devtools actions (refetch, invalidate, etc.) back to the device

### Data flow

```
Device app                Bridge server              Dashboard browser
  |                           |                           |
  |-- hello (device role) --> |                           |
  |<-- ready (clientId) ----- |                           |
  |                           | <-- hello (dashboard) --- |
  |                           | --- ready (clientId) ---> |
  |                           | --- deviceList ---------> |
  |-- snapshot -------------> | --- snapshot ------------> |
  |                           |                           |
  |                           | <-- action (refetch) ---- |
  |<-- action (refetch) ----- |                           |
  |-- snapshot (result) ----> | --- snapshot ------------> |
```

## Platform integration

The dashboard UI includes panels for:

- **ADB Devices** -- lists connected Android devices/emulators and lets you reconnect them while refreshing the required reverse port rules
- **Direct Connect** -- connect to a device by IP:port (e.g., wireless ADB)
- **iOS Devices** -- lists discovered simulators and physical devices, then shows the right host guidance for each

Android tooling removes the need to run `adb reverse` commands manually. iOS tooling focuses on discovery and diagnostics: simulators use `localhost`, while physical devices need a LAN-reachable host. Disable each platform independently with `--no-android-tools` or `--no-ios-tools`.

## REST API

The dashboard exposes a small API used by its own frontend:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/status` | Server config + connected devices |
| `GET` | `/api/adb/devices` | List ADB devices |
| `POST` | `/api/adb/reconnect` | Connect/reconnect a device and refresh reverse rules |
| `POST` | `/api/adb/connect` | Connect to a device by address |
| `POST` | `/api/adb/pairing/start` | Start a QR-based ADB pairing session |
| `GET` | `/api/adb/pairing/:id` | Poll a pairing session |
| `GET` | `/api/ios/status` | iOS tooling availability and support |
| `GET` | `/api/ios/devices` | List discovered iOS simulators and devices |
| `GET` | `/api/ios/connection-hints` | Recommended host guidance per iOS device |
| `POST` | `/api/ios/refresh` | Refresh iOS devices and host guidance |
| `GET` | `/config.json` | Dashboard frontend config (WebSocket URL, etc.) |
