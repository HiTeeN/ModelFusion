// ---------------------------------------------------------------------------
// FusionProgressNotifier — toast-based progress notifications for each
// fusion pipeline stage.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Stage icons (unicode/emoji for visual distinction)
// ---------------------------------------------------------------------------
const STAGE_ICONS = {
    "fan-out": "📡",
    panelist: "🤖",
    judging: "⚖️",
    synthesis: "✍️",
    complete: "✅",
    degraded: "⚠️",
    error: "❌",
};
// ---------------------------------------------------------------------------
// Toast durations (ms)
// ---------------------------------------------------------------------------
const SUCCESS_DURATION = 3000; // auto-dismiss after 3s
const PERSIST_DURATION = 0; // never auto-dismiss
// ---------------------------------------------------------------------------
// FusionProgressNotifier
// ---------------------------------------------------------------------------
export class FusionProgressNotifier {
    toast;
    constructor(api) {
        this.toast = api.ui.toast;
    }
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
    notifyStage(stage, detail) {
        const icon = STAGE_ICONS[stage] ?? "🔔";
        const title = `${icon} ${stage}`;
        const message = detail ?? "";
        const variant = this.stageVariant(stage);
        const duration = this.stageDuration(stage);
        this.toast({
            variant,
            title,
            message,
            duration,
        });
    }
    /**
     * Show a cost breakdown toast.
     */
    notifyCost(cost) {
        this.toast({
            variant: "info",
            title: "💰 Cost",
            message: `Estimated cost: $${cost.estimatedCost.toFixed(4)}`,
            duration: SUCCESS_DURATION,
        });
    }
    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------
    stageVariant(stage) {
        switch (stage) {
            case "complete":
                return "success";
            case "degraded":
                return "warning";
            case "error":
                return "error";
            default:
                return "info";
        }
    }
    stageDuration(stage) {
        switch (stage) {
            case "error":
            case "degraded":
                return PERSIST_DURATION;
            default:
                return SUCCESS_DURATION;
        }
    }
}
//# sourceMappingURL=progress.js.map