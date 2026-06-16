import { tool } from "@opencode-ai/plugin/tool";
export function createFusionTool(deps) {
    const { pipelineFn, client, config, recursionGuard, originalModel } = deps;
    return tool({
        description: "Invoke multi-model deliberation. A panel of models answers your " +
            "prompt in parallel, a judge compares their responses and returns " +
            "structured analysis (consensus, contradictions, unique insights, " +
            "blind spots, scoring). Use for complex questions where multiple " +
            "perspectives add value.",
        args: {
            prompt: tool.schema
                .string()
                .describe("The question or task for the panel to analyze"),
        },
        async execute(args, context) {
            const { prompt } = args;
            const result = await pipelineFn(client, context.sessionID, prompt, config, originalModel, recursionGuard);
            return JSON.stringify(result);
        },
    });
}
//# sourceMappingURL=tool-registration.js.map