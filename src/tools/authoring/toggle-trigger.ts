import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { callComposioMethod } from "../../composio-client.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  triggerId: Type.String({ minLength: 1 }),
  enabled: Type.Boolean(),
});

export type ToggleTriggerParams = Static<typeof parameters>;

export function toggleTriggerTool(deps: {
  enableTrigger?: (triggerId: string) => Promise<unknown>;
  disableTrigger?: (triggerId: string) => Promise<unknown>;
} = {}) {
  return createTool<ToggleTriggerParams>({
    name: "composio_toggle_trigger",
    label: "Composio Toggle Trigger",
    description: "Enable or disable a Composio trigger by ID.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const enableTrigger =
        deps.enableTrigger ?? ((triggerId: string) => callComposioMethod("triggers.enable", triggerId));
      const disableTrigger =
        deps.disableTrigger ?? ((triggerId: string) => callComposioMethod("triggers.disable", triggerId));

      const response = await withProgress(
        () => (params.enabled ? enableTrigger(params.triggerId) : disableTrigger(params.triggerId)),
        onUpdate,
      );

      return textResult(
        summarizeJson(
          `${params.enabled ? "Enabled" : "Disabled"} Composio trigger ${params.triggerId}.`,
          response,
        ),
        {
          triggerId: params.triggerId,
          enabled: params.enabled,
          response,
        },
      );
    },
  });
}

export const toggleTrigger = toggleTriggerTool();
