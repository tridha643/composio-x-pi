import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { getComposioSdk } from "../../composio-client.js";
import type { ToolExecuteResult } from "../../composio-client.js";
import { resolveAccount } from "../../lib/account-resolver.js";
import type { ResolvedAccount } from "../../lib/account-resolver.js";
import { UserFacingError } from "../../lib/errors.js";
import { LooseObject, createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  slug: Type.String({ minLength: 1 }),
  arguments: Type.Optional(LooseObject),
  account: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Friendly account selector (alias/label, word id, or a ca_ connected-account id). Omit to use the default account.",
    }),
  ),
});

export type ExecuteToolParams = Static<typeof parameters>;

function inferApp(slug: string): string {
  const prefix = slug.split("_")[0] ?? slug;
  return prefix.toLowerCase();
}

export function executeToolTool(deps: {
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
  return createTool<ExecuteToolParams>({
    name: "composio_execute_tool",
    label: "Composio Execute Tool",
    description:
      "Execute a specific Composio tool. Pass `account` to target a connected account by alias, word id, or ca_ id.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const resolve = deps.resolveAccount ?? resolveAccount;
      const invoke =
        deps.executeTool ??
        (async (slug, body) => {
          const sdk = await getComposioSdk();
          return sdk.tools.execute(slug, body);
        });

      const resolved = await resolve(inferApp(params.slug), params.account);

      const response = await withProgress(
        () =>
          invoke(params.slug, {
            // The API rejects requests that omit `arguments`, so always send at least {}.
            arguments: params.arguments ?? {},
            ...(resolved.connectedAccountId === undefined
              ? {}
              : { connectedAccountId: resolved.connectedAccountId }),
            userId: resolved.userId,
            // Match the prior tool-router behavior of executing the latest toolkit version.
            dangerouslySkipVersionCheck: true,
          }),
        onUpdate,
      );

      // tools.execute resolves (does not throw) on tool-level failures.
      if (response && response.successful === false) {
        throw new UserFacingError(
          "TOOL_EXECUTION_FAILED",
          `Composio tool ${params.slug} failed: ${response.error ?? "unknown error"}.`,
          { slug: params.slug, resolvedAccount: resolved, response },
        );
      }

      return textResult(summarizeJson(`Executed Composio tool ${params.slug}.`, response), {
        slug: params.slug,
        resolvedAccount: resolved,
        response,
      });
    },
  });
}

export const executeTool = executeToolTool();
