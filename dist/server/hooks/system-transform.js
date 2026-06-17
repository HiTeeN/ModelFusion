// ---------------------------------------------------------------------------
// system-transform.ts — injects deliberation system prompt when fusion is
// enabled. Preserves existing system prompts by appending only.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Deliberation Prompt
// ---------------------------------------------------------------------------
const DELIBERATION_PROMPT = "You have access to a multi-model deliberation tool (fusion_deliberate). " +
    "For complex questions, invoke it to get consensus, contradictions, unique " +
    "insights, and blind spots from a panel of models. Use the analysis to " +
    "write a better final answer with attribution.";
// ---------------------------------------------------------------------------
// createSystemTransformHook
// ---------------------------------------------------------------------------
export function createSystemTransformHook(pluginState) {
    return async (_input, output) => {
        // Fusion disabled → pass through unchanged
        if (!pluginState.config.enabled) {
            return;
        }
        // Append deliberation prompt to existing system messages
        output.system.push(DELIBERATION_PROMPT);
    };
}
//# sourceMappingURL=system-transform.js.map