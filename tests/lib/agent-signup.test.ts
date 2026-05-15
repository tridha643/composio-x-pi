import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { claim, signUp, whoami } from "../../src/lib/agent-signup.js";
import { UserFacingError } from "../../src/lib/errors.js";

type FetchCall = { url: string; init?: RequestInit };

const originalFetch = globalThis.fetch;
let calls: FetchCall[] = [];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function installFetchMock(responder: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    calls.push({ url, init });
    return responder(url, init);
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("agent-signup client", () => {
  test("signUp posts to /api/signup with empty body and returns JSON", async () => {
    installFetchMock(() =>
      jsonResponse({ status: "ready", slug: "amber-cedar-otter", agent_key: "k1", composio: { api_key: "ak_1" } }),
    );

    const result = await signUp();
    expect(result.slug).toBe("amber-cedar-otter");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://agents.composio.dev/api/signup");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe("{}");
  });

  test("signUp forwards wait and force as query params", async () => {
    installFetchMock(() => jsonResponse({ status: "ready", agent_key: "k", composio: { api_key: "ak" } }));

    await signUp({ wait: true, force: true });
    expect(calls[0].url).toBe("https://agents.composio.dev/api/signup?wait=true&force=true");
  });

  test("signUp throws AGENT_SIGNUP_PENDING on 202", async () => {
    installFetchMock(() => jsonResponse({ status: "pending" }, { status: 202 }));

    await expect(signUp({ wait: false })).rejects.toMatchObject({
      name: "UserFacingError",
      code: "AGENT_SIGNUP_PENDING",
    });
  });

  test("signUp throws AGENT_SIGNUP_FAILED on non-2xx", async () => {
    installFetchMock(() => new Response("rate limited", { status: 429 }));

    let captured: unknown;
    try {
      await signUp();
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(UserFacingError);
    expect((captured as UserFacingError).code).toBe("AGENT_SIGNUP_FAILED");
    expect((captured as UserFacingError).message).toContain("rate limited");
  });

  test("whoami sends bearer auth and returns JSON", async () => {
    installFetchMock(() => jsonResponse({ status: "ready", slug: "s", composio: { api_key: "ak" } }));

    const result = await whoami("agent_key_xyz");
    expect(result.status).toBe("ready");
    expect(calls[0].url).toBe("https://agents.composio.dev/api/whoami");
    expect(calls[0].init?.method).toBe("GET");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer agent_key_xyz",
    );
  });

  test("whoami throws AGENT_SIGNUP_FAILED on non-2xx", async () => {
    installFetchMock(() => new Response("unauthorized", { status: 401 }));

    await expect(whoami("bad")).rejects.toMatchObject({
      name: "UserFacingError",
      code: "AGENT_SIGNUP_FAILED",
    });
  });

  test("claim posts email with bearer auth", async () => {
    installFetchMock(() => jsonResponse({ invite_code: "inv_123", org_id: "org_1" }));

    const result = await claim("agent_key_xyz", "human@example.com");
    expect(result.invite_code).toBe("inv_123");
    expect(calls[0].url).toBe("https://agents.composio.dev/api/claim");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe(JSON.stringify({ email: "human@example.com" }));
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer agent_key_xyz");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("claim throws AGENT_CLAIM_FAILED on non-2xx", async () => {
    installFetchMock(() => new Response("bad email", { status: 400 }));

    await expect(claim("agent_key_xyz", "x")).rejects.toMatchObject({
      name: "UserFacingError",
      code: "AGENT_CLAIM_FAILED",
    });
  });
});
