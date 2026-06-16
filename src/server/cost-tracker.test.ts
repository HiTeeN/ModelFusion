import { describe, expect, test } from "bun:test";
import { CostTracker, estimateCost } from "./cost-tracker.js";

describe("CostTracker", () => {
  test("trackPanelist accumulates per-model entries for multiple models", () => {
    // GIVEN a cost tracker
    const tracker = new CostTracker();

    // WHEN panelist calls are tracked for two different models
    tracker.trackPanelist("gpt-4o", 100, 50);
    tracker.trackPanelist("claude-opus", 200, 100);

    // THEN perModel contains both models with correct accumulations
    const summary = tracker.getSummary();
    expect(Object.keys(summary.perModel)).toHaveLength(2);
    expect(summary.perModel["gpt-4o"].prompt).toBe(100);
    expect(summary.perModel["gpt-4o"].completion).toBe(50);
    expect(summary.perModel["claude-opus"].prompt).toBe(200);
    expect(summary.perModel["claude-opus"].completion).toBe(100);
  });

  test("getSummary totals across panelist, judge, and synthesis", () => {
    // GIVEN a tracker with panelist, judge, and synthesis usage recorded
    const tracker = new CostTracker();
    tracker.trackPanelist("gpt-4o", 300, 100);
    tracker.trackJudge(150, 50);
    tracker.trackSynthesis(50, 20);

    // WHEN summary is retrieved
    const summary = tracker.getSummary();

    // THEN totals reflect the sum of all stages
    expect(summary.totals.prompt).toBe(500);
    expect(summary.totals.completion).toBe(170);

    expect(summary.judge.prompt).toBe(150);
    expect(summary.judge.completion).toBe(50);
    expect(summary.synthesis.prompt).toBe(50);
    expect(summary.synthesis.completion).toBe(20);
  });

  test("estimateCost calculates correct amounts for budget and premium tiers", () => {
    // GIVEN 1M prompt + 1M completion tokens
    const promptTokens = 1_000_000;
    const completionTokens = 1_000_000;

    // WHEN estimating for budget tier
    const budgetCost = estimateCost(promptTokens, completionTokens, "budget");
    // THEN (0.15 + 0.60) = 0.75
    expect(budgetCost).toBeCloseTo(0.75, 4);

    // WHEN estimating for premium tier
    const premiumCost = estimateCost(promptTokens, completionTokens, "premium");
    // THEN (15 + 75) = 90
    expect(premiumCost).toBeCloseTo(90, 4);
  });

  test("empty tracker returns estimatedCost of 0", () => {
    // GIVEN a tracker with no recorded usage
    const tracker = new CostTracker();

    // WHEN summary is retrieved
    const summary = tracker.getSummary();

    // THEN estimatedCost is 0
    expect(summary.estimatedCost).toBe(0);
  });

  test("accumulating on the same model sums tokens correctly", () => {
    // GIVEN a tracker
    const tracker = new CostTracker();

    // WHEN the same model is tracked multiple times
    tracker.trackPanelist("gpt-4o", 100, 50);
    tracker.trackPanelist("gpt-4o", 200, 100);

    // THEN the model entry shows cumulative totals
    const summary = tracker.getSummary();
    expect(summary.perModel["gpt-4o"].prompt).toBe(300);
    expect(summary.perModel["gpt-4o"].completion).toBe(150);
  });
});