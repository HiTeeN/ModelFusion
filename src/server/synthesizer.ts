import type { JudgeOutput, PanelResult } from "../types/results.js";
import type { FusionConfig } from "../types/config.js";

// ---------------------------------------------------------------------------
// Client interface (loosely typed — matches opencode SDK session.prompt)
// ---------------------------------------------------------------------------

export interface SynthesizerClient {
  session: {
    prompt: (params: {
      sessionID: string;
      model: { providerID: string; modelID: string };
      parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
    }) => Promise<{
      info: { tokens: { input: number; output: number } };
      parts: Array<{ type: string; text?: string }>;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Original model reference (the session's model, NOT the judge model)
// ---------------------------------------------------------------------------

export interface OriginalModel {
  providerId: string;
  modelId: string;
}

// ---------------------------------------------------------------------------
// synthesize — produce a final answer from judge analysis
// ---------------------------------------------------------------------------

export async function synthesize(
  client: SynthesizerClient,
  sessionID: string,
  judgeOutput: JudgeOutput,
  panelResults: PanelResult[],
  config: FusionConfig,
  originalModel: OriginalModel,
): Promise<string> {
  const prompt = buildSynthesisPrompt(judgeOutput, panelResults);

  const response = await client.session.prompt({
    sessionID,
    model: {
      providerID: originalModel.providerId,
      modelID: originalModel.modelId,
    },
    parts: [{ type: "text", text: prompt }],
  });

  return (
    response.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text!)
      .join("") ?? ""
  );
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildSynthesisPrompt(
  judgeOutput: JudgeOutput,
  panelResults: PanelResult[],
): string {
  const judgeJson = JSON.stringify(judgeOutput, null, 2);

  const panelSummary = panelResults
    .map(
      (r) =>
        `### ${r.providerId}/${r.modelId}\n${r.content}`,
    )
    .join("\n\n");

  return [
    "You have received structured analysis from a judge comparing multiple AI model responses to the same prompt.",
    "",
    "## Judge Analysis",
    "```json",
    judgeJson,
    "```",
    "",
    "## Original Model Responses",
    panelSummary,
    "",
    "## Instructions",
    "Write a comprehensive final answer that incorporates the consensus, addresses contradictions, highlights unique insights, and acknowledges blind spots.",
    "Attribute claims to specific models where relevant (e.g., 'Claude noted that...', 'GPT-4o uniquely observed...').",
    "Synthesize the best elements from all responses into a single coherent answer.",
    "If the judge identified a winner, give appropriate weight to that model's response.",
    "Do not simply repeat the judge's analysis — produce a polished final answer for the end user.",
  ].join("\n");
}
