import { Type } from "@sinclair/typebox";

import { getComposioConfig } from "../../composio-client.js";
import type { ConstellagentMode } from "../../mode.js";
import { createTool, textResult } from "../../lib/toolkit.js";
import { authoringToolNames } from "../authoring/index.js";
import { runtimeToolNames } from "../runtime/index.js";

export function debugInfoTool(mode: ConstellagentMode) {
  return createTool({
    name: "composio_debug_info",
    label: "Composio Debug Info",
    description: "Inspect extension mode, configured user identity, and registered tool names.",
    parameters: Type.Object({}),
    async execute() {
      const config = getComposioConfig();
      const registeredTools =
        mode === "authoring"
          ? ["composio_debug_info", ...runtimeToolNames, ...authoringToolNames]
          : ["composio_debug_info", ...runtimeToolNames];

      return textResult(JSON.stringify({ mode, registeredTools, composioUserId: config.userId ?? null, apiKeyPresent: config.apiKeyPresent }, null, 2), {
        mode,
        registeredTools,
        composioUserId: config.userId ?? null,
        apiKeyPresent: config.apiKeyPresent,
      });
    },
  });
}
