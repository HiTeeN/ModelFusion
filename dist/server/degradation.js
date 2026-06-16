// ---------------------------------------------------------------------------
// handleDegradation — post-process pipeline results for graceful degradation
// ---------------------------------------------------------------------------
/**
 * Analyzes a FusionResult from the pipeline and adjusts status/messages
 * for graceful degradation scenarios.
 *
 * Scenarios:
 * - A: Judge failed but panelists succeeded → status "degraded"
 * - B: Partial panel failure → status stays "ok", failedModels populated
 * - C: All panelists failed → status "error", fallback to original model
 * - Pre-existing failureReason (e.g. recursion guard) → preserved as-is
 *
 * @param result — the FusionResult assembled by the pipeline
 * @param originalModelResponse — optional fallback response from the original model
 * @returns a (possibly modified) FusionResult with appropriate degradation status
 */
export function handleDegradation(result, originalModelResponse) {
    // If failureReason is already set (e.g. "fusion_invocation_capped" from
    // RecursionGuard), preserve it — the pipeline already handled this case.
    if (result.failureReason) {
        return result;
    }
    const hasSuccessfulResponse = result.responses.some((r) => r.error === undefined);
    const allFailed = result.responses.length > 0 &&
        result.responses.every((r) => r.error !== undefined);
    // ------------------------------------------------------------------
    // Scenario C: all panelists failed
    // ------------------------------------------------------------------
    if (allFailed) {
        return {
            ...result,
            status: "error",
            failureReason: "all_panels_failed",
            synthesizedAnswer: originalModelResponse ?? result.synthesizedAnswer,
        };
    }
    // ------------------------------------------------------------------
    // Scenario A: judge failed but at least one panelist succeeded
    // ------------------------------------------------------------------
    if (!result.analysis && hasSuccessfulResponse) {
        return {
            ...result,
            status: "degraded",
        };
    }
    // ------------------------------------------------------------------
    // Scenario B: partial panel failure — status stays as-is,
    // failedModels already populated by the pipeline
    // ------------------------------------------------------------------
    return result;
}
// ---------------------------------------------------------------------------
// getDegradationMessage — user-facing explanation for degradation status
// ---------------------------------------------------------------------------
/**
 * Returns a human-readable message explaining the degradation state.
 * Returns an empty string when status is "ok" (no degradation to explain).
 */
export function getDegradationMessage(result) {
    if (result.status === "ok") {
        return "";
    }
    if (result.status === "degraded") {
        return "Judge model failed to produce structured analysis. Showing raw panel responses. Review them directly to form your own synthesis.";
    }
    if (result.status === "error") {
        if (result.failureReason === "all_panels_failed") {
            return "All panel models failed to produce responses. Falling back to the original model. Check model availability and API configurations.";
        }
        if (result.failureReason === "fusion_invocation_capped") {
            return "Fusion already running — nested deliberation blocked.";
        }
    }
    return "";
}
//# sourceMappingURL=degradation.js.map