import { describe, expect, test, mock } from "bun:test";
import type { FusionConfig, PanelModel } from "../types/config";
import type { PanelResult, JudgeOutput, FusionResult } from "../types/results";
import { RecursionGuard } from "./recursion-guard";
import type { OriginalModel } from "./synthesizer";

// ---------------------------------------------------------------------------
// Mock modules — replace all sub-module imports used by pipeline.ts
// ---------------------------------------------------------------------------

const mockFanOut = mock();
const mockRunJudge = mock();
const mockSynthesize = mock();

mock.module("./orchestrator", () => ({
  fanOut: mockFanOut,
}));

mock.module("./judge", () => ({
  runJudge: mockRunJudge,
}));

mock.module("./synthesizer", () => ({
  synthesize: mockSynthesize,
}));

// CostTracker mock — pipeline does `new CostTracker()` internally
const trackerInstance = {
  trackPanelist: mock(() => {}),
  trackJudge: mock(() => {}),
  trackSynthesis: mock(() => {}),
  getSummary: mock(() => ({
    perModel: {},
    judge: { prompt: 0, completion: 0, estimatedCost: 0 },
    synthesis: { prompt: 0, completion: 0, estimatedCost: 0 },
    totals: { prompt: 0, completion: 0 },
    estimatedCost: 0,
  })),
};

function MockCostTracker() {
  return trackerInstance;
}

mock.module("./cost-tracker", () => ({
  CostTracker: MockCostTracker,
  estimateCost: mock(() => 0),
}));

// ---------------------------------------------------------------------------
// Import pipeline AFTER mocks are registered
// ---------------------------------------------------------------------------

import { runFusionPipeline, type PipelineClient } from "./pipeline";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SESSION_ID = "ses_test123";
const TEST_PROMPT = "What is the meaning of life?";

const defaultConfig: FusionConfig = {
  panel: {
    models: [
      { providerId: "openai", modelId: "gpt-4o-mini" },
      { providerId: "anthropic", modelId: "claude-3-haiku" },
      { providerId: "google", modelId: "gemini-1.5-flash" },
    ],
    maxModels: 8,
  },
  judge: { providerId: "openai", modelId: "gpt-4o" },
  triggering: "manual",
  maxToolCalls: 8,
  temperature: 0.7,
  enabled: true,
};

const originalModel: OriginalModel = {
  providerId: "openai",
  modelId: "gpt-4o",
};

const dummyClient: PipelineClient = {
  session: {
    prompt: async () => ({}),
  },
};

function successPanelResult(
  providerId: string,
  modelId: string,
  content: string,
): PanelResult {
  return {
    providerId,
    modelId,
    content,
    tokenCount: { prompt: 10, completion: 20 },
    latencyMs: 100,
  };
}

function errorPanelResult(
  providerId: string,
  modelId: string,
  error: string,
): PanelResult {
  return {
    providerId,
    modelId,
    content: "",
    tokenCount: { prompt: 0, completion: 0 },
    latencyMs: 50,
    error,
  };
}

const validJudgeOutput: JudgeOutput = {
  consensus: [
    { point: "Life has subjective meaning", supportingModels: ["gpt-4o-mini", "claude-3-haiku"] },
  ],
  contradictions: [],
  partial_coverage: [],
  unique_insights: [
    { modelId: "claude-3-haiku", insight: "Referenced existentialist philosophy" },
  ],
  blind_spots: ["quantitative measurement of meaning"],
  scoring: [
    {
      modelId: "gpt-4o-mini",
      scores: { completeness: 8, accuracy: 7, novelty: 6, clarity: 9 },
      total: 30,
    },
    {
      modelId: "claude-3-haiku",
      scores: { completeness: 9, accuracy: 8, novelty: 8, clarity: 8 },
      total: 33,
    },
    {
      modelId: "gemini-1.5-flash",
      scores: { completeness: 7, accuracy: 7, novelty: 5, clarity: 7 },
      total: 26,
    },
  ],
  winner: "claude-3-haiku",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshGuard(): RecursionGuard {
  return new RecursionGuard();
}

function resetMocks(): void {
  mockFanOut.mockClear();
  mockRunJudge.mockClear();
  mockSynthesize.mockClear();
  trackerInstance.trackPanelist.mockClear();
  trackerInstance.trackJudge.mockClear();
  trackerInstance.trackSynthesis.mockClear();
  trackerInstance.getSummary.mockClear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runFusionPipeline", () => {
  // -----------------------------------------------------------------------
  // Test 1: Happy path — all panelists succeed, judge succeeds, synthesis succeeds
  // -----------------------------------------------------------------------
  test("happy path: all stages succeed → status ok with analysis and synthesizedAnswer", async () => {
    // GIVEN all sub-modules return success
    resetMocks();

    const panelResults: PanelResult[] = [
      successPanelResult("openai", "gpt-4o-mini", "Life is 42."),
      successPanelResult("anthropic", "claude-3-haiku", "42 is the answer."),
      successPanelResult("google", "gemini-1.5-flash", "The answer is 42."),
    ];

    mockFanOut.mockResolvedValue(panelResults);
    mockRunJudge.mockResolvedValue(validJudgeOutput);
    mockSynthesize.mockResolvedValue("Synthesized: Life's meaning is subjective yet universally sought.");

    const guard = freshGuard();

    // WHEN runFusionPipeline is called
    const result = await runFusionPipeline(
      dummyClient,
      SESSION_ID,
      TEST_PROMPT,
      defaultConfig,
      originalModel,
      guard,
    );

    // THEN status is "ok"
    expect(result.status).toBe("ok");

    // THEN analysis (judge output) is present
    expect(result.analysis).toBeDefined();
    expect(result.analysis!.consensus).toHaveLength(1);
    expect(result.analysis!.winner).toBe("claude-3-haiku");

    // THEN synthesizedAnswer is present
    expect(result.synthesizedAnswer).toBeDefined();
    expect(result.synthesizedAnswer).toContain("Synthesized");

    // THEN responses contain all 3 panel results
    expect(result.responses).toHaveLength(3);

    // THEN no failedModels (all succeeded)
    expect(result.failedModels).toBeUndefined();

    // THEN cost is populated
    expect(result.cost).toBeDefined();
    expect(result.cost.totalPromptTokens).toBeGreaterThanOrEqual(0);

    // THEN recursion guard is cleaned up (fusion no longer active)
    expect(guard.isFusionActive(SESSION_ID)).toBe(false);

    // THEN fanOut was called with correct args
    expect(mockFanOut).toHaveBeenCalledTimes(1);
    const fanOutCall = mockFanOut.mock.calls[0];
    expect(fanOutCall[1]).toBe(SESSION_ID); // sessionID
    expect(fanOutCall[2]).toBe(TEST_PROMPT); // prompt

    // THEN runJudge was called
    expect(mockRunJudge).toHaveBeenCalledTimes(1);

    // THEN synthesize was called
    expect(mockSynthesize).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Test 2: Judge fails → degraded with raw responses, no analysis
  // -----------------------------------------------------------------------
  test("judge returns null → status degraded, responses present, analysis absent", async () => {
    // GIVEN panelists succeed but judge returns null
    resetMocks();

    const panelResults: PanelResult[] = [
      successPanelResult("openai", "gpt-4o-mini", "Answer A"),
      successPanelResult("anthropic", "claude-3-haiku", "Answer B"),
      successPanelResult("google", "gemini-1.5-flash", "Answer C"),
    ];

    mockFanOut.mockResolvedValue(panelResults);
    mockRunJudge.mockResolvedValue(null);
    // synthesize should NOT be called

    const guard = freshGuard();

    // WHEN runFusionPipeline is called
    const result = await runFusionPipeline(
      dummyClient,
      SESSION_ID,
      TEST_PROMPT,
      defaultConfig,
      originalModel,
      guard,
    );

    // THEN status is "degraded"
    expect(result.status).toBe("degraded");

    // THEN responses contain all panel results
    expect(result.responses).toHaveLength(3);
    for (const r of result.responses) {
      expect(r.content).toBeTruthy();
    }

    // THEN analysis is absent
    expect(result.analysis).toBeUndefined();

    // THEN synthesizedAnswer is absent
    expect(result.synthesizedAnswer).toBeUndefined();

    // THEN synthesize was NOT called (judge failed, skip synthesis)
    expect(mockSynthesize).toHaveBeenCalledTimes(0);

    // THEN recursion guard is cleaned up
    expect(guard.isFusionActive(SESSION_ID)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Test 3: All panelists fail → error with failure_reason
  // -----------------------------------------------------------------------
  test("all panelists fail → status error, failure_reason all_panels_failed", async () => {
    // GIVEN all panelists return errors
    resetMocks();

    const panelResults: PanelResult[] = [
      errorPanelResult("openai", "gpt-4o-mini", "API timeout"),
      errorPanelResult("anthropic", "claude-3-haiku", "Rate limited"),
      errorPanelResult("google", "gemini-1.5-flash", "Model unavailable"),
    ];

    mockFanOut.mockResolvedValue(panelResults);
    // runJudge and synthesize should NOT be called

    const guard = freshGuard();

    // WHEN runFusionPipeline is called
    const result = await runFusionPipeline(
      dummyClient,
      SESSION_ID,
      TEST_PROMPT,
      defaultConfig,
      originalModel,
      guard,
    );

    // THEN status is "error"
    expect(result.status).toBe("error");

    // THEN failureReason is "all_panels_failed"
    expect(result.failureReason).toBe("all_panels_failed");

    // THEN responses contain all error results
    expect(result.responses).toHaveLength(3);
    for (const r of result.responses) {
      expect(r.error).toBeDefined();
    }

    // THEN failedModels lists all failures with reasons
    expect(result.failedModels).toBeDefined();
    expect(result.failedModels).toHaveLength(3);
    expect(result.failedModels![0].modelId).toBe("gpt-4o-mini");
    expect(result.failedModels![0].reason).toBe("API timeout");

    // THEN analysis and synthesizedAnswer are absent
    expect(result.analysis).toBeUndefined();
    expect(result.synthesizedAnswer).toBeUndefined();

    // THEN judge and synthesize were NOT called
    expect(mockRunJudge).toHaveBeenCalledTimes(0);
    expect(mockSynthesize).toHaveBeenCalledTimes(0);

    // THEN recursion guard is cleaned up
    expect(guard.isFusionActive(SESSION_ID)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Test 4: Partial panel failure — 2 succeed + 1 fail → ok with failedModels
  // -----------------------------------------------------------------------
  test("partial panel failure: 2 success + 1 error → status ok, failedModels populated", async () => {
    // GIVEN 2 panelists succeed, 1 fails, judge and synthesis succeed
    resetMocks();

    const panelResults: PanelResult[] = [
      successPanelResult("openai", "gpt-4o-mini", "Answer A"),
      errorPanelResult("test", "fail-model", "Simulated failure"),
      successPanelResult("google", "gemini-1.5-flash", "Answer C"),
    ];

    mockFanOut.mockResolvedValue(panelResults);
    mockRunJudge.mockResolvedValue(validJudgeOutput);
    mockSynthesize.mockResolvedValue("Partial synthesis answer.");

    const guard = freshGuard();

    // WHEN runFusionPipeline is called
    const result = await runFusionPipeline(
      dummyClient,
      SESSION_ID,
      TEST_PROMPT,
      defaultConfig,
      originalModel,
      guard,
    );

    // THEN status is "ok" (enough panelists for judge to work)
    expect(result.status).toBe("ok");

    // THEN analysis and synthesizedAnswer are present
    expect(result.analysis).toBeDefined();
    expect(result.synthesizedAnswer).toBeDefined();

    // THEN responses contain all 3 results
    expect(result.responses).toHaveLength(3);

    // THEN failedModels contains the one failing model
    expect(result.failedModels).toBeDefined();
    expect(result.failedModels).toHaveLength(1);
    expect(result.failedModels![0].modelId).toBe("fail-model");
    expect(result.failedModels![0].reason).toBe("Simulated failure");

    // THEN judge and synthesize were called
    expect(mockRunJudge).toHaveBeenCalledTimes(1);
    expect(mockSynthesize).toHaveBeenCalledTimes(1);

    // THEN recursion guard is cleaned up
    expect(guard.isFusionActive(SESSION_ID)).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Test 5: Recursion guard blocks nested fusion
  // -----------------------------------------------------------------------
  test("recursion guard active → status error, failure_reason fusion_invocation_capped", async () => {
    // GIVEN a guard where fusion is already active
    resetMocks();

    const guard = freshGuard();
    guard.markFusionActive(SESSION_ID);

    // WHEN runFusionPipeline is called
    const result = await runFusionPipeline(
      dummyClient,
      SESSION_ID,
      TEST_PROMPT,
      defaultConfig,
      originalModel,
      guard,
    );

    // THEN status is "error"
    expect(result.status).toBe("error");

    // THEN failureReason is "fusion_invocation_capped"
    expect(result.failureReason).toBe("fusion_invocation_capped");

    // THEN responses is empty (no work was done)
    expect(result.responses).toEqual([]);

    // THEN cost is zero
    expect(result.cost.totalPromptTokens).toBe(0);
    expect(result.cost.totalCompletionTokens).toBe(0);
    expect(result.cost.estimatedCost).toBe(0);

    // THEN fanOut was NOT called (blocked before any work)
    expect(mockFanOut).toHaveBeenCalledTimes(0);
    expect(mockRunJudge).toHaveBeenCalledTimes(0);
    expect(mockSynthesize).toHaveBeenCalledTimes(0);

    // THEN fusion remains active (pipeline returns early without calling markFusionComplete)
    expect(guard.isFusionActive(SESSION_ID)).toBe(true);
  });
});
