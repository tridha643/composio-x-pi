import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type StoredComposioConfig = {
  apiKey?: string;
  /** Preferred Composio account selector per toolkit slug (alias, word id, or ca_ id). */
  defaultAccounts?: Record<string, string>;
};

function getConfigPath(): string {
  return join(getAgentDir(), "extensions", "composio-x-pi.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getComposioConfigPath(): string {
  return getConfigPath();
}

export function readStoredComposioConfig(): StoredComposioConfig {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }

    const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : undefined;
    const defaultAccounts = isRecord(parsed.defaultAccounts)
      ? Object.fromEntries(
          Object.entries(parsed.defaultAccounts)
            .map(([app, value]) => [app.trim().toLowerCase(), typeof value === "string" ? value.trim() : ""])
            .filter(([app, value]) => app && value),
        )
      : undefined;

    return {
      apiKey: apiKey || undefined,
      ...(defaultAccounts && Object.keys(defaultAccounts).length > 0 ? { defaultAccounts } : {}),
    };
  } catch {
    return {};
  }
}

async function writeStoredComposioConfig(next: StoredComposioConfig): Promise<void> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function writeStoredComposioApiKey(apiKey: string): Promise<void> {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new Error("Composio API key cannot be empty.");
  }

  const current = readStoredComposioConfig();
  await writeStoredComposioConfig({
    ...current,
    apiKey: trimmedApiKey,
  });
}

export async function writeDefaultComposioAccount(app: string, selector: string): Promise<void> {
  const normalizedApp = app.trim().toLowerCase();
  const trimmedSelector = selector.trim();
  if (!normalizedApp || !trimmedSelector) {
    throw new Error("Composio default account requires an app and selector.");
  }

  const current = readStoredComposioConfig();
  await writeStoredComposioConfig({
    ...current,
    defaultAccounts: {
      ...(current.defaultAccounts ?? {}),
      [normalizedApp]: trimmedSelector,
    },
  });
}
