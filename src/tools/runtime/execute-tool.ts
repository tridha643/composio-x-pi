import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { getToolRouterSession } from "../../composio-client.js";
import { LooseObject, createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  slug: Type.String({ minLength: 1 }),
  arguments: Type.Optional(LooseObject),
});

export type ExecuteToolParams = Static<typeof parameters>;

export function executeToolTool(deps: {
  executeTool?: (input: {
    slug: string;
    arguments?: Record<string, unknown>;
  }) => Promise<unknown>;
} = {}) {
  return createTool<ExecuteToolParams>({
    name: "composio_execute_tool",
    label: "Composio Execute Tool",
    description: "Execute a specific Composio tool.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const invoke =
        deps.executeTool ??
        (async (input) => {
          const session = await getToolRouterSession();
          const execute = (session as { execute?: unknown }).execute;

          if (typeof execute !== "function") {
            throw new Error("Composio tool router session does not expose execute().");
          }

          return execute.call(
            session,
            input.slug,
            input.arguments ?? {},
          );
        });

      const response = await withProgress(
        () =>
          invoke({
            slug: params.slug,
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
