import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { UserFacingError } from "../lib/errors.js";
import { claimAgentIdentity } from "../lib/signup-flow.js";

export async function handleComposioClaimCommand(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const email = (args.trim() || (await ctx.ui.input(
    "Composio admin email",
    "Enter the email address to receive the Composio admin invite",
  )))?.trim();

  if (!email) {
    ctx.ui.notify("Composio claim cancelled — no email provided.", "warning");
    return;
  }

  try {
    const result = await claimAgentIdentity(email);
    ctx.ui.notify(
      `Composio admin invite sent to ${email}. Invite code: ${result.inviteCode}`,
      "info",
    );
  } catch (error) {
    const message = error instanceof UserFacingError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Composio claim failed.";
    ctx.ui.notify(message, "error");
  }
}

export function registerComposioClaimCommand(pi: ExtensionAPI): void {
  pi.registerCommand("composio-claim", {
    description: "Hand the auto-provisioned Composio org to a human admin (sends a 24h invite).",
    handler: handleComposioClaimCommand,
  });
}
