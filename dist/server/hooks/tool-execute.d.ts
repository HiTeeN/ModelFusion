/**
 * Tool execution hooks for fusion orchestration.
 *
 * Intercepts tool.execute.before and tool.execute.after to:
 * - Validate fusion tool args and enforce recursion guard (before)
 * - Format fusion output with analysis, answer, cost, degradation (after)
 * - Pass through non-fusion tools unchanged
 */
import type { RecursionGuard } from "../recursion-guard.js";
import type { FusionResult } from "../../types/results.js";
export interface ToolExecutePluginState {
    recursionGuard: RecursionGuard;
    fusionResult?: FusionResult;
}
export interface ToolExecuteBeforeInput {
    tool: string;
    sessionID: string;
    callID: string;
}
export interface ToolExecuteBeforeOutput {
    args: any;
}
export interface ToolExecuteAfterInput {
    tool: string;
    sessionID: string;
    callID: string;
    args: any;
}
export interface ToolExecuteAfterOutput {
    title: string;
    output: string;
    metadata: any;
}
/**
 * Creates a tool.execute.before hook that intercepts fusion:deliberate calls.
 *
 * For fusion tools:
 *   - Validates that required args are present
 *   - Checks RecursionGuard to prevent nested fusion
 *   - Marks fusion as active if not already running
 *
 * For non-fusion tools: passes through unchanged.
 */
export declare function createToolExecuteBeforeHook(pluginState: ToolExecutePluginState): (input: ToolExecuteBeforeInput, output: ToolExecuteBeforeOutput) => Promise<void>;
/**
 * Creates a tool.execute.after hook that formats fusion:deliberate output.
 *
 * For fusion tools:
 *   - Formats output with analysis summary, final answer, cost, degradation notice
 *   - Marks fusion as complete
 *
 * For non-fusion tools: passes through unchanged.
 */
export declare function createToolExecuteAfterHook(pluginState: ToolExecutePluginState): (input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput) => Promise<void>;
//# sourceMappingURL=tool-execute.d.ts.map