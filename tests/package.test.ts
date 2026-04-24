import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  name: string;
  keywords: string[];
  license?: string;
  repository?: {
    type?: string;
    url?: string;
  };
  publishConfig?: {
    access?: string;
  };
  pi?: {
    extensions?: string[];
  };
};

const readme = readFileSync("README.md", "utf8");

describe("pi package manifest", () => {
  test("declares the extension entrypoint", () => {
    expect(packageJson.name).toBe("composio-x-pi");
    expect(packageJson.keywords).toContain("pi-package");
    expect(packageJson.keywords).toContain("pi-extension");
    expect(packageJson.pi).toEqual({
      extensions: ["./src/index.ts"],
    });
  });

  test("is ready for npm-based pi install", () => {
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.publishConfig).toEqual({ access: "public" });
    expect(packageJson.repository?.url).toBe(
      "git+https://github.com/tridha643/composio-x-pi.git",
    );
    expect(readme).toContain("pi install npm:composio-x-pi");
  });
});
