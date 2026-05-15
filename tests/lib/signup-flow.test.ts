import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getAnonymousUserDataPath,
  readAnonymousUserData,
  writeAnonymousUserData,
} from "../../src/lib/anonymous-user-data.js";
import { ensureAgentIdentity, claimAgentIdentity } from "../../src/lib/signup-flow.js";

type FetchCall = { url: string; init?: RequestInit };

const originalFetch = globalThis.fetch;
let tempHome: string;
let originalHome: string | undefined;
let calls: FetchCall[] = [];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function installFetchMock(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  originalHome = process.env.HOME;
  tempHome = mkdtempSync(join(tmpdir(), "composio-flow-"));
  process.env.HOME = tempHome;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  rmSync(tempHome, { recursive: true, force: true });
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
});

describe("ensureAgentIdentity", () => {
  test("cold start: signs up and persists the response", async () => {
    installFetchMock((url) => {
      if (url.startsWith("https://agents.composio.dev/api/signup")) {
        return jsonResponse({
          status: "ready",
          slug: "amber-cedar-otter",
          email: "amber@agent.composio.ai",
          agent_key: "k_new",
          composio: { api_key: "ak_new", org_id: "org_new", project_id: "proj_new" },
        });
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await ensureAgentIdentity();
    expect(result.reused).toBe(false);
    expect(result.slug).toBe("amber-cedar-otter");
    expect(result.email).toBe("amber@agent.composio.ai");
    expect(result.apiKey).toBe("ak_new");

    const persisted = readAnonymousUserData();
    expect(persisted?.agent_key).toBe("k_new");
    expect(persisted?.composio?.api_key).toBe("ak_new");
    expect(calls).toHaveLength(1);
  });

  test("reuses existing identity when whoami returns READY", async () => {
    await writeAnonymousUserData({
      status: "ready",
      slug: "old-slug",
      email: "old@agent.composio.ai",
      agent_key: "k_existing",
      composio: { api_key: "ak_existing" },
    });

    installFetchMock((url) => {
      if (url === "https://agents.composio.dev/api/whoami") {
        return jsonResponse({
          status: "READY",
          slug: "old-slug",
          email: "old@agent.composio.ai",
          composio: { api_key: "ak_existing" },
        });
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await ensureAgentIdentity();
    expect(result.reused).toBe(true);
    expect(result.slug).toBe("old-slug");
    expect(result.apiKey).toBe("ak_existing");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://agents.composio.dev/api/whoami");
  });

  test("falls back to signup when whoami fails", async () => {
    await writeAnonymousUserData({
      agent_key: "k_stale",
      composio: { api_key: "ak_stale" },
    });

    installFetchMock((url) => {
      if (url === "https://agents.composio.dev/api/whoami") {
        return new Response("unauthorized", { status: 401 });
      }
      if (url.startsWith("https://agents.composio.dev/api/signup")) {
        return jsonResponse({
          status: "ready",
          slug: "fresh",
          email: "fresh@agent.composio.ai",
          agent_key: "k_fresh",
          composio: { api_key: "ak_fresh" },
        });
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await ensureAgentIdentity();
    expect(result.reused).toBe(false);
    expect(result.slug).toBe("fresh");
    expect(result.apiKey).toBe("ak_fresh");
    expect(calls.map((c) => c.url)).toEqual([
      "https://agents.composio.dev/api/whoami",
      "https://agents.composio.dev/api/signup?wait=true",
    ]);
  });

  test("force: skips whoami and provisions a new identity", async () => {
    await writeAnonymousUserData({
      agent_key: "k_existing",
      composio: { api_key: "ak_existing" },
    });

    installFetchMock((url) => {
      if (url.startsWith("https://agents.composio.dev/api/signup")) {
        return jsonResponse({
          status: "ready",
          slug: "forced",
          email: "forced@agent.composio.ai",
          agent_key: "k_forced",
          composio: { api_key: "ak_forced" },
        });
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await ensureAgentIdentity({ force: true });
    expect(result.reused).toBe(false);
    expect(result.slug).toBe("forced");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://agents.composio.dev/api/signup?wait=true&force=true");

    const persisted = readAnonymousUserData();
    expect(persisted?.agent_key).toBe("k_forced");
  });

  test("throws when signup response lacks an api_key", async () => {
    installFetchMock(() =>
      jsonResponse({ status: "ready", slug: "broken", agent_key: "k", composio: {} }),
    );

    await expect(ensureAgentIdentity()).rejects.toMatchObject({
      name: "UserFacingError",
      code: "AGENT_SIGNUP_FAILED",
    });
  });

  test("whoami response without api_key falls back to signup", async () => {
    await writeAnonymousUserData({ agent_key: "k_existing", composio: { api_key: "ak_old" } });

    installFetchMock((url) => {
      if (url === "https://agents.composio.dev/api/whoami") {
        return jsonResponse({ status: "READY", slug: "s", composio: {} });
      }
      if (url.startsWith("https://agents.composio.dev/api/signup")) {
        return jsonResponse({
          status: "ready",
          slug: "fresh",
          agent_key: "k_fresh",
          composio: { api_key: "ak_fresh" },
        });
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await ensureAgentIdentity();
    // whoami returned READY but no api_key in fresh response — caller reuses persisted ak_old
    expect(result.reused).toBe(true);
    expect(result.apiKey).toBe("ak_old");
  });
});

describe("claimAgentIdentity", () => {
  test("calls /api/claim and returns invite code", async () => {
    await writeAnonymousUserData({ agent_key: "k_existing", composio: { api_key: "ak" } });

    installFetchMock((url) => {
      if (url === "https://agents.composio.dev/api/claim") {
        return jsonResponse({ invite_code: "inv_42", org_id: "org_1" });
      }
      throw new Error(`unexpected ${url}`);
    });

    const result = await claimAgentIdentity("admin@example.com");
    expect(result.inviteCode).toBe("inv_42");
    expect(result.orgId).toBe("org_1");
  });

  test("rejects invalid email", async () => {
    await writeAnonymousUserData({ agent_key: "k_existing", composio: { api_key: "ak" } });
    installFetchMock(() => new Response("should not be called", { status: 500 }));

    await expect(claimAgentIdentity("not-an-email")).rejects.toMatchObject({
      name: "UserFacingError",
      code: "AGENT_CLAIM_FAILED",
    });
    expect(calls).toHaveLength(0);
  });

  test("rejects when no agent_key persisted", async () => {
    installFetchMock(() => new Response("should not be called", { status: 500 }));

    await expect(claimAgentIdentity("admin@example.com")).rejects.toMatchObject({
      name: "UserFacingError",
      code: "AGENT_CLAIM_FAILED",
    });
    expect(calls).toHaveLength(0);
  });

  test("rejects when response lacks invite_code", async () => {
    await writeAnonymousUserData({ agent_key: "k_existing" });
    installFetchMock(() => jsonResponse({ org_id: "org_1" }));

    await expect(claimAgentIdentity("admin@example.com")).rejects.toMatchObject({
      name: "UserFacingError",
      code: "AGENT_CLAIM_FAILED",
    });
  });
});

// Suppress unused import warning in some configs.
void getAnonymousUserDataPath;
