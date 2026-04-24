import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { UserFacingError } from "../../lib/errors.js";
import { LooseObject, createTool, sleep, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const parameters = Type.Object({
  triggerId: Type.String({ minLength: 1 }),
  payloadOverride: Type.Optional(LooseObject),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 120000 })),
  pollIntervalMs: Type.Optional(Type.Number({ minimum: 250, maximum: 10000 })),
});

type JsonRecord = Record<string, unknown>;

export type TestWebhookDeliveryParams = Static<typeof parameters>;

function requireEnvUrl(name: string): string {
  const value = process.env[name]?.trim();
  if (value) {
    return value;
  }

  throw new UserFacingError(
    "MISSING_CONFIG",
    `${name} is required to test webhook delivery. Configure the Composio Pi local test endpoints.`,
  );
}

async function fetchJson(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<JsonRecord> {
  const response = await fetch(url, {
    ...init,
    signal,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new UserFacingError(
      "HTTP_ERROR",
      `Request to ${url} failed with status ${response.status}.`,
      { status: response.status, body: await response.text() },
    );
  }

  return (await response.json()) as JsonRecord;
}

function deliverySeen(result: JsonRecord): boolean {
  if (result.received === true || result.delivered === true || result.ok === true) {
    return true;
  }

  if (result.status === "received" || result.status === "delivered") {
    return true;
  }

  if (Array.isArray(result.events) && result.events.length > 0) {
    return true;
  }

  if (Array.isArray(result.items) && result.items.length > 0) {
    return true;
  }

  return false;
}

export function testWebhookDeliveryTool(deps: {
  fireTestDelivery?: (payload: JsonRecord, signal?: AbortSignal) => Promise<JsonRecord>;
  pollForDelivery?: (
    input: { triggerId: string; deliveryId?: string },
    signal?: AbortSignal,
  ) => Promise<JsonRecord>;
} = {}) {
  return createTool<TestWebhookDeliveryParams>({
    name: "test_webhook_delivery",
    label: "Test Webhook Delivery",
    description: "Trigger a local webhook smoke test and poll for the resulting event delivery.",
    parameters,
    async execute(_toolCallId, params, signal, onUpdate) {
      const fireTestDelivery =
        deps.fireTestDelivery ??
        ((payload: JsonRecord, abortSignal?: AbortSignal) =>
          fetchJson(
            requireEnvUrl("COMPOSIO_PI_WEBHOOK_TEST_URL"),
            {
              method: "POST",
              body: JSON.stringify(payload),
            },
            abortSignal,
          ));

      const pollForDelivery =
        deps.pollForDelivery ??
        ((input: { triggerId: string; deliveryId?: string }, abortSignal?: AbortSignal) => {
          const url = new URL(requireEnvUrl("COMPOSIO_PI_EVENT_POLL_URL"));
          url.searchParams.set("triggerId", input.triggerId);
          if (input.deliveryId) {
            url.searchParams.set("deliveryId", input.deliveryId);
          }

          return fetchJson(url.toString(), { method: "GET" }, abortSignal);
        });

      const timeoutMs = params.timeoutMs ?? 15000;
      const pollIntervalMs = params.pollIntervalMs ?? 1000;

      const kickoff = await withProgress(
        () =>
          fireTestDelivery(
            {
              triggerId: params.triggerId,
              ...(params.payloadOverride === undefined
                ? {}
                : { payloadOverride: params.payloadOverride }),
            },
            signal,
          ),
        onUpdate,
        "Firing test webhook delivery...",
      );

      const startedAt = Date.now();
      let lastPollResult: JsonRecord = {};

      while (Date.now() - startedAt < timeoutMs) {
        const deliveryId =
          typeof kickoff.deliveryId === "string" ? kickoff.deliveryId : undefined;
        lastPollResult = await pollForDelivery(
          {
            triggerId: params.triggerId,
            deliveryId,
          },
          signal,
        );

        if (deliverySeen(lastPollResult)) {
          return textResult(
            summarizeJson("Webhook delivery observed successfully.", {
              kickoff,
              poll: lastPollResult,
            }),
            {
              kickoff,
              poll: lastPollResult,
            },
          );
        }

        await sleep(pollIntervalMs, signal);
      }

      throw new UserFacingError(
        "WEBHOOK_TIMEOUT",
        `No webhook delivery was observed for trigger ${params.triggerId} within ${timeoutMs}ms.`,
        {
          kickoff,
          lastPollResult,
        },
      );
    },
  });
}

export const testWebhookDelivery = testWebhookDeliveryTool();
