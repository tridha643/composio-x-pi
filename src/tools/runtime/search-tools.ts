import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { getComposioSdk } from "../../composio-client.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  query: Type.String({ minLength: 1 }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
});

export type SearchToolsParams = Static<typeof parameters>;

export function searchToolsTool(deps: {
  getRawTools?: (query: Record<string, unknown>) => Promise<unknown[]>;
} = {}) {
  return createTool<SearchToolsParams>({
    name: "composio_search_tools",
    label: "Composio Search Tools",
    description: "Search Composio tools using a natural-language query.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const invoke =
        deps.getRawTools ??
        (async (query: Record<string, unknown>) => {
          const sdk = await getComposioSdk();
          return sdk.tools.getRawComposioTools(query);
        });

      // The SDK forbids `search` + `limit` together, so we slice client-side.
      const allTools = await withProgress(() => invoke({ search: params.query }), onUpdate);
      const tools = params.limit === undefined ? allTools : allTools.slice(0, params.limit);

      return textResult(
        summarizeJson(`Composio tool search results for "${params.query}".`, tools),
        {
          query: params.query,
          tools,
        },
      );
    },
  });
}

export const searchTools = searchToolsTool();
