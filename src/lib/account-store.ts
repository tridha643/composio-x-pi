import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type AccountRecord = string | { id: string; userId?: string };

export type AccountStore = {
  version: 1;
  userId: string;
  accounts: Record<string, Record<string, AccountRecord>>;
};

const DEFAULT_STORE: AccountStore = { version: 1, userId: "default", accounts: {} };

export function getAccountStorePath(): string {
  return join(getAgentDir(), "extensions", "composio-accounts.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAccountRecord(value: unknown): AccountRecord | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (isRecord(value)) {
    const id = typeof value.id === "string" ? value.id.trim() : "";
    if (!id) {
      return undefined;
    }
    const userId = typeof value.userId === "string" ? value.userId.trim() : undefined;
    return userId ? { id, userId } : { id };
  }

  return undefined;
}

export function readAccountStore(): AccountStore {
  const path = getAccountStorePath();
  if (!existsSync(path)) {
    return { ...DEFAULT_STORE, accounts: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      return { ...DEFAULT_STORE, accounts: {} };
    }

    const userId =
      typeof parsed.userId === "string" && parsed.userId.trim()
        ? parsed.userId.trim()
        : "default";

    const accounts: AccountStore["accounts"] = {};
    if (isRecord(parsed.accounts)) {
      for (const [app, labels] of Object.entries(parsed.accounts)) {
        if (!isRecord(labels)) {
          continue;
        }
        const normalized: Record<string, AccountRecord> = {};
        for (const [label, raw] of Object.entries(labels)) {
          const record = normalizeAccountRecord(raw);
          if (record) {
            normalized[label] = record;
          }
        }
        if (Object.keys(normalized).length > 0) {
          accounts[app] = normalized;
        }
      }
    }

    return { version: 1, userId, accounts };
  } catch {
    return { ...DEFAULT_STORE, accounts: {} };
  }
}

export async function writeAccountAlias(
  app: string,
  label: string,
  caId: string,
  userId?: string,
): Promise<void> {
  const trimmedApp = app.trim();
  const trimmedLabel = label.trim();
  const trimmedId = caId.trim();
  if (!trimmedApp || !trimmedLabel || !trimmedId) {
    throw new Error("app, label, and connected account id are required to remember an account.");
  }

  const current = readAccountStore();
  const next: AccountStore = {
    version: 1,
    userId: current.userId,
    accounts: { ...current.accounts },
  };

  const appLabels = { ...(next.accounts[trimmedApp] ?? {}) };
  const trimmedUserId = userId?.trim();
  appLabels[trimmedLabel] =
    trimmedUserId && trimmedUserId !== current.userId
      ? { id: trimmedId, userId: trimmedUserId }
      : trimmedId;
  next.accounts[trimmedApp] = appLabels;

  const path = getAccountStorePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function renderAccountsPromptSnippet(store: AccountStore): string {
  const apps = Object.keys(store.accounts);
  if (apps.length === 0) {
    return "";
  }

  const lines: string[] = [
    "",
    "## Composio account aliases",
    "Saved connected-account aliases. Pass the label as the `account` parameter to target one:",
  ];

  for (const app of apps.sort()) {
    const labels = store.accounts[app];
    const rendered = Object.entries(labels)
      .map(([label, record]) => {
        const id = typeof record === "string" ? record : record.id;
        return `${label} (${id})`;
      })
      .join(", ");
    lines.push(`- ${app}: ${rendered}`);
  }

  return `${lines.join("\n")}\n`;
}
