const FUSION_COMMANDS = new Set(["fusion", "deliberate", "panel"]);
const CONFIG_COMMANDS = new Set(["fusion:config", "config", "fusion-config"]);
function normalizeCommandName(command) {
    return command.trim().replace(/^\/+/, "").toLowerCase();
}
function textPart(text) {
    return { type: "text", text };
}
export function parseFusionCommand(command, args) {
    const normalized = normalizeCommandName(command);
    if (CONFIG_COMMANDS.has(normalized)) {
        return { kind: "config" };
    }
    if (!FUSION_COMMANDS.has(normalized)) {
        return null;
    }
    const prompt = args.trim();
    if (!prompt) {
        return {
            kind: "invalid",
            message: 'Usage: /fusion <question>\n\nExample: /fusion Compare Postgres and SQLite for a local-first app.',
        };
    }
    return { kind: "fusion", prompt };
}
export function parseFusionPromptText(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/")) {
        return null;
    }
    const withoutSlash = trimmed.slice(1);
    const firstWhitespace = withoutSlash.search(/\s/);
    if (firstWhitespace === -1) {
        return parseFusionCommand(withoutSlash, "");
    }
    const command = withoutSlash.slice(0, firstWhitespace);
    const args = withoutSlash.slice(firstWhitespace + 1);
    return parseFusionCommand(command, args);
}
export function formatFusionConfigForDisplay(config) {
    const modelLines = config.panel.models
        .map((model) => `  ${model.providerId} / ${model.modelId}`)
        .join("\n");
    return [
        "Current Fusion Configuration",
        "",
        "Panel models:",
        modelLines,
        "",
        `Judge:          ${config.judge.providerId} / ${config.judge.modelId}`,
        `Trigger mode:   ${config.triggering}`,
        `Max tool calls: ${config.maxToolCalls}`,
        `Temperature:    ${config.temperature}`,
        `Enabled:        ${config.enabled ? "yes" : "no"}`,
    ].join("\n");
}
export function fusionResultToParts(result) {
    if (result.status === "ok" && result.synthesizedAnswer) {
        return [textPart(result.synthesizedAnswer)];
    }
    if (result.status === "degraded" && result.responses.length > 0) {
        const rawResponses = result.responses
            .map((response) => `**[${response.providerId}/${response.modelId}]**\n${response.content}`)
            .join("\n\n---\n\n");
        return [
            textPart("⚠️ Fusion panel completed but judge analysis failed. Raw panel responses below:\n\n"
                + rawResponses),
        ];
    }
    const reason = result.failureReason ?? "unknown error";
    return [textPart(`⚠️ Fusion pipeline failed: ${reason}`)];
}
export function invalidCommandMessageToParts(message) {
    return [textPart(message)];
}
//# sourceMappingURL=fusion-command.js.map