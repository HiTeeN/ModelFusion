import type { JudgeOutput, PanelResult } from "../types/results.js";
import type { FusionConfig } from "../types/config.js";
export interface SynthesizerClient {
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
        }) => Promise<{
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
        }>;
    };
}
export interface OriginalModel {
    providerId: string;
    modelId: string;
}
export declare function synthesize(client: SynthesizerClient, sessionID: string, judgeOutput: JudgeOutput, panelResults: PanelResult[], config: FusionConfig, originalModel: OriginalModel): Promise<string>;
//# sourceMappingURL=synthesizer.d.ts.map