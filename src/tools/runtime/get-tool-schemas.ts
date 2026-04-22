import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { executeMetaTool } from "../../composio-client.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  toolSlugs: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
});

export type GetToolSchemasParams = Static<typeof parameters>;

export function getToolSchemasTool(deps: {
  executeMetaTool?: (slug: string, input?: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  return createTool<GetToolSchemasParams>({
    name: "composio_get_tool_schemas",
    label: "Composio Get Tool Schemas",
    description: "Fetch the JSON schemas for one or more Composio tools.",
    parameters,
    async execute(_toolCallId, params, onUpdate) {
      const invoke = deps.executeMetaTool ?? executeMetaTool;
      const response = await withProgress(
        () =>
          invoke("COMPOSIO_GET_TOOL_SCHEMAS", {
            toolSlugs: params.toolSlugs,
          }),
        onUpdate,
      );

      return textResult(
        summarizeJson(
          `Retrieved Composio schemas for ${params.toolSlugs.length} tool(s).`,
          response,
        ),
        {
          toolSlugs: params.toolSlugs,
          response,
        },
      );
    },
  });
}

export const getToolSchemas = getToolSchemasTool();
