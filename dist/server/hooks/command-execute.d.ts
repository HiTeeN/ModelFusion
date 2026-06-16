import type { Part } from "@opencode-ai/sdk";
import type { FusionConfig } from "../../types/config.js";
import { RecursionGuard } from "../recursion-guard.js";
import { runFusionPipeline, type PipelineClient } from "../pipeline.js";
export interface CommandExecutePluginState {
    config: FusionConfig;
    recursionGuard: RecursionGuard;
    pipeline: typeof runFusionPipeline;
    client: PipelineClient;
}
export interface CommandExecuteBeforeInput {
    command: string;
    sessionID: string;
    arguments: string;
}
export interface CommandExecuteBeforeOutput {
    parts: Part[];
}
export declare function createCommandExecuteBeforeHook(pluginState: CommandExecutePluginState): (input: CommandExecuteBeforeInput, output: CommandExecuteBeforeOutput) => Promise<void>;
//# sourceMappingURL=command-execute.d.ts.map