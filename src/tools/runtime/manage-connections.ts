import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { getComposioSdk, getToolRouterSession } from "../../composio-client.js";
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

type UiContext = {
  ui?: {
    notify?: (message: string, type?: "info" | "warning" | "error") => void;
    confirm?: (title: string, message: string) => Promise<boolean>;
  };
};

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

      const connectionRequest = await withProgress(
        () => authorize(params.app, params.alias === undefined ? {} : { alias: params.alias }),
        onUpdate,
        `Preparing ${params.app} connection...`,
      );

      const url = connectionRequest.redirectUrl;
      let connectedAccountId = connectionRequest.id;
      let finalStatus = connectionRequest.status;

      if (typeof url === "string" && url.startsWith("http")) {
        const proceed = await presentConnectionLink(params.app, url, ctx, onUpdate);
        if (proceed) {
          const account = await withProgress(
            () => connectionRequest.waitForConnection(),
            onUpdate,
            "Waiting for Composio connection...",
          );
          connectedAccountId = account.id ?? connectedAccountId;
          finalStatus = account.status ?? "ACTIVE";
        }
      }

      // The alias (if any) is already persisted server-side by authorize(app, { alias }).
      // Invalidate the cache so the freshly connected account surfaces immediately.
      invalidateAccounts(userId);

      const accounts = await listAccounts(params.app, userId).catch(() => [] as ConnectedAccountSummary[]);

      return textResult(summarizeJson(`Composio connection status for ${params.app}.`, accounts), {
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
