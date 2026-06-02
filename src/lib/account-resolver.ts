import type { ConnectedAccountSummary } from "../composio-client.js";
import { listConnectedAccounts, resolveUserId } from "./account-directory.js";
import { UserFacingError } from "./errors.js";

export type ResolvedAccount = {
  connectedAccountId?: string;
  userId: string;
};

/**
 * Resolve a friendly `account` selector to a concrete connected-account id + userId.
 *
 * Resolution order (cheapest first):
 *   1. `account` undefined → no binding, just the userId (Composio picks the default account).
 *   2. `account` starting with `ca_` → used verbatim, no network.
 *   3. Backend lookup (one cached `connectedAccounts.list` call) matched by alias / wordId / id.
 */
export async function resolveAccount(
  app: string,
  account: string | undefined,
): Promise<ResolvedAccount> {
  const userId = resolveUserId();

  if (account === undefined) {
    return { userId };
  }

  const trimmed = account.trim();

  if (trimmed.startsWith("ca_")) {
    return { connectedAccountId: trimmed, userId };
  }

  const match = await findAccount(app, trimmed, userId);
  if (match) {
    return { connectedAccountId: match.id, userId };
  }

  // Retry once with a fresh fetch — covers an account connected moments ago.
  const fresh = await findAccount(app, trimmed, userId, { force: true });
  if (fresh) {
    return { connectedAccountId: fresh.id, userId };
  }

  const accounts = await loadAccounts(app, trimmed, userId);
  const available = accounts
    .filter((item) => item.toolkit.slug === app)
    .map((item) => item.alias ?? item.wordId ?? item.id)
    .filter(Boolean);

  throw new UserFacingError(
    "ACCOUNT_NOT_FOUND",
    available.length > 0
      ? `No connected account matches "${trimmed}" for "${app}". Available: ${available.join(", ")}. ` +
        `Connect one with composio_manage_connections, or pass a ca_ id directly.`
      : `No connected account matches "${trimmed}" for "${app}". ` +
        `Connect one with composio_manage_connections({ app: "${app}" }).`,
  );
}

async function findAccount(
  app: string,
  selector: string,
  userId: string,
  { force = false }: { force?: boolean } = {},
): Promise<ConnectedAccountSummary | undefined> {
  const accounts = await loadAccounts(app, selector, userId, { force });
  return accounts.find(
    (item) =>
      item.toolkit.slug === app &&
      (item.alias === selector || item.wordId === selector || item.id === selector),
  );
}

async function loadAccounts(
  app: string,
  selector: string,
  userId: string,
  { force = false }: { force?: boolean } = {},
): Promise<ConnectedAccountSummary[]> {
  try {
    return await listConnectedAccounts(userId, { force });
  } catch (error) {
    throw new UserFacingError(
      "ACCOUNT_LOOKUP_FAILED",
      `Could not look up connected accounts for "${app}" while resolving account "${selector}".`,
      { cause: error instanceof Error ? error.message : error },
    );
  }
}
