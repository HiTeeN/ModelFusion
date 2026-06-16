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
import { getDegradationMessage } from "../degradation.js";

// ---------------------------------------------------------------------------
// Plugin state passed to hook factories
// ---------------------------------------------------------------------------

export interface ToolExecutePluginState {
  recursionGuard: RecursionGuard;
  fusionResult?: FusionResult;
}

// ---------------------------------------------------------------------------
// Hook input/output types (matching OpenCode hook signatures)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// createToolExecuteBeforeHook
// ---------------------------------------------------------------------------

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
export function createToolExecuteBeforeHook(
  pluginState: ToolExecutePluginState,
): (input: ToolExecuteBeforeInput, output: ToolExecuteBeforeOutput) => Promise<void> {
  return async (
    input: ToolExecuteBeforeInput,
    output: ToolExecuteBeforeOutput,
  ): Promise<void> => {
    // Only intercept fusion:deliberate
    if (input.tool !== "fusion:deliberate") {
      return;
    }

    // Validate required args
    if (!output.args || typeof output.args.prompt !== "string" || !output.args.prompt.trim()) {
      throw new Error("fusion:deliberate requires a non-empty 'prompt' argument");
    }

    // Check recursion guard — block nested fusion
    if (pluginState.recursionGuard.isFusionActive(input.sessionID)) {
      throw new Error(
        "Fusion already running in this session — nested deliberation blocked",
      );
    }

    // Mark fusion active
    const activated = pluginState.recursionGuard.markFusionActive(input.sessionID);
    if (!activated) {
      throw new Error(
        "Failed to activate fusion — session may already have an active fusion call",
      );
    }
  };
}

// ---------------------------------------------------------------------------
// createToolExecuteAfterHook
// ---------------------------------------------------------------------------

/**
 * Creates a tool.execute.after hook that formats fusion:deliberate output.
 *
 * For fusion tools:
 *   - Formats output with analysis summary, final answer, cost, degradation notice
 *   - Marks fusion as complete
 *
 * For non-fusion tools: passes through unchanged.
 */
export function createToolExecuteAfterHook(
  pluginState: ToolExecutePluginState,
): (input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput) => Promise<void> {
  return async (
    input: ToolExecuteAfterInput,
    output: ToolExecuteAfterOutput,
  ): Promise<void> => {
    // Only intercept fusion:deliberate
    if (input.tool !== "fusion:deliberate") {
      return;
    }

    // Mark fusion complete regardless of result
    pluginState.recursionGuard.markFusionComplete(input.sessionID);

    // If no fusion result available, leave output as-is
    if (!pluginState.fusionResult) {
      return;
    }

    const result = pluginState.fusionResult;

    // Build formatted output sections
    const sections: string[] = [];

    // --- Analysis Summary ---
    if (result.analysis) {
      sections.push("## Analysis Summary");
      if (result.analysis.consensus && result.analysis.consensus.length > 0) {
        sections.push("### Consensus Points");
        for (const cp of result.analysis.consensus) {
          const models = cp.supportingModels.join(", ");
          sections.push(`- **${cp.point}** (supported by: ${models})`);
        }
      }
      if (result.analysis.contradictions && result.analysis.contradictions.length > 0) {
        sections.push("### Contradictions");
        for (const c of result.analysis.contradictions) {
          sections.push(`- **${c.topic}**:`);
          for (const s of c.stances) {
            sections.push(`  - ${s.modelId}: ${s.stance}`);
          }
        }
      }
      if (result.analysis.blind_spots && result.analysis.blind_spots.length > 0) {
        sections.push("### Blind Spots");
        for (const bs of result.analysis.blind_spots) {
          sections.push(`- ${bs}`);
        }
      }
      if (result.analysis.unique_insights && result.analysis.unique_insights.length > 0) {
        sections.push("### Unique Insights");
        for (const ui of result.analysis.unique_insights) {
          sections.push(`- **${ui.modelId}**: ${ui.insight}`);
        }
      }
      if (result.analysis.winner) {
        sections.push(`### Winner: ${result.analysis.winner}`);
      }
    }

    // --- Final Answer ---
    if (result.synthesizedAnswer) {
      sections.push("## Final Answer");
      sections.push(result.synthesizedAnswer);
    }

    // --- Cost ---
    sections.push("## Cost");
    sections.push(
      `- Prompt tokens: ${result.cost.totalPromptTokens.toLocaleString()}`,
    );
    sections.push(
      `- Completion tokens: ${result.cost.totalCompletionTokens.toLocaleString()}`,
    );
    sections.push(
      `- Estimated cost: $${result.cost.estimatedCost.toFixed(4)}`,
    );

    // --- Degradation Notice ---
    const degradationMsg = getDegradationMessage(result);
    if (degradationMsg) {
      sections.push("## Degradation Notice");
      sections.push(degradationMsg);
    }

    // --- Failed Models ---
    if (result.failedModels && result.failedModels.length > 0) {
      sections.push("## Failed Models");
      for (const fm of result.failedModels) {
        sections.push(`- **${fm.modelId}**: ${fm.reason}`);
      }
    }

    // Set formatted output
    output.output = sections.join("\n\n");
    output.title = `Fusion: ${result.status.toUpperCase()}`;
    output.metadata = {
      ...output.metadata,
      fusionStatus: result.status,
      fusionCost: result.cost,
      panelCount: result.responses.length,
      hasAnalysis: result.analysis !== undefined,
      hasSynthesis: result.synthesizedAnswer !== undefined,
    };
  };
}
