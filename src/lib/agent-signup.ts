import { UserFacingError } from "./errors.js";

const DEFAULT_AGENT_BASE_URL = "https://agents.composio.dev";
const AGENT_BASE_URL_ENV = "COMPOSIO_AGENT_BASE_URL";
const MAX_ERROR_BODY_LENGTH = 1000;

function getAgentBaseUrl(): string {
  const configured = process.env[AGENT_BASE_URL_ENV]?.trim();
  return (configured || DEFAULT_AGENT_BASE_URL).replace(/\/+$/, "");
}

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
    const detail = text || `${response.status} ${response.statusText}`;
    return detail.length <= MAX_ERROR_BODY_LENGTH
      ? detail
      : `${detail.slice(0, MAX_ERROR_BODY_LENGTH)}\n...`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

function deploymentNotFoundHint(response: Response, detail: string): string | undefined {
  const vercelError = response.headers.get("x-vercel-error");
  if (vercelError === "DEPLOYMENT_NOT_FOUND" || detail.includes("DEPLOYMENT_NOT_FOUND")) {
    return "The Composio agent-signup service deployment is unavailable. This is not a missing Gmail/app connection. Until Composio restores the agent endpoint, run `/composio-init` with a Composio project API key or set COMPOSIO_API_KEY.";
  }

  return undefined;
}

function agentRequestFailed(operation: string, response: Response, detail: string): UserFacingError {
  const hint = deploymentNotFoundHint(response, detail);
  const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
  const message = hint
    ? `Composio agent ${operation} failed: ${status}. ${hint}`
    : `Composio agent ${operation} failed: ${detail}`;

  return new UserFacingError("AGENT_SIGNUP_FAILED", message, {
    status: response.status,
    statusText: response.statusText,
    vercelError: response.headers.get("x-vercel-error") ?? undefined,
    detail,
  });
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

  const url = `${getAgentBaseUrl()}/api/signup${params.size ? `?${params.toString()}` : ""}`;
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
    throw agentRequestFailed("signup", response, detail);
  }

  return (await response.json()) as AgentSignupResponse;
}

export async function whoami(agentKey: string): Promise<AgentSignupResponse> {
  const response = await fetch(`${getAgentBaseUrl()}/api/whoami`, {
    method: "GET",
    headers: { Authorization: `Bearer ${agentKey}` },
  });

  if (!response.ok) {
    const detail = await readErrorBody(response);
    throw agentRequestFailed("whoami", response, detail);
  }

  return (await response.json()) as AgentSignupResponse;
}

export async function claim(agentKey: string, email: string): Promise<ClaimResponse> {
  const response = await fetch(`${getAgentBaseUrl()}/api/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${agentKey}`,
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const detail = await readErrorBody(response);
    const signupError = agentRequestFailed("claim", response, detail);
    throw new UserFacingError("AGENT_CLAIM_FAILED", signupError.message, signupError.details);
  }

  return (await response.json()) as ClaimResponse;
}
