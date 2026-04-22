import { rm } from "node:fs/promises";
import { createServer } from "node:net";

import { resolveIpcSocketPath } from "../src/lib/ipc.js";

const socketPath = resolveIpcSocketPath();

await rm(socketPath, { force: true });

const server = createServer((socket) => {
  socket.on("data", (chunk) => {
    const line = chunk.toString("utf8").trim();
    if (!line) {
      return;
    }

    const request = JSON.parse(line) as {
      id: string;
      method: string;
      params: Record<string, unknown>;
    };

    const result =
      request.method === "saveAutomationLocal"
        ? {
            stored: true,
            automationId: `stub_${Date.now()}`,
            payload: request.params,
          }
        : {
            ok: true,
            payload: request.params,
          };

    socket.write(`${JSON.stringify({ id: request.id, result })}\n`);
  });
});

server.listen(socketPath, () => {
  console.log(`Constellagent IPC stub listening on ${socketPath}`);
});

const shutdown = async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(socketPath, { force: true });
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
