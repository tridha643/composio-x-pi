import { Type } from "@sinclair/typebox";

import { getComposioConfig } from "../../composio-client.js";
import { createTool, textResult } from "../../lib/toolkit.js";
import { authoringToolNames } from "../authoring/index.js";
import { runtimeToolNames } from "../runtime/index.js";

export function debugInfoTool() {
  return createTool({
    name: "composio_debug_info",
    label: "Composio Debug Info",
    description: "Inspect API key presence, API key source, and registered tool names.",
    parameters: Type.Object({}),
    async execute() {
      const config = getComposioConfig();
      const registeredTools = ["composio_debug_info", ...runtimeToolNames, ...authoringToolNames];
      const details = {
        registeredTools,
        authoringToolsRegistered: true,
        registeredCommands: ["composio-claim"],
        apiKeyPresent: config.apiKeyPresent,
        apiKeySource: config.apiKeySource,
      };

      return textResult(JSON.stringify(details, null, 2), details);
    },
  });
}
