import { resolve } from "node:path";

async function main(): Promise<void> {
  const module = (await import("@mariozechner/pi-coding-agent")) as Record<string, unknown>;
  const createAgentSession = module.createAgentSession as
    | ((input: Record<string, unknown>) => Promise<unknown> | unknown)
    | undefined;

  if (!createAgentSession) {
    throw new Error("createAgentSession is not available from @mariozechner/pi-coding-agent.");
  }

  const session = (await Promise.resolve(
    createAgentSession({
      additionalExtensionPaths: [resolve(process.cwd(), "src/index.ts")],
    }),
  )) as {
    subscribe?: (handler: (event: unknown) => void) => void;
    prompt?: (text: string) => Promise<unknown>;
    close?: () => Promise<unknown> | unknown;
  };

  session.subscribe?.((event) => {
    console.log(JSON.stringify(event, null, 2));
  });

  const prompt =
    process.argv.slice(2).join(" ") ||
    "create a trigger on GITHUB_COMMIT_EVENT for owner=acme repo=backend";

  await session.prompt?.(prompt);
  await Promise.resolve(session.close?.());
}

await main();
