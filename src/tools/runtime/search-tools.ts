import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { executeMetaTool } from "../../composio-client.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  query: Type.String({ minLength: 1 }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
});

export type SearchToolsParams = Static<typeof parameters>;

export function searchToolsTool(deps: {
  executeMetaTool?: (slug: string, input?: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  return createTool<SearchToolsParams>({
    name: "composio_search_tools",
    label: "Composio Search Tools",
    description: "Search Composio tools using a natural-language query.",
    parameters,
    async execute(_toolCallId, params, onUpdate) {
      const invoke = deps.executeMetaTool ?? executeMetaTool;
      const response = await withProgress(
        () =>
          invoke("COMPOSIO_SEARCH_TOOLS", {
            query: params.query,
            ...(params.limit === undefined ? {} : { limit: params.limit }),
          }),
        onUpdate,
      );

      return textResult(
        summarizeJson(`Composio tool search results for "${params.query}".`, response),
        {
          query: params.query,
          response,
        },
      );
    },
  });
}

export const searchTools = searchToolsTool();
