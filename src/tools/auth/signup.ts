import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { ensureAgentIdentity } from "../../lib/signup-flow.js";
import { createTool, textResult } from "../../lib/toolkit.js";

const parameters = Type.Object({
  force: Type.Optional(Type.Boolean()),
});

export type SignupParams = Static<typeof parameters>;

export function signupTool(deps: {
  ensureAgentIdentity?: typeof ensureAgentIdentity;
} = {}) {
  return createTool<SignupParams>({
    name: "composio_signup",
    label: "Composio Signup",
    description:
      "Bootstrap a Composio identity for this extension. Call this when other Composio tools fail with MISSING_CONFIG or missing-API-key errors. Idempotent — safe to call when already signed up. Pass { force: true } to provision a fresh identity.",
    parameters,
    async execute(_toolCallId, params) {
      const invoke = deps.ensureAgentIdentity ?? ensureAgentIdentity;
      const result = await invoke({ force: params.force });

      const summary = result.reused
        ? `Reused existing Composio agent identity (${result.slug}).`
        : `Provisioned new Composio agent identity (${result.slug}).`;

      return textResult(summary, {
        slug: result.slug,
        email: result.email,
        reused: result.reused,
      });
    },
  });
}

export const signup = signupTool();
