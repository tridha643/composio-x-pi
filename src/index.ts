import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerComposioInitCommand } from "./commands/composio-init.js";
import { getMode } from "./mode.js";
import { authoringTools } from "./tools/authoring/index.js";
import { debugInfoTool } from "./tools/debug/debug-info.js";
import { runtimeTools } from "./tools/runtime/index.js";

export default function registerComposioPiExtension(pi: ExtensionAPI): void {
  const mode = getMode();

  registerComposioInitCommand(pi);

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
