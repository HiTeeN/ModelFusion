import { createFusionCommandDefinitions } from "../command-definitions.js";

export interface ConfigHookInput {
  command?: Record<string, unknown>;
  [key: string]: unknown;
}

export function createConfigHook(): (input: ConfigHookInput) => Promise<void> {
  return async (input: ConfigHookInput): Promise<void> => {
    const existingCommands =
      input.command && typeof input.command === "object"
        ? input.command
        : {};

    input.command = {
      ...existingCommands,
      ...createFusionCommandDefinitions(),
    };
  };
}
