import { beforeEach, describe, expect, test } from "bun:test";

import { createTriggerTool } from "../src/tools/authoring/create-trigger.js";
import { deleteTriggerTool } from "../src/tools/authoring/delete-trigger.js";
import { getTriggerTypeSchemaTool } from "../src/tools/authoring/get-trigger-type-schema.js";
import { listTriggerTypesTool } from "../src/tools/authoring/list-trigger-types.js";
import { listTriggersTool } from "../src/tools/authoring/list-triggers.js";
import { saveAutomationLocalTool } from "../src/tools/authoring/save-automation-local.js";
import { testWebhookDeliveryTool } from "../src/tools/authoring/test-webhook-delivery.js";
import { toggleTriggerTool } from "../src/tools/authoring/toggle-trigger.js";

describe("authoring tools", () => {
  beforeEach(() => {
    process.env.COMPOSIO_USER_ID = "authoring_user";
  });

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
          userId: "authoring_user",
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

  test("composio_toggle_trigger picks the enabled branch", async () => {
    const tool = toggleTriggerTool({
      enableTrigger: async (triggerId) => ({ enabled: triggerId }),
      disableTrigger: async (triggerId) => ({ disabled: triggerId }),
    });

    const result = await tool.execute("call_5", { triggerId: "trg_123", enabled: true });
    expect(result.details).toEqual({
      triggerId: "trg_123",
      enabled: true,
      response: { enabled: "trg_123" },
    });
    expect(result.content[0]?.text).toContain("Enabled Composio trigger trg_123.");
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

  test("save_automation_local sends the expected payload", async () => {
    const tool = saveAutomationLocalTool({
      saveAutomation: async (payload) => ({
        stored: true,
        payload,
      }),
    });

    const result = await tool.execute("call_7", {
      name: "Linear triage",
      triggerId: "trg_123",
      triggerSlug: "LINEAR_ISSUE_CREATED",
      instructions: "Create a follow-up task.",
    });
    expect(result.details).toEqual({
      automationName: "Linear triage",
      response: {
        stored: true,
        payload: {
          name: "Linear triage",
          triggerId: "trg_123",
          triggerSlug: "LINEAR_ISSUE_CREATED",
          instructions: "Create a follow-up task.",
        },
      },
    });
    expect(result.content[0]?.text).toContain('Saved automation "Linear triage" locally.');
  });

  test("test_webhook_delivery reports success once polling sees an event", async () => {
    let pollCount = 0;
    const tool = testWebhookDeliveryTool({
      fireTestDelivery: async () => ({
        deliveryId: "delivery_123",
      }),
      pollForDelivery: async () => {
        pollCount += 1;
        return pollCount === 1 ? { received: false } : { received: true, eventId: "evt_123" };
      },
    });

    const result = await tool.execute("call_8", {
      triggerId: "trg_123",
      pollIntervalMs: 1,
      timeoutMs: 100,
    });
    expect(result.details).toEqual({
      kickoff: { deliveryId: "delivery_123" },
      poll: { received: true, eventId: "evt_123" },
    });
    expect(result.content[0]?.text).toContain("Webhook delivery observed successfully.");
  });
});
