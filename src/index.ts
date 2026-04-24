import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { setComposioApiKey } from "./composio-client.js";
import { getComposioConfigPath } from "./config-store.js";
import { getMode } from "./mode.js";
import { authoringTools } from "./tools/authoring/index.js";
import { debugInfoTool } from "./tools/debug/debug-info.js";
import { runtimeTools } from "./tools/runtime/index.js";

export default function registerComposioPiExtension(pi: ExtensionAPI): void {
  const mode = getMode();

  pi.registerCommand("composio-api-key", {
    description: "Enter and store a Composio API key for the Composio extension",
    handler: async (args, ctx) => {
      const apiKey = args.trim() || (await ctx.ui.input("Composio API key", "paste your API key..."));

      if (!apiKey?.trim()) {
        ctx.ui.notify("Composio API key was not changed.", "warning");
        return;
      }

      await setComposioApiKey(apiKey);
      ctx.ui.notify(`Composio API key saved to ${getComposioConfigPath()}.`, "info");
    },
  });

  pi.registerTool(debugInfoTool(mode) as never);

  for (const tool of runtimeTools) {
    pi.registerTool(tool as never);
  }

  if (mode === "authoring") {
    for (const tool of authoringTools) {
      pi.registerTool(tool as never);
    }
  }
}
