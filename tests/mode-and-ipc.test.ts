import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { callConstellagentRpc, resolveIpcSocketPath } from "../src/lib/ipc.js";
import { getMode } from "../src/mode.js";

const socketDir = join(process.cwd(), ".tmp");
const socketPath = join(socketDir, `constellagent-pi-extension-test-${process.pid}.sock`);

afterEach(async () => {
  await rm(socketPath, { force: true });
});

describe("mode helpers", () => {
  test("defaults to worktree", () => {
    expect(getMode({} as NodeJS.ProcessEnv)).toBe("worktree");
  });

  test("returns authoring when explicitly requested", () => {
    expect(getMode({ CONSTELLAGENT_MODE: "authoring" } as NodeJS.ProcessEnv)).toBe("authoring");
  });
});

describe("ipc helper", () => {
  test("resolves the default socket path", () => {
    expect(resolveIpcSocketPath({ UID: "501" } as NodeJS.ProcessEnv)).toBe(
      `/tmp/constellagent-${typeof process.getuid === "function" ? process.getuid() : "unknown"}.sock`,
    );
  });

  test("returns a user-facing error when the IPC socket is unavailable", async () => {
    await expect(
      callConstellagentRpc(
        "saveAutomationLocal",
        { name: "Smoke test" },
        {
          socketPath,
          timeoutMs: 100,
        },
      ),
    ).rejects.toMatchObject({
      code: "IPC_UNAVAILABLE",
      message: `Constellagent IPC socket is unavailable at ${socketPath}.`,
    });
  });
});
