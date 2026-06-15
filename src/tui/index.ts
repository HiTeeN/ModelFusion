import type { PluginOptions } from "@opencode-ai/plugin";
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginMeta,
} from "@opencode-ai/plugin/tui";
import { registerTuiCommands } from "./command-registration";
import { createFusionCommand } from "./commands";
import { createConfigUI } from "./config";

// ---------------------------------------------------------------------------
// FusionTuiPlugin — TUI plugin entry point
// ---------------------------------------------------------------------------

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
export const FusionTuiPlugin: TuiPlugin = async (
  api: TuiPluginApi,
  _options: PluginOptions | undefined,
  _meta: TuiPluginMeta,
) => {
  // -------------------------------------------------------------------------
  // State persistence via api.kv
  // -------------------------------------------------------------------------
  const KV_NAMESPACE = "fusion";
  const kv = api.kv;

  // Initialize plugin state if not already present
  if (!kv.get(`${KV_NAMESPACE}.initialized`)) {
    kv.set(`${KV_NAMESPACE}.initialized`, true);
    kv.set(`${KV_NAMESPACE}.version`, "0.1.0");
  }

  // -------------------------------------------------------------------------
  // Register /fusion slash command
  // -------------------------------------------------------------------------
  registerTuiCommands(api, [createFusionCommand(api)]);

  createConfigUI(api);

  // -------------------------------------------------------------------------
  // Subscribe to lifecycle events
  // -------------------------------------------------------------------------
  const unsubSessionCreated = api.event.on("session.created", (_event) => {
    // Track session count in kv
    const count = (kv.get(`${KV_NAMESPACE}.sessionCount`, 0) as number) + 1;
    kv.set(`${KV_NAMESPACE}.sessionCount`, count);
  });

  const unsubSessionDeleted = api.event.on("session.deleted", (_event) => {
    // Clean up per-session state if needed
    // TODO: Task 23-25 — wire up actual cleanup
  });

  // Register cleanup on plugin dispose
  api.lifecycle.onDispose(() => {
    unsubSessionCreated();
    unsubSessionDeleted();
  });
};

export const tui = FusionTuiPlugin;

export default {
  tui,
};
