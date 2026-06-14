// ---------------------------------------------------------------------------
// tool-registration.ts — registers the fusion:deliberate custom tool
// ---------------------------------------------------------------------------

import { z } from "zod";
import type { runFusionPipeline } from "../pipeline";

// ---------------------------------------------------------------------------
// ToolDefinition — shape expected by the plugin system
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  description: string;
  args: Record<string, z.ZodType>;
  execute: (args: Record<string, unknown>, ctx: unknown) => Promise<string>;
}

// ---------------------------------------------------------------------------
// createFusionTool — factory that returns a ToolDefinition backed by the
// full fusion pipeline (fan-out → judge → synthesize).
// ---------------------------------------------------------------------------

export function createFusionTool(
  pipelineFn: typeof runFusionPipeline,
): ToolDefinition {
  return {
    description:
      "Invoke multi-model deliberation. A panel of models answers your " +
      "prompt in parallel, a judge compares their responses and returns " +
      "structured analysis (consensus, contradictions, unique insights, " +
      "blind spots, scoring). Use for complex questions where multiple " +
      "perspectives add value.",
    args: {
      prompt: z
        .string()
        .describe("The question or task for the panel to analyze"),
    },
    async execute(args, ctx) {
      const { prompt } = args as { prompt: string };
      const result = await pipelineFn(
        (ctx as Record<string, unknown>)?.client as Parameters<
          typeof runFusionPipeline
        >[0],
        (ctx as Record<string, unknown>)?.sessionID as string,
        prompt,
        (ctx as Record<string, unknown>)?.config as Parameters<
          typeof runFusionPipeline
        >[3],
        (ctx as Record<string, unknown>)?.originalModel as Parameters<
          typeof runFusionPipeline
        >[4],
        (ctx as Record<string, unknown>)?.recursionGuard as Parameters<
          typeof runFusionPipeline
        >[5],
      );
      return JSON.stringify(result);
    },
  };
}
