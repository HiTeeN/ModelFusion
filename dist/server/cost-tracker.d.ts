export type CostTier = "budget" | "standard" | "premium";
export interface ModelCostEntry {
    prompt: number;
    completion: number;
    estimatedCost: number;
}
export interface CostSummary {
    perModel: Record<string, ModelCostEntry>;
    judge: ModelCostEntry;
    synthesis: ModelCostEntry;
    totals: {
        prompt: number;
        completion: number;
    };
    estimatedCost: number;
}
export declare function estimateCost(promptTokens: number, completionTokens: number, tier: CostTier): number;
export declare class CostTracker {
    private perModel;
    private judge;
    private synthesis;
    private tier;
    constructor(tier?: CostTier);
    trackPanelist(modelId: string, promptTokens: number, completionTokens: number): void;
    trackJudge(promptTokens: number, completionTokens: number): void;
    trackSynthesis(promptTokens: number, completionTokens: number): void;
    getSummary(): CostSummary;
}
//# sourceMappingURL=cost-tracker.d.ts.map