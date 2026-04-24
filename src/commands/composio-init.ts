import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { setComposioApiKey } from "../composio-client.js";
import { getComposioConfigPath } from "../config-store.js";

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

  await setComposioApiKey(apiKey);

  ctx.ui.notify(`Composio API key saved to ${getComposioConfigPath()}.`, "info");
}
 
export function registerComposioInitCommand(pi: ExtensionAPI): void {
  pi.registerCommand("composio-init", {
    description: "Enter and store a Composio API key for the Composio extension",
    handler: handleComposioInitCommand,
  });
}
