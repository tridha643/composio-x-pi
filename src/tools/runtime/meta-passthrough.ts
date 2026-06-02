import { executeMetaTool } from "../../composio-client.js";
import { LooseObject, createTool, summarizeJson, textResult, withProgress } from "../../lib/toolkit.js";

type MetaPassthroughParams = Record<string, unknown>;

export function metaPassthroughTool(options: {
  name: string;
  label: string;
  description: string;
  metaSlug: string;
  resultTitle: string | ((params: MetaPassthroughParams) => string);
  executeMetaTool?: (slug: string, input?: Record<string, unknown>) => Promise<unknown>;
}) {
  return createTool<MetaPassthroughParams>({
    name: options.name,
    label: options.label,
    description: options.description,
    parameters: LooseObject,
    async execute(_toolCallId, params, _signal, onUpdate) {
      const invoke = options.executeMetaTool ?? executeMetaTool;
      const input = params ?? {};
      const response = await withProgress(
        () => invoke(options.metaSlug, input),
        onUpdate,
      );
      const title = typeof options.resultTitle === "function"
        ? options.resultTitle(input)
        : options.resultTitle;

      return textResult(summarizeJson(title, response), {
        metaSlug: options.metaSlug,
        input,
        response,
      });
    },
  });
}
