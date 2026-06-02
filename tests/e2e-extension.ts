#!/usr/bin/env bun
/**
 * Deterministic Pi-extension e2e smoke test.
 *
 * Loads src/index.ts through Pi's SDK (not a hand-rolled mock), verifies the
 * extension registers its tools/commands, executes non-network tools, and
 * exercises the /composio-init command in an isolated HOME sandbox.
 */

import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const expectedTools = [
  "composio_debug_info",
  "composio_signup",
  "composio_claim",
  "composio_search_tools",
  "composio_get_tool_schemas",
  "composio_execute_tool",
  "composio_manage_connections",
  "composio_multi_execute_tool",
  "composio_remember_account",
  "composio_remote_bash_tool",
  "composio_remote_workbench",
  "composio_list_trigger_types",
  "composio_get_trigger_type_schema",
  "composio_create_trigger",
  "composio_list_triggers",
  "composio_delete_trigger",
  "save_automation_definition",
] as const;

const expectedCommands = ["composio-init", "composio-claim"] as const;

type TextToolResult = {
  content?: Array<{ type?: string; text?: string }>;
  details?: Record<string, unknown>;
};

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }

  failures += 1;
  console.log(`  ✗ ${label}`);
  if (detail !== undefined) {
    console.log("     ", detail);
  }
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

const originalHome = process.env.HOME;
const originalApiKey = process.env.COMPOSIO_API_KEY;
const originalAutomationsPath = process.env.PI_COMPOSIO_AUTOMATIONS_JSON;
const originalPiAgentDir = process.env.PI_CODING_AGENT_DIR;

const sandbox = mkdtempSync(join(tmpdir(), "composio-pi-e2e-"));
const agentDir = join(sandbox, ".pi-agent");
const automationsPath = join(sandbox, "automations", "composio-automations.json");

process.env.HOME = sandbox;
delete process.env.COMPOSIO_API_KEY;
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.PI_COMPOSIO_AUTOMATIONS_JSON = automationsPath;

console.log("# Pi extension e2e smoke test");
console.log(`Sandboxed HOME: ${sandbox}`);

const settingsManager = SettingsManager.inMemory({
  compaction: { enabled: false },
});

const resourceLoader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir,
  additionalExtensionPaths: [resolve(process.cwd(), "src/index.ts")],
  settingsManager,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
});

let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;

try {
  await resourceLoader.reload();
  const result = await createAgentSession({
    cwd: process.cwd(),
    agentDir,
    resourceLoader,
    sessionManager: SessionManager.inMemory(process.cwd()),
    settingsManager,
    noTools: "builtin",
  });
  session = result.session;

  console.log("\nStep 1 — load extension through Pi SDK");
  check("extension loader has no errors", result.extensionsResult.errors.length === 0, result.extensionsResult.errors);
  check("one extension was loaded", result.extensionsResult.extensions.length === 1, result.extensionsResult.extensions.length);

  const activeToolNames = session.getActiveToolNames();
  check("active tools match extension manifest", sameStrings(activeToolNames, expectedTools), activeToolNames);

  const commandNames = session.extensionRunner.getRegisteredCommands().map((command) => command.name);
  check("commands are registered", sameStrings(commandNames, expectedCommands), commandNames);

  console.log("\nStep 2 — execute debug tool without credentials");
  const debugTool = session.getToolDefinition("composio_debug_info");
  check("debug tool is available", debugTool?.name === "composio_debug_info");
  const debugBefore = await debugTool?.execute(
    "e2e_debug_before",
    {},
    undefined,
    undefined,
    undefined as never,
  ) as TextToolResult | undefined;
  check("debug reports no API key before setup", debugBefore?.details?.apiKeyPresent === false, debugBefore?.details);
  check("debug reports null API key source before setup", debugBefore?.details?.apiKeySource === null, debugBefore?.details);

  console.log("\nStep 3 — execute automation handoff tool");
  const saveTool = session.getToolDefinition("save_automation_definition");
  check("save_automation_definition tool is available", saveTool?.name === "save_automation_definition");
  const saveResult = await saveTool?.execute(
    "e2e_save",
    {
      name: "E2E smoke automation",
      triggerId: "trg_e2e_smoke",
      triggerSlug: "GITHUB_COMMIT_EVENT",
      instructions: "This is a deterministic Pi extension smoke test.",
    },
    undefined,
    undefined,
    undefined as never,
  ) as TextToolResult | undefined;
  check("save tool wrote configured handoff path", saveResult?.details?.filePath === automationsPath, saveResult?.details);
  check("handoff JSON file exists", existsSync(automationsPath));
  const savedAutomations = JSON.parse(readFileSync(automationsPath, "utf8")) as Array<Record<string, unknown>>;
  check("handoff JSON contains one automation", savedAutomations.length === 1, savedAutomations);
  check("handoff JSON contains trigger id", savedAutomations[0]?.triggerId === "trg_e2e_smoke", savedAutomations[0]);

  console.log("\nStep 4 — execute /composio-init command through Pi prompt dispatch");
  await session.prompt("/composio-init ak_e2e_local_command");
  const debugAfter = await debugTool?.execute(
    "e2e_debug_after",
    {},
    undefined,
    undefined,
    undefined as never,
  ) as TextToolResult | undefined;
  check("debug reports API key after /composio-init", debugAfter?.details?.apiKeyPresent === true, debugAfter?.details);
  check("debug reports env source after /composio-init", debugAfter?.details?.apiKeySource === "env", debugAfter?.details);
} catch (error) {
  failures += 1;
  console.error("\nUnhandled error in Pi extension e2e:", error);
} finally {
  session?.dispose();
  restoreEnv("HOME", originalHome);
  restoreEnv("COMPOSIO_API_KEY", originalApiKey);
  restoreEnv("PI_CODING_AGENT_DIR", originalPiAgentDir);
  restoreEnv("PI_COMPOSIO_AUTOMATIONS_JSON", originalAutomationsPath);
  rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
