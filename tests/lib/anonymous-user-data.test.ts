import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getAnonymousUserDataPath,
  readAnonymousUserData,
  writeAnonymousUserData,
} from "../../src/lib/anonymous-user-data.js";

let tempHome: string;
let originalHome: string | undefined;

beforeEach(() => {
  originalHome = process.env.HOME;
  tempHome = mkdtempSync(join(tmpdir(), "composio-anon-"));
  process.env.HOME = tempHome;
});

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true });
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
});

describe("anonymous user data store", () => {
  test("path is rooted at HOME/.composio/anonymous_user_data.json", () => {
    expect(getAnonymousUserDataPath()).toBe(
      join(tempHome, ".composio", "anonymous_user_data.json"),
    );
  });

  test("read returns null when file is missing", () => {
    expect(readAnonymousUserData()).toBeNull();
  });

  test("read returns null when file is malformed", () => {
    const path = getAnonymousUserDataPath();
    const dir = join(tempHome, ".composio");
    require("node:fs").mkdirSync(dir, { recursive: true });
    writeFileSync(path, "not json", "utf8");

    expect(readAnonymousUserData()).toBeNull();
  });

  test("write creates the directory and persists the payload with mode 0600", async () => {
    const payload = {
      status: "ready",
      slug: "amber-cedar-otter",
      email: "amber-cedar-otter@agent.composio.ai",
      agent_key: "composio_agent_key_test",
      composio: { api_key: "ak_test", org_id: "org_test", project_id: "proj_test" },
    };

    await writeAnonymousUserData(payload);

    const path = getAnonymousUserDataPath();
    expect(existsSync(path)).toBe(true);

    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);

    expect(readAnonymousUserData()).toEqual(payload);
  });

  test("write overwrites prior content", async () => {
    await writeAnonymousUserData({ slug: "first", agent_key: "k1" });
    await writeAnonymousUserData({ slug: "second", agent_key: "k2" });
    expect(readAnonymousUserData()).toEqual({ slug: "second", agent_key: "k2" });
  });
});
