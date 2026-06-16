import { FusionConfigSchema, DEFAULT_FUSION_CONFIG, } from "../types/config.js";
import { RecursionGuard } from "./recursion-guard.js";
import { CostTracker } from "./cost-tracker.js";
import { runFusionPipeline } from "./pipeline.js";
import { createChatMessageHook } from "./hooks/chat-message.js";
import { createChatParamsHook } from "./hooks/chat-params.js";
import { createMessagesTransformHook } from "./hooks/messages-transform.js";
import { createSystemTransformHook } from "./hooks/system-transform.js";
import { createFusionTool } from "./hooks/tool-registration.js";
import { createToolExecuteBeforeHook, createToolExecuteAfterHook, } from "./hooks/tool-execute.js";
import { createEventHook } from "./hooks/event.js";
import { createCommandExecuteBeforeHook } from "./hooks/command-execute.js";
import { createConfigHook } from "./hooks/config.js";
// ---------------------------------------------------------------------------
// FusionPlugin — main plugin entry point
// ---------------------------------------------------------------------------
/**
 * Creates a ModelFusion plugin instance that enables multi-model deliberation
 * in OpenCode. When installed, the plugin registers the `fusion:deliberate`
 * tool and several lifecycle hooks that orchestrate panel discussions among
 * multiple AI models.
 *
 * @param ctx    - Plugin context provided by the OpenCode runtime.
 * @param options - Partial `FusionConfig` override. Invalid values fall back
 *                 to `DEFAULT_FUSION_CONFIG` with a console warning.
 * @returns A `Plugin` hooks object with chat, tool, and event handlers.
 *
 * @example
 * ```ts
 * import { FusionPlugin } from "@modelfusion/plugin/server";
 *
 * const plugin = await FusionPlugin(ctx, {
 *   panel: {
 *     models: [
 *       { providerId: "openai", modelId: "gpt-4o-mini" },
 *       { providerId: "anthropic", modelId: "claude-3-haiku" },
 *     ],
 *   },
 *   judge: { providerId: "openai", modelId: "gpt-4o" },
 *   triggering: "manual",
 * });
 * ```
 */
export const FusionPlugin = async (ctx, options) => {
    // Parse and validate config — fall back to defaults on invalid input
    let config;
    try {
        config = FusionConfigSchema.parse(options ?? DEFAULT_FUSION_CONFIG);
    }
    catch (err) {
        console.error("[fusion-plugin] Invalid config, using defaults:", err.message);
        config = DEFAULT_FUSION_CONFIG;
    }
    // Initialize core engine components
    const recursionGuard = new RecursionGuard();
    const costTracker = new CostTracker();
    // Build a shared plugin state used by multiple hook factories.
    // Extra properties beyond what a factory requires are benign thanks to
    // TypeScript structural typing — each factory destructures only what it needs.
    const pluginState = {
        config,
        recursionGuard,
        costTracker,
        pipeline: runFusionPipeline,
        client: ctx.client,
    };
    const originalModel = {
        providerId: config.judge.providerId,
        modelId: config.judge.modelId,
    };
    return {
        // -----------------------------------------------------------------------
        // config — publish host-visible fusion command definitions
        // -----------------------------------------------------------------------
        config: createConfigHook(),
        // -----------------------------------------------------------------------
        // chat.message — intercept incoming user messages to trigger fusion
        // -----------------------------------------------------------------------
        "chat.message": createChatMessageHook(pluginState),
        // -----------------------------------------------------------------------
        // chat.params — adjust temperature / max_tokens for panelist calls
        // -----------------------------------------------------------------------
        "chat.params": createChatParamsHook(pluginState),
        // -----------------------------------------------------------------------
        // experimental.chat.messages.transform — inject fusion results into history
        // -----------------------------------------------------------------------
        "experimental.chat.messages.transform": createMessagesTransformHook({
            fusionResult: undefined,
        }),
        // -----------------------------------------------------------------------
        // experimental.chat.system.transform — inject deliberation system prompt
        // -----------------------------------------------------------------------
        "experimental.chat.system.transform": createSystemTransformHook({ config }),
        // -----------------------------------------------------------------------
        // tool — register the fusion:deliberate tool backed by the pipeline
        // -----------------------------------------------------------------------
        tool: {
            "fusion:deliberate": createFusionTool({
                pipelineFn: runFusionPipeline,
                client: pluginState.client,
                config,
                recursionGuard,
                originalModel,
            }),
        },
        // -----------------------------------------------------------------------
        // tool.execute.before — guard against recursive deliberation calls
        // -----------------------------------------------------------------------
        "tool.execute.before": createToolExecuteBeforeHook(pluginState),
        // -----------------------------------------------------------------------
        // command.execute.before — make /fusion host-visible outside TUI-only paths
        // -----------------------------------------------------------------------
        "command.execute.before": createCommandExecuteBeforeHook(pluginState),
        // -----------------------------------------------------------------------
        // tool.execute.after — format fusion results / update cost tracker
        // -----------------------------------------------------------------------
        "tool.execute.after": createToolExecuteAfterHook(pluginState),
        // -----------------------------------------------------------------------
        // event — handle session lifecycle events
        // -----------------------------------------------------------------------
        event: createEventHook(pluginState),
    };
};
export const server = FusionPlugin;
export default {
    server,
};
//# sourceMappingURL=index.js.map