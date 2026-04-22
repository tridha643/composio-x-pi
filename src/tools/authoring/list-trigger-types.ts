import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { callFirstAvailableComposioMethod } from "../../composio-client.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  app: Type.Optional(Type.String({ minLength: 1 })),
  query: Type.Optional(Type.String({ minLength: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
});

export type ListTriggerTypesParams = Static<typeof parameters>;

export function listTriggerTypesTool(deps: {
  listTriggerTypes?: (filters: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  return createTool<ListTriggerTypesParams>({
    name: "composio_list_trigger_types",
    label: "Composio List Trigger Types",
    description: "List trigger types available in the configured Composio account.",
    parameters,
    async execute(_toolCallId, params, onUpdate) {
      const invoke =
        deps.listTriggerTypes ??
        ((filters: Record<string, unknown>) =>
          callFirstAvailableComposioMethod(
            ["triggers.listTypes", "triggers.getTypes", "triggers.list_types"],
            filters,
          ));

      const response = await withProgress(() => invoke(params as Record<string, unknown>), onUpdate);

      return textResult(summarizeJson("Available Composio trigger types.", response), {
        filters: params,
        response,
      });
    },
  });
}

export const listTriggerTypes = listTriggerTypesTool();
