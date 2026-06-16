import { formatFusionConfigForDisplay, fusionResultToParts, invalidCommandMessageToParts, parseFusionPromptText, } from "../fusion-command.js";
const FUSION_MANUAL_VARIANT = "fusion:manual";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Extract the full prompt text from output parts.
 * Concatenates text from all TextPart items.
 */
function extractPrompt(parts) {
    return parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("\n");
}
/**
 * Check whether the prompt meets the threshold criteria for triggering fusion.
 * Returns true if prompt length exceeds minPromptLength OR contains any keyword.
 */
function meetsThreshold(prompt, minPromptLength, keywords) {
    if (prompt.length > minPromptLength)
        return true;
    if (keywords.length === 0)
        return false;
    const lower = prompt.toLowerCase();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}
/**
 * Build a TextPart from a string for injection into output.parts.
 */
function textPart(text) {
    return { type: "text", text };
}
// ---------------------------------------------------------------------------
// createChatMessageHook — factory that returns the chat.message hook
// ---------------------------------------------------------------------------
/**
 * Creates a `chat.message` hook that intercepts incoming user messages and
 * decides whether to trigger the fusion pipeline based on the configured
 * triggering mode.
 *
 * Modes:
 * - **manual**: Messages pass through unchanged. Fusion is only triggered
 *   via the `fusion:deliberate` tool.
 * - **auto**: Every incoming message triggers fusion.
 * - **threshold**: Fusion triggers when the prompt exceeds `minPromptLength`
 *   or contains any of the configured `keywords`.
 *
 * A recursion guard prevents nested fusion calls within the same session.
 */
export function createChatMessageHook(pluginState) {
    const { config, recursionGuard, pipeline, client } = pluginState;
    return async (input, output) => {
        if (!config.enabled) {
            return;
        }
        // -----------------------------------------------------------------------
        // Step 1: Extract the prompt text from incoming parts
        // -----------------------------------------------------------------------
        const prompt = extractPrompt(output.parts);
        const commandIntent = parseFusionPromptText(prompt);
        if (commandIntent?.kind === "config") {
            output.parts = [textPart(formatFusionConfigForDisplay(config))];
            return;
        }
        if (commandIntent?.kind === "invalid") {
            output.parts = invalidCommandMessageToParts(commandIntent.message);
            return;
        }
        // -----------------------------------------------------------------------
        // Step 2: Decide whether to trigger based on triggering mode
        // -----------------------------------------------------------------------
        let shouldTrigger = false;
        const effectivePrompt = commandIntent?.kind === "fusion"
            ? commandIntent.prompt
            : prompt;
        if (input.variant === FUSION_MANUAL_VARIANT) {
            shouldTrigger = true;
        }
        else if (commandIntent?.kind === "fusion") {
            shouldTrigger = true;
        }
        else {
            switch (config.triggering) {
                case "manual":
                    // Manual mode — never auto-trigger; pass through unchanged
                    shouldTrigger = false;
                    break;
                case "auto":
                    // Auto mode — always trigger
                    shouldTrigger = true;
                    break;
                case "threshold": {
                    // Threshold mode — check length and keywords
                    const threshold = config.threshold ?? { minPromptLength: 200, keywords: [] };
                    shouldTrigger = meetsThreshold(effectivePrompt, threshold.minPromptLength, threshold.keywords);
                    break;
                }
            }
        }
        // -----------------------------------------------------------------------
        // Step 3: If not triggering, pass through unchanged
        // -----------------------------------------------------------------------
        if (!shouldTrigger) {
            return;
        }
        // -----------------------------------------------------------------------
        // Step 4: Recursion guard — skip if fusion already active for this session
        // -----------------------------------------------------------------------
        if (recursionGuard.isFusionActive(input.sessionID)) {
            return;
        }
        // -----------------------------------------------------------------------
        // Step 5: Build original model info from input
        // -----------------------------------------------------------------------
        const originalModel = input.model
            ? { providerId: input.model.providerID, modelId: input.model.modelID }
            : { providerId: "unknown", modelId: "unknown" };
        // -----------------------------------------------------------------------
        // Step 6: Run the fusion pipeline
        // -----------------------------------------------------------------------
        const result = await pipeline(client, input.sessionID, effectivePrompt, config, originalModel, recursionGuard);
        // -----------------------------------------------------------------------
        // Step 7: Inject fusion results into the output
        // -----------------------------------------------------------------------
        if (commandIntent?.kind === "fusion") {
            output.parts = fusionResultToParts(result);
            return;
        }
        if (result.status === "ok" && result.synthesizedAnswer) {
            // Happy path — replace parts with the synthesized answer
            output.parts = [textPart(result.synthesizedAnswer)];
        }
        else if (result.status === "degraded" && result.responses.length > 0) {
            // Degraded — show raw panel responses with a note
            const rawResponses = result.responses
                .map((r) => `**[${r.providerId}/${r.modelId}]**\n${r.content}`)
                .join("\n\n---\n\n");
            output.parts = [
                textPart("⚠️ Fusion panel completed but judge analysis failed. " +
                    "Raw panel responses below:\n\n" +
                    rawResponses),
            ];
        }
        else {
            // Error — inject failure message, keep original prompt visible
            const reason = result.failureReason ?? "unknown error";
            output.parts = [
                textPart(`⚠️ Fusion pipeline failed: ${reason}`),
                ...output.parts,
            ];
        }
    };
}
//# sourceMappingURL=chat-message.js.map