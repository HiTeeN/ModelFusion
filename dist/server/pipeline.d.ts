import type { FusionConfig } from "../types/config.js";
import type { FusionResult } from "../types/results.js";
import { type OriginalModel } from "./synthesizer.js";
import { RecursionGuard } from "./recursion-guard.js";
export interface PipelineClient {
    session: {
        prompt: (params: {
            sessionID: string;
            model: {
                providerID: string;
                modelID: string;
            };
            parts: Array<{
                type: string;
                text?: string;
                [key: string]: unknown;
            }>;
            format?: {
                type: string;
                schema?: unknown;
            };
            system?: string;
        }) => Promise<unknown>;
    };
}
/**
 * Runs the complete fusion pipeline:
 *   validate → fan-out → judge → synthesize
 *
 * Flow:
 *   1. Check RecursionGuard — block nested fusion calls
 *   2. fanOut to all panel models concurrently
 *   3. If any panelists succeeded → runJudge
 *   4. If judge succeeded → synthesize final answer
 *   5. If judge returned null → degraded (raw responses, no analysis)
 *   6. If all panelists failed → error with failureReason
 *
 * Cost is accumulated across all stages via CostTracker.
 */
export declare function runFusionPipeline(client: PipelineClient, sessionID: string, prompt: string, config: FusionConfig, originalModel: OriginalModel, recursionGuard: RecursionGuard): Promise<FusionResult>;
//# sourceMappingURL=pipeline.d.ts.map