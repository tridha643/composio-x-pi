import { describe, expect, test } from "bun:test";

describe("extension entrypoint", () => {
  test("registers only runtime tools in worktree mode", async () => {
    process.env.CONSTELLAGENT_MODE = "worktree";
    const registered: string[] = [];

    const mod = await import("../src/index.js");
    mod.default({
      registerTool(tool: { name: string }) {
        registered.push(tool.name);
      },
    } as never);

    expect(registered).toEqual([
      "composio_debug_info",
      "composio_search_tools",
      "composio_get_tool_schemas",
      "composio_execute_tool",
      "composio_manage_connections",
    ]);
  });

  test("registers authoring tools when authoring mode is enabled", async () => {
    process.env.CONSTELLAGENT_MODE = "authoring";
    const registered: string[] = [];

    const mod = await import("../src/index.js");
    mod.default({
      registerTool(tool: { name: string }) {
        registered.push(tool.name);
      },
    } as never);

    expect(registered).toEqual([
      "composio_debug_info",
      "composio_search_tools",
      "composio_get_tool_schemas",
      "composio_execute_tool",
      "composio_manage_connections",
      "composio_list_trigger_types",
      "composio_get_trigger_type_schema",
      "composio_create_trigger",
      "composio_list_triggers",
      "composio_toggle_trigger",
      "composio_delete_trigger",
      "test_webhook_delivery",
      "save_automation_local",
    ]);
  });
});
