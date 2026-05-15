import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type AnonymousUserComposio = {
  member_id?: string;
  org_id?: string;
  project_id?: string;
  api_key?: string;
  user_api_key?: string;
};

export type AnonymousUserData = {
  status?: string;
  request_id?: string;
  slug?: string;
  email?: string;
  agent_key?: string;
  composio?: AnonymousUserComposio;
  [key: string]: unknown;
};

const FILE_NAME = "anonymous_user_data.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveHome(): string {
  const envHome = process.env.HOME?.trim();
  return envHome || homedir();
}

export function getAnonymousUserDataPath(): string {
  return join(resolveHome(), ".composio", FILE_NAME);
}

export function readAnonymousUserData(): AnonymousUserData | null {
  const path = getAnonymousUserDataPath();
  if (!existsSync(path)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    return parsed as AnonymousUserData;
  } catch {
    return null;
  }
}

export async function writeAnonymousUserData(data: AnonymousUserData): Promise<void> {
  const path = getAnonymousUserDataPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
