export type ConstellagentMode = "authoring" | "worktree";

export function getMode(env: NodeJS.ProcessEnv = process.env): ConstellagentMode {
  return env.CONSTELLAGENT_MODE === "authoring" ? "authoring" : "worktree";
}
