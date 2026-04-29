# Data Flow

This document describes how data flows through the system.

## Connection Flow

```
1. Dashboard starts HTTP server (port 42831) and WebSocket server (port 9090)

2. React Native app calls connectReactQueryDevtools()
   |
   v
3. Bridge opens WebSocket to ws://localhost:9090
   |
   v
4. Bridge sends hello frame:
   {
     type: "rntqdevtools.hello",
     payload: {
       role: "react-query-device",
       name: "My App",
       deviceId: "abc123",
       platform: "ios",
       protocolVersion: 1
     }
   }
   |
   v
5. Server responds with ready frame:
   {
     type: "rntqdevtools.ready",
     payload: { clientId: "xyz789" }
   }
   |
   v
6. Bridge immediately sends initial snapshot
   |
   v
7. Server broadcasts `deviceList` to all connected dashboards
```

## Snapshot Flow

```
QueryClient cache change (query fetched, mutation runs, etc.)
   |
   v
Bridge's cache subscription fires
   |
   v
Throttle check (100ms default)
   |
   +-- Under throttle --> Schedule delayed send
   |
   +-- Ready to send --> Build snapshot
                              |
                              v
                         createSnapshot() serializes:
                         - All queries (hash, key, state, observers)
                         - All mutations (id, key, state)
                         - Device metadata
                         - Timestamp
                              |
                              v
                         Send to server
                              |
                              v
                         Server forwards to all dashboards
                              |
                              v
                         Dashboard receives snapshot
                              |
                              v
                         applySnapshotToMirror() hydrates mirror QueryClient
                              |
                              v
                         React Query devtools panel re-renders
```

## Action Flow

```
User clicks action in devtools panel (e.g., "Refetch")
   |
   v
TanStack Devtools fires window event: "@tanstack/query-devtools-event"
   |
   v
useDevtoolsEventBridge hook catches event
   |
   v
Maps event type to action name (REFETCH -> "refetch")
   |
   v
Sends action frame to bridge server:
{
  type: "rntqdevtools.action",
  payload: {
    targetDeviceId: "abc123",
    action: "refetch",
    queryHash: '["todos"]'
  }
}
   |
   v
Server routes to target device's WebSocket
   |
   v
Bridge receives action
   |
   v
applyAction() executes on real QueryClient:
- refetch: query.fetch()
- invalidate: queryClient.invalidateQueries()
- reset: queryClient.resetQueries()
- remove: queryClient.removeQueries()
- setData: queryClient.setQueryData()
- triggerError: query.setState({ status: "error", ... })
- clearQueryCache: queryClient.getQueryCache().clear()
   |
   v
Cache change triggers new snapshot (flows back to dashboard)
```

## Manual Data Edit Flow

```
User edits query data in devtools panel
   |
   v
queryClient.setQueryData() called on mirror
   |
   v
QueryCache subscription fires with { type: "updated", action: { manual: true } }
   |
   v
useDashboardController detects manual update (isApplyingSnapshotRef = false)
   |
   v
Sends setData action to real app:
{
  type: "rntqdevtools.action",
  payload: {
    targetDeviceId: "abc123",
    action: "setData",
    queryKey: ["todos"],
    data: [{ id: 1, title: "Updated!" }]
  }
}
   |
   v
App's QueryClient receives new data
```

## Device Discovery Flow (Android Tooling)

```
Dashboard loads
   |
   v
Fetch /api/adb/devices
   |
   v
Server runs: adb devices -l
   |
   v
Parse output into device list
   |
   v
Display in ADB Devices panel
   |
   v
User clicks "Reconnect" on device
   |
   v
POST /api/adb/reconnect { serial: "emulator-5554" }
   |
   v
Server runs:
- adb connect <serial>        # only for wireless/network devices
- adb -s emulator-5554 reverse tcp:9090 tcp:9090
- adb -s emulator-5554 reverse tcp:42831 tcp:42831
   |
   v
Emulator can now reach localhost:9090 on host machine
   |
   v
App connects to bridge
```

## Error Flow

```
Action fails in app (e.g., query not found)
   |
   v
Bridge logs a structured error event and sends an error frame:
{
  type: "rntqdevtools.error",
  payload: {
    targetDeviceId: "abc123",
    message: "Query not found for action refetch: [\"unknown\"]"
  }
}
   |
   v
Server forwards to requesting dashboard
   |
   v
Dashboard displays error alert
```

## Reconnection Flow

```
WebSocket connection closes
   |
   v
Bridge detects close event
   |
   +-- wasConnected: true --> Log disconnect, schedule reconnect (1s delay)
   |
   +-- wasConnected: false --> Log connect failure, schedule reconnect (1s delay)
   |
   v
Wait 1 second
   |
   v
Attempt reconnection
   |
   v
If server unavailable, repeat until successful
   |
   v
On successful reconnect, send hello + initial snapshot
```
