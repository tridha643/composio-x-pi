import { createTrigger } from "./create-trigger.js";
import { deleteTrigger } from "./delete-trigger.js";
import { getTriggerTypeSchema } from "./get-trigger-type-schema.js";
import { listTriggerTypes } from "./list-trigger-types.js";
import { listTriggers } from "./list-triggers.js";
import { saveAutomationDefinition } from "./save-automation-definition.js";

export const authoringTools = [
  listTriggerTypes,
  getTriggerTypeSchema,
  createTrigger,
  listTriggers,
  deleteTrigger,
  saveAutomationDefinition,
];

export const authoringToolNames = authoringTools.map((tool) => tool.name);
