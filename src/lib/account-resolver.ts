import type { ConnectedAccountSummary } from "../composio-client.js";
import { readStoredComposioConfig } from "../config-store.js";
import { listConnectedAccounts, resolveUserId } from "./account-directory.js";
import { UserFacingError } from "./errors.js";

export type ResolvedAccount = {
  connectedAccountId?: string;
  userId: string;
};

function normalizeApp(app: string): string {
  return app.trim().toLowerCase();
}

function isActiveAccount(account: ConnectedAccountSummary): boolean {
  return account.status.toUpperCase() === "ACTIVE";
}

function accountSelector(account: ConnectedAccountSummary): string {
  return account.alias ?? account.wordId ?? account.id;
}

function matchesSelector(account: ConnectedAccountSummary, selector: string): boolean {
  return account.alias === selector || account.wordId === selector || account.id === selector;
}

export function selectDefaultActiveAccount(
  app: string,
  accounts: ConnectedAccountSummary[],
  preferredSelector?: string,
): ConnectedAccountSummary | undefined {
  const normalizedApp = normalizeApp(app);
  const active = accounts.filter((item) => item.toolkit.slug === normalizedApp && isActiveAccount(item));
  if (preferredSelector) {
    const preferred = active.find((item) => matchesSelector(item, preferredSelector));
    if (preferred) return preferred;
  }
  return active.length === 1 ? active[0] : undefined;
}

/**
 * Resolve a friendly `account` selector to a concrete connected-account id + userId.
 *
 * Resolution order (cheapest first):
 *   1. `account` undefined → prefer a stored/default ACTIVE account; if ambiguous, fail clearly.
 *   2. `account` starting with `ca_` → used verbatim, no network.
 *   3. Backend lookup (one cached `connectedAccounts.list` call) matched by alias / wordId / id.
 */
export async function resolveAccount(
  app: string,
  account: string | undefined,
): Promise<ResolvedAccount> {
  const normalizedApp = normalizeApp(app);
  const userId = resolveUserId();

  if (account === undefined) {
    // Do not let the Composio backend silently pick an expired/stale default
    // connected account. This is common in embedded surfaces like boring.notch,
    // where the user says "use Slack/GitHub" without an explicit account label;
    // the API key is valid, but tool execution fails because the default account
    // is not. Prefer an ACTIVE account when the backend can be reached, and fall
    // back to legacy unbound execution only when there is no account evidence for
    // this toolkit (some Composio tools do not need a connected account).
    let accounts: ConnectedAccountSummary[];
    try {
      accounts = await listConnectedAccounts(userId);
    } catch {
      return { userId };
    }

    const appAccounts = accounts.filter((item) => item.toolkit.slug === normalizedApp);
    if (appAccounts.length === 0) {
      return { userId };
    }

    const active = appAccounts.filter(isActiveAccount);
    const preferredSelector = readStoredComposioConfig().defaultAccounts?.[normalizedApp];
    const selected = selectDefaultActiveAccount(normalizedApp, accounts, preferredSelector);
    if (selected) {
      return { connectedAccountId: selected.id, userId };
    }

    if (active.length === 0) {
      const available = appAccounts.map((item) => `${accountSelector(item)} [${item.status}]`).join(", ");
      throw new UserFacingError(
        "NO_ACTIVE_ACCOUNT",
        `No ACTIVE Composio account is connected for "${normalizedApp}". ` +
          `Reconnect with composio_manage_connections({ app: "${normalizedApp}", alias: "main" }).` +
          (available ? ` Current accounts: ${available}.` : ""),
      );
    }

    throw new UserFacingError(
      "MULTIPLE_ACTIVE_ACCOUNTS",
      `Multiple ACTIVE Composio accounts are connected for "${normalizedApp}". ` +
        `Pass one with the account parameter (${active.map(accountSelector).join(", ")}) ` +
        `or save a default with composio_remember_account.`,
    );
  }

  const trimmed = account.trim();

  if (trimmed.startsWith("ca_")) {
    return { connectedAccountId: trimmed, userId };
  }

  const match = await findAccount(normalizedApp, trimmed, userId);
  if (match) {
    return { connectedAccountId: match.id, userId };
  }

  // Retry once with a fresh fetch — covers an account connected moments ago.
  const fresh = await findAccount(normalizedApp, trimmed, userId, { force: true });
  if (fresh) {
    return { connectedAccountId: fresh.id, userId };
  }

  const accounts = await loadAccounts(normalizedApp, trimmed, userId);
  const available = accounts
    .filter((item) => item.toolkit.slug === normalizedApp)
    .map((item) => item.alias ?? item.wordId ?? item.id)
    .filter(Boolean);

  throw new UserFacingError(
    "ACCOUNT_NOT_FOUND",
    available.length > 0
      ? `No connected account matches "${trimmed}" for "${normalizedApp}". Available: ${available.join(", ")}. ` +
        `Connect one with composio_manage_connections, or pass a ca_ id directly.`
      : `No connected account matches "${trimmed}" for "${normalizedApp}". ` +
        `Connect one with composio_manage_connections({ app: "${normalizedApp}" }).`,
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
