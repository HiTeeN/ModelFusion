import type { FusionResult } from "../../types/results.js";
import type { Message, Part } from "@opencode-ai/sdk";
export interface MessagesTransformPluginState {
    /** The fusion result to inject. undefined/null → passthrough. */
    fusionResult?: FusionResult;
}
/**
 * Creates an `experimental.chat.messages.transform` hook that injects fusion
 * results into the message history.
 *
 * - When `pluginState.fusionResult` is present: appends an analysis summary
 *   as a system message and the synthesized answer as an assistant message.
 *   Original messages are preserved.
 * - When `pluginState.fusionResult` is null/undefined: messages pass through
 *   unchanged.
 */
export declare function createMessagesTransformHook(pluginState: MessagesTransformPluginState): (input: {}, output: {
    messages: {
        info: Message;
        parts: Part[];
    }[];
}) => Promise<void>;
//# sourceMappingURL=messages-transform.d.ts.map