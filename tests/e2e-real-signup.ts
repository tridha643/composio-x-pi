#!/usr/bin/env bun
/**
 * Real e2e: drives signup-flow.ts against the live agents.composio.dev API
 * inside an isolated HOME sandbox so the user's real ~/.composio is untouched.
 *
 * Does NOT call claim() unless --claim-email=<addr> is passed (claim sends a
 * real invite email and shouldn't run accidentally).
 *
 * Usage:
 *   bun run tests/e2e-real-signup.ts
 *   bun run tests/e2e-real-signup.ts --claim-email=admin@example.com
 */

import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getAnonymousUserDataPath,
  readAnonymousUserData,
} from "../src/lib/anonymous-user-data.js";
import { claimAgentIdentity, ensureAgentIdentity } from "../src/lib/signup-flow.js";

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  const [k, v] = arg.replace(/^--/, "").split("=");
  args.set(k, v ?? "true");
}
const claimEmail = args.get("claim-email");

const originalHome = process.env.HOME;
const sandbox = mkdtempSync(join(tmpdir(), "composio-e2e-"));
process.env.HOME = sandbox;

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}`);
    if (detail !== undefined) {
      console.log("     ", detail);
    }
  }
}

async function main(): Promise<void> {
  console.log(`# Real e2e against https://agents.composio.dev`);
  console.log(`Sandboxed HOME: ${sandbox}`);
  console.log(`Anonymous data path: ${getAnonymousUserDataPath()}\n`);

  // --- 1. Cold start ---
  console.log("Step 1 — cold-start signup");
  const cold = await ensureAgentIdentity();
  check("ensureAgentIdentity returns reused=false", cold.reused === false, cold);
  check("returns a non-empty slug", typeof cold.slug === "string" && cold.slug.length > 0, cold.slug);
  check("returns an email", typeof cold.email === "string" && cold.email.includes("@"), cold.email);
  check("returns an apiKey", typeof cold.apiKey === "string" && cold.apiKey.length > 10);

  const path = getAnonymousUserDataPath();
  check("anonymous_user_data.json exists on disk", existsSync(path));
  const mode = statSync(path).mode & 0o777;
  check("file mode is 0600", mode === 0o600, mode.toString(8));

  const persisted = readAnonymousUserData();
  check("persisted file contains agent_key", typeof persisted?.agent_key === "string");
  check(
    "persisted composio.api_key matches return value",
    persisted?.composio?.api_key === cold.apiKey,
  );
  console.log(`  → slug=${cold.slug} email=${cold.email}\n`);

  // --- 2. Idempotent reuse ---
  console.log("Step 2 — idempotent reuse");
  const reuse = await ensureAgentIdentity();
  check("reused=true on second call", reuse.reused === true, reuse);
  check("same slug on reuse", reuse.slug === cold.slug, { first: cold.slug, second: reuse.slug });
  check("same apiKey on reuse", reuse.apiKey === cold.apiKey);
  console.log();

  // --- 3. Force ---
  console.log("Step 3 — force: provision a new identity");
  const forced = await ensureAgentIdentity({ force: true });
  check("reused=false on force", forced.reused === false, forced);
  check("force returns a different slug", forced.slug !== cold.slug, {
    cold: cold.slug,
    forced: forced.slug,
  });
  const afterForce = readAnonymousUserData();
  check(
    "persisted agent_key updated after force",
    typeof afterForce?.agent_key === "string" && afterForce.agent_key !== persisted?.agent_key,
  );
  console.log(`  → new slug=${forced.slug}\n`);

  // --- 4. Reuse after force still works ---
  console.log("Step 4 — reuse the new identity");
  const reuseAfterForce = await ensureAgentIdentity();
  check("reused=true after force", reuseAfterForce.reused === true);
  check("reused slug matches forced slug", reuseAfterForce.slug === forced.slug);
  console.log();

  // --- 5. Claim (only if explicitly opted in) ---
  if (claimEmail) {
    console.log(`Step 5 — claim with email=${claimEmail}`);
    const claim = await claimAgentIdentity(claimEmail);
    check("claim returns invite_code", typeof claim.inviteCode === "string" && claim.inviteCode.length > 0);
    console.log(`  → invite_code=${claim.inviteCode} org_id=${claim.orgId}`);
  } else {
    console.log("Step 5 — claim (skipped; pass --claim-email=<addr> to exercise)\n");
  }

  // --- 6. Invalid-email guard (no network call expected) ---
  console.log("Step 6 — claim validates email locally");
  let threw = false;
  try {
    await claimAgentIdentity("not-an-email");
  } catch (e) {
    threw = true;
    check(
      "rejects invalid email with AGENT_CLAIM_FAILED",
      (e as { code?: string }).code === "AGENT_CLAIM_FAILED",
    );
  }
  check("invalid email actually threw", threw);
}

try {
  await main();
} catch (err) {
  failures += 1;
  console.error("\nUnhandled error in e2e:", err);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
}
