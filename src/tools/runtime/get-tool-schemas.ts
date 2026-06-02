import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { getComposioSdk } from "../../composio-client.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  toolSlugs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
});

export type GetToolSchemasParams = Static<typeof parameters>;

export function getToolSchemasTool(deps: {
  getRawTools?: (query: Record<string, unknown>) => Promise<unknown[]>;
} = {}) {
  return createTool<GetToolSchemasParams>({
    name: "composio_get_tool_schemas",
    label: "Composio Get Tool Schemas",
    description: "Fetch the JSON schemas for one or more Composio tools.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const invoke =
        deps.getRawTools ??
        (async (query: Record<string, unknown>) => {
          const sdk = await getComposioSdk();
          return sdk.tools.getRawComposioTools(query);
        });

      const tools = await withProgress(() => invoke({ tools: params.toolSlugs }), onUpdate);

      return textResult(
        summarizeJson(
          `Retrieved Composio schemas for ${params.toolSlugs.length} tool(s).`,
          tools,
        ),
        {
          toolSlugs: params.toolSlugs,
          tools,
        },
      );
    },
  });
}

export const getToolSchemas = getToolSchemasTool();
