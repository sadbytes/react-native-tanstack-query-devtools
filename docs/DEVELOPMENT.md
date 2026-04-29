# Development Guide

## Prerequisites

- Node.js 18+
- pnpm 10+
- For ADB features: Android SDK Platform Tools (or they'll be auto-downloaded)

## Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Development Mode

Start the dashboard with Vite HMR and the example Expo app:

```bash
pnpm dev
```

This runs:
- Dashboard at http://localhost:42831 (with hot reload)
- WebSocket bridge at ws://localhost:9090
- Example Expo app

## Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm test` | Run tests (core + bridge) |
| `pnpm dev` | Start dev mode |
| `pnpm clean` | Remove dist/ from all packages |

## Project Structure

```
react-native-tanstack-query-devtools/
├── packages/
│   ├── core/              # Shared protocol types and utilities
│   │   ├── src/
│   │   │   ├── types.ts       # Protocol types
│   │   │   ├── actions.ts     # Action constants
│   │   │   ├── dehydrate.ts   # Snapshot serialization
│   │   │   ├── hydrate.ts     # Snapshot deserialization
│   │   │   └── transport.ts   # WebSocket client
│   │   └── test/
│   │
│   ├── bridge/            # React Native app-side plugin
│   │   ├── src/
│   │   │   ├── connectReactQueryDevtools.ts  # Main implementation
│   │   │   ├── inferHost.ts   # Auto-detect Metro host
│   │   │   └── production.ts  # No-op for production
│   │   └── test/
│   │
│   └── dashboard/         # CLI + web dashboard
│       ├── src/
│       │   ├── index.tsx      # Production CLI entry
│       │   ├── dev.ts         # Development CLI entry
│       │   ├── cli-utils.ts   # Shared CLI utilities
│       │   ├── backend/
│       │   │   ├── createBridgeServer.ts  # HTTP + WS server
│       │   │   ├── bridgeSocketServer.ts  # WebSocket server
│       │   │   └── adb.ts     # ADB integration
│       │   └── frontend/
│       │       ├── App.tsx
│       │       ├── components/
│       │       ├── hooks/
│       │       └── lib/
│       └── test/
│
└── examples/
    └── expo-crud-app/     # Example React Native app
```

## Testing

```bash
# Run all tests
pnpm test

# Run specific package tests
pnpm --filter react-native-tanstack-query-devtools-core test
pnpm --filter react-native-tanstack-query-devtools-bridge test
```

## Adding a New Action

1. Add the action type to `packages/core/src/types.ts`:
   ```typescript
   export type DevtoolsAction = "refetch" | ... | "myNewAction";
   ```

2. Add the dashboard event mapping in `packages/core/src/actions.ts`:
   ```typescript
   export const dashboardEventToAction = {
     // ...
     MY_NEW_ACTION: "myNewAction",
   };
   ```

3. Handle the action in `packages/bridge/src/connectReactQueryDevtools.ts`:
   ```typescript
   function applyAction(...) {
     switch (action.action) {
       // ...
       case "myNewAction":
         // Implementation
         break;
     }
   }
   ```

## Building for Production

```bash
pnpm build
```

Output:
- `packages/core/dist/` - ESM, CJS, and type declarations
- `packages/bridge/dist/` - ESM, CJS, and type declarations
- `packages/dashboard/dist/` - CLI bundle and frontend assets

## Publishing

Packages are published independently:

```bash
cd packages/core && pnpm publish
cd packages/bridge && pnpm publish
cd packages/dashboard && pnpm publish
```

## Debugging Tips

### Enable Bridge Logs

```typescript
connectReactQueryDevtools({
  queryClient,
  logLevel: "debug",
});
```

### Check WebSocket Connection

Open browser devtools console on the dashboard and look for `[rn-tq-devtools]` log entries.

### Android Emulator Not Connecting

1. Check ADB is available: `adb devices`
2. Set up port forwarding: `adb reverse tcp:9090 tcp:9090`
3. Or use the dashboard's ADB panel to auto-configure

### iOS Simulator

Works out of the box - `localhost` on the simulator reaches the host machine.

### iOS Physical Device

Use a debug build served by Metro and keep the device on the same LAN as the host machine. The bridge infers the host from the Metro bundle URL when possible, and the dashboard now exposes discovered iOS devices plus recommended host guidance.
