import type { FusionConfig } from "../../types/config.js";
import type { RecursionGuard } from "../recursion-guard.js";
import type { Model, UserMessage } from "@opencode-ai/sdk";
import type { ProviderContext } from "@opencode-ai/plugin";
export interface ChatParamsPluginState {
    config: FusionConfig;
    recursionGuard: RecursionGuard;
}
export interface ChatParamsInput {
    sessionID: string;
    agent: string;
    model: Model;
    provider: ProviderContext;
    message: UserMessage;
}
export interface ChatParamsOutput {
    temperature: number;
    topP: number;
    topK: number;
    maxOutputTokens: number | undefined;
    options: Record<string, unknown>;
}
/**
 * Creates a `chat.params` hook that adjusts LLM parameters when fusion is
 * active for a session.
 *
 * - Fusion active: sets temperature and maxOutputTokens from config.
 * - Fusion inactive: passes through unchanged (no modifications).
 */
export declare function createChatParamsHook(pluginState: ChatParamsPluginState): (input: ChatParamsInput, output: ChatParamsOutput) => Promise<void>;
//# sourceMappingURL=chat-params.d.ts.map