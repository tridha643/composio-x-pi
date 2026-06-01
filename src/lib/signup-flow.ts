import { resetComposioSingletons } from "../composio-client.js";
import {
  type AnonymousUserData,
  readAnonymousUserData,
  writeAnonymousUserData,
} from "./anonymous-user-data.js";
import { claim, signUp, whoami } from "./agent-signup.js";
import { UserFacingError } from "./errors.js";

export type EnsureAgentIdentityResult = {
  slug: string;
  email: string;
  reused: boolean;
  apiKey: string;
};

export type ClaimAgentIdentityResult = {
  inviteCode: string;
  orgId: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractApiKey(data: AnonymousUserData | null | undefined): string | undefined {
  const apiKey = data?.composio?.api_key;
  return typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : undefined;
}

function extractSlug(data: AnonymousUserData | null | undefined): string {
  return typeof data?.slug === "string" ? data.slug : "";
}

function extractEmail(data: AnonymousUserData | null | undefined): string {
  return typeof data?.email === "string" ? data.email : "";
}

function isReady(data: AnonymousUserData | null | undefined): boolean {
  const status = typeof data?.status === "string" ? data.status.toLowerCase() : "";
  return status === "ready";
}

export async function ensureAgentIdentity(
  opts: { force?: boolean } = {},
): Promise<EnsureAgentIdentityResult> {
  if (!opts.force) {
    const existing = readAnonymousUserData();
    const agentKey = typeof existing?.agent_key === "string" ? existing.agent_key : undefined;

    if (agentKey) {
      try {
        const fresh = await whoami(agentKey);
        if (isReady(fresh)) {
          const apiKey = extractApiKey(fresh) ?? extractApiKey(existing);
          if (apiKey) {
            const merged: AnonymousUserData = { ...existing, ...fresh };
            await writeAnonymousUserData(merged);
            resetComposioSingletons();

            return {
              slug: extractSlug(fresh) || extractSlug(existing),
              email: extractEmail(fresh) || extractEmail(existing),
              reused: true,
              apiKey,
            };
          }
        }
      } catch (error) {
        if (!(error instanceof UserFacingError)) {
          throw error;
        }
      }
    }
  }

  const created = await signUp({ wait: true, force: opts.force });
  const apiKey = extractApiKey(created);
  if (!apiKey) {
    throw new UserFacingError(
      "AGENT_SIGNUP_FAILED",
      "Composio agent signup did not return an API key.",
      created,
    );
  }

  await writeAnonymousUserData(created);
  resetComposioSingletons();

  return {
    slug: extractSlug(created),
    email: extractEmail(created),
    reused: false,
    apiKey,
  };
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

export async function claimAgentIdentity(email: string): Promise<ClaimAgentIdentityResult> {
  const trimmed = email.trim();
  if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
    throw new UserFacingError(
      "AGENT_CLAIM_FAILED",
      `Invalid email address: ${email || "(empty)"}.`,
    );
  }

  const data = readAnonymousUserData();
  const agentKey = typeof data?.agent_key === "string" ? data.agent_key : undefined;
  if (!agentKey) {
    throw new UserFacingError(
      "AGENT_CLAIM_FAILED",
      "No Composio agent identity found. Call the `composio_signup` tool first.",
    );
  }

  const response = await claim(agentKey, trimmed) as Record<string, unknown>;
  const payload = (response.data && typeof response.data === "object")
    ? response.data as Record<string, unknown>
    : response;

  const inviteCode = pickString(
    payload.invite_code,
    payload.inviteCode,
    response.invite_code,
    response.inviteCode,
  );
  const orgId = pickString(
    payload.org_id,
    payload.orgId,
    response.org_id,
    response.orgId,
  );

  if (!inviteCode) {
    throw new UserFacingError(
      "AGENT_CLAIM_FAILED",
      "Composio claim response did not include an invite code.",
      response,
    );
  }

  return { inviteCode, orgId };
}
