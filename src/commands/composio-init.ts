import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { setComposioApiKey } from "../composio-client.js";
import { getComposioConfigPath } from "../config-store.js";
import { UserFacingError } from "../lib/errors.js";

export async function handleComposioInitCommand(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const apiKey = (args.trim() || (await ctx.ui.input(
    "Composio API key",
    "Enter your Composio API key",
  )))?.trim();

  if (!apiKey) {
    ctx.ui.notify("Composio API key was not set.", "warning");
    return;
  }

  try {
    await setComposioApiKey(apiKey);
    ctx.ui.notify(`Composio API key saved to ${getComposioConfigPath()}.`, "info");
  } catch (error) {
    const message = error instanceof UserFacingError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Composio API key setup failed.";
    ctx.ui.notify(message, "error");
  }
}

export function registerComposioInitCommand(pi: ExtensionAPI): void {
  pi.registerCommand("composio-init", {
    description: "Enter and store a Composio API key for the Composio extension.",
    handler: handleComposioInitCommand,
  });
}
