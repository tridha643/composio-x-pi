import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerComposioClaimCommand } from "./commands/composio-claim.js";
import { registerComposioInitCommand } from "./commands/composio-init.js";
import {
  listConnectedAccounts,
  renderAccountsPromptSnippet,
  resolveUserId,
} from "./lib/account-directory.js";
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

  // Surface connected accounts (from the Composio backend) to the model by appending
  // to the system prompt. Timeout-bounded and fully swallowed so a slow or unconfigured
  // backend never blocks or breaks thread start.
  const on = (pi as { on?: (event: string, handler: (event: unknown) => unknown) => void }).on;
  if (typeof on === "function") {
    on.call(pi, "before_agent_start", async (event: unknown) => {
      try {
        const accounts = await Promise.race([
          listConnectedAccounts(resolveUserId()),
          new Promise<never>((_resolve, reject) =>
            setTimeout(() => reject(new Error("timeout")), 1500),
          ),
        ]);
        const snippet = renderAccountsPromptSnippet(accounts);
        if (!snippet) {
          return undefined;
        }
        const systemPrompt = (event as { systemPrompt?: string })?.systemPrompt ?? "";
        return { systemPrompt: `${systemPrompt}${snippet}` };
      } catch {
        return undefined;
      }
    });
  }
}
