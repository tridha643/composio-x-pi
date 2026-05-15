import { UserFacingError } from "./errors.js";

const AGENT_BASE_URL = "https://agents.composio.dev";

export type AgentSignupComposio = {
  member_id?: string;
  org_id?: string;
  project_id?: string;
  api_key?: string;
  user_api_key?: string;
};

export type AgentSignupResponse = {
  status?: string;
  request_id?: string;
  slug?: string;
  email?: string;
  agent_key?: string;
  composio?: AgentSignupComposio;
  [key: string]: unknown;
};

export type ClaimResponse = {
  invite_code?: string;
  org_id?: string;
  [key: string]: unknown;
};

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export async function signUp(
  opts: { wait?: boolean; force?: boolean } = {},
): Promise<AgentSignupResponse> {
  const params = new URLSearchParams();
  if (opts.wait !== undefined) {
    params.set("wait", opts.wait ? "true" : "false");
  }
  if (opts.force) {
    params.set("force", "true");
  }

  const url = `${AGENT_BASE_URL}/api/signup${params.size ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  if (response.status === 202) {
    const pending = (await response.json().catch(() => ({}))) as AgentSignupResponse;
    throw new UserFacingError(
      "AGENT_SIGNUP_PENDING",
      "Composio agent signup is still pending. Try again shortly.",
      pending,
    );
  }

  if (!response.ok) {
    const detail = await readErrorBody(response);
    throw new UserFacingError(
      "AGENT_SIGNUP_FAILED",
      `Composio agent signup failed: ${detail}`,
    );
  }

  return (await response.json()) as AgentSignupResponse;
}

export async function whoami(agentKey: string): Promise<AgentSignupResponse> {
  const response = await fetch(`${AGENT_BASE_URL}/api/whoami`, {
    method: "GET",
    headers: { Authorization: `Bearer ${agentKey}` },
  });

  if (!response.ok) {
    const detail = await readErrorBody(response);
    throw new UserFacingError(
      "AGENT_SIGNUP_FAILED",
      `Composio agent whoami failed: ${detail}`,
    );
  }

  return (await response.json()) as AgentSignupResponse;
}

export async function claim(agentKey: string, email: string): Promise<ClaimResponse> {
  const response = await fetch(`${AGENT_BASE_URL}/api/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${agentKey}`,
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const detail = await readErrorBody(response);
    throw new UserFacingError(
      "AGENT_CLAIM_FAILED",
      `Composio agent claim failed: ${detail}`,
    );
  }

  return (await response.json()) as ClaimResponse;
}
