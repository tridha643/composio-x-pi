import { describe, expect, test } from "bun:test";

import { selectDefaultActiveAccount } from "../src/lib/account-resolver.js";
import { executeToolTool } from "../src/tools/runtime/execute-tool.js";
import { getToolSchemasTool } from "../src/tools/runtime/get-tool-schemas.js";
import { manageConnectionsTool } from "../src/tools/runtime/manage-connections.js";
import { multiExecuteToolTool } from "../src/tools/runtime/multi-execute-tool.js";
import { remoteBashToolTool } from "../src/tools/runtime/remote-bash-tool.js";
import { remoteWorkbenchTool } from "../src/tools/runtime/remote-workbench.js";
import { searchToolsTool } from "../src/tools/runtime/search-tools.js";

describe("runtime tools", () => {
  test("default account selection prefers active accounts over expired ones", () => {
    const selected = selectDefaultActiveAccount("github", [
      { id: "ca_expired", status: "EXPIRED", toolkit: { slug: "github" } },
      { id: "ca_active", status: "ACTIVE", toolkit: { slug: "github" } },
      { id: "ca_other", status: "ACTIVE", toolkit: { slug: "linear" } },
    ]);

    expect(selected?.id).toBe("ca_active");
  });

  test("composio_search_tools returns the expected result shape", async () => {
    const tool = searchToolsTool({
      getRawTools: async () => [{ slug: "LINEAR_CREATE_ISSUE", score: 0.98 }],
    });

    const result = await tool.execute("call_1", { query: "create a Linear issue" });
    expect(result.details).toEqual({
      query: "create a Linear issue",
      tools: [{ slug: "LINEAR_CREATE_ISSUE", score: 0.98 }],
    });
    expect(result.content[0]?.text).toContain('Composio tool search results for "create a Linear issue".');
    expect(result.content[0]?.text).toContain('"LINEAR_CREATE_ISSUE"');
  });

  test("composio_search_tools slices to limit client-side", async () => {
    const tool = searchToolsTool({
      getRawTools: async () => [{ slug: "A" }, { slug: "B" }, { slug: "C" }],
    });

    const result = await tool.execute("call_1b", { query: "anything", limit: 2 });
    expect(result.details).toEqual({
      query: "anything",
      tools: [{ slug: "A" }, { slug: "B" }],
    });
  });

  test("composio_get_tool_schemas returns the expected result shape", async () => {
    const tool = getToolSchemasTool({
      getRawTools: async () => [
        { slug: "LINEAR_CREATE_ISSUE", inputParameters: { type: "object" } },
      ],
    });

    const result = await tool.execute("call_2", { toolSlugs: ["LINEAR_CREATE_ISSUE"] });
    expect(result.details).toEqual({
      toolSlugs: ["LINEAR_CREATE_ISSUE"],
      tools: [{ slug: "LINEAR_CREATE_ISSUE", inputParameters: { type: "object" } }],
    });
    expect(result.content[0]?.text).toContain("Retrieved Composio schemas for 1 tool(s).");
  });

  test("composio_execute_tool binds the resolved account per call", async () => {
    const calls: Array<{ slug: string; body: Record<string, unknown> }> = [];
    const tool = executeToolTool({
      resolveAccount: async (app, account) => {
        expect(app).toBe("linear");
        expect(account).toBe("work");
        return { connectedAccountId: "ca_work123", userId: "default" };
      },
      executeTool: async (slug, body) => {
        calls.push({ slug, body });
        return { data: { ok: true }, error: null, successful: true };
      },
    });

    const result = await tool.execute("call_3", {
      slug: "LINEAR_CREATE_ISSUE",
      arguments: { title: "Broken sync" },
      account: "work",
    });

    expect(calls).toEqual([
      {
        slug: "LINEAR_CREATE_ISSUE",
        body: {
          arguments: { title: "Broken sync" },
          connectedAccountId: "ca_work123",
          userId: "default",
          dangerouslySkipVersionCheck: true,
        },
      },
    ]);
    expect(result.details).toEqual({
      slug: "LINEAR_CREATE_ISSUE",
      resolvedAccount: { connectedAccountId: "ca_work123", userId: "default" },
      response: { data: { ok: true }, error: null, successful: true },
    });
    expect(result.content[0]?.text).toContain("Executed Composio tool LINEAR_CREATE_ISSUE.");
  });

  test("composio_execute_tool throws on tool-level failure", async () => {
    const tool = executeToolTool({
      resolveAccount: async () => ({ userId: "default" }),
      executeTool: async () => ({ data: {}, error: "boom", successful: false }),
    });

    let thrown: unknown;
    try {
      await tool.execute("call_3b", { slug: "LINEAR_CREATE_ISSUE" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("Composio tool LINEAR_CREATE_ISSUE failed: boom");
  });

  test("composio_multi_execute_tool loops tools with a single account", async () => {
    const calls: Array<{ slug: string; body: Record<string, unknown> }> = [];
    const tool = multiExecuteToolTool({
      resolveAccount: async (_app, account) => {
        expect(account).toBe("perso");
        return { connectedAccountId: "ca_perso", userId: "alt" };
      },
      executeTool: async (slug, body) => {
        calls.push({ slug, body });
        return { data: { slug }, error: null, successful: true };
      },
    });

    const result = await tool.execute("call_multi", {
      account: "perso",
      tools: [
        { slug: "LINEAR_CREATE_ISSUE", arguments: { title: "Bug" } },
        { slug: "GITHUB_GET_REPO" },
      ],
    });

    expect(calls).toEqual([
      {
        slug: "LINEAR_CREATE_ISSUE",
        body: {
          arguments: { title: "Bug" },
          connectedAccountId: "ca_perso",
          userId: "alt",
          dangerouslySkipVersionCheck: true,
        },
      },
      {
        slug: "GITHUB_GET_REPO",
        body: {
          arguments: {},
          connectedAccountId: "ca_perso",
          userId: "alt",
          dangerouslySkipVersionCheck: true,
        },
      },
    ]);
    expect(result.details).toEqual({
      account: "perso",
      results: [
        { slug: "LINEAR_CREATE_ISSUE", response: { data: { slug: "LINEAR_CREATE_ISSUE" }, error: null, successful: true } },
        { slug: "GITHUB_GET_REPO", response: { data: { slug: "GITHUB_GET_REPO" }, error: null, successful: true } },
      ],
    });
    expect(result.content[0]?.text).toContain("Executed 2 Composio tool(s).");
  });

  test("remote meta-tool wrappers pass raw arguments through", async () => {
    const cases = [
      {
        tool: remoteBashToolTool,
        publicName: "composio_remote_bash_tool",
        metaSlug: "COMPOSIO_REMOTE_BASH_TOOL",
        params: { command: "jq . data.json" },
      },
      {
        tool: remoteWorkbenchTool,
        publicName: "composio_remote_workbench",
        metaSlug: "COMPOSIO_REMOTE_WORKBENCH",
        params: { code: "print('hello')" },
      },
    ];

    for (const testCase of cases) {
      const calls: Array<{ slug: string; input?: Record<string, unknown> }> = [];
      const tool = testCase.tool({
        executeMetaTool: async (slug, input) => {
          calls.push({ slug, input });
          return { ok: true, slug, input };
        },
      });

      const result = await tool.execute("call_meta", testCase.params);
      expect(tool.name).toBe(testCase.publicName);
      expect(calls).toEqual([{ slug: testCase.metaSlug, input: testCase.params }]);
      expect(result.details).toEqual({
        metaSlug: testCase.metaSlug,
        input: testCase.params,
        response: { ok: true, slug: testCase.metaSlug, input: testCase.params },
      });
      expect(result.content[0]?.text).toContain(testCase.metaSlug);
    }
  });

  test("composio_manage_connections lists accounts when already connected", async () => {
    const tool = manageConnectionsTool({
      authorize: async () => ({
        id: "ca_existing",
        status: "ACTIVE",
        redirectUrl: null,
        async waitForConnection() {
          throw new Error("should not wait when already active");
        },
      }),
      listAccounts: async (app) => [
        { id: "ca_existing", status: "ACTIVE", toolkit: { slug: app } },
      ],
    });

    const result = await tool.execute("call_4", { app: "linear" });
    expect(result.details).toEqual({
      app: "linear",
      alias: undefined,
      connectionLink: undefined,
      connectedAccountId: "ca_existing",
      status: "ACTIVE",
      accounts: [{ id: "ca_existing", status: "ACTIVE", toolkit: { slug: "linear" } }],
    });
    expect(result.content[0]?.text).toContain("Composio connection status for linear.");
  });

  test("composio_manage_connections shows deeplink and waits for connection", async () => {
    const updates: string[] = [];
    const notifications: string[] = [];
    const confirmations: Array<{ title: string; message: string }> = [];
    let waited = false;

    const tool = manageConnectionsTool({
      authorize: async (app, options) => {
        expect(app).toBe("github");
        expect(options.alias).toBe("work");
        return {
          id: "ca_new",
          status: "INITIATED",
          redirectUrl: "https://connect.composio.dev/link/lk_test",
          async waitForConnection() {
            waited = true;
            return { id: "ca_new", status: "ACTIVE" };
          },
        };
      },
      listAccounts: async (app) => [{ id: "ca_new", status: "ACTIVE", toolkit: { slug: app } }],
    });

    const result = await tool.execute(
      "call_5",
      { app: "github", alias: "work" },
      undefined,
      (update) => {
        if (typeof update === "object" && "content" in update) {
          updates.push(update.content[0]?.text ?? "");
        }
      },
      {
        ui: {
          notify(message: string) {
            notifications.push(message);
          },
          async confirm(title: string, message: string) {
            confirmations.push({ title, message });
            return true;
          },
        },
      },
    );

    expect(waited).toBe(true);
    expect(updates.some((text) => text.includes("https://connect.composio.dev/link/lk_test"))).toBe(true);
    expect(notifications[0]).toContain("Composio connection required for github");
    expect(confirmations[0]?.message).toContain("https://connect.composio.dev/link/lk_test");
    expect(result.details).toMatchObject({
      app: "github",
      alias: "work",
      connectionLink: "https://connect.composio.dev/link/lk_test",
      connectedAccountId: "ca_new",
      status: "ACTIVE",
    });
  });
});
