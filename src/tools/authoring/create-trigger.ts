import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { getComposioSdk } from "../../composio-client.js";
import { resolveAccount } from "../../lib/account-resolver.js";
import type { ResolvedAccount } from "../../lib/account-resolver.js";
import { LooseObject, createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  slug: Type.String({ minLength: 1 }),
  triggerConfig: LooseObject,
  account: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Friendly account selector to bind the trigger to (alias/label, word id, or ca_ id). Omit to use the default account.",
    }),
  ),
});

export type CreateTriggerParams = Static<typeof parameters>;

function inferApp(slug: string): string {
  const prefix = slug.split("_")[0] ?? slug;
  return prefix.toLowerCase();
}

export function createTriggerTool(deps: {
  createTrigger?: (
    userId: string,
    slug: string,
    body: { connectedAccountId?: string; triggerConfig?: Record<string, unknown> },
  ) => Promise<unknown>;
  resolveAccount?: (app: string, account: string | undefined) => Promise<ResolvedAccount>;
} = {}) {
  return createTool<CreateTriggerParams>({
    name: "composio_create_trigger",
    label: "Composio Create Trigger",
    description: "Create a Composio trigger. Pass `account` to bind it to a specific connected account.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const resolve = deps.resolveAccount ?? resolveAccount;
      const invoke =
        deps.createTrigger ??
        (async (userId, slug, body) => {
          const sdk = await getComposioSdk();
          return sdk.triggers.create(userId, slug, body);
        });

      const resolved = await resolve(inferApp(params.slug), params.account);

      const response = await withProgress(
        () =>
          invoke(resolved.userId, params.slug, {
            ...(resolved.connectedAccountId === undefined
              ? {}
              : { connectedAccountId: resolved.connectedAccountId }),
            triggerConfig: params.triggerConfig,
          }),
        onUpdate,
      );

      return textResult(summarizeJson(`Created Composio trigger ${params.slug}.`, response), {
        slug: params.slug,
        resolvedAccount: resolved,
        response,
      });
    },
  });
}

export const createTrigger = createTriggerTool();
