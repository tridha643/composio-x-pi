import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getComposioConfig } from "../src/composio-client.js";
import { writeAnonymousUserData } from "../src/lib/anonymous-user-data.js";

let originalHome: string | undefined;
let originalApiKey: string | undefined;
let originalAgentDir: string | undefined;
let tempHome: string;
let tempAgentDir: string;

function writeLegacyStored(apiKey: string): void {
  // config-store.ts uses getAgentDir() from pi-coding-agent; redirecting it via
  // PI_CODING_AGENT_DIR lets us point the legacy file inside the tempHome sandbox.
  const dir = join(tempAgentDir, "extensions");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "composio-x-pi.json"), JSON.stringify({ apiKey }), "utf8");
}

beforeEach(() => {
  originalHome = process.env.HOME;
  originalApiKey = process.env.COMPOSIO_API_KEY;
  originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  tempHome = mkdtempSync(join(tmpdir(), "composio-client-"));
  tempAgentDir = join(tempHome, ".pi", "agent");
  process.env.HOME = tempHome;
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
  delete process.env.COMPOSIO_API_KEY;
});

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true });
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalApiKey === undefined) {
    delete process.env.COMPOSIO_API_KEY;
  } else {
    process.env.COMPOSIO_API_KEY = originalApiKey;
  }
  if (originalAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  }
});

describe("getComposioConfig precedence", () => {
  test("returns null source when nothing is configured", () => {
    const config = getComposioConfig();
    expect(config.apiKeyPresent).toBe(false);
    expect(config.apiKeySource).toBeNull();
    expect(config.apiKey).toBeUndefined();
  });

  test("env wins over signup and legacy stored", async () => {
    process.env.COMPOSIO_API_KEY = "ak_env";
    await writeAnonymousUserData({ agent_key: "k", composio: { api_key: "ak_signup" } });
    writeLegacyStored("ak_stored");

    const config = getComposioConfig();
    expect(config.apiKey).toBe("ak_env");
    expect(config.apiKeySource).toBe("env");
  });

  test("signup wins over legacy stored when env absent", async () => {
    await writeAnonymousUserData({ agent_key: "k", composio: { api_key: "ak_signup" } });
    writeLegacyStored("ak_stored");

    const config = getComposioConfig();
    expect(config.apiKey).toBe("ak_signup");
    expect(config.apiKeySource).toBe("signup");
  });

  test("legacy stored is used when env and signup are both absent", () => {
    writeLegacyStored("ak_stored");

    const config = getComposioConfig();
    expect(config.apiKey).toBe("ak_stored");
    expect(config.apiKeySource).toBe("stored");
  });

  test("signup file with empty api_key falls through to legacy stored", async () => {
    await writeAnonymousUserData({ agent_key: "k", composio: { api_key: "   " } });
    writeLegacyStored("ak_stored");

    const config = getComposioConfig();
    expect(config.apiKey).toBe("ak_stored");
    expect(config.apiKeySource).toBe("stored");
  });

  test("trims whitespace from env values", () => {
    process.env.COMPOSIO_API_KEY = "  ak_env  ";
    const config = getComposioConfig();
    expect(config.apiKey).toBe("ak_env");
    expect(config.apiKeySource).toBe("env");
  });
});
