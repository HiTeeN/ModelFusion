import { formatFusionConfigForDisplay, fusionResultToParts, invalidCommandMessageToParts, parseFusionCommand, } from "../fusion-command.js";
export function createCommandExecuteBeforeHook(pluginState) {
    const { config, recursionGuard, pipeline, client } = pluginState;
    return async (input, output) => {
        if (!config.enabled) {
            return;
        }
        const intent = parseFusionCommand(input.command, input.arguments);
        if (!intent) {
            return;
        }
        if (intent.kind === "config") {
            output.parts = [
                {
                    type: "text",
                    text: formatFusionConfigForDisplay(config),
                },
            ];
            return;
        }
        if (intent.kind === "invalid") {
            output.parts = invalidCommandMessageToParts(intent.message);
            return;
        }
        const originalModel = {
            providerId: config.judge.providerId,
            modelId: config.judge.modelId,
        };
        const result = await pipeline(client, input.sessionID, intent.prompt, config, originalModel, recursionGuard);
        output.parts = fusionResultToParts(result);
    };
}
//# sourceMappingURL=command-execute.js.map