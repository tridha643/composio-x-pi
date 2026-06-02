import { metaPassthroughTool } from "./meta-passthrough.js";

export function remoteBashToolTool(deps: {
  executeMetaTool?: (slug: string, input?: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  return metaPassthroughTool({
    name: "composio_remote_bash_tool",
    label: "Composio Remote Bash Tool",
    description:
      "Execute bash commands in Composio's remote workbench through the COMPOSIO_REMOTE_BASH_TOOL meta tool. Pass the raw meta-tool arguments from the schema/reference.",
    metaSlug: "COMPOSIO_REMOTE_BASH_TOOL",
    resultTitle: "Executed Composio remote bash request.",
    executeMetaTool: deps.executeMetaTool,
  });
}

export const remoteBashTool = remoteBashToolTool();
