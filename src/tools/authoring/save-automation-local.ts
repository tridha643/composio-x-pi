import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { callConstellagentRpc, resolveIpcSocketPath } from "../../lib/ipc.js";
import { LooseObject, createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  name: Type.String({ minLength: 1 }),
  triggerId: Type.String({ minLength: 1 }),
  triggerSlug: Type.String({ minLength: 1 }),
  instructions: Type.String({ minLength: 1 }),
  enabled: Type.Optional(Type.Boolean()),
  metadata: Type.Optional(LooseObject),
});

export type SaveAutomationLocalParams = Static<typeof parameters>;

export function saveAutomationLocalTool(deps: {
  saveAutomation?: (params: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  return createTool<SaveAutomationLocalParams>({
    name: "save_automation_local",
    label: "Save Automation Local",
    description: "Persist the automation definition to the local Constellagent main-process store.",
    parameters,
    async execute(_toolCallId, params, onUpdate) {
      const invoke =
        deps.saveAutomation ??
        ((payload: Record<string, unknown>) =>
          callConstellagentRpc("saveAutomationLocal", payload, {
            socketPath: resolveIpcSocketPath(),
          }));

      const response = await withProgress(() => invoke(params as Record<string, unknown>), onUpdate, "Saving automation locally...");

      return textResult(summarizeJson(`Saved automation "${params.name}" locally.`, response), {
        automationName: params.name,
        response,
      });
    },
  });
}

export const saveAutomationLocal = saveAutomationLocalTool();
