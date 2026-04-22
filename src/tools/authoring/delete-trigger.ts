import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { callComposioMethod } from "../../composio-client.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  triggerId: Type.String({ minLength: 1 }),
});

export type DeleteTriggerParams = Static<typeof parameters>;

export function deleteTriggerTool(deps: {
  deleteTrigger?: (triggerId: string) => Promise<unknown>;
} = {}) {
  return createTool<DeleteTriggerParams>({
    name: "composio_delete_trigger",
    label: "Composio Delete Trigger",
    description: "Delete a Composio trigger by ID.",
    parameters,
    async execute(_toolCallId, params, onUpdate) {
      const invoke =
        deps.deleteTrigger ?? ((triggerId: string) => callComposioMethod("triggers.delete", triggerId));
      const response = await withProgress(() => invoke(params.triggerId), onUpdate);

      return textResult(
        summarizeJson(`Deleted Composio trigger ${params.triggerId}.`, response),
        {
          triggerId: params.triggerId,
          response,
        },
      );
    },
  });
}

export const deleteTrigger = deleteTriggerTool();
