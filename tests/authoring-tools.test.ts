import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTriggerTool } from "../src/tools/authoring/create-trigger.js";
import { deleteTriggerTool } from "../src/tools/authoring/delete-trigger.js";
import { getTriggerTypeSchemaTool } from "../src/tools/authoring/get-trigger-type-schema.js";
import { listTriggerTypesTool } from "../src/tools/authoring/list-trigger-types.js";
import { listTriggersTool } from "../src/tools/authoring/list-triggers.js";
import { saveAutomationDefinitionTool } from "../src/tools/authoring/save-automation-definition.js";

describe("authoring tools", () => {
  test("composio_list_trigger_types returns the expected result shape", async () => {
    const tool = listTriggerTypesTool({
      listTriggerTypes: async () => ({
        items: [{ slug: "GITHUB_COMMIT_EVENT" }],
      }),
    });

    const result = await tool.execute("call_1", { query: "github" });
    expect(result.details).toEqual({
      filters: { query: "github" },
      response: { items: [{ slug: "GITHUB_COMMIT_EVENT" }] },
    });
    expect(result.content[0]?.text).toContain("Available Composio trigger types.");
  });

  test("composio_get_trigger_type_schema returns the expected result shape", async () => {
    const tool = getTriggerTypeSchemaTool({
      getTriggerType: async () => ({
        slug: "GITHUB_COMMIT_EVENT",
        configSchema: { type: "object" },
      }),
    });

    const result = await tool.execute("call_2", { slug: "GITHUB_COMMIT_EVENT" });
    expect(result.details).toEqual({
      slug: "GITHUB_COMMIT_EVENT",
      response: {
        slug: "GITHUB_COMMIT_EVENT",
        configSchema: { type: "object" },
      },
    });
    expect(result.content[0]?.text).toContain("Trigger schema for GITHUB_COMMIT_EVENT.");
  });

  test("composio_create_trigger returns the expected result shape", async () => {
    const tool = createTriggerTool({
      createTrigger: async (input) => ({
        triggerId: "trg_123",
        input,
      }),
    });

    const result = await tool.execute("call_3", {
      slug: "GITHUB_COMMIT_EVENT",
      triggerConfig: { owner: "acme", repo: "backend" },
    });
    expect(result.details).toEqual({
      slug: "GITHUB_COMMIT_EVENT",
      response: {
        triggerId: "trg_123",
        input: {
          slug: "GITHUB_COMMIT_EVENT",
          triggerConfig: { owner: "acme", repo: "backend" },
        },
      },
    });
    expect(result.content[0]?.text).toContain("Created Composio trigger GITHUB_COMMIT_EVENT.");
  });

  test("composio_list_triggers returns the expected result shape", async () => {
    const tool = listTriggersTool({
      listTriggers: async () => ({
        items: [{ id: "trg_123", active: true }],
      }),
    });

    const result = await tool.execute("call_4", { active: true });
    expect(result.details).toEqual({
      filters: { active: true },
      response: { items: [{ id: "trg_123", active: true }] },
    });
    expect(result.content[0]?.text).toContain("Configured Composio triggers.");
  });

  test("composio_delete_trigger returns the expected result shape", async () => {
    const tool = deleteTriggerTool({
      deleteTrigger: async () => ({ deleted: true }),
    });

    const result = await tool.execute("call_6", { triggerId: "trg_123" });
    expect(result.details).toEqual({
      triggerId: "trg_123",
      response: { deleted: true },
    });
    expect(result.content[0]?.text).toContain("Deleted Composio trigger trg_123.");
  });

  test("save_automation_definition creates a JSON handoff file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "composio-x-pi-"));
    const filePath = join(dir, "nested", "automations.json");

    try {
      const tool = saveAutomationDefinitionTool();
      const result = await tool.execute("call_7", {
        name: "Linear triage",
        triggerId: "trg_123",
        triggerSlug: "LINEAR_ISSUE_CREATED",
        instructions: "Create a follow-up task.",
        enabled: true,
        metadata: { owner: "support" },
        filePath,
      });

      expect(result.details).toMatchObject({
        filePath,
        operation: "inserted",
        automation: {
          name: "Linear triage",
          triggerId: "trg_123",
          triggerSlug: "LINEAR_ISSUE_CREATED",
          instructions: "Create a follow-up task.",
          enabled: true,
          metadata: { owner: "support" },
        },
      });
      expect(result.content[0]?.text).toContain('Saved automation definition "Linear triage".');

      const saved = JSON.parse(await readFile(filePath, "utf8")) as Array<Record<string, unknown>>;
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        name: "Linear triage",
        triggerId: "trg_123",
        triggerSlug: "LINEAR_ISSUE_CREATED",
        instructions: "Create a follow-up task.",
        enabled: true,
        metadata: { owner: "support" },
      });
      expect(typeof saved[0]?.updatedAt).toBe("string");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("save_automation_definition uses PI_COMPOSIO_AUTOMATIONS_JSON when filePath is omitted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "composio-x-pi-"));
    const filePath = join(dir, "global", "composio-automations.json");
    const previousEnvValue = process.env.PI_COMPOSIO_AUTOMATIONS_JSON;
    process.env.PI_COMPOSIO_AUTOMATIONS_JSON = filePath;

    try {
      const tool = saveAutomationDefinitionTool();
      const result = await tool.execute("call_env", {
        name: "Global handoff",
        triggerId: "trg_env",
        triggerSlug: "GITHUB_COMMIT_EVENT",
        instructions: "Handle the event globally.",
      });

      expect(result.details).toMatchObject({
        filePath,
        operation: "inserted",
        automation: {
          name: "Global handoff",
          triggerId: "trg_env",
          triggerSlug: "GITHUB_COMMIT_EVENT",
          instructions: "Handle the event globally.",
        },
      });

      const saved = JSON.parse(await readFile(filePath, "utf8")) as Array<Record<string, unknown>>;
      expect(saved).toHaveLength(1);
      expect(saved[0]?.triggerId).toBe("trg_env");
    } finally {
      if (previousEnvValue === undefined) {
        delete process.env.PI_COMPOSIO_AUTOMATIONS_JSON;
      } else {
        process.env.PI_COMPOSIO_AUTOMATIONS_JSON = previousEnvValue;
      }
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("save_automation_definition upserts by triggerId", async () => {
    const dir = await mkdtemp(join(tmpdir(), "composio-x-pi-"));
    const filePath = join(dir, "automations.json");

    try {
      await writeFile(
        filePath,
        `${JSON.stringify(
          [
            {
              name: "Old name",
              triggerId: "trg_123",
              triggerSlug: "LINEAR_ISSUE_CREATED",
              instructions: "Old instructions.",
              enabled: false,
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          null,
          2,
        )}\n`,
        "utf8",
      );

      const tool = saveAutomationDefinitionTool();
      const result = await tool.execute("call_8", {
        name: "New name",
        triggerId: "trg_123",
        triggerSlug: "LINEAR_ISSUE_CREATED",
        instructions: "New instructions.",
        filePath,
      });

      expect(result.details).toMatchObject({
        filePath,
        operation: "updated",
        automation: {
          name: "New name",
          triggerId: "trg_123",
          triggerSlug: "LINEAR_ISSUE_CREATED",
          instructions: "New instructions.",
        },
      });

      const saved = JSON.parse(await readFile(filePath, "utf8")) as Array<Record<string, unknown>>;
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        name: "New name",
        triggerId: "trg_123",
        triggerSlug: "LINEAR_ISSUE_CREATED",
        instructions: "New instructions.",
        enabled: false,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
