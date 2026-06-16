// ---------------------------------------------------------------------------
// CostTracker — tracks token counts and estimates cost across fusion pipeline
// stages (panelist, judge, synthesis). Uses 3 pricing tiers.
// ---------------------------------------------------------------------------
const TIER_PRICES = {
    budget: { promptPer1M: 0.15, completionPer1M: 0.60 },
    standard: { promptPer1M: 3.00, completionPer1M: 15.00 },
    premium: { promptPer1M: 15.00, completionPer1M: 75.00 },
};
export function estimateCost(promptTokens, completionTokens, tier) {
    const price = TIER_PRICES[tier];
    const promptCost = (promptTokens / 1_000_000) * price.promptPer1M;
    const completionCost = (completionTokens / 1_000_000) * price.completionPer1M;
    return Math.round((promptCost + completionCost) * 100_000) / 100_000;
}
function emptyEntry() {
    return { prompt: 0, completion: 0, estimatedCost: 0 };
}
export class CostTracker {
    perModel = new Map();
    judge = emptyEntry();
    synthesis = emptyEntry();
    tier;
    constructor(tier = "standard") {
        this.tier = tier;
    }
    trackPanelist(modelId, promptTokens, completionTokens) {
        const entry = this.perModel.get(modelId) ?? emptyEntry();
        entry.prompt += promptTokens;
        entry.completion += completionTokens;
        entry.estimatedCost = estimateCost(entry.prompt, entry.completion, this.tier);
        this.perModel.set(modelId, entry);
    }
    trackJudge(promptTokens, completionTokens) {
        this.judge.prompt += promptTokens;
        this.judge.completion += completionTokens;
        this.judge.estimatedCost = estimateCost(this.judge.prompt, this.judge.completion, this.tier);
    }
    trackSynthesis(promptTokens, completionTokens) {
        this.synthesis.prompt += promptTokens;
        this.synthesis.completion += completionTokens;
        this.synthesis.estimatedCost = estimateCost(this.synthesis.prompt, this.synthesis.completion, this.tier);
    }
    getSummary() {
        const perModel = {};
        let totalPrompt = 0;
        let totalCompletion = 0;
        for (const [id, entry] of this.perModel) {
            perModel[id] = { ...entry };
            totalPrompt += entry.prompt;
            totalCompletion += entry.completion;
        }
        totalPrompt += this.judge.prompt + this.synthesis.prompt;
        totalCompletion += this.judge.completion + this.synthesis.completion;
        const totalEstimatedCost = totalPrompt > 0 || totalCompletion > 0
            ? estimateCost(totalPrompt, totalCompletion, this.tier)
            : 0;
        return {
            perModel,
            judge: { ...this.judge },
            synthesis: { ...this.synthesis },
            totals: { prompt: totalPrompt, completion: totalCompletion },
            estimatedCost: totalEstimatedCost,
        };
    }
}
//# sourceMappingURL=cost-tracker.js.map