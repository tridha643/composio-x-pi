import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { getComposioSdk } from "../../composio-client.js";
import type { ToolExecuteResult } from "../../composio-client.js";
import { resolveAccount } from "../../lib/account-resolver.js";
import type { ResolvedAccount } from "../../lib/account-resolver.js";
import { LooseObject, createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  tools: Type.Array(
    Type.Object({
      slug: Type.String({ minLength: 1 }),
      arguments: Type.Optional(LooseObject),
    }),
    { minItems: 1 },
  ),
  account: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Friendly account selector applied to every tool in this batch (alias/label, word id, or ca_ id).",
    }),
  ),
});

export type MultiExecuteToolParams = Static<typeof parameters>;

function inferApp(slug: string): string {
  const prefix = slug.split("_")[0] ?? slug;
  return prefix.toLowerCase();
}

export function multiExecuteToolTool(deps: {
  executeTool?: (
    slug: string,
    body: {
      arguments?: Record<string, unknown>;
      connectedAccountId?: string;
      userId?: string;
      dangerouslySkipVersionCheck?: boolean;
    },
  ) => Promise<ToolExecuteResult>;
  resolveAccount?: (app: string, account: string | undefined) => Promise<ResolvedAccount>;
} = {}) {
  return createTool<MultiExecuteToolParams>({
    name: "composio_multi_execute_tool",
    label: "Composio Multi Execute Tool",
    description:
      "Execute multiple Composio tools in sequence. A single `account` selector (if given) is applied to every tool in the batch.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const resolve = deps.resolveAccount ?? resolveAccount;
      const invoke =
        deps.executeTool ??
        (async (slug, body) => {
          const sdk = await getComposioSdk();
          return sdk.tools.execute(slug, body);
        });

      const results = await withProgress(
        async () => {
          const collected: Array<{ slug: string; response: ToolExecuteResult }> = [];
          for (const tool of params.tools) {
            const resolved = await resolve(inferApp(tool.slug), params.account);
            const response = await invoke(tool.slug, {
              // The API rejects requests that omit `arguments`, so always send at least {}.
              arguments: tool.arguments ?? {},
              ...(resolved.connectedAccountId === undefined
                ? {}
                : { connectedAccountId: resolved.connectedAccountId }),
              userId: resolved.userId,
              // Match the prior tool-router behavior of executing the latest toolkit version.
              dangerouslySkipVersionCheck: true,
            });
            collected.push({ slug: tool.slug, response });
          }
          return collected;
        },
        onUpdate,
        "Executing Composio tools...",
      );

      const failed = results.filter((r) => r.response && r.response.successful === false);
      const summary =
        failed.length > 0
          ? `Executed ${results.length} Composio tool(s); ${failed.length} failed.`
          : `Executed ${results.length} Composio tool(s).`;

      return textResult(summarizeJson(summary, results), {
        account: params.account,
        results,
      });
    },
  });
}

export const multiExecuteTool = multiExecuteToolTool();
