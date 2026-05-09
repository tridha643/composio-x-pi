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

const expectedTools = [
  "composio_debug_info",
  "composio_search_tools",
  "composio_get_tool_schemas",
  "composio_execute_tool",
  "composio_manage_connections",
  "composio_list_trigger_types",
  "composio_get_trigger_type_schema",
  "composio_create_trigger",
  "composio_list_triggers",
  "composio_delete_trigger",
  "save_automation_definition",
];

describe("extension entrypoint", () => {
  test("registers runtime and authoring tools by default", async () => {
    delete process.env.COMPOSIO_PI_MODE;
    const { pi, registeredTools, registeredCommands } = createMockPi();

    const mod = await import("../src/index.js");
    mod.default(pi as never);

    expect(registeredCommands).toEqual(["composio-init"]);
    expect(registeredTools).toEqual(expectedTools);
  });

  test("registers authoring tools even when COMPOSIO_PI_MODE is set", async () => {
    process.env.COMPOSIO_PI_MODE = "worktree";
    const { pi, registeredTools, registeredCommands } = createMockPi();

    const mod = await import("../src/index.js");
    mod.default(pi as never);

    expect(registeredCommands).toEqual(["composio-init"]);
    expect(registeredTools).toEqual(expectedTools);
  });
});
