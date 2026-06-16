import type { Plugin } from "@opencode-ai/plugin";
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
export declare const FusionPlugin: Plugin;
export declare const server: Plugin;
declare const _default: {
    server: Plugin;
};
export default _default;
//# sourceMappingURL=index.d.ts.map