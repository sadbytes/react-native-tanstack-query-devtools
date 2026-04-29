# react-native-tanstack-query-devtools-bridge

App-side plugin that connects a `@tanstack/react-query` `QueryClient` to the remote devtools dashboard. Subscribes to cache changes, streams serialized snapshots over WebSocket, and applies actions sent back from the dashboard (refetch, invalidate, reset, etc.).

## Installation

```bash
npm install react-native-tanstack-query-devtools-bridge
```

Peer dependencies: `@tanstack/react-query` >= 5.0.0 and `react` >= 18.0.0.

## Usage

### Imperative API

```ts
// react-query-devtools.ts
import { connectReactQueryDevtools } from "react-native-tanstack-query-devtools-bridge";
import { queryClient } from "./queryClient";

const connection = connectReactQueryDevtools({
  queryClient,
  name: "My App",
});

// connection.disconnect()   -- stop streaming and close the socket
// connection.sendSnapshot() -- force a snapshot outside of cache events
// connection.isConnected()  -- check if the bridge is connected
```

Load it conditionally so the bridge is stripped from production builds:

```ts
if (__DEV__) {
  require("./react-query-devtools");
}
```

### React component API

```tsx
import { ReactQueryDevtoolsBridge } from "react-native-tanstack-query-devtools-bridge";

function App() {
  return (
    <>
      {__DEV__ && <ReactQueryDevtoolsBridge queryClient={queryClient} />}
      {/* ... */}
    </>
  );
}
```

The component connects on mount and disconnects on unmount. It accepts the same options as `connectReactQueryDevtools`.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `queryClient` | `QueryClient` | *required* | The query client to observe |
| `enabled` | `boolean` | `NODE_ENV !== "production"` | Enable/disable the bridge |
| `logLevel` | `"none" \| "error" \| "info" \| "debug"` | `"none"` | Emit structured bridge lifecycle logs |
| `autoConnect` | `boolean` | `true` | Connect immediately on creation |
| `name` | `string` | `"React Native"` | Display name in the dashboard |
| `deviceId` | `string` | auto-generated | Stable device identifier |
| `host` | `string` | Metro host when available, otherwise `"localhost"` | WebSocket host |
| `port` | `number` | `9090` | WebSocket port |
| `secure` | `boolean` | `false` | Use `wss://` instead of `ws://` |
| `throttleMs` | `number` | `100` | Minimum delay (ms) between snapshot sends |
| `includeMutations` | `boolean` | `false` | Include mutation cache in snapshots |
| `logger` | `{ log(prefix, payload); error(prefix, payload) }` | `console` | Custom log sink |

## Auto-reconnection

The bridge automatically reconnects when the WebSocket closes or the dashboard server becomes unreachable. It retries every 1 second with a 5-second handshake timeout per attempt. No configuration is needed -- just start the dashboard whenever you're ready and the app will connect.

## Production builds

The package exports a `./production` entry point that tree-shakes the entire bridge:

```ts
import { connectReactQueryDevtools } from "react-native-tanstack-query-devtools-bridge/production";

// Returns a no-op DevtoolsConnection -- zero runtime cost
connectReactQueryDevtools({ queryClient });
```

The package is marked `"sideEffects": false` to help bundlers eliminate unused code.

## Supported actions

The dashboard can send these actions back to the app:

`refetch`, `invalidate`, `reset`, `remove`, `setData`, `triggerError`, `restoreError`, `triggerLoading`, `restoreLoading`, `clearQueryCache`, `clearMutationCache`, `setOnline`
