import { Type } from "@sinclair/typebox";

import { getComposioConfig } from "../../composio-client.js";
import type { ComposioPiMode } from "../../mode.js";
import { createTool, textResult } from "../../lib/toolkit.js";
import { authoringToolNames } from "../authoring/index.js";
import { runtimeToolNames } from "../runtime/index.js";

export function debugInfoTool(mode: ComposioPiMode) {
  return createTool({
    name: "composio_debug_info",
    label: "Composio Debug Info",
    description: "Inspect extension mode, API key presence, API key source, and registered tool names.",
    parameters: Type.Object({}),
    async execute() {
      const config = getComposioConfig();
      const registeredTools =
        mode === "authoring"
          ? ["composio_debug_info", ...runtimeToolNames, ...authoringToolNames]
          : ["composio_debug_info", ...runtimeToolNames];
      const details = {
        mode,
        registeredTools,
        registeredCommands: ["composio-init"],
        apiKeyPresent: config.apiKeyPresent,
        apiKeySource: config.apiKeySource,
      };

      return textResult(JSON.stringify(details, null, 2), details);
    },
  });
}
