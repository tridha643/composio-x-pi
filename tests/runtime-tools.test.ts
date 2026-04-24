import { describe, expect, test } from "bun:test";

import { executeToolTool } from "../src/tools/runtime/execute-tool.js";
import { getToolSchemasTool } from "../src/tools/runtime/get-tool-schemas.js";
import { manageConnectionsTool } from "../src/tools/runtime/manage-connections.js";
import { searchToolsTool } from "../src/tools/runtime/search-tools.js";

describe("runtime tools", () => {
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
          arguments: { title: "Broken sync" },
        },
      },
    });
    expect(result.content[0]?.text).toContain("Executed Composio tool LINEAR_CREATE_ISSUE.");
  });

  test("composio_manage_connections returns the expected result shape", async () => {
    const calls: Array<{ slug: string; input?: Record<string, unknown> }> = [];
    const tool = manageConnectionsTool({
      executeMetaTool: async (slug, input) => {
        calls.push({ slug, input });
        return {
          data: {
            results: {
              linear: {
                status: "active",
              },
            },
          },
        };
      },
    });

    const result = await tool.execute("call_4", { app: "linear" });
    expect(calls).toEqual([
      {
        slug: "COMPOSIO_MANAGE_CONNECTIONS",
        input: { toolkits: ["linear"] },
      },
    ]);
    expect(result.details).toEqual({
      app: "linear",
      connectionLinks: [],
      response: {
        data: {
          results: {
            linear: {
              status: "active",
            },
          },
        },
      },
    });
    expect(result.content[0]?.text).toContain("Composio connection status for linear.");
  });

  test("composio_manage_connections shows deeplink UI and rechecks after approval", async () => {
    const calls: Array<{ slug: string; input?: Record<string, unknown> }> = [];
    const updates: string[] = [];
    const notifications: string[] = [];
    const confirmations: Array<{ title: string; message: string }> = [];
    const responses = [
      {
        data: {
          results: {
            github: {
              status: "initiated",
              redirect_url: "https://connect.composio.dev/link/lk_test",
            },
          },
        },
      },
      {
        data: {
          results: {
            github: {
              status: "active",
            },
          },
        },
      },
    ];
    const tool = manageConnectionsTool({
      executeMetaTool: async (slug, input) => {
        calls.push({ slug, input });
        return responses.shift();
      },
    });

    const result = await tool.execute(
      "call_5",
      { app: "github" },
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

    expect(calls).toHaveLength(2);
    expect(updates.some((text) => text.includes("https://connect.composio.dev/link/lk_test"))).toBe(true);
    expect(notifications[0]).toContain("Composio connection required for github");
    expect(confirmations[0]?.message).toContain("https://connect.composio.dev/link/lk_test");
    expect(result.details).toEqual({
      app: "github",
      connectionLinks: [
        {
          toolkit: "github",
          url: "https://connect.composio.dev/link/lk_test",
          instruction: undefined,
        },
      ],
      response: {
        data: {
          results: {
            github: {
              status: "active",
            },
          },
        },
      },
    });
  });
});
