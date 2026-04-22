import { createTrigger } from "./create-trigger.js";
import { deleteTrigger } from "./delete-trigger.js";
import { getTriggerTypeSchema } from "./get-trigger-type-schema.js";
import { listTriggerTypes } from "./list-trigger-types.js";
import { listTriggers } from "./list-triggers.js";
import { saveAutomationLocal } from "./save-automation-local.js";
import { testWebhookDelivery } from "./test-webhook-delivery.js";
import { toggleTrigger } from "./toggle-trigger.js";

export const authoringTools = [
  listTriggerTypes,
  getTriggerTypeSchema,
  createTrigger,
  listTriggers,
  toggleTrigger,
  deleteTrigger,
  testWebhookDelivery,
  saveAutomationLocal,
];

export const authoringToolNames = authoringTools.map((tool) => tool.name);
