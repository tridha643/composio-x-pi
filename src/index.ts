import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerComposioClaimCommand } from "./commands/composio-claim.js";
import { registerComposioInitCommand } from "./commands/composio-init.js";
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
}
