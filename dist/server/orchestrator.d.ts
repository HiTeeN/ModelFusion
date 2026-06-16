import type { PanelModel, FusionConfig } from "../types/config.js";
import type { PanelResult } from "../types/results.js";
export interface OrchestratorClient {
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
        }) => Promise<PromptResponse>;
    };
}
export interface PromptResponse {
    info: {
        tokens: {
            input: number;
            output: number;
        };
    };
    parts: Array<{
        type: string;
        text?: string;
    }>;
}
export interface FanOutOptions {
    /** Per-panelist call timeout in ms. Default: 120_000 (2 min). */
    timeoutMs?: number;
    /** Number of retries for transient failures. Default: 1. */
    retries?: number;
    /** Called whenever a panelist settles, success or error. */
    onPanelistDone?: (result: PanelResult) => void;
}
/**
 * Spawns parallel model calls for each panelist.
 *
 * - Input prompt is sanitized (trimmed) before dispatch.
 * - Each panelist receives the **verbatim** prompt (no lenses/personas/roles).
 * - Calls execute concurrently via Promise.allSettled.
 * - Per-call timeout (default 120s) prevents infinite hangs.
 * - Transient errors are retried once before being captured as failures.
 * - Individual failures are captured as PanelResult with an `error` field.
 * - Token counts and latency are captured from response metadata.
 */
export declare function fanOut(client: OrchestratorClient, sessionID: string, prompt: string, models: PanelModel[], _config: FusionConfig, options?: FanOutOptions): Promise<PanelResult[]>;
//# sourceMappingURL=orchestrator.d.ts.map