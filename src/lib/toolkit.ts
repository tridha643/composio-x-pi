import { Type } from "@sinclair/typebox";

import { toUserFacingError } from "./errors.js";

export const LooseObject = Type.Object({}, { additionalProperties: true });

export type ToolContent = {
  type: "text";
  text: string;
};

export type ToolResult = {
  content: ToolContent[];
  details?: unknown;
};

export type ToolUpdate = string | ToolResult | { content: ToolContent[] };

export type ToolUpdateFn = ((update: ToolUpdate) => unknown | Promise<unknown>) | undefined;

export type ToolExecute<TParams> = (
  toolCallId: string,
  params: TParams,
  onUpdate?: ToolUpdateFn,
  ctx?: unknown,
  signal?: AbortSignal,
) => Promise<ToolResult> | ToolResult;

export type PiToolDefinition<TParams = unknown> = {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: ToolExecute<TParams>;
};

export function textContent(text: string): ToolContent {
  return { type: "text", text };
}

export function textResult(text: string, details?: unknown): ToolResult {
  return {
    content: [textContent(text)],
    ...(details === undefined ? {} : { details }),
  };
}

export function jsonString(value: unknown, maxLength = 2000): string {
  const serialized = JSON.stringify(value, null, 2) ?? "null";
  if (serialized.length <= maxLength) {
    return serialized;
  }

  return `${serialized.slice(0, maxLength)}\n...`;
}

export async function notifyProgress(onUpdate: ToolUpdateFn, message: string): Promise<void> {
  if (!onUpdate) {
    return;
  }

  try {
    await onUpdate({ content: [textContent(message)] });
  } catch {
    // Pi progress hook shape can vary by host version. Tool execution should continue.
  }
}

export async function withProgress<T>(
  operation: () => Promise<T>,
  onUpdate: ToolUpdateFn,
  message = "Calling Composio...",
  delayMs = 500,
): Promise<T> {
  let completed = false;
  const timer = setTimeout(() => {
    if (!completed) {
      void notifyProgress(onUpdate, message);
    }
  }, delayMs);

  try {
    return await operation();
  } finally {
    completed = true;
    clearTimeout(timer);
  }
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason ?? new Error("Operation aborted.");
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason ?? new Error("Operation aborted."));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createTool<TParams>(
  definition: Omit<PiToolDefinition<TParams>, "execute"> & { execute: ToolExecute<TParams> },
): PiToolDefinition<TParams> {
  return {
    ...definition,
    async execute(toolCallId, params, onUpdate, ctx, signal) {
      try {
        return await definition.execute(toolCallId, params, onUpdate, ctx, signal);
      } catch (error) {
        throw toUserFacingError(error);
      }
    },
  };
}

export function summarizeJson(title: string, details: unknown): string {
  return `${title}\n\n${jsonString(details)}`;
}
