export declare class FusionProgressNotifier {
    private toast;
    constructor(api: {
        ui: {
            toast: (input: any) => void;
        };
    });
    /**
     * Show a toast notification for a pipeline stage.
     * Fire-and-forget — does not block.
     *
     * Stages:
     *   "fan-out"   — dispatching to N models
     *   "panelist"  — model X completed
     *   "judging"   — comparing responses
     *   "synthesis" — writing final answer
     *   "complete"  — done, with cost summary
     *   "degraded"  — judge failed, showing raw responses
     *   "error"     — all models failed
     */
    notifyStage(stage: string, detail?: string): void;
    /**
     * Show a cost breakdown toast.
     */
    notifyCost(cost: {
        estimatedCost: number;
    }): void;
    private stageVariant;
    private stageDuration;
}
//# sourceMappingURL=progress.d.ts.map