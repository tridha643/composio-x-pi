import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";

import { UserFacingError } from "./errors.js";

type JsonRpcResponse = {
  id?: string;
  result?: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export function resolveIpcSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.COMPOSIO_PI_IPC_SOCK?.trim();
  if (override) {
    return override;
  }

  const runtimeDir = env.XDG_RUNTIME_DIR?.trim();
  if (runtimeDir) {
    return `${runtimeDir}/composio-pi.sock`;
  }

  const uid =
    typeof process.getuid === "function"
      ? process.getuid()
      : env.UID
        ? Number(env.UID)
        : "unknown";

  return `/tmp/composio-pi-${uid}.sock`;
}

export async function callComposioPiRpc<T = unknown>(
  method: string,
  params: Record<string, unknown>,
  options: {
    socketPath?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<T> {
  const socketPath = options.socketPath ?? resolveIpcSocketPath(options.env);
  const timeoutMs = options.timeoutMs ?? 5000;

  return await new Promise<T>((resolve, reject) => {
    const id = randomUUID();
    const socket = createConnection(socketPath);
    let settled = false;
    let buffer = "";

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      socket.removeAllListeners();
      callback();
    };

    const timeout = setTimeout(() => {
      finish(() => {
        socket.destroy();
        reject(
          new UserFacingError(
            "IPC_TIMEOUT",
            `Timed out waiting for Composio Pi IPC response on ${socketPath}.`,
          ),
        );
      });
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ id, method, params })}\n`);
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newlineIndex = buffer.indexOf("\n");

      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line) {
          const message = JSON.parse(line) as JsonRpcResponse;
          if (message.id === id) {
            finish(() => {
              socket.end();

              if (message.error) {
                reject(
                  new UserFacingError(
                    message.error.code ?? "IPC_REMOTE_ERROR",
                    message.error.message ?? "Composio Pi IPC request failed.",
                    message.error.details,
                  ),
                );
                return;
              }

              resolve(message.result as T);
            });
            return;
          }
        }

        newlineIndex = buffer.indexOf("\n");
      }
    });

    socket.on("error", (error) => {
      finish(() => {
        reject(
          new UserFacingError(
            "IPC_UNAVAILABLE",
            `Composio Pi IPC socket is unavailable at ${socketPath}.`,
            { cause: error.message },
          ),
        );
      });
    });
  });
}
