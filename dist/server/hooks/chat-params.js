// ---------------------------------------------------------------------------
// createChatParamsHook — factory returning a chat.params hook
// ---------------------------------------------------------------------------
/**
 * Creates a `chat.params` hook that adjusts LLM parameters when fusion is
 * active for a session.
 *
 * - Fusion active: sets temperature and maxOutputTokens from config.
 * - Fusion inactive: passes through unchanged (no modifications).
 */
export function createChatParamsHook(pluginState) {
    const { config, recursionGuard } = pluginState;
    return async (_input, output) => {
        // -------------------------------------------------------------------
        // Fusion inactive — pass through unchanged
        // -------------------------------------------------------------------
        if (!recursionGuard.isFusionActive(_input.sessionID)) {
            return;
        }
        // -------------------------------------------------------------------
        // Fusion active — route params for panelist calls
        // -------------------------------------------------------------------
        output.temperature = config.temperature;
        output.maxOutputTokens = config.maxToolCalls * 1000;
    };
}
//# sourceMappingURL=chat-params.js.map