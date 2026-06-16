import type { FusionConfig } from "../../types/config.js";
import type { Model } from "@opencode-ai/sdk";
export declare function createSystemTransformHook(pluginState: {
    config: FusionConfig;
}): (input: {
    sessionID?: string;
    model: Model;
}, output: {
    system: string[];
}) => Promise<void>;
//# sourceMappingURL=system-transform.d.ts.map