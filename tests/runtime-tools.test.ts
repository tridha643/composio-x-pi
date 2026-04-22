import { beforeEach, describe, expect, test } from "bun:test";

import { executeToolTool } from "../src/tools/runtime/execute-tool.js";
import { getToolSchemasTool } from "../src/tools/runtime/get-tool-schemas.js";
import { manageConnectionsTool } from "../src/tools/runtime/manage-connections.js";
import { searchToolsTool } from "../src/tools/runtime/search-tools.js";

describe("runtime tools", () => {
  beforeEach(() => {
    process.env.COMPOSIO_USER_ID = "user_test";
  });

  test("composio_search_tools returns the expected result shape", async () => {
    const tool = searchToolsTool({
      executeMetaTool: async () => ({
        tools: [{ slug: "LINEAR_CREATE_ISSUE", score: 0.98 }],
      }),
    });

    const result = await tool.execute("call_1", { query: "create a Linear issue" });
    expect(result.details).toEqual({
      query: "create a Linear issue",
      response: {
        tools: [{ slug: "LINEAR_CREATE_ISSUE", score: 0.98 }],
      },
    });
    expect(result.content[0]?.text).toContain('Composio tool search results for "create a Linear issue".');
    expect(result.content[0]?.text).toContain('"LINEAR_CREATE_ISSUE"');
  });

  test("composio_get_tool_schemas returns the expected result shape", async () => {
    const tool = getToolSchemasTool({
      executeMetaTool: async () => ({
        LINEAR_CREATE_ISSUE: {
          input: { type: "object" },
        },
      }),
    });

    const result = await tool.execute("call_2", { toolSlugs: ["LINEAR_CREATE_ISSUE"] });
    expect(result.details).toEqual({
      toolSlugs: ["LINEAR_CREATE_ISSUE"],
      response: {
        LINEAR_CREATE_ISSUE: {
          input: { type: "object" },
        },
      },
    });
    expect(result.content[0]?.text).toContain("Retrieved Composio schemas for 1 tool(s).");
  });

  test("composio_execute_tool passes user context through", async () => {
    const tool = executeToolTool({
      executeTool: async (input) => ({
        ok: true,
        input,
      }),
    });

    const result = await tool.execute("call_3", {
      slug: "LINEAR_CREATE_ISSUE",
      arguments: { title: "Broken sync" },
    });
    expect(result.details).toEqual({
      slug: "LINEAR_CREATE_ISSUE",
      response: {
        ok: true,
        input: {
          slug: "LINEAR_CREATE_ISSUE",
          userId: "user_test",
          arguments: { title: "Broken sync" },
        },
      },
    });
    expect(result.content[0]?.text).toContain("Executed Composio tool LINEAR_CREATE_ISSUE.");
  });

  test("composio_manage_connections returns the expected result shape", async () => {
    const tool = manageConnectionsTool({
      executeMetaTool: async () => ({
        status: "needs_auth",
        authUrl: "https://example.com/oauth",
      }),
    });

    const result = await tool.execute("call_4", { app: "linear" });
    expect(result.details).toEqual({
      app: "linear",
      response: {
        status: "needs_auth",
        authUrl: "https://example.com/oauth",
      },
    });
    expect(result.content[0]?.text).toContain("Composio connection status for linear.");
  });
});
