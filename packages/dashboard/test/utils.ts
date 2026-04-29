import net from "node:net";
import WebSocket from "ws";
import type { BridgeHelloPayload, BridgeTransportFrame } from "react-native-tanstack-query-devtools-core";

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate port"));
        return;
      }
      const { port } = address;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

export async function waitForFrame(
  socket: WebSocket,
  predicate: (frame: BridgeTransportFrame) => boolean = () => true,
): Promise<BridgeTransportFrame> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      const frame = JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : String(data)) as BridgeTransportFrame;
      if (!predicate(frame)) return;
      cleanup();
      resolve(frame);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

export async function connectClient(port: number, hello: BridgeHelloPayload) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);

  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => {
      socket.send(JSON.stringify({ type: "rntqdevtools.hello", payload: hello }));
      resolve();
    });
    socket.once("error", reject);
  });

  const ready = await waitForFrame(socket, (f) => f.type === "rntqdevtools.ready");
  if (ready.type !== "rntqdevtools.ready") {
    throw new Error(`Expected ready frame, got ${ready.type}`);
  }

  return { socket, clientId: ready.payload.clientId };
}
