import { metaPassthroughTool } from "./meta-passthrough.js";

export function remoteWorkbenchTool(deps: {
  executeMetaTool?: (slug: string, input?: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  return metaPassthroughTool({
    name: "composio_remote_workbench",
    label: "Composio Remote Workbench",
    description:
      "Run Python code in Composio's persistent remote workbench through the COMPOSIO_REMOTE_WORKBENCH meta tool. Pass the raw meta-tool arguments from the schema/reference.",
    metaSlug: "COMPOSIO_REMOTE_WORKBENCH",
    resultTitle: "Executed Composio remote workbench request.",
    executeMetaTool: deps.executeMetaTool,
  });
}

export const remoteWorkbench = remoteWorkbenchTool();
