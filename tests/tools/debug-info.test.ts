import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeAnonymousUserData } from "../../src/lib/anonymous-user-data.js";
import { debugInfoTool } from "../../src/tools/debug/debug-info.js";

let originalHome: string | undefined;
let originalApiKey: string | undefined;
let originalAgentDir: string | undefined;
let tempHome: string;

beforeEach(() => {
  originalHome = process.env.HOME;
  originalApiKey = process.env.COMPOSIO_API_KEY;
  originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  tempHome = mkdtempSync(join(tmpdir(), "composio-debug-"));
  process.env.HOME = tempHome;
  process.env.PI_CODING_AGENT_DIR = join(tempHome, ".pi", "agent");
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

describe("composio_debug_info tool", () => {
  test("lists composio-claim command and signup/claim tools", async () => {
    const tool = debugInfoTool();
    const result = await tool.execute("call_debug_1", {});
    const details = result.details as {
      registeredTools: string[];
      registeredCommands: string[];
      apiKeyPresent: boolean;
      apiKeySource: string | null;
    };

    expect(details.registeredCommands).toEqual(["composio-claim"]);
    expect(details.registeredTools).toContain("composio_signup");
    expect(details.registeredTools).toContain("composio_claim");
    expect(details.registeredTools).toContain("composio_debug_info");
    expect(details.registeredTools[0]).toBe("composio_debug_info");
  });

  test("reports apiKeySource = signup when anonymous data has an api_key", async () => {
    await writeAnonymousUserData({ agent_key: "k", composio: { api_key: "ak" } });

    const tool = debugInfoTool();
    const result = await tool.execute("call_debug_2", {});
    const details = result.details as { apiKeyPresent: boolean; apiKeySource: string | null };
    expect(details.apiKeyPresent).toBe(true);
    expect(details.apiKeySource).toBe("signup");
  });

  test("reports apiKeySource = env when env var is set", async () => {
    process.env.COMPOSIO_API_KEY = "ak_env";
    const tool = debugInfoTool();
    const result = await tool.execute("call_debug_3", {});
    const details = result.details as { apiKeyPresent: boolean; apiKeySource: string | null };
    expect(details.apiKeySource).toBe("env");
    expect(details.apiKeyPresent).toBe(true);
  });

  test("reports null source when nothing is configured", async () => {
    const tool = debugInfoTool();
    const result = await tool.execute("call_debug_4", {});
    const details = result.details as { apiKeyPresent: boolean; apiKeySource: string | null };
    expect(details.apiKeyPresent).toBe(false);
    expect(details.apiKeySource).toBeNull();
  });
});
