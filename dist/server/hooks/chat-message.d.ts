import type { FusionConfig } from "../../types/config.js";
import { RecursionGuard } from "../recursion-guard.js";
import { runFusionPipeline, type PipelineClient } from "../pipeline.js";
import type { UserMessage, Part } from "@opencode-ai/sdk";
export interface ChatMessagePluginState {
    config: FusionConfig;
    recursionGuard: RecursionGuard;
    pipeline: typeof runFusionPipeline;
    client: PipelineClient;
}
export interface ChatMessageInput {
    sessionID: string;
    agent?: string;
    model?: {
        providerID: string;
        modelID: string;
    };
    messageID?: string;
    variant?: string;
}
export interface ChatMessageOutput {
    message: UserMessage;
    parts: Part[];
}
/**
 * Creates a `chat.message` hook that intercepts incoming user messages and
 * decides whether to trigger the fusion pipeline based on the configured
 * triggering mode.
 *
 * Modes:
 * - **manual**: Messages pass through unchanged. Fusion is only triggered
 *   via the `fusion_deliberate` tool.
 * - **auto**: Every incoming message triggers fusion.
 * - **threshold**: Fusion triggers when the prompt exceeds `minPromptLength`
 *   or contains any of the configured `keywords`.
 *
 * A recursion guard prevents nested fusion calls within the same session.
 */
export declare function createChatMessageHook(pluginState: ChatMessagePluginState): (input: ChatMessageInput, output: ChatMessageOutput) => Promise<void>;
//# sourceMappingURL=chat-message.d.ts.map