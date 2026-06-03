import { getComposioSdk } from "../composio-client.js";
import type { ConnectedAccountSummary } from "../composio-client.js";

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  expiresAt: number;
  accounts: ConnectedAccountSummary[];
};

const cache = new Map<string, CacheEntry>();

/**
 * The Composio userId/entity to scope account lookups against.
 * Strictly `COMPOSIO_USER_ID || "default"` — no local file is consulted.
 */
export function resolveUserId(): string {
  return process.env.COMPOSIO_USER_ID?.trim() || "default";
}

/**
 * List every connected account for a userId, backed by a short in-process cache so
 * thread-start discovery and per-call resolution don't each pay a round trip.
 * `force` bypasses the cache (used right after our own mutations).
 */
export async function listConnectedAccounts(
  userId: string,
  { force = false }: { force?: boolean } = {},
): Promise<ConnectedAccountSummary[]> {
  const now = Date.now();
  if (!force) {
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.accounts;
    }
  }

  const sdk = await getComposioSdk();
  const response = await sdk.connectedAccounts.list({ userIds: [userId] });
  const accounts = response.items ?? [];
  cache.set(userId, { expiresAt: now + CACHE_TTL_MS, accounts });
  return accounts;
}

/** Clear the cache for one userId (or all of it) after a connect/alias write. */
export function invalidateAccounts(userId?: string): void {
  if (userId === undefined) {
    cache.clear();
    return;
  }
  cache.delete(userId);
}

/**
 * Render a system-prompt snippet from backend accounts, grouped by toolkit slug.
 * Empty string when there are no accounts.
 */
export function renderAccountsPromptSnippet(accounts: ConnectedAccountSummary[]): string {
  if (accounts.length === 0) {
    return "";
  }

  const byApp = new Map<string, ConnectedAccountSummary[]>();
  for (const account of accounts) {
    const slug = account.toolkit.slug;
    const list = byApp.get(slug);
    if (list) {
      list.push(account);
    } else {
      byApp.set(slug, [account]);
    }
  }

  const lines: string[] = [
    "",
    "## Composio connected accounts",
    "Connected accounts available right now. Use ACTIVE accounts only. Always pass the alias, word id, or ca_ id as the `account` parameter when one is listed. Never use EXPIRED or INITIALIZING accounts; reconnect them with composio_manage_connections.",
  ];

  for (const app of [...byApp.keys()].sort()) {
    const rendered = (byApp.get(app) ?? [])
      .map((account) => {
        const name = account.alias ?? account.wordId ?? account.id;
        const instruction = account.status.toUpperCase() === "ACTIVE"
          ? ` → use account=\"${name}\"`
          : " → reconnect before use";
        return `${name} (${account.id}) [${account.status}]${instruction}`;
      })
      .join(", ");
    lines.push(`- ${app}: ${rendered}`);
  }

  return `${lines.join("\n")}\n`;
}
