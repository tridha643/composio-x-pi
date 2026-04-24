import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import { getComposioConfig } from "../src/composio-client.js";
import { handleComposioInitCommand } from "../src/commands/composio-init.js";
import { getComposioConfigPath } from "../src/config-store.js";

function createCommandContext(inputValue: string | undefined) {
  const notifications: Array<{ message: string; type?: "info" | "warning" | "error" }> = [];

  return {
    notifications,
    ctx: {
      ui: {
        input: async (title: string, placeholder?: string) => {
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

function preserveComposioConfig() {
  const path = getComposioConfigPath();
  const existed = existsSync(path);
  const previous = existed ? readFileSync(path, "utf8") : undefined;

  return () => {
    if (existed && previous !== undefined) {
      writeFileSync(path, previous, "utf8");
    } else {
      rmSync(path, { force: true });
    }
  };
}

describe("/composio-init command", () => {
  test("sets COMPOSIO_API_KEY from the TUI input", async () => {
    const previousApiKey = process.env.COMPOSIO_API_KEY;
    const restoreConfig = preserveComposioConfig();
    const { ctx, notifications } = createCommandContext("  test-api-key  ");

    try {
      delete process.env.COMPOSIO_API_KEY;

      await handleComposioInitCommand("", ctx as never);

      expect(getComposioConfig().apiKey).toBe("test-api-key");
      expect(notifications[0]).toEqual({
        message: expect.stringContaining("Composio API key saved to"),
        type: "info",
      });
    } finally {
      restoreConfig();
      if (previousApiKey === undefined) {
        delete process.env.COMPOSIO_API_KEY;
      } else {
        process.env.COMPOSIO_API_KEY = previousApiKey;
      }
    }
  });

  test("does not overwrite COMPOSIO_API_KEY when input is empty", async () => {
    const previousApiKey = process.env.COMPOSIO_API_KEY;
    const restoreConfig = preserveComposioConfig();
    const { ctx, notifications } = createCommandContext("   ");

    try {
      process.env.COMPOSIO_API_KEY = "existing-api-key";

      await handleComposioInitCommand("", ctx as never);

      expect(getComposioConfig().apiKey).toBe("existing-api-key");
      expect(notifications).toEqual([
        { message: "Composio API key was not set.", type: "warning" },
      ]);
    } finally {
      restoreConfig();
      if (previousApiKey === undefined) {
        delete process.env.COMPOSIO_API_KEY;
      } else {
        process.env.COMPOSIO_API_KEY = previousApiKey;
      }
    }
  });
});
