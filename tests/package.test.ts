import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  name: string;
  keywords: string[];
  pi?: {
    extensions?: string[];
  };
};

describe("pi package manifest", () => {
  test("declares the extension entrypoint", () => {
    expect(packageJson.name).toBe("composio-x-pi");
    expect(packageJson.keywords).toContain("pi-package");
    expect(packageJson.keywords).toContain("pi-extension");
    expect(packageJson.pi).toEqual({
      extensions: ["./src/index.ts"],
    });
  });
});
