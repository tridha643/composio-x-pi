import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { executeMetaTool, getComposioSdk, getToolRouterSession } from "../../composio-client.js";
import { writeDefaultComposioAccount } from "../../config-store.js";
import type { ConnectedAccountSummary } from "../../composio-client.js";
import { invalidateAccounts, resolveUserId } from "../../lib/account-directory.js";
import { createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";
import type { ToolUpdateFn } from "../../lib/toolkit.js";

const parameters = Type.Object({
  app: Type.String({ minLength: 1 }),
  alias: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Friendly label for this connection (e.g. \"work\" or \"personal\"). Pass a distinct alias to link an additional account on the same app.",
    }),
  ),
});

export type ManageConnectionsParams = Static<typeof parameters>;

type ConnectionRequestLike = {
  id: string;
  status?: string;
  redirectUrl?: string | null;
  waitForConnection: (timeout?: number) => Promise<{ id: string; status?: string }>;
};

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

async function presentConnectionLink(
  app: string,
  url: string,
  ctx: unknown,
  onUpdate: ToolUpdateFn,
): Promise<boolean> {
  await onUpdate?.({
    content: [
      {
        type: "text",
        text: `Composio needs a connection before ${app} tools can run.\n\nConnect ${app}: ${url}`,
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
    `Open this link to connect ${app}:\n\n${url}\n\nAfter approving it in your browser, choose Yes to confirm the connection now.`,
  );
}

export function manageConnectionsTool(deps: {
  authorize?: (app: string, options: { alias?: string }) => Promise<ConnectionRequestLike>;
  listAccounts?: (app: string, userId: string) => Promise<ConnectedAccountSummary[]>;
  writeDefaultAccount?: (app: string, selector: string) => Promise<void>;
  executeMetaTool?: (slug: string, input?: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  return createTool<ManageConnectionsParams>({
    name: "composio_manage_connections",
    label: "Composio Manage Connections",
    description:
      "Inspect or create Composio connections for an app, showing an interactive deeplink when authentication is required. Pass `alias` to link an additional account on the same app.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const userId = resolveUserId();

      const authorize =
        deps.authorize ??
        (async (app: string, options: { alias?: string }) => {
          const session = await getToolRouterSession();
          const fn = (session as { authorize?: unknown }).authorize;
          if (typeof fn !== "function") {
            throw new Error("Composio tool router session does not expose authorize().");
          }
          return (await fn.call(session, app, options)) as ConnectionRequestLike;
        });

      const listAccounts =
        deps.listAccounts ??
        (async (app: string, uid: string) => {
          const sdk = await getComposioSdk();
          const response = await sdk.connectedAccounts.list({
            toolkitSlugs: [app],
            userIds: [uid],
          });
          return response.items ?? [];
        });

      const fallbackMetaConnect = async (): Promise<ConnectionLink | undefined> => {
        const response = await withProgress(
          () => (deps.executeMetaTool ?? executeMetaTool)("COMPOSIO_MANAGE_CONNECTIONS", { toolkits: [params.app] }),
          onUpdate,
          `Preparing ${params.app} connection...`,
        );
        return extractConnectionLinks(response)[0];
      };

      let connectionRequest: ConnectionRequestLike | undefined;
      let fallbackLink: ConnectionLink | undefined;
      try {
        connectionRequest = await withProgress(
          () => authorize(params.app, params.alias === undefined ? {} : { alias: params.alias }),
          onUpdate,
          `Preparing ${params.app} connection...`,
        );
      } catch (error) {
        fallbackLink = await fallbackMetaConnect();
        if (!fallbackLink) {
          throw error;
        }
      }

      const url = connectionRequest?.redirectUrl ?? fallbackLink?.url;
      let connectedAccountId = connectionRequest?.id ?? "pending";
      let finalStatus = connectionRequest?.status ?? (fallbackLink ? "INITIATED" : undefined);

      if (typeof url === "string" && url.startsWith("http")) {
        const proceed = await presentConnectionLink(params.app, url, ctx, onUpdate);
        if (proceed) {
          const account = await withProgress(
            () => connectionRequest?.waitForConnection() ?? Promise.resolve({ id: connectedAccountId, status: finalStatus }),
            onUpdate,
            "Waiting for Composio connection...",
          );
          connectedAccountId = account.id ?? connectedAccountId;
          finalStatus = account.status ?? "ACTIVE";
        }
      }

      // The alias (if any) is already persisted server-side by authorize(app, { alias }).
      // Also persist it locally as the preferred account for implicit future tool calls.
      if (params.alias && connectedAccountId) {
        await (deps.writeDefaultAccount ?? writeDefaultComposioAccount)(params.app, params.alias);
      }

      // Invalidate the cache so the freshly connected account surfaces immediately.
      invalidateAccounts(userId);

      const accounts = await listAccounts(params.app, userId).catch(() => [] as ConnectedAccountSummary[]);
      const connectionText =
        typeof url === "string" && url.startsWith("http")
          ? `\n\nComposio needs a connection before ${params.app} tools can run.\n\nConnect ${params.app}: ${url}`
          : "";

      return textResult(summarizeJson(`Composio connection status for ${params.app}.${connectionText}`, accounts), {
        app: params.app,
        alias: params.alias,
        connectionLink: typeof url === "string" ? url : undefined,
        connectedAccountId,
        status: finalStatus,
        accounts,
      });
    },
  });
}

export const manageConnections = manageConnectionsTool();
