import type { TuiPlugin } from "@opencode-ai/plugin/tui";
/**
 * Creates a ModelFusion TUI plugin that registers the `/fusion` slash command
 * in the OpenCode terminal UI. The command lets users trigger multi-model
 * deliberation from the chat bar.
 *
 * @param api     - TUI plugin API for registering commands, UI elements, and
 *                 lifecycle hooks.
 * @param _options - Optional plugin configuration (currently unused).
 * @param _meta    - Plugin metadata.
 * @returns A `TuiPlugin` instance with registered commands and event handlers.
 *
 * @example
 * ```ts
 * import { FusionTuiPlugin } from "@modelfusion/plugin/tui";
 *
 * const tuiPlugin = await FusionTuiPlugin(api);
 * ```
 */
export declare const FusionTuiPlugin: TuiPlugin;
export declare const tui: TuiPlugin;
export default FusionTuiPlugin;
//# sourceMappingURL=index.d.ts.map