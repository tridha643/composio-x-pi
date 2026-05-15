import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleComposioClaimCommand } from "../../src/commands/composio-claim.js";
import { writeAnonymousUserData } from "../../src/lib/anonymous-user-data.js";

type Notification = { message: string; type?: "info" | "warning" | "error" };

const originalFetch = globalThis.fetch;
let originalHome: string | undefined;
let tempHome: string;

function ctxFactory(inputValue?: string) {
  const notifications: Notification[] = [];
  return {
    notifications,
    ctx: {
      ui: {
        async input(_title: string, _placeholder?: string) {
          return inputValue;
        },
        notify(message: string, type?: "info" | "warning" | "error") {
          notifications.push({ message, type });
        },
      },
    },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  originalHome = process.env.HOME;
  tempHome = mkdtempSync(join(tmpdir(), "composio-cmd-"));
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

describe("/composio-claim command", () => {
  test("notifies invite code on success", async () => {
    await writeAnonymousUserData({ agent_key: "k", composio: { api_key: "ak" } });
    globalThis.fetch = (async () => jsonResponse({ invite_code: "inv_42", org_id: "org_1" })) as unknown as typeof fetch;

    const { ctx, notifications } = ctxFactory();
    await handleComposioClaimCommand("admin@example.com", ctx as never);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("info");
    expect(notifications[0].message).toContain("admin@example.com");
    expect(notifications[0].message).toContain("inv_42");
  });

  test("prompts via ctx.ui.input when no arg supplied", async () => {
    await writeAnonymousUserData({ agent_key: "k", composio: { api_key: "ak" } });
    globalThis.fetch = (async () => jsonResponse({ invite_code: "inv_77", org_id: "org_2" })) as unknown as typeof fetch;

    const { ctx, notifications } = ctxFactory("prompted@example.com");
    await handleComposioClaimCommand("", ctx as never);

    expect(notifications[0].type).toBe("info");
    expect(notifications[0].message).toContain("prompted@example.com");
  });

  test("warns when no email is provided", async () => {
    const { ctx, notifications } = ctxFactory(undefined);
    await handleComposioClaimCommand("   ", ctx as never);

    expect(notifications).toEqual([
      { message: "Composio claim cancelled — no email provided.", type: "warning" },
    ]);
  });

  test("notifies error when underlying flow rejects", async () => {
    // No agent_key persisted → claimAgentIdentity throws
    const { ctx, notifications } = ctxFactory();
    await handleComposioClaimCommand("admin@example.com", ctx as never);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("error");
    expect(notifications[0].message).toContain("No Composio agent identity");
  });

  test("notifies error on invalid email without calling fetch", async () => {
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const { ctx, notifications } = ctxFactory();
    await handleComposioClaimCommand("not-an-email", ctx as never);

    expect(called).toBe(0);
    expect(notifications[0].type).toBe("error");
    expect(notifications[0].message).toContain("Invalid email");
  });
});
