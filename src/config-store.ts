import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { getAgentDir } from "@mariozechner/pi-coding-agent";

export type StoredComposioConfig = {
  apiKey?: string;
  userId?: string;
};

const CONFIG_PATH = join(getAgentDir(), "extensions", "composio-x-pi.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getComposioConfigPath(): string {
  return CONFIG_PATH;
}

export function readStoredComposioConfig(): StoredComposioConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }

    const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : undefined;
    const userId = typeof parsed.userId === "string" ? parsed.userId.trim() : undefined;

    return {
      apiKey: apiKey || undefined,
      userId: userId || undefined,
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

  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
