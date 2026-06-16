import type { FusionConfig } from "../types/config.js";
import type {
  FusionResult,
  PanelResult,
  JudgeOutput,
  FailedModel,
} from "../types/results.js";
import { fanOut, type OrchestratorClient } from "./orchestrator.js";
import { runJudge, type JudgeClient } from "./judge.js";
import { synthesize, type SynthesizerClient, type OriginalModel } from "./synthesizer.js";
import { CostTracker } from "./cost-tracker.js";
import { RecursionGuard } from "./recursion-guard.js";
import { emitFusionProgress } from "../progress-bus.js";

// ---------------------------------------------------------------------------
// Pipeline client — loosely typed, compatible with all sub-modules
// ---------------------------------------------------------------------------

export interface PipelineClient {
  session: {
    prompt: (params: {
      sessionID: string;
      model: { providerID: string; modelID: string };
      parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
      format?: { type: string; schema?: unknown };
      system?: string;
    }) => Promise<unknown>;
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
    emitFusionProgress({
      sessionID,
      stage: "fan-out",
      detail: `Querying ${config.panel.models.length} panel models...`,
    });

    const panelResults = await fanOut(
      client as unknown as OrchestratorClient,
      sessionID,
      prompt,
      config.panel.models,
      config,
      {
        onPanelistDone: (result) => {
          const status = result.error ? "failed" : "completed";
          emitFusionProgress({
            sessionID,
            stage: "panelist",
            detail: `${result.providerId}/${result.modelId} ${status}.`,
          });
        },
      },
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

      emitFusionProgress({
        sessionID,
        stage: "error",
        detail: "All panel models failed.",
      });

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
    emitFusionProgress({
      sessionID,
      stage: "judging",
      detail: `Evaluating ${successful.length} panel responses...`,
    });

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

      emitFusionProgress({
        sessionID,
        stage: "degraded",
        detail: "Judge failed — showing panel responses without synthesis.",
      });

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
    emitFusionProgress({
      sessionID,
      stage: "synthesis",
      detail: "Synthesizing the final answer...",
    });

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

    emitFusionProgress({
      sessionID,
      stage: "complete",
      detail: `Fusion complete. Estimated cost: $${summary.estimatedCost.toFixed(4)}`,
    });

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

    emitFusionProgress({
      sessionID,
      stage: "error",
      detail: err instanceof Error ? err.message : String(err),
    });

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
