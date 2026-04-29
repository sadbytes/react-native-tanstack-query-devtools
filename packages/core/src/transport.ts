import type { BridgeEnvelope, DashboardRole, DevicePlatform } from "./types";

type MaybePromise<T> = T | Promise<T>;

export type BridgeFrame<TType extends string = string, TPayload = unknown> = {
  type: TType;
  payload: TPayload;
};

export type BridgeHelloPayload = {
  role: DashboardRole;
  name: string;
  clientId?: string;
  deviceId?: string;
  protocolVersion?: number;
  platform?: DevicePlatform;
};

export type BridgeHelloFrame = BridgeFrame<"rntqdevtools.hello", BridgeHelloPayload>;

export type BridgeReadyPayload = {
  clientId: string;
};

export type BridgeReadyFrame = BridgeFrame<"rntqdevtools.ready", BridgeReadyPayload>;

export type BridgeTransportFrame = BridgeHelloFrame | BridgeReadyFrame | BridgeEnvelope;

export type BridgeSocketLike = {
  send(data: string): void;
  close(): void;
  onopen?: ((this: any, ...args: any[]) => any) | null;
  onclose?: ((this: any, ...args: any[]) => any) | null;
  onerror?: ((this: any, ...args: any[]) => any) | null;
  onmessage?: ((this: any, ...args: any[]) => any) | null;
  addEventListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeEventListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export type BridgeClientOptions = {
  createSocket(url: string): BridgeSocketLike;
  host: string;
  port: number;
  secure?: boolean;
  hello: BridgeHelloPayload;
  onMessage?(frame: BridgeEnvelope): void;
  onSocketOpen?(): MaybePromise<void>;
  onSocketError?(error: unknown): MaybePromise<void>;
  onSocketClose?(details: { wasConnected: boolean }): MaybePromise<void>;
  onConnect?(): MaybePromise<void>;
  onDisconnect?(): MaybePromise<void>;
  logger?: Pick<Console, "warn" | "error">;
};

export type BridgeClient = {
  connect(): void;
  close(): void;
  send<TType extends BridgeEnvelope["type"]>(type: TType, payload: Extract<BridgeEnvelope, { type: TType }>["payload"]): void;
  isConnected(): boolean;
};

function createUrl(host: string, port: number, secure: boolean) {
  return `${secure ? "wss" : "ws"}://${host}:${port}`;
}

function decodeFrame(raw: unknown): BridgeTransportFrame {
  if (typeof raw === "string") {
    return JSON.parse(raw) as BridgeTransportFrame;
  }

  if (raw instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(raw)) as BridgeTransportFrame;
  }

  if (ArrayBuffer.isView(raw)) {
    return JSON.parse(new TextDecoder().decode(raw)) as BridgeTransportFrame;
  }

  return raw as BridgeTransportFrame;
}

function encodeFrame(frame: BridgeTransportFrame) {
  return JSON.stringify(frame);
}

function isBridgeEnvelope(frame: BridgeTransportFrame): frame is BridgeEnvelope {
  return frame.type !== "rntqdevtools.hello" && frame.type !== "rntqdevtools.ready";
}

export function createBridgeClient(options: BridgeClientOptions): BridgeClient {
  let socket: BridgeSocketLike | null = null;
  let connected = false;
  let queue: string[] = [];

  const flushQueue = () => {
    if (!socket || !connected || queue.length === 0) {
      return;
    }

    for (const message of queue) {
      socket.send(message);
    }
    queue = [];
  };

  const sendFrame = (frame: BridgeTransportFrame) => {
    const message = encodeFrame(frame);
    if (!socket || !connected) {
      queue.push(message);
      return;
    }

    socket.send(message);
  };

  const handleFrame = async (frame: BridgeTransportFrame) => {
    if (frame.type === "rntqdevtools.ready") {
      connected = true;
      await options.onConnect?.();
      flushQueue();
      return;
    }

    if (isBridgeEnvelope(frame)) {
      options.onMessage?.(frame);
    }
  };

  const handleClose = async () => {
    socket = null;
    const wasConnected = connected;
    connected = false;
    queue = [];
    await options.onSocketClose?.({ wasConnected });
    if (wasConnected) {
      await options.onDisconnect?.();
    }
  };

  return {
    connect() {
      if (socket) {
        return;
      }

      const nextSocket = options.createSocket(createUrl(options.host, options.port, options.secure ?? false));
      socket = nextSocket;

      const handleOpen = () => {
        void options.onSocketOpen?.();
        nextSocket.send(
          encodeFrame({
            type: "rntqdevtools.hello",
            payload: options.hello,
          }),
        );
      };

      const handleMessage = (data: unknown) => {
        void handleFrame(decodeFrame(data));
      };

      if (typeof nextSocket.on === "function") {
        nextSocket.on("open", handleOpen);
        nextSocket.on("close", () => {
          void handleClose();
        });
        nextSocket.on("message", (data: unknown) => {
          handleMessage(data);
        });
        nextSocket.on("error", (error: unknown) => {
          void options.onSocketError?.(error);
          options.logger?.warn?.("[rn-tq-devtools] bridge socket error", error);
        });
        return;
      }

      nextSocket.onopen = handleOpen;
      nextSocket.onclose = () => {
        void handleClose();
      };
      nextSocket.onerror = (error: unknown) => {
        void options.onSocketError?.(error);
        options.logger?.warn?.("[rn-tq-devtools] bridge socket error", error);
      };
      nextSocket.onmessage = (event: { data: unknown }) => {
        handleMessage(event.data);
      };
    },
    close() {
      if (!socket) {
        return;
      }

      const currentSocket = socket;
      socket = null;
      currentSocket.close();
    },
    send(type, payload) {
      const frame = { type, payload } as Extract<BridgeEnvelope, { type: typeof type }>;
      sendFrame(frame);
    },
    isConnected() {
      return connected;
    },
  };
}
