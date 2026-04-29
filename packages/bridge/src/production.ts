import type { ConnectReactQueryDevtoolsOptions, DevtoolsConnection } from "./connectReactQueryDevtools";

function noop() {}

export function connectReactQueryDevtools(_options: ConnectReactQueryDevtoolsOptions): DevtoolsConnection {
  return {
    connect: noop,
    disconnect: noop,
    sendSnapshot: noop,
    isConnected: () => false,
  };
}

export function ReactQueryDevtoolsBridge() {
  return null;
}

