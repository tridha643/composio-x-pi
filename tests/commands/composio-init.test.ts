import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getComposioConfig } from "../../src/composio-client.js";
import { handleComposioInitCommand } from "../../src/commands/composio-init.js";
import { writeAnonymousUserData } from "../../src/lib/anonymous-user-data.js";

type Notification = { message: string; type?: "info" | "warning" | "error" };

let originalHome: string | undefined;
let originalApiKey: string | undefined;
let originalAgentDir: string | undefined;
let tempHome: string;

function ctxFactory(inputValue?: string) {
  const notifications: Notification[] = [];
  return {
    notifications,
    ctx: {
      ui: {
        async input(title: string, placeholder?: string) {
          expect(title).toBe("Composio API key");
          expect(placeholder).toBe("Enter your Composio API key");
          return inputValue;
        },
        notify(message: string, type?: "info" | "warning" | "error") {
          notifications.push({ message, type });
        },
      },
    },
  };
}

beforeEach(() => {
  originalHome = process.env.HOME;
  originalApiKey = process.env.COMPOSIO_API_KEY;
  originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  tempHome = mkdtempSync(join(tmpdir(), "composio-init-"));
  process.env.HOME = tempHome;
  process.env.PI_CODING_AGENT_DIR = join(tempHome, ".pi", "agent");
  delete process.env.COMPOSIO_API_KEY;
});

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true });
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalApiKey === undefined) {
    delete process.env.COMPOSIO_API_KEY;
  } else {
    process.env.COMPOSIO_API_KEY = originalApiKey;
  }
  if (originalAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  }
});

describe("/composio-init command", () => {
  test("sets COMPOSIO_API_KEY from the TUI input", async () => {
    const { ctx, notifications } = ctxFactory("  test-api-key  ");

    await handleComposioInitCommand("", ctx as never);

    expect(getComposioConfig().apiKey).toBe("test-api-key");
    expect(getComposioConfig().apiKeySource).toBe("env");
    expect(notifications[0]).toEqual({
      message: expect.stringContaining("Composio API key saved to"),
      type: "info",
    });
  });

  test("stored API key overrides signup credentials after command runs", async () => {
    await writeAnonymousUserData({ agent_key: "k", composio: { api_key: "ak_signup" } });
    const { ctx } = ctxFactory("ak_stored");

    await handleComposioInitCommand("", ctx as never);

    const config = getComposioConfig();
    expect(config.apiKey).toBe("ak_stored");
    expect(config.apiKeySource).toBe("env");
  });

  test("accepts API key from command args", async () => {
    const { ctx, notifications } = ctxFactory("should-not-be-used");

    await handleComposioInitCommand("  ak_arg  ", ctx as never);

    expect(getComposioConfig().apiKey).toBe("ak_arg");
    expect(notifications[0]?.type).toBe("info");
  });

  test("does not overwrite COMPOSIO_API_KEY when input is empty", async () => {
    process.env.COMPOSIO_API_KEY = "existing-api-key";
    const { ctx, notifications } = ctxFactory("   ");

    await handleComposioInitCommand("", ctx as never);

    expect(getComposioConfig().apiKey).toBe("existing-api-key");
    expect(notifications).toEqual([
      { message: "Composio API key was not set.", type: "warning" },
    ]);
  });
});
