import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { callComposioMethod, getRequiredUserId } from "../../composio-client.js";
import { LooseObject, createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  slug: Type.String({ minLength: 1 }),
  triggerConfig: LooseObject,
});

export type CreateTriggerParams = Static<typeof parameters>;

export function createTriggerTool(deps: {
  createTrigger?: (input: {
    slug: string;
    userId: string;
    triggerConfig: Record<string, unknown>;
  }) => Promise<unknown>;
} = {}) {
  return createTool<CreateTriggerParams>({
    name: "composio_create_trigger",
    label: "Composio Create Trigger",
    description: "Create a Composio trigger for the configured user.",
    parameters,
    async execute(_toolCallId, params, onUpdate) {
      const invoke =
        deps.createTrigger ??
        ((input) => {
          return callComposioMethod("triggers.create", input);
        });

      const response = await withProgress(
        () =>
          invoke({
            slug: params.slug,
            userId: getRequiredUserId(),
            triggerConfig: params.triggerConfig,
          }),
        onUpdate,
      );

      return textResult(summarizeJson(`Created Composio trigger ${params.slug}.`, response), {
        slug: params.slug,
        response,
      });
    },
  });
}

export const createTrigger = createTriggerTool();
