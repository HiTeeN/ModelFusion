// ---------------------------------------------------------------------------
// event.ts — listens for session lifecycle events to manage per-session state.
// Handles session.created, session.deleted, session.error; ignores all others.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// createEventHook
// ---------------------------------------------------------------------------
export function createEventHook(pluginState) {
    return async (input) => {
        const { event } = input;
        switch (event.type) {
            case "session.created": {
                console.log(`[fusion-plugin] Session created: ${event.sessionID ?? "unknown"}`);
                // Per-session state is initialized implicitly via fresh RecursionGuard
                // and CostTracker instances created per plugin initialization.
                break;
            }
            case "session.deleted": {
                console.log(`[fusion-plugin] Session deleted: ${event.sessionID ?? "unknown"}`);
                // Cleanup: clear any active fusion state for this session
                if (event.sessionID) {
                    pluginState.recursionGuard.markFusionComplete(event.sessionID);
                }
                break;
            }
            case "session.error": {
                const errorMessage = event.error instanceof Error
                    ? event.error.message
                    : String(event.error ?? "unknown error");
                console.error(`[fusion-plugin] Session error [${event.sessionID ?? "unknown"}]: ${errorMessage}`);
                break;
            }
            default: {
                // All other events — no side effects
                break;
            }
        }
    };
}
//# sourceMappingURL=event.js.map