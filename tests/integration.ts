import { createTriggerTool } from "../src/tools/authoring/create-trigger.js";
import { deleteTriggerTool } from "../src/tools/authoring/delete-trigger.js";
import { listTriggersTool } from "../src/tools/authoring/list-triggers.js";

function extractTriggerId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["triggerId", "id"]) {
    if (typeof record[key] === "string") {
      return record[key] as string;
    }
  }

  for (const nested of Object.values(record)) {
    const maybeTriggerId = extractTriggerId(nested);
    if (maybeTriggerId) {
      return maybeTriggerId;
    }
  }

  return undefined;
}

function extractItems(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const items = record.items;
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter((item): item is Record<string, unknown> =>
    Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
}

async function main(): Promise<void> {
  const apiKey = process.env.COMPOSIO_API_KEY_TEST?.trim();
  if (!apiKey) {
    console.log("Skipping integration test because COMPOSIO_API_KEY_TEST is not set.");
    return;
  }

  const triggerSlug = process.env.COMPOSIO_TEST_TRIGGER_SLUG?.trim();
  if (!triggerSlug) {
    throw new Error("COMPOSIO_TEST_TRIGGER_SLUG is required for the integration test.");
  }

  const rawConfig = process.env.COMPOSIO_TEST_TRIGGER_CONFIG_JSON?.trim();
  if (!rawConfig) {
    throw new Error("COMPOSIO_TEST_TRIGGER_CONFIG_JSON is required for the integration test.");
  }

  process.env.COMPOSIO_API_KEY = apiKey;
  const triggerConfig = JSON.parse(rawConfig) as Record<string, unknown>;
  const account =
    process.env.COMPOSIO_TEST_ACCOUNT?.trim() ||
    process.env.COMPOSIO_TEST_CONNECTED_ACCOUNT_ID?.trim() ||
    undefined;

  const createTrigger = createTriggerTool();
  const listTriggers = listTriggersTool();
  const deleteTrigger = deleteTriggerTool();

  const created = await createTrigger.execute("integration_create", {
    slug: triggerSlug,
    triggerConfig,
    ...(account === undefined ? {} : { account }),
  });
  console.log(created.content[0]?.text ?? "Created trigger.");

  const triggerId = extractTriggerId(created.details);
  if (!triggerId) {
    throw new Error("Unable to extract a trigger ID from the Composio create response.");
  }

  const listed = await listTriggers.execute("integration_list", {});
  const listedItems = extractItems((listed.details as Record<string, unknown> | undefined)?.response);
  const createdTriggerWasListed = listedItems.some((item) => item.id === triggerId);
  if (!createdTriggerWasListed) {
    throw new Error(`Created trigger ${triggerId} was not returned by list triggers.`);
  }
  console.log(`Listed ${listedItems.length} trigger(s); created trigger ${triggerId} is present.`);

  const deleted = await deleteTrigger.execute("integration_delete", {
    triggerId,
  });
  console.log(deleted.content[0]?.text ?? "Deleted trigger.");
}

await main();
