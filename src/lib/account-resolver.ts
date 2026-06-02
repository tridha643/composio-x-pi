import { getComposioSdk } from "../composio-client.js";
import type { ConnectedAccountSummary } from "../composio-client.js";
import { UserFacingError } from "./errors.js";
import { readAccountStore } from "./account-store.js";
import type { AccountRecord, AccountStore } from "./account-store.js";

export type ResolvedAccount = {
  connectedAccountId?: string;
  userId: string;
};

function resolveUserId(store: AccountStore, record?: AccountRecord): string {
  if (record && typeof record !== "string" && record.userId) {
    return record.userId;
  }
  return store.userId || process.env.COMPOSIO_USER_ID?.trim() || "default";
}

function recordId(record: AccountRecord): string {
  return typeof record === "string" ? record : record.id;
}

/**
 * Resolve a friendly `account` selector to a concrete connected-account id + userId.
 *
 * Resolution order (cheapest first):
 *   1. `account` undefined → no binding, just the userId (Composio picks the default account).
 *   2. `account` starting with `ca_` → used verbatim, no network.
 *   3. Local `accounts.json` label hit → no network.
 *   4. Backend lookup (one `connectedAccounts.list` call) matched by alias / wordId / id.
 */
export async function resolveAccount(
  app: string,
  account: string | undefined,
): Promise<ResolvedAccount> {
  const store = readAccountStore();
  const appLabels = store.accounts[app] ?? {};

  if (account === undefined) {
    return { userId: resolveUserId(store) };
  }

  const trimmed = account.trim();

  if (trimmed.startsWith("ca_")) {
    return { connectedAccountId: trimmed, userId: resolveUserId(store) };
  }

  const localRecord = appLabels[trimmed];
  if (localRecord) {
    return {
      connectedAccountId: recordId(localRecord),
      userId: resolveUserId(store, localRecord),
    };
  }

  const userId = resolveUserId(store);
  const sdk = await getComposioSdk();
  let accounts: ConnectedAccountSummary[] = [];
  try {
    const response = await sdk.connectedAccounts.list({
      toolkitSlugs: [app],
      userIds: [userId],
    });
    accounts = response.items ?? [];
  } catch (error) {
    throw new UserFacingError(
      "ACCOUNT_LOOKUP_FAILED",
      `Could not look up connected accounts for "${app}" while resolving account "${trimmed}".`,
      { cause: error instanceof Error ? error.message : error },
    );
  }

  const match = accounts.find(
    (item) =>
      item.alias === trimmed || item.wordId === trimmed || item.id === trimmed,
  );

  if (!match) {
    const available = accounts
      .map((item) => item.alias ?? item.wordId ?? item.id)
      .filter(Boolean);
    const localLabels = Object.keys(appLabels);
    const hint = [...new Set([...localLabels, ...available])];
    throw new UserFacingError(
      "ACCOUNT_NOT_FOUND",
      hint.length > 0
        ? `No connected account matches "${trimmed}" for "${app}". Available: ${hint.join(", ")}. ` +
          `Connect one with composio_manage_connections, or pass a ca_ id directly.`
        : `No connected account matches "${trimmed}" for "${app}". ` +
          `Connect one with composio_manage_connections({ app: "${app}" }).`,
    );
  }

  return { connectedAccountId: match.id, userId };
}
