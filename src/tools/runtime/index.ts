import { claim as composioClaim } from "../auth/claim.js";
import { signup as composioSignup } from "../auth/signup.js";
import { executeTool } from "./execute-tool.js";
import { getToolSchemas } from "./get-tool-schemas.js";
import { manageConnections } from "./manage-connections.js";
import { searchTools } from "./search-tools.js";

export const runtimeTools = [
  composioSignup,
  composioClaim,
  searchTools,
  getToolSchemas,
  executeTool,
  manageConnections,
];

export const runtimeToolNames = runtimeTools.map((tool) => tool.name);
