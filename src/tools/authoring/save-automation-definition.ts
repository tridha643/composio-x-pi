import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { UserFacingError } from "../../lib/errors.js";
import { LooseObject, createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

const AUTOMATIONS_FILE_ENV = "PI_COMPOSIO_AUTOMATIONS_JSON";
const DEFAULT_AUTOMATIONS_FILE = join(homedir(), ".config", "pi", "composio-automations.json");

const parameters = Type.Object({
  name: Type.String({ minLength: 1 }),
  triggerId: Type.String({ minLength: 1 }),
  triggerSlug: Type.String({ minLength: 1 }),
  instructions: Type.String({ minLength: 1 }),
  enabled: Type.Optional(Type.Boolean()),
  metadata: Type.Optional(LooseObject),
  filePath: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Optional path override for this call. Defaults to PI_COMPOSIO_AUTOMATIONS_JSON or ~/.config/pi/composio-automations.json.",
    }),
  ),
});

export type SaveAutomationDefinitionParams = Static<typeof parameters>;

type AutomationDefinition = {
  name: string;
  triggerId: string;
  triggerSlug: string;
  instructions: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
  updatedAt: string;
};

type SaveAutomationResult = {
  filePath: string;
  operation: "inserted" | "updated";
  automation: AutomationDefinition;
};

async function readExistingAutomations(absolutePath: string): Promise<AutomationDefinition[]> {
  let raw: string;
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new UserFacingError(
      "INVALID_AUTOMATIONS_FILE",
      `Automation file ${absolutePath} must contain a JSON array.`,
    );
  }

  return parsed as AutomationDefinition[];
}

function expandHomePath(filePath: string): string {
  if (filePath === "~") {
    return homedir();
  }

  if (filePath.startsWith("~/") || filePath.startsWith("~\\")) {
    return join(homedir(), filePath.slice(2));
  }

  return filePath;
}

function getAutomationFilePath(params: SaveAutomationDefinitionParams): string {
  const envFilePath = process.env[AUTOMATIONS_FILE_ENV]?.trim() || undefined;
  return expandHomePath(params.filePath ?? envFilePath ?? DEFAULT_AUTOMATIONS_FILE);
}

async function saveAutomationDefinitionToFile(
  params: SaveAutomationDefinitionParams,
): Promise<SaveAutomationResult> {
  const filePath = resolve(getAutomationFilePath(params));
  const existing = await readExistingAutomations(filePath);

  const existingIndex = existing.findIndex((automation) => automation?.triggerId === params.triggerId);
  const previous = existingIndex >= 0 ? existing[existingIndex] : undefined;
  const automation: AutomationDefinition = {
    name: params.name,
    triggerId: params.triggerId,
    triggerSlug: params.triggerSlug,
    instructions: params.instructions,
    ...(params.enabled === undefined ? {} : { enabled: params.enabled }),
    ...(params.metadata === undefined ? {} : { metadata: params.metadata }),
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    existing[existingIndex] = {
      ...previous,
      ...automation,
    };
  } else {
    existing.push(automation);
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");

  return {
    filePath,
    operation: existingIndex >= 0 ? "updated" : "inserted",
    automation: existingIndex >= 0 ? existing[existingIndex] : automation,
  };
}

export function saveAutomationDefinitionTool(deps: {
  saveAutomation?: (params: SaveAutomationDefinitionParams) => Promise<SaveAutomationResult>;
} = {}) {
  return createTool<SaveAutomationDefinitionParams>({
    name: "save_automation_definition",
    label: "Save Automation Definition",
    description: "Save an automation definition to Pi's global Composio automation JSON handoff file for the host application to read.",
    parameters,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const saveAutomation = deps.saveAutomation ?? saveAutomationDefinitionToFile;
      const result = await withProgress(
        () => saveAutomation(params),
        onUpdate,
        "Saving automation definition...",
      );

      return textResult(
        summarizeJson(`Saved automation definition \"${params.name}\".`, result),
        result,
      );
    },
  });
}

export const saveAutomationDefinition = saveAutomationDefinitionTool();
