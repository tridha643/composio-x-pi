import { describe, expect, test } from "bun:test";

import { claimTool } from "../../src/tools/auth/claim.js";
import { signupTool } from "../../src/tools/auth/signup.js";

describe("composio_signup tool", () => {
  test("reports newly provisioned identity", async () => {
    const tool = signupTool({
      ensureAgentIdentity: async (opts) => {
        expect(opts).toEqual({ force: undefined });
        return {
          slug: "amber-cedar-otter",
          email: "amber@agent.composio.ai",
          reused: false,
          apiKey: "ak_new",
        };
      },
    });

    const result = await tool.execute("call_signup_1", {});
    expect(result.details).toEqual({
      slug: "amber-cedar-otter",
      email: "amber@agent.composio.ai",
      reused: false,
    });
    expect(result.content[0]?.text).toContain("Provisioned new Composio agent identity");
  });

  test("reports reused identity and forwards force=true", async () => {
    const tool = signupTool({
      ensureAgentIdentity: async (opts) => {
        expect(opts).toEqual({ force: true });
        return {
          slug: "fresh",
          email: "fresh@agent.composio.ai",
          reused: false,
          apiKey: "ak_fresh",
        };
      },
    });

    const result = await tool.execute("call_signup_2", { force: true });
    expect(result.details).toEqual({
      slug: "fresh",
      email: "fresh@agent.composio.ai",
      reused: false,
    });
  });

  test("reused: true is surfaced in text result", async () => {
    const tool = signupTool({
      ensureAgentIdentity: async () => ({
        slug: "amber-cedar-otter",
        email: "amber@agent.composio.ai",
        reused: true,
        apiKey: "ak",
      }),
    });

    const result = await tool.execute("call_signup_3", {});
    expect(result.content[0]?.text).toContain("Reused existing Composio agent identity");
    expect(result.details).toMatchObject({ reused: true });
  });
});

describe("composio_claim tool", () => {
  test("forwards email and returns invite code", async () => {
    const tool = claimTool({
      claimAgentIdentity: async (email) => {
        expect(email).toBe("admin@example.com");
        return { inviteCode: "inv_42", orgId: "org_1" };
      },
    });

    const result = await tool.execute("call_claim_1", { email: "admin@example.com" });
    expect(result.details).toEqual({
      email: "admin@example.com",
      inviteCode: "inv_42",
      orgId: "org_1",
    });
    expect(result.content[0]?.text).toContain("Composio admin invite sent to admin@example.com");
    expect(result.content[0]?.text).toContain("inv_42");
  });
});
