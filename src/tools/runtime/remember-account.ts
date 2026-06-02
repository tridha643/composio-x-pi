import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { getComposioSdk } from "../../composio-client.js";
import { invalidateAccounts } from "../../lib/account-directory.js";
import { resolveAccount } from "../../lib/account-resolver.js";
import type { ResolvedAccount } from "../../lib/account-resolver.js";
import { UserFacingError } from "../../lib/errors.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  app: Type.String({ minLength: 1 }),
  account: Type.String({
    minLength: 1,
    description: "The account to remember: a ca_ connected-account id, word id, or existing alias.",
  }),
  label: Type.String({
    minLength: 1,
    description: "The friendly label to assign (e.g. \"work\" or \"personal\").",
  }),
});

export type RememberAccountParams = Static<typeof parameters>;

export function rememberAccountTool(deps: {
  resolveAccount?: (app: string, account: string | undefined) => Promise<ResolvedAccount>;
  updateAlias?: (caId: string, alias: string) => Promise<unknown>;
} = {}) {
  return createTool<RememberAccountParams>({
    name: "composio_remember_account",
    label: "Composio Remember Account",
    description:
      "Save a friendly label for a connected account, both locally and as the Composio backend alias. Idempotent.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const resolve = deps.resolveAccount ?? resolveAccount;
      const updateAlias =
        deps.updateAlias ??
        (async (caId: string, alias: string) => {
          const sdk = await getComposioSdk();
          return sdk.connectedAccounts.update(caId, { alias });
        });

      const resolved = await resolve(params.app, params.account);
      if (!resolved.connectedAccountId) {
        throw new UserFacingError(
          "ACCOUNT_NOT_FOUND",
          `Could not resolve account "${params.account}" for "${params.app}" to a connected-account id.`,
        );
      }

      const caId = resolved.connectedAccountId;

      await withProgress(() => updateAlias(caId, params.label), onUpdate, "Saving Composio alias...");
      invalidateAccounts(resolved.userId);

      return textResult(
        summarizeJson(`Remembered ${params.app} account as "${params.label}".`, {
          app: params.app,
          label: params.label,
          connectedAccountId: caId,
          userId: resolved.userId,
        }),
        {
          app: params.app,
          label: params.label,
          connectedAccountId: caId,
          userId: resolved.userId,
        },
      );
    },
  });
}

export const rememberAccount = rememberAccountTool();
