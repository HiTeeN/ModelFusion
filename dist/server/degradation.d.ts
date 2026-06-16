import type { FusionResult } from "../types/results.js";
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
export declare function handleDegradation(result: FusionResult, originalModelResponse?: string): FusionResult;
/**
 * Returns a human-readable message explaining the degradation state.
 * Returns an empty string when status is "ok" (no degradation to explain).
 */
export declare function getDegradationMessage(result: FusionResult): string;
//# sourceMappingURL=degradation.d.ts.map