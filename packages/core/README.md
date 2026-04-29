# react-native-tanstack-query-devtools-core

Shared protocol primitives for React Native TanStack Query Devtools. This package defines the wire protocol, snapshot serialization/hydration, and the WebSocket transport client used by both the bridge and dashboard packages.

You typically don't install this package directly -- it's a dependency of `react-native-tanstack-query-devtools-bridge` and `react-native-tanstack-query-devtools-dashboard`.

## What's inside

### Protocol types (`types.ts`)

- `BridgeEnvelope` -- discriminated union of all message types exchanged between devices and the dashboard (snapshots, actions, session management, errors)
- `DevtoolsSnapshot` -- full serialized state of a `QueryClient` including queries, mutations, observers, and online status
- `DevtoolsAction` -- the set of remote actions the dashboard can invoke on a device (refetch, invalidate, reset, remove, setData, triggerError, etc.)

### Snapshot serialization (`dehydrate.ts`)

```ts
import { createSnapshot } from "react-native-tanstack-query-devtools-core";

const snapshot = createSnapshot({
  queryClient,
  deviceId: "device-123",
  deviceName: "My App",
  reason: "query-cache",
});
```

Walks the query and mutation caches, strips non-serializable fields (`queryFn`, `behavior`), and produces a `DevtoolsSnapshot` ready to send over the wire.

### Snapshot hydration (`hydrate.ts`)

```ts
import { applySnapshotToMirror } from "react-native-tanstack-query-devtools-core";

applySnapshotToMirror(mirrorQueryClient, snapshot);
```

Rebuilds a `QueryClient`'s cache from a snapshot. Used by the dashboard to create a mirror client that the TanStack Query Devtools panel can render. Queries are hydrated with a throwing `queryFn` to prevent accidental refetches on the mirror side.

### Transport client (`transport.ts`)

```ts
import { createBridgeClient } from "react-native-tanstack-query-devtools-core";

const client = createBridgeClient({
  createSocket: (url) => new WebSocket(url),
  host: "localhost",
  port: 9090,
  hello: { role: "react-query-device", name: "My App" },
  onMessage(frame) { /* handle incoming BridgeEnvelope */ },
  onConnect() { /* ready to send */ },
});

client.connect();
```

Manages the WebSocket lifecycle: hello/ready handshake, frame encoding/decoding, message queuing before the connection is ready, and typed send/receive. Works with both browser `WebSocket` and Node.js `ws` via the `BridgeSocketLike` interface.

### Action mapping (`actions.ts`)

Maps TanStack Query Devtools UI events (like `REFETCH`, `INVALIDATE`, `CLEAR_QUERY_CACHE`) to the protocol's `DevtoolsAction` values.

## Peer dependencies

- `@tanstack/react-query` >= 5.0.0
