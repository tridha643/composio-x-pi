import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import type { ConnectedAccountSummary } from "../../composio-client.js";
import {
  listConnectedAccounts,
  renderAccountsPromptSnippet,
  resolveUserId,
} from "../../lib/account-directory.js";
import { createTool, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  app: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Optional toolkit slug to filter by (e.g. \"github\", \"linear\"). Omit to list every connected account.",
    }),
  ),
  refresh: Type.Optional(
    Type.Boolean({
      description:
        "Bypass the short-lived cache and re-fetch fresh from the Composio backend. Use after connecting an account elsewhere.",
    }),
  ),
});

export type ListAccountsParams = Static<typeof parameters>;

type AccountInfo = {
  app: string;
  connectedAccountId: string;
  alias: string | null;
  wordId: string | null;
  status: string;
};

function toAccountInfo(account: ConnectedAccountSummary): AccountInfo {
  return {
    app: account.toolkit.slug,
    connectedAccountId: account.id,
    alias: account.alias ?? null,
    wordId: account.wordId ?? null,
    status: account.status,
  };
}

export function listAccountsTool(deps: {
  listAccounts?: (
    userId: string,
    opts: { force?: boolean },
  ) => Promise<ConnectedAccountSummary[]>;
} = {}) {
  return createTool<ListAccountsParams>({
    name: "composio_list_accounts",
    label: "Composio List Accounts",
    description:
      "List every Composio connected account for the current user — id, alias, word id, status, and toolkit — straight from the Composio backend. Read-only. Use it to discover which accounts are available and what selector to pass as the `account` parameter on other Composio tools.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const userId = resolveUserId();
      const list = deps.listAccounts ?? listConnectedAccounts;
      const force = params.refresh === true;

      const all = await withProgress(
        () => list(userId, { force }),
        onUpdate,
        "Listing Composio accounts...",
      );
      const accounts = params.app
        ? all.filter((account) => account.toolkit.slug === params.app)
        : all;

      const heading = params.app
        ? `Composio connected accounts for "${params.app}" (${accounts.length}).`
        : `Composio connected accounts (${accounts.length}).`;
      const snippet = renderAccountsPromptSnippet(accounts);
      const text = snippet ? `${heading}\n${snippet}` : `${heading}\nNo connected accounts found.`;

      return textResult(text, {
        userId,
        count: accounts.length,
        accounts: accounts.map(toAccountInfo),
      });
    },
  });
}

export const listAccounts = listAccountsTool();
