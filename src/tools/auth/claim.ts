import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { claimAgentIdentity } from "../../lib/signup-flow.js";
import { createTool, textResult } from "../../lib/toolkit.js";

const parameters = Type.Object({
  email: Type.String({ minLength: 1 }),
});

export type ClaimParams = Static<typeof parameters>;

export function claimTool(deps: {
  claimAgentIdentity?: typeof claimAgentIdentity;
} = {}) {
  return createTool<ClaimParams>({
    name: "composio_claim",
    label: "Composio Claim",
    description:
      "Hand the auto-provisioned Composio organization over to a human admin. Generates a 24-hour single-use invite link sent to the given email.",
    parameters,
    async execute(_toolCallId, params) {
      const invoke = deps.claimAgentIdentity ?? claimAgentIdentity;
      const result = await invoke(params.email);

      return textResult(
        `Composio admin invite sent to ${params.email}. Invite code: ${result.inviteCode}`,
        {
          email: params.email,
          inviteCode: result.inviteCode,
          orgId: result.orgId,
        },
      );
    },
  });
}

export const claim = claimTool();
