# Architecture Overview

React Native TanStack Query Devtools is a remote debugging tool that lets you inspect your React Native app's TanStack Query cache from a browser dashboard.

## System Architecture

```
                           React Native App
                        +--------------------+
                        |    QueryClient     |
                        |         +          |
                        |    Bridge Plugin   |
                        +--------+-----------+
                                 |
                          WebSocket (snapshots + actions)
                                 |
                                 v
                        +--------------------+
                        |   Bridge Server    |
                        | (ws://localhost:9090)
                        +--------+-----------+
                                 |
                          WebSocket (forwarding)
                                 |
                                 v
                        +--------------------+
                        |     Dashboard      |
                        | (http://localhost:42831)
                        |         +          |
                        |  Mirror QueryClient |
                        |         +          |
                        | TanStack Devtools  |
                        +--------------------+
```

## Key Concepts

### Snapshots

The bridge serializes the entire QueryClient state (queries, mutations, observers) into a **snapshot**. Snapshots are sent:

1. On initial connection
2. When the query or mutation cache changes (throttled)
3. On explicit request from the dashboard
4. After an action is applied

### Actions

The dashboard can send **actions** back to the app:

- `refetch` - Re-fetch a query
- `invalidate` - Invalidate a query
- `reset` - Reset a query to initial state
- `remove` - Remove a query from cache
- `setData` - Set query data directly
- `triggerError` / `restoreError` - Simulate error states
- `triggerLoading` / `restoreLoading` - Simulate loading states
- `clearQueryCache` / `clearMutationCache` - Clear all queries/mutations
- `setOnline` - Toggle online manager state

### Mirror QueryClient

The dashboard creates a local `QueryClient` that mirrors the remote app's state. When snapshots arrive, the mirror is hydrated with the serialized data. The official TanStack Query Devtools panel renders against this mirror client.

### Protocol Frames

All communication uses JSON frames with a `type` field:

| Frame Type | Direction | Purpose |
|------------|-----------|---------|
| `rntqdevtools.hello` | App/Dashboard -> Server | Initial handshake with role and device info |
| `rntqdevtools.ready` | Server -> App/Dashboard | Handshake accepted, assigns clientId |
| `rntqdevtools.snapshot` | App -> Dashboard | Serialized QueryClient state |
| `rntqdevtools.requestSnapshot` | Dashboard -> App | Request fresh snapshot |
| `rntqdevtools.action` | Dashboard -> App | Devtools action to apply |
| `rntqdevtools.deviceList` | Server -> Dashboard | List of connected apps |
| `rntqdevtools.error` | Any -> Dashboard | Error notification |
| `rntqdevtools.online` | App -> Dashboard | Online status change |

The protocol type definitions also include session-oriented envelopes (`sessionRequest`, `sessionAccept`, `sessionReject`, `sessionStarted`, `sessionEnded`) so the wire format can evolve without changing package boundaries.

## ADB Integration

For Android emulators, the dashboard includes ADB integration:

1. **Port forwarding**: Sets up `adb reverse` so the emulator can reach `localhost` on the host
2. **Device discovery**: Lists connected ADB devices
3. **Wireless pairing**: QR code-based wireless ADB pairing (Android 11+)

The ADB binary is automatically downloaded to a cache directory if not found in PATH.

## Security Considerations

- The bridge operates over unencrypted WebSocket by default (development only)
- No authentication - any dashboard or app on the network can connect
- Actions can modify app state - ensure devtools are disabled in production
- The bridge auto-disables when `process.env.NODE_ENV === "production"` unless you override `enabled`
