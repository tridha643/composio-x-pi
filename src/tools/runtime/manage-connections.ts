import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { executeMetaTool } from "../../composio-client.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  app: Type.String({ minLength: 1 }),
  entityId: Type.Optional(Type.String({ minLength: 1 })),
  connectionId: Type.Optional(Type.String({ minLength: 1 })),
});

export type ManageConnectionsParams = Static<typeof parameters>;

export function manageConnectionsTool(deps: {
  executeMetaTool?: (slug: string, input?: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  return createTool<ManageConnectionsParams>({
    name: "composio_manage_connections",
    label: "Composio Manage Connections",
    description:
      "Inspect or create Composio connections for an app, including OAuth links when a connection is missing.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const invoke = deps.executeMetaTool ?? executeMetaTool;
      const response = await withProgress(
        () => invoke("COMPOSIO_MANAGE_CONNECTIONS", params as Record<string, unknown>),
        onUpdate,
      );

      return textResult(summarizeJson(`Composio connection status for ${params.app}.`, response), {
        app: params.app,
        response,
      });
    },
  });
}

export const manageConnections = manageConnectionsTool();
