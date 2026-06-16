// ---------------------------------------------------------------------------
// messages-transform.ts — injects fusion results into the message history.
// When a FusionResult is present, appends an analysis summary (system role)
// and the synthesized final answer (assistant role) to the message list.
// When no FusionResult exists, messages pass through unchanged.
// ---------------------------------------------------------------------------

import type { FusionResult, JudgeOutput } from "../../types/results.js";
import type { Message, Part } from "@opencode-ai/sdk";

// ---------------------------------------------------------------------------
// PluginState
// ---------------------------------------------------------------------------

export interface MessagesTransformPluginState {
  /** The fusion result to inject. undefined/null → passthrough. */
  fusionResult?: FusionResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a human-readable analysis summary from the judge output.
 * Formats consensus, contradictions, unique insights, blind spots,
 * scoring, and winner into a structured markdown block.
 */
function buildAnalysisSummary(result: FusionResult): string {
  const analysis = result.analysis;
  if (!analysis) {
    return "Fusion panel completed but no judge analysis is available.";
  }

  const lines: string[] = ["## Fusion Panel Analysis"];

  // Consensus points
  if (analysis.consensus.length > 0) {
    lines.push("", "### Consensus Points");
    for (const cp of analysis.consensus) {
      const models = cp.supportingModels.length > 0
        ? ` (supported by: ${cp.supportingModels.join(", ")})`
        : "";
      lines.push(`- ${cp.point}${models}`);
    }
  }

  // Contradictions
  if (analysis.contradictions.length > 0) {
    lines.push("", "### Contradictions");
    for (const c of analysis.contradictions) {
      lines.push(`- **${c.topic}**`);
      for (const s of c.stances) {
        lines.push(`  - ${s.modelId}: ${s.stance}`);
      }
    }
  }

  // Unique insights
  if (analysis.unique_insights.length > 0) {
    lines.push("", "### Unique Insights");
    for (const ui of analysis.unique_insights) {
      lines.push(`- **${ui.modelId}**: ${ui.insight}`);
    }
  }

  // Blind spots
  if (analysis.blind_spots.length > 0) {
    lines.push("", "### Blind Spots");
    for (const bs of analysis.blind_spots) {
      lines.push(`- ${bs}`);
    }
  }

  // Scoring summary
  if (analysis.scoring.length > 0) {
    lines.push("", "### Model Scoring");
    for (const s of analysis.scoring) {
      lines.push(
        `- **${s.modelId}**: total ${s.total}/40 ` +
        `(completeness: ${s.scores.completeness}, accuracy: ${s.scores.accuracy}, ` +
        `novelty: ${s.scores.novelty}, clarity: ${s.scores.clarity})`,
      );
    }
  }

  // Winner
  if (analysis.winner) {
    lines.push("", `### Winner: **${analysis.winner}**`);
  }

  // Partial coverage
  if (analysis.partial_coverage.length > 0) {
    lines.push("", "### Partial Coverage");
    for (const pc of analysis.partial_coverage) {
      const models = pc.models.length > 0
        ? ` (covered by: ${pc.models.join(", ")})`
        : "";
      lines.push(`- ${pc.point}${models}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build a minimal Message object with the given role and text content.
 * Uses type assertion since the SDK Message type is UserMessage | AssistantMessage
 * but the runtime accepts system-role messages for injection.
 */
function buildMessage(
  role: "system" | "assistant",
  text: string,
  result: FusionResult,
): { info: Message; parts: Part[] } {
  const base = {
    id: `fusion-${role}-${Date.now()}`,
    sessionID: "",
    role,
    time: { created: Date.now() },
  };

  const info: Message =
    role === "assistant"
      ? ({
          ...base,
          parentID: "",
          modelID: "",
          providerID: "",
          mode: "fusion",
          path: { cwd: "", root: "" },
          cost: result.cost.estimatedCost,
          tokens: {
            input: result.cost.totalPromptTokens,
            output: result.cost.totalCompletionTokens,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        } as Message)
      : (base as Message);

  const parts: Part[] = [{ type: "text", text } as Part];

  return { info, parts };
}

// ---------------------------------------------------------------------------
// createMessagesTransformHook
// ---------------------------------------------------------------------------

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
export function createMessagesTransformHook(
  pluginState: MessagesTransformPluginState,
): (
  input: {},
  output: { messages: { info: Message; parts: Part[] }[] },
) => Promise<void> {
  return async (_input, output) => {
    const { fusionResult } = pluginState;

    // Fusion inactive — pass through unchanged
    if (!fusionResult) {
      return;
    }

    // Build analysis summary from judge output
    const analysisText = buildAnalysisSummary(fusionResult);

    // Build final answer text
    const answerText =
      fusionResult.synthesizedAnswer ??
      "Fusion completed but no synthesized answer was produced.";

    // Inject: preserve original messages, append analysis + answer
    output.messages.push(
      buildMessage("system", analysisText, fusionResult),
      buildMessage("assistant", answerText, fusionResult),
    );
  };
}
