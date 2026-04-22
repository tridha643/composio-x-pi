import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { callComposioMethod, getRequiredUserId } from "../../composio-client.js";
import { LooseObject, createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  slug: Type.String({ minLength: 1 }),
  arguments: Type.Optional(LooseObject),
});

export type ExecuteToolParams = Static<typeof parameters>;

export function executeToolTool(deps: {
  executeTool?: (input: {
    slug: string;
    userId: string;
    arguments?: Record<string, unknown>;
  }) => Promise<unknown>;
} = {}) {
  return createTool<ExecuteToolParams>({
    name: "composio_execute_tool",
    label: "Composio Execute Tool",
    description: "Execute a specific Composio tool for the configured user.",
    parameters,
    async execute(_toolCallId, params, onUpdate) {
      const invoke =
        deps.executeTool ??
        ((input) => {
          return callComposioMethod("tools.execute", input);
        });

      const response = await withProgress(
        () =>
          invoke({
            slug: params.slug,
            userId: getRequiredUserId(),
            ...(params.arguments === undefined ? {} : { arguments: params.arguments }),
          }),
        onUpdate,
      );

      return textResult(summarizeJson(`Executed Composio tool ${params.slug}.`, response), {
        slug: params.slug,
        response,
      });
    },
  });
}

export const executeTool = executeToolTool();
