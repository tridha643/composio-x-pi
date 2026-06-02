import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerComposioClaimCommand } from "./commands/composio-claim.js";
import { registerComposioInitCommand } from "./commands/composio-init.js";
import { readAccountStore, renderAccountsPromptSnippet } from "./lib/account-store.js";
import { authoringTools } from "./tools/authoring/index.js";
import { debugInfoTool } from "./tools/debug/debug-info.js";
import { runtimeTools } from "./tools/runtime/index.js";

export default function registerComposioPiExtension(pi: ExtensionAPI): void {
  registerComposioInitCommand(pi);
  registerComposioClaimCommand(pi);

  pi.registerTool(debugInfoTool() as never);

  for (const tool of runtimeTools) {
    pi.registerTool(tool as never);
  }

  for (const tool of authoringTools) {
    pi.registerTool(tool as never);
  }

  // Surface saved account aliases to the model by appending to the system prompt.
  const on = (pi as { on?: (event: string, handler: (event: unknown) => unknown) => void }).on;
  if (typeof on === "function") {
    on.call(pi, "before_agent_start", (event: unknown) => {
      const snippet = renderAccountsPromptSnippet(readAccountStore());
      if (!snippet) {
        return undefined;
      }
      const systemPrompt = (event as { systemPrompt?: string })?.systemPrompt ?? "";
      return { systemPrompt: `${systemPrompt}${snippet}` };
    });
  }
}
