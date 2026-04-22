import { UserFacingError } from "./lib/errors.js";

type JsonRecord = Record<string, unknown>;

export type ComposioConfig = {
  apiKey?: string;
  userId?: string;
  apiKeyPresent: boolean;
};

let composioClientPromise: Promise<unknown> | null = null;
let toolRouterSessionPromise: Promise<unknown> | null = null;

export function getComposioConfig(env: NodeJS.ProcessEnv = process.env): ComposioConfig {
  const apiKey = env.COMPOSIO_API_KEY?.trim();
  const userId = env.COMPOSIO_USER_ID?.trim();

  return {
    apiKey,
    userId,
    apiKeyPresent: Boolean(apiKey),
  };
}

export function resetComposioSingletons(): void {
  composioClientPromise = null;
  toolRouterSessionPromise = null;
}

function requireConfiguredValue(value: string | undefined, label: string): string {
  if (value) {
    return value;
  }

  throw new UserFacingError(
    "MISSING_CONFIG",
    `${label} is required. Check the Constellagent Pi extension environment configuration.`,
  );
}

async function loadComposioModule(): Promise<Record<string, unknown>> {
  return (await import("@composio/core")) as Record<string, unknown>;
}

async function createComposioClient(apiKey: string): Promise<unknown> {
  const module = await loadComposioModule();
  const Composio = (module.Composio ?? module.default ?? module) as new (
    config: JsonRecord,
  ) => unknown;

  if (typeof Composio !== "function") {
    throw new UserFacingError(
      "COMPOSIO_SDK_ERROR",
      "Unable to load the Composio SDK constructor from @composio/core.",
    );
  }

  return new Composio({ apiKey });
}

export async function getComposioClient(): Promise<unknown> {
  const { apiKey } = getComposioConfig();
  const resolvedApiKey = requireConfiguredValue(apiKey, "COMPOSIO_API_KEY");

  if (!composioClientPromise) {
    composioClientPromise = createComposioClient(resolvedApiKey);
  }

  return composioClientPromise;
}

function getMethod(target: unknown, path: string): { parent: Record<string, unknown>; method: Function } {
  const segments = path.split(".");
  const last = segments.pop();

  if (!last) {
    throw new UserFacingError("INVALID_METHOD_PATH", `Invalid method path: ${path}`);
  }

  let current = target as Record<string, unknown>;

  for (const segment of segments) {
    const next = current?.[segment];
    if (!next || typeof next !== "object") {
      throw new UserFacingError(
        "COMPOSIO_SDK_ERROR",
        `Composio SDK method ${path} is unavailable in this SDK version.`,
      );
    }

    current = next as Record<string, unknown>;
  }

  const method = current[last];
  if (typeof method !== "function") {
    throw new UserFacingError(
      "COMPOSIO_SDK_ERROR",
      `Composio SDK method ${path} is unavailable in this SDK version.`,
    );
  }

  return {
    parent: current,
    method,
  };
}

function findMethod(
  target: unknown,
  path: string,
): { parent: Record<string, unknown>; method: Function } | null {
  try {
    return getMethod(target, path);
  } catch (error) {
    if (error instanceof UserFacingError && error.code === "COMPOSIO_SDK_ERROR") {
      return null;
    }

    throw error;
  }
}

export async function callComposioMethod<T = unknown>(path: string, ...args: unknown[]): Promise<T> {
  const client = await getComposioClient();
  const { parent, method } = getMethod(client, path);
  return (await method.apply(parent, args)) as T;
}

export async function callFirstAvailableComposioMethod<T = unknown>(
  paths: string[],
  ...args: unknown[]
): Promise<T> {
  const client = await getComposioClient();

  for (const path of paths) {
    const methodRef = findMethod(client, path);
    if (methodRef) {
      return (await methodRef.method.apply(methodRef.parent, args)) as T;
    }
  }

  throw new UserFacingError(
    "COMPOSIO_SDK_ERROR",
    `None of the expected Composio SDK methods are available: ${paths.join(", ")}.`,
  );
}

export async function getToolRouterSession(): Promise<unknown> {
  const client = await getComposioClient();
  const { userId } = getComposioConfig();
  const resolvedUserId = requireConfiguredValue(userId, "COMPOSIO_USER_ID");

  if (!toolRouterSessionPromise) {
    const { parent, method } = getMethod(client, "create");
    toolRouterSessionPromise = Promise.resolve(method.call(parent, { userId: resolvedUserId }));
  }

  return toolRouterSessionPromise;
}

export async function executeMetaTool<T = unknown>(slug: string, input: JsonRecord = {}): Promise<T> {
  const session = await getToolRouterSession();
  const { parent, method } = getMethod(session, "execute");

  return (await method.call(parent, {
    slug,
    arguments: input,
  })) as T;
}

export function getRequiredUserId(): string {
  return requireConfiguredValue(getComposioConfig().userId, "COMPOSIO_USER_ID");
}
