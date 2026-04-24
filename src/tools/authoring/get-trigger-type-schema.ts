import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { callFirstAvailableComposioMethod } from "../../composio-client.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  slug: Type.String({ minLength: 1 }),
});

export type GetTriggerTypeSchemaParams = Static<typeof parameters>;

export function getTriggerTypeSchemaTool(deps: {
  getTriggerType?: (slug: string) => Promise<unknown>;
} = {}) {
  return createTool<GetTriggerTypeSchemaParams>({
    name: "composio_get_trigger_type_schema",
    label: "Composio Get Trigger Type Schema",
    description: "Fetch the config schema for a single Composio trigger type.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const invoke =
        deps.getTriggerType ??
        ((slug: string) =>
          callFirstAvailableComposioMethod(
            ["triggers.getType", "triggers.get_type", "triggers.retrieveType"],
            slug,
          ));

      const response = await withProgress(() => invoke(params.slug), onUpdate);

      return textResult(
        summarizeJson(`Trigger schema for ${params.slug}.`, response),
        {
          slug: params.slug,
          response,
        },
      );
    },
  });
}

export const getTriggerTypeSchema = getTriggerTypeSchemaTool();
