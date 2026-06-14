import { describe, expect, test, mock } from "bun:test";
import type { FusionConfig } from "./types/config";
import type { PanelResult, JudgeOutput, FusionResult } from "./types/results";
import { RecursionGuard } from "./server/recursion-guard";
import type { OriginalModel } from "./server/synthesizer";
import type { TuiPluginApi, TuiCommand } from "@opencode-ai/plugin/tui";

// ===========================================================================
// Mock modules — replace all sub-module imports used by pipeline.ts
// ===========================================================================

const mockFanOut = mock();
const mockRunJudge = mock();
const mockSynthesize = mock();

mock.module("./server/orchestrator", () => ({
  fanOut: mockFanOut,
}));

mock.module("./server/judge", () => ({
  runJudge: mockRunJudge,
}));

mock.module("./server/synthesizer", () => ({
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

mock.module("./server/cost-tracker", () => ({
  CostTracker: MockCostTracker,
  estimateCost: mock(() => 0),
}));

// ===========================================================================
// Import pipeline and hooks AFTER mocks are registered
// ===========================================================================

import { runFusionPipeline, type PipelineClient } from "./server/pipeline";
import { createChatMessageHook, type ChatMessagePluginState } from "./server/hooks/chat-message";
import { createFusionCommand } from "./tui/commands";

// ===========================================================================
// Shared fixtures
// ===========================================================================

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

// ===========================================================================
// Helpers
// ===========================================================================

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

// ===========================================================================
// TUI mock helpers
// ===========================================================================

function mockTuiApi(overrides: Partial<TuiPluginApi> = {}): TuiPluginApi {
  const store = new Map<string, unknown>();

  return {
    app: { version: "1.0.0-test" },
    attention: {
      notify: mock(async () => ({ ok: true, notification: true, sound: false })),
      soundboard: {
        registerPack: mock(() => () => {}),
        activate: mock(() => true),
        current: mock(() => "default"),
        list: mock(() => []),
      },
    },
    command: {
      register: mock(() => () => {}),
      trigger: mock(() => {}),
      show: mock(() => {}),
    },
    keys: {
      formatSequence: mock(() => ""),
      formatBindings: mock(() => undefined),
    },
    keymap: {} as TuiPluginApi["keymap"],
    mode: {
      current: mock(() => "normal"),
      push: mock(() => () => {}),
    },
    route: {
      register: mock(() => () => {}),
      navigate: mock(() => {}),
      current: { name: "home" },
    },
    ui: {
      Dialog: (() => null) as TuiPluginApi["ui"]["Dialog"],
      DialogAlert: (() => null) as TuiPluginApi["ui"]["DialogAlert"],
      DialogConfirm: (() => null) as TuiPluginApi["ui"]["DialogConfirm"],
      DialogPrompt: (() => null) as TuiPluginApi["ui"]["DialogPrompt"],
      DialogSelect: (() => null) as TuiPluginApi["ui"]["DialogSelect"],
      Slot: (() => null) as TuiPluginApi["ui"]["Slot"],
      Prompt: (() => null) as TuiPluginApi["ui"]["Prompt"],
      toast: mock(() => {}),
      dialog: {
        replace: mock(() => {}),
        clear: mock(() => {}),
        setSize: mock(() => {}),
        size: "medium",
        depth: 0,
        open: false,
      },
    },
    tuiConfig: {} as TuiPluginApi["tuiConfig"],
    kv: {
      get: <Value = unknown>(key: string, fallback?: Value): Value =>
        (store.has(key) ? store.get(key) : fallback) as Value,
      set: (key: string, value: unknown) => {
        store.set(key, value);
      },
      ready: true,
    },
    state: {} as TuiPluginApi["state"],
    theme: {} as TuiPluginApi["theme"],
    client: {
      session: {
        prompt: mock(async () => ({})),
      },
    } as unknown as TuiPluginApi["client"],
    event: {
      on: mock(() => () => {}),
    },
    renderer: {} as TuiPluginApi["renderer"],
    slots: {
      register: mock(() => "slot-id"),
    },
    plugins: {
      list: mock(() => []),
      activate: mock(async () => true),
      deactivate: mock(async () => true),
      add: mock(async () => true),
      install: mock(async () => ({ ok: true, dir: "/tmp", tui: true })),
    },
    lifecycle: {
      signal: new AbortController().signal,
      onDispose: mock(() => () => {}),
    },
    ...overrides,
  } as TuiPluginApi;
}

function mockDialogStack(
  overrides: Partial<TuiPluginApi["ui"]["dialog"]> = {},
): TuiPluginApi["ui"]["dialog"] {
  return {
    replace: mock(() => {}),
    clear: mock(() => {}),
    setSize: mock(() => {}),
    size: "medium",
    depth: 0,
    open: true,
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe("ModelFusion Integration", () => {
  // =========================================================================
  // Pipeline integration tests
  // =========================================================================

  describe("runFusionPipeline", () => {
    // -----------------------------------------------------------------------
    // Test 1: Happy path — all panelists succeed, judge succeeds, synthesis succeeds
    // -----------------------------------------------------------------------
    test("GIVEN all sub-modules succeed WHEN pipeline runs THEN status ok with analysis and synthesizedAnswer", async () => {
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
      expect(fanOutCall[1]).toBe(SESSION_ID);
      expect(fanOutCall[2]).toBe(TEST_PROMPT);

      // THEN runJudge was called
      expect(mockRunJudge).toHaveBeenCalledTimes(1);

      // THEN synthesize was called
      expect(mockSynthesize).toHaveBeenCalledTimes(1);
    });

    // -----------------------------------------------------------------------
    // Test 2: Degraded path — judge returns null
    // -----------------------------------------------------------------------
    test("GIVEN panelists succeed but judge returns null WHEN pipeline runs THEN status degraded, responses present, analysis absent", async () => {
      // GIVEN panelists succeed but judge returns null
      resetMocks();

      const panelResults: PanelResult[] = [
        successPanelResult("openai", "gpt-4o-mini", "Answer A"),
        successPanelResult("anthropic", "claude-3-haiku", "Answer B"),
        successPanelResult("google", "gemini-1.5-flash", "Answer C"),
      ];

      mockFanOut.mockResolvedValue(panelResults);
      mockRunJudge.mockResolvedValue(null);

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
    // Test 3: Error path — all panelists fail
    // -----------------------------------------------------------------------
    test("GIVEN all panelists fail WHEN pipeline runs THEN status error, failureReason all_panels_failed", async () => {
      // GIVEN all panelists return errors
      resetMocks();

      const panelResults: PanelResult[] = [
        errorPanelResult("openai", "gpt-4o-mini", "API timeout"),
        errorPanelResult("anthropic", "claude-3-haiku", "Rate limited"),
        errorPanelResult("google", "gemini-1.5-flash", "Model unavailable"),
      ];

      mockFanOut.mockResolvedValue(panelResults);

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
    // Test 4: Partial panel — 2 succeed, 1 fails
    // -----------------------------------------------------------------------
    test("GIVEN 2 panelists succeed and 1 fails WHEN pipeline runs THEN status ok, failedModels has 1 entry", async () => {
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
    // Test 5: Recursion guard — blocks nested fusion
    // -----------------------------------------------------------------------
    test("GIVEN fusion already active for session WHEN pipeline runs THEN status error, failureReason fusion_invocation_capped", async () => {
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

    // -----------------------------------------------------------------------
    // Test 6: Cost tracking — verify cost tracker methods called during pipeline
    // -----------------------------------------------------------------------
    test("GIVEN happy path pipeline WHEN pipeline executes THEN cost tracker methods are called for each stage", async () => {
      // GIVEN all sub-modules return success
      resetMocks();

      const panelResults: PanelResult[] = [
        successPanelResult("openai", "gpt-4o-mini", "Answer 1"),
        successPanelResult("anthropic", "claude-3-haiku", "Answer 2"),
        successPanelResult("google", "gemini-1.5-flash", "Answer 3"),
      ];

      mockFanOut.mockResolvedValue(panelResults);
      mockRunJudge.mockResolvedValue(validJudgeOutput);
      mockSynthesize.mockResolvedValue("Synthesized answer.");

      const guard = freshGuard();

      // WHEN runFusionPipeline is called
      await runFusionPipeline(
        dummyClient,
        SESSION_ID,
        TEST_PROMPT,
        defaultConfig,
        originalModel,
        guard,
      );

      // THEN trackPanelist was called for each successful panelist (3 times)
      expect(trackerInstance.trackPanelist).toHaveBeenCalledTimes(3);

      // THEN trackJudge was called once
      expect(trackerInstance.trackJudge).toHaveBeenCalledTimes(1);

      // THEN trackSynthesis was called once
      expect(trackerInstance.trackSynthesis).toHaveBeenCalledTimes(1);

      // THEN getSummary was called (at least once, for the final result)
      expect(trackerInstance.getSummary).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Hook integration test
  // =========================================================================

  describe("chat.message hook integration", () => {
    // -----------------------------------------------------------------------
    // Test 7: Auto mode — hook triggers pipeline
    // -----------------------------------------------------------------------
    test("GIVEN triggering=auto WHEN message arrives THEN pipeline is called and output is replaced with synthesized answer", async () => {
      // GIVEN a chat message hook with auto triggering mode
      const pipelineMock = mock(async (): Promise<FusionResult> => ({
        status: "ok",
        responses: [],
        cost: { totalPromptTokens: 0, totalCompletionTokens: 0, estimatedCost: 0 },
        synthesizedAnswer: "Fused answer from panel deliberation.",
      }));

      const state: ChatMessagePluginState = {
        config: { ...defaultConfig, triggering: "auto" },
        recursionGuard: new RecursionGuard(),
        pipeline: pipelineMock as unknown as ChatMessagePluginState["pipeline"],
        client: dummyClient,
      };

      const hook = createChatMessageHook(state);

      const input = {
        sessionID: "hook-test-session",
        model: { providerID: "openai", modelID: "gpt-4o" },
      };

      const output = {
        message: { id: "msg-1", role: "user", parts: [] as string[] },
        parts: [{ type: "text", text: "What is the meaning of life?" }],
      };

      // WHEN the hook is invoked
      await hook(input, output);

      // THEN pipeline was called once
      expect(pipelineMock).toHaveBeenCalledTimes(1);

      // THEN pipeline was called with correct prompt
      const pipelineCall = (pipelineMock as ReturnType<typeof mock>).mock.calls[0];
      expect(pipelineCall[2]).toBe("What is the meaning of life?");

      // THEN output parts are replaced with synthesized answer
      expect(output.parts).toHaveLength(1);
      expect(output.parts[0].text).toBe("Fused answer from panel deliberation.");
    });
  });

  // =========================================================================
  // TUI integration test
  // =========================================================================

  describe("/fusion command integration", () => {
    // -----------------------------------------------------------------------
    // Test 8: /fusion command calls toast and delegates to pipeline
    // -----------------------------------------------------------------------
    test("GIVEN /fusion command with confirmed question WHEN onSelect fires THEN toast shown and pipeline delegated", async () => {
      // GIVEN a TuiPluginApi with mocked toast and client.session.prompt
      const api = mockTuiApi();

      let capturedOnConfirm: ((value: string) => void) | undefined;

      const dialog = mockDialogStack({
        replace: mock((renderFn: () => unknown) => {
          renderFn();
          capturedOnConfirm?.("What is the meaning of life?");
        }),
      });

      (api.ui.DialogPrompt as ReturnType<typeof mock>) = mock(
        (props: Record<string, unknown>) => {
          capturedOnConfirm = props.onConfirm as (value: string) => void;
          return null;
        },
      );

      const cmd = createFusionCommand(api);

      // WHEN onSelect is called with a dialog
      await cmd.onSelect!(dialog as unknown as Parameters<NonNullable<TuiCommand["onSelect"]>>[0]);

      // THEN an info toast with "Fan-out started" was shown
      const toastCalls = (api.ui.toast as ReturnType<typeof mock>).mock.calls;
      const infoToast = toastCalls.find(
        (c: unknown[]) => (c[0] as Record<string, unknown>).variant === "info",
      );
      expect(infoToast).toBeDefined();
      expect((infoToast![0] as Record<string, unknown>).title).toBe("Fusion");
      expect((infoToast![0] as Record<string, unknown>).message).toContain("Fan-out started");

      // THEN client.session.prompt was called (pipeline delegated)
      expect(api.client.session.prompt).toHaveBeenCalled();
    });
  });
});
