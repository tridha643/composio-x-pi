import { metaPassthroughTool } from "./meta-passthrough.js";

export function multiExecuteToolTool(deps: {
  executeMetaTool?: (slug: string, input?: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  return metaPassthroughTool({
    name: "composio_multi_execute_tool",
    label: "Composio Multi Execute Tool",
    description:
      "Execute multiple Composio tools through the COMPOSIO_MULTI_EXECUTE_TOOL meta tool. Pass the raw meta-tool arguments from the schema/reference.",
    metaSlug: "COMPOSIO_MULTI_EXECUTE_TOOL",
    resultTitle: "Executed Composio multi-tool request.",
    executeMetaTool: deps.executeMetaTool,
  });
}

export const multiExecuteTool = multiExecuteToolTool();
