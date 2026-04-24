export type ComposioPiMode = "authoring" | "worktree";

export function getMode(env: NodeJS.ProcessEnv = process.env): ComposioPiMode {
  return env.COMPOSIO_PI_MODE === "authoring" ? "authoring" : "worktree";
}
