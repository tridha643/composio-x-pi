import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { executeMetaTool } from "../../composio-client.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";
import type { ToolUpdateFn } from "../../lib/toolkit.js";

const parameters = Type.Object({
  app: Type.String({ minLength: 1 }),
  entityId: Type.Optional(Type.String({ minLength: 1 })),
  connectionId: Type.Optional(Type.String({ minLength: 1 })),
});

export type ManageConnectionsParams = Static<typeof parameters>;

type ConnectionLink = {
  toolkit: string;
  url: string;
  instruction?: string;
};

type UiContext = {
  ui?: {
    notify?: (message: string, type?: "info" | "warning" | "error") => void;
    confirm?: (title: string, message: string) => Promise<boolean>;
  };
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function extractConnectionLinks(response: unknown): ConnectionLink[] {
  const root = asRecord(response);
  const data = asRecord(root?.data) ?? root;
  const results = asRecord(data?.results);
  if (!results) {
    return [];
  }

  return Object.entries(results).flatMap(([toolkit, raw]) => {
    const result = asRecord(raw);
    const url = result?.redirect_url ?? result?.redirectUrl ?? result?.authUrl ?? result?.url;
    if (typeof url !== "string" || !url.startsWith("http")) {
      return [];
    }

    return [
      {
        toolkit,
        url,
        instruction: typeof result?.instruction === "string" ? result.instruction : undefined,
      },
    ];
  });
}

async function presentConnectionLinks(
  app: string,
  links: ConnectionLink[],
  ctx: unknown,
  onUpdate: ToolUpdateFn,
): Promise<boolean> {
  if (links.length === 0) {
    return false;
  }

  const message = links
    .map((link) => `Connect ${link.toolkit}: ${link.url}`)
    .join("\n");

  await onUpdate?.({
    content: [
      {
        type: "text",
        text: `Composio needs a connection before ${app} tools can run.\n\n${message}`,
      },
    ],
  });

  const ui = (ctx as UiContext | undefined)?.ui;
  ui?.notify?.(`Composio connection required for ${app}. Open the link shown in the prompt.`, "info");

  if (!ui?.confirm) {
    return false;
  }

  return await ui.confirm(
    `Connect ${app} in Composio`,
    `Open this link to connect ${app}:\n\n${links[0].url}\n\nAfter approving it in your browser, choose Yes to re-check the connection now.`,
  );
}

export function manageConnectionsTool(deps: {
  executeMetaTool?: (slug: string, input?: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  return createTool<ManageConnectionsParams>({
    name: "composio_manage_connections",
    label: "Composio Manage Connections",
    description:
      "Inspect or create Composio connections for an app, showing an interactive deeplink when authentication is required.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const invoke = deps.executeMetaTool ?? executeMetaTool;
      const input = {
        toolkits: [params.app],
        ...(params.entityId === undefined ? {} : { entity_id: params.entityId }),
        ...(params.connectionId === undefined ? {} : { connected_account_id: params.connectionId }),
      };
      let response = await withProgress(
        () => invoke("COMPOSIO_MANAGE_CONNECTIONS", input),
        onUpdate,
      );

      const links = extractConnectionLinks(response);
      const shouldRecheck = await presentConnectionLinks(params.app, links, ctx, onUpdate);
      if (shouldRecheck) {
        response = await withProgress(
          () => invoke("COMPOSIO_MANAGE_CONNECTIONS", input),
          onUpdate,
          "Re-checking Composio connection...",
        );
      }

      return textResult(summarizeJson(`Composio connection status for ${params.app}.`, response), {
        app: params.app,
        connectionLinks: links,
        response,
      });
    },
  });
}

export const manageConnections = manageConnectionsTool();
