import type { FusionConfig } from "../types/config.js";
import type { JudgeOutput, PanelResult } from "../types/results.js";
export interface JudgeClient {
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
export declare function runJudge(client: JudgeClient, sessionID: string, panelResults: PanelResult[], config: FusionConfig): Promise<JudgeOutput | null>;
/**
 * Sanitizes a single config string value: trims whitespace and strips
 * characters that could cause issues in API calls.
 */
export declare function sanitizeConfigValue(value: string): string;
//# sourceMappingURL=judge.d.ts.map