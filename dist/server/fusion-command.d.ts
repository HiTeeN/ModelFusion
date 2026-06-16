import type { Part } from "@opencode-ai/sdk";
import type { FusionConfig } from "../types/config.js";
import type { FusionResult } from "../types/results.js";
export type FusionCommandIntent = {
    kind: "fusion";
    prompt: string;
} | {
    kind: "config";
} | {
    kind: "invalid";
    message: string;
};
export declare function parseFusionCommand(command: string, args: string): FusionCommandIntent | null;
export declare function parseFusionPromptText(text: string): FusionCommandIntent | null;
export declare function formatFusionConfigForDisplay(config: FusionConfig): string;
export declare function fusionResultToParts(result: FusionResult): Part[];
export declare function invalidCommandMessageToParts(message: string): Part[];
//# sourceMappingURL=fusion-command.d.ts.map