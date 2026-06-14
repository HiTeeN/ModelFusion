import type { FusionConfig } from "../types/config";
import type {
  FusionResult,
  PanelResult,
  JudgeOutput,
  FailedModel,
} from "../types/results";
import { fanOut, type OrchestratorClient } from "./orchestrator";
import { runJudge, type JudgeClient } from "./judge";
import { synthesize, type SynthesizerClient, type OriginalModel } from "./synthesizer";
import { CostTracker } from "./cost-tracker";
import { RecursionGuard } from "./recursion-guard";

// ---------------------------------------------------------------------------
// Pipeline client — loosely typed, compatible with all sub-modules
// ---------------------------------------------------------------------------

export interface PipelineClient {
  session: {
    prompt: (path: string, body: Record<string, unknown>) => Promise<unknown>;
  };
}

// ---------------------------------------------------------------------------
// runFusionPipeline — orchestrates the full fusion pipeline
// ---------------------------------------------------------------------------

/**
 * Runs the complete fusion pipeline:
 *   validate → fan-out → judge → synthesize
 *
 * Flow:
 *   1. Check RecursionGuard — block nested fusion calls
 *   2. fanOut to all panel models concurrently
 *   3. If any panelists succeeded → runJudge
 *   4. If judge succeeded → synthesize final answer
 *   5. If judge returned null → degraded (raw responses, no analysis)
 *   6. If all panelists failed → error with failureReason
 *
 * Cost is accumulated across all stages via CostTracker.
 */
export async function runFusionPipeline(
  client: PipelineClient,
  sessionID: string,
  prompt: string,
  config: FusionConfig,
  originalModel: OriginalModel,
  recursionGuard: RecursionGuard,
): Promise<FusionResult> {
  // -----------------------------------------------------------------------
  // Step 1: Recursion guard — block nested fusion calls
  // -----------------------------------------------------------------------
  if (recursionGuard.isFusionActive(sessionID)) {
    return {
      status: "error",
      responses: [],
      cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
      failureReason: "fusion_invocation_capped",
    };
  }

  // -----------------------------------------------------------------------
  // Step 2: Mark fusion active
  // -----------------------------------------------------------------------
  recursionGuard.markFusionActive(sessionID);

  const costTracker = new CostTracker();

  try {
    // ---------------------------------------------------------------------
    // Step 3: fanOut — parallel panelist execution
    // ---------------------------------------------------------------------
    const panelResults = await fanOut(
      client as unknown as OrchestratorClient,
      sessionID,
      prompt,
      config.panel.models,
      config,
    );

    // Track panelist costs from returned token counts
    for (const r of panelResults) {
      if (!r.error) {
        costTracker.trackPanelist(
          r.modelId,
          r.tokenCount.prompt,
          r.tokenCount.completion,
        );
      }
    }

    // Split results
    const successful = panelResults.filter((r) => !r.error);
    const failed = panelResults.filter((r) => r.error);

    // ---------------------------------------------------------------------
    // Step 7 (early): All panelists failed → error
    // ---------------------------------------------------------------------
    if (successful.length === 0) {
      recursionGuard.markFusionComplete(sessionID);

      const failedModels: FailedModel[] = failed.map((r) => ({
        modelId: r.modelId,
        reason: r.error!,
      }));

      const summary = costTracker.getSummary();

      return {
        status: "error",
        responses: panelResults,
        failedModels,
        cost: {
          totalPromptTokens: summary.totals.prompt,
          totalCompletionTokens: summary.totals.completion,
          estimatedCost: summary.estimatedCost,
        },
         failureReason: "all_panels_failed",
      };
    }

    // ---------------------------------------------------------------------
    // Step 4: Any panelists succeeded → run judge
    // ---------------------------------------------------------------------
    const judgeOutput = await runJudge(
      client as unknown as JudgeClient,
      sessionID,
      panelResults,
      config,
    );

    // Track judge cost (token counts not exposed by runJudge return type)
    costTracker.trackJudge(0, 0);

    // ---------------------------------------------------------------------
    // Step 6: Judge returned null → degraded
    // ---------------------------------------------------------------------
    if (judgeOutput === null) {
      recursionGuard.markFusionComplete(sessionID);

      const failedModels: FailedModel[] | undefined =
        failed.length > 0
          ? failed.map((r) => ({ modelId: r.modelId, reason: r.error! }))
          : undefined;

      const summary = costTracker.getSummary();

      return {
        status: "degraded",
        responses: panelResults,
        failedModels,
        cost: {
          totalPromptTokens: summary.totals.prompt,
          totalCompletionTokens: summary.totals.completion,
          estimatedCost: summary.estimatedCost,
        },
      };
    }

    // ---------------------------------------------------------------------
    // Step 5: Judge succeeded → synthesize final answer
    // ---------------------------------------------------------------------
    const synthesizedAnswer = await synthesize(
      client as unknown as SynthesizerClient,
      sessionID,
      judgeOutput,
      panelResults,
      config,
      originalModel,
    );

    // Track synthesis cost
    costTracker.trackSynthesis(0, 0);

    // ---------------------------------------------------------------------
    // Step 8: Mark fusion complete
    // ---------------------------------------------------------------------
    recursionGuard.markFusionComplete(sessionID);

    // ---------------------------------------------------------------------
    // Step 9: Build FusionResult (happy path)
    // ---------------------------------------------------------------------
    const summary = costTracker.getSummary();

    const failedModels: FailedModel[] | undefined =
      failed.length > 0
        ? failed.map((r) => ({ modelId: r.modelId, reason: r.error! }))
        : undefined;

    return {
      status: "ok",
      analysis: judgeOutput,
      responses: panelResults,
      failedModels,
      synthesizedAnswer,
      cost: {
        totalPromptTokens: summary.totals.prompt,
        totalCompletionTokens: summary.totals.completion,
        estimatedCost: summary.estimatedCost,
      },
    };
  } catch (err: unknown) {
    // Unexpected error in pipeline orchestration itself
    // (fanOut/runJudge/synthesize handle their own errors internally,
    //  so this catch is for truly unexpected failures)
    recursionGuard.markFusionComplete(sessionID);

    const summary = costTracker.getSummary();

    return {
      status: "error",
      responses: [],
      cost: {
        totalPromptTokens: summary.totals.prompt,
        totalCompletionTokens: summary.totals.completion,
        estimatedCost: summary.estimatedCost,
      },
      failureReason:
        err instanceof Error ? err.message : String(err),
    };
  }
}
