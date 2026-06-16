import type { TuiPluginApi, TuiCommand } from "@opencode-ai/plugin/tui";
/**
 * Creates the `/fusion` slash command that triggers the multi-model
 * deliberation pipeline. The command extracts the user's question,
 * shows progress toasts at each pipeline stage, and delegates the
 * actual fusion execution to the server plugin.
 *
 * Flow:
 *   1. User types `/fusion <question>` in the TUI prompt
 *   2. onSelect() fires → extract question from dialog prompt
 *   3. Subscribe to real pipeline progress events
 *   4. Delegate to server plugin (async, non-blocking)
 *   5. Server plugin runs: fan-out → judge → synthesize
 *   6. Progress toasts fire from real stage events
 *   7. Final result toast displayed
 */
export declare function createFusionCommand(api: TuiPluginApi): TuiCommand;
//# sourceMappingURL=commands.d.ts.map