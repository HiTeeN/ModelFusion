import { type ToolDefinition } from "@opencode-ai/plugin/tool";
import type { runFusionPipeline } from "../pipeline.js";
import type { PipelineClient } from "../pipeline.js";
import type { FusionConfig } from "../../types/config.js";
import type { RecursionGuard } from "../recursion-guard.js";
import type { OriginalModel } from "../synthesizer.js";
export declare function createFusionTool(deps: {
    pipelineFn: typeof runFusionPipeline;
    client: PipelineClient;
    config: FusionConfig;
    recursionGuard: RecursionGuard;
    originalModel: OriginalModel;
}): ToolDefinition;
//# sourceMappingURL=tool-registration.d.ts.map