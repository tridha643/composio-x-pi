import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { callComposioMethod } from "../../composio-client.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  active: Type.Optional(Type.Boolean()),
  triggerTypeSlug: Type.Optional(Type.String({ minLength: 1 })),
});

export type ListTriggersParams = Static<typeof parameters>;

export function listTriggersTool(deps: {
  listTriggers?: (filters: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  return createTool<ListTriggersParams>({
    name: "composio_list_triggers",
    label: "Composio List Triggers",
    description: "List configured Composio triggers.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const invoke =
        deps.listTriggers ??
        ((filters: Record<string, unknown>) => callComposioMethod("triggers.listActive", filters));

      const response = await withProgress(
        () =>
          invoke({
            ...(params.limit === undefined ? {} : { limit: params.limit }),
            ...(params.active === undefined ? {} : { active: params.active }),
            ...(params.triggerTypeSlug === undefined
              ? {}
              : { triggerTypeSlug: params.triggerTypeSlug }),
          }),
        onUpdate,
      );

      return textResult(summarizeJson("Configured Composio triggers.", response), {
        filters: params,
        response,
      });
    },
  });
}

export const listTriggers = listTriggersTool();
