import { createFusionCommandDefinitions } from "../command-definitions.js";
export function createConfigHook() {
    return async (input) => {
        const existingCommands = input.command && typeof input.command === "object"
            ? input.command
            : {};
        input.command = {
            ...existingCommands,
            ...createFusionCommandDefinitions(),
        };
    };
}
//# sourceMappingURL=config.js.map