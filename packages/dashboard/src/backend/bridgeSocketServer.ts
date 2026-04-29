import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { BridgeEnvelope, BridgeHelloPayload, BridgeTransportFrame } from "react-native-tanstack-query-devtools-core";

type ReadyConnection = BridgeHelloPayload & {
  clientId: string;
  address?: string;
  port?: number;
  socket: WebSocket;
};

type BridgeSocketServerEvents = {
  connectionEstablished: [Omit<ReadyConnection, "socket">];
  command: [{ clientId?: string; type: BridgeEnvelope["type"]; payload: BridgeEnvelope["payload"] }];
  disconnect: [Omit<ReadyConnection, "socket">];
};

type TrackedSocket = WebSocket & {
  isAlive?: boolean;
  clientId?: string;
};

type BridgeSocketServer = {
  on<EventName extends keyof BridgeSocketServerEvents>(
    event: EventName,
    listener: (...args: BridgeSocketServerEvents[EventName]) => void,
  ): void;
  off<EventName extends keyof BridgeSocketServerEvents>(
    event: EventName,
    listener: (...args: BridgeSocketServerEvents[EventName]) => void,
  ): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  send<TType extends BridgeEnvelope["type"]>(
    type: TType,
    payload: Extract<BridgeEnvelope, { type: TType }>["payload"],
    clientId?: string,
  ): void;
  sendEnvelope(envelope: BridgeEnvelope, clientId?: string): void;
};

function parseFrame(data: RawData): BridgeTransportFrame {
  return JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : String(data)) as BridgeTransportFrame;
}

function serializeFrame(frame: BridgeTransportFrame) {
  return JSON.stringify(frame);
}

export function createBridgeSocketServer(options: { port: number }): BridgeSocketServer {
  const emitter = new EventEmitter();
  const connections = new Map<string, ReadyConnection>();
  let wss: WebSocketServer | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const isBridgeEnvelope = (frame: BridgeTransportFrame): frame is BridgeEnvelope =>
    frame.type !== "rntqdevtools.hello" && frame.type !== "rntqdevtools.ready";

  const emitDisconnect = (socket: TrackedSocket) => {
    const clientId = socket.clientId;
    if (!clientId) {
      return;
    }

    const connection = connections.get(clientId);
    if (!connection) {
      return;
    }

    connections.delete(clientId);
    emitter.emit("disconnect", {
      clientId: connection.clientId,
      role: connection.role,
      name: connection.name,
      address: connection.address,
      port: connection.port,
      deviceId: connection.deviceId,
      platform: connection.platform,
      protocolVersion: connection.protocolVersion,
    });
  };

  const handleHello = (
    socket: TrackedSocket,
    address: string | undefined,
    port: number | undefined,
    payload: BridgeHelloPayload,
  ) => {
    const clientId = payload.clientId ?? randomUUID();
    const previous = connections.get(clientId);
    if (previous) {
      connections.delete(clientId);
      previous.socket.close();
    }

    socket.clientId = clientId;
    const connection: ReadyConnection = {
      ...payload,
      clientId,
      address,
      port,
      socket,
    };
    connections.set(clientId, connection);
    socket.send(
      serializeFrame({
        type: "rntqdevtools.ready",
        payload: { clientId },
      }),
    );
    emitter.emit("connectionEstablished", {
      clientId,
      role: payload.role,
      name: payload.name,
      address,
      port,
      deviceId: payload.deviceId,
      platform: payload.platform,
      protocolVersion: payload.protocolVersion,
    });
  };

  return {
    on(event, listener) {
      emitter.on(event, listener as (...args: any[]) => void);
    },
    off(event, listener) {
      emitter.off(event, listener as (...args: any[]) => void);
    },
    async start() {
      if (wss) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const nextServer = new WebSocketServer({ port: options.port });
        const handleError = (error: Error) => {
          nextServer.off("listening", handleListening);
          reject(error);
        };
        const handleListening = () => {
          nextServer.off("error", handleError);
          resolve();
        };

        nextServer.once("error", handleError);
        nextServer.once("listening", handleListening);

        nextServer.on("connection", (socket, request) => {
          const trackedSocket = socket as TrackedSocket;
          trackedSocket.isAlive = true;
          trackedSocket.on("pong", () => {
            trackedSocket.isAlive = true;
          });
          trackedSocket.on("close", () => {
            emitDisconnect(trackedSocket);
          });
          trackedSocket.on("error", () => {
            emitDisconnect(trackedSocket);
          });
          trackedSocket.on("message", (data) => {
            let frame: BridgeTransportFrame;
            try {
              frame = parseFrame(data);
            } catch {
              trackedSocket.close();
              return;
            }

            if (frame.type === "rntqdevtools.hello") {
              handleHello(trackedSocket, request.socket.remoteAddress, request.socket.remotePort, frame.payload);
              return;
            }

            if (!trackedSocket.clientId) {
              trackedSocket.close();
              return;
            }

            if (!isBridgeEnvelope(frame)) {
              return;
            }

            emitter.emit("command", {
              clientId: trackedSocket.clientId,
              type: frame.type,
              payload: frame.payload,
            });
          });
        });

        wss = nextServer;
      });

      keepAlive = setInterval(() => {
        if (!wss) {
          return;
        }

        for (const socket of wss.clients) {
          const trackedSocket = socket as TrackedSocket;
          if (trackedSocket.isAlive === false) {
            trackedSocket.terminate();
            continue;
          }

          trackedSocket.isAlive = false;
          trackedSocket.ping();
        }
      }, 30000);
    },
    async stop() {
      if (!wss) {
        return;
      }

      if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
      }

      for (const connection of connections.values()) {
        connection.socket.close();
      }
      connections.clear();

      const currentServer = wss;
      wss = null;
      await new Promise<void>((resolve, reject) => {
        currentServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    send(type, payload, clientId) {
      this.sendEnvelope({ type, payload } as BridgeEnvelope, clientId);
    },
    sendEnvelope(envelope, clientId) {
      const message = serializeFrame(envelope);
      for (const connection of connections.values()) {
        if (clientId && connection.clientId !== clientId) {
          continue;
        }

        if (connection.socket.readyState !== WebSocket.OPEN) {
          continue;
        }

        connection.socket.send(message);
      }
    },
  };
}
