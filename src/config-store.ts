import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { getAgentDir } from "@mariozechner/pi-coding-agent";

export type StoredComposioConfig = {
  apiKey?: string;
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

    return {
      apiKey: apiKey || undefined,
    };
  } catch {
    return {};
  }
}

export async function writeStoredComposioApiKey(apiKey: string): Promise<void> {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new Error("Composio API key cannot be empty.");
  }

  const current = readStoredComposioConfig();
  const next: StoredComposioConfig = {
    ...current,
    apiKey: trimmedApiKey,
  };

  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
