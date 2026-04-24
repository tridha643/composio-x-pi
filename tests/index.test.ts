import { describe, expect, test } from "bun:test";

function createMockPi() {
  const registeredTools: string[] = [];
  const registeredCommands: string[] = [];

  return {
    registeredTools,
    registeredCommands,
    pi: {
      registerTool(tool: { name: string }) {
        registeredTools.push(tool.name);
      },
      registerCommand(name: string) {
        registeredCommands.push(name);
      },
    },
  };
}

describe("extension entrypoint", () => {
  test("registers only runtime tools in worktree mode", async () => {
    process.env.COMPOSIO_PI_MODE = "worktree";
    const { pi, registeredTools, registeredCommands } = createMockPi();

    const mod = await import("../src/index.js");
    mod.default(pi as never);

    expect(registeredCommands).toEqual(["composio-init"]);
    expect(registeredTools).toEqual([
      "composio_debug_info",
      "composio_search_tools",
      "composio_get_tool_schemas",
      "composio_execute_tool",
      "composio_manage_connections",
    ]);
  });

  test("registers authoring tools when authoring mode is enabled", async () => {
    process.env.COMPOSIO_PI_MODE = "authoring";
    const { pi, registeredTools, registeredCommands } = createMockPi();

    const mod = await import("../src/index.js");
    mod.default(pi as never);

    expect(registeredCommands).toEqual(["composio-init"]);
    expect(registeredTools).toEqual([
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
