import { describe, expect, test, mock } from "bun:test";
import { FusionProgressNotifier } from "./progress.js";
import { emitFusionProgress, getFusionProgressListenerCount, subscribeToFusionProgress, } from "../progress-bus.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockApi() {
    return {
        ui: {
            toast: mock(() => { }),
        },
    };
}
function lastToastCall(api) {
    const calls = api.ui.toast.mock.calls;
    return calls[calls.length - 1]?.[0];
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("FusionProgressNotifier", () => {
    // -----------------------------------------------------------------------
    // notifyStage
    // -----------------------------------------------------------------------
    test("notifyStage('fan-out') fires toast with info variant", () => {
        // GIVEN a FusionProgressNotifier with a mock toast API
        const api = mockApi();
        const notifier = new FusionProgressNotifier(api);
        // WHEN notifyStage is called with "fan-out"
        notifier.notifyStage("fan-out");
        // THEN toast is called once with info variant and the stage name
        expect(api.ui.toast).toHaveBeenCalledTimes(1);
        const call = lastToastCall(api);
        expect(call.variant).toBe("info");
        expect(call.title).toContain("fan-out");
    });
    test("notifyStage('panelist') fires toast with detail", () => {
        // GIVEN a FusionProgressNotifier
        const api = mockApi();
        const notifier = new FusionProgressNotifier(api);
        // WHEN notifyStage is called with "panelist" and a model detail
        notifier.notifyStage("panelist", "gpt-4o completed");
        // THEN toast message contains the detail string
        const call = lastToastCall(api);
        expect(call.message).toBe("gpt-4o completed");
        expect(call.title).toContain("panelist");
    });
    test("notifyStage('complete') fires toast with success variant", () => {
        // GIVEN a FusionProgressNotifier
        const api = mockApi();
        const notifier = new FusionProgressNotifier(api);
        // WHEN notifyStage is called with "complete"
        notifier.notifyStage("complete");
        // THEN toast variant is "success" and duration is set (auto-dismiss)
        const call = lastToastCall(api);
        expect(call.variant).toBe("success");
        expect(call.duration).toBeGreaterThan(0);
    });
    test("notifyStage('error') fires toast with error variant and persists", () => {
        // GIVEN a FusionProgressNotifier
        const api = mockApi();
        const notifier = new FusionProgressNotifier(api);
        // WHEN notifyStage is called with "error"
        notifier.notifyStage("error", "All models failed");
        // THEN toast variant is "error" and duration is 0 (persist, no auto-dismiss)
        const call = lastToastCall(api);
        expect(call.variant).toBe("error");
        expect(call.duration).toBe(0);
        expect(call.message).toBe("All models failed");
    });
    test("notifyStage('degraded') fires toast with warning variant and persists", () => {
        // GIVEN a FusionProgressNotifier
        const api = mockApi();
        const notifier = new FusionProgressNotifier(api);
        // WHEN notifyStage is called with "degraded"
        notifier.notifyStage("degraded");
        // THEN toast variant is "warning" and duration is 0 (persist)
        const call = lastToastCall(api);
        expect(call.variant).toBe("warning");
        expect(call.duration).toBe(0);
    });
    test("all pipeline stages fire toasts", () => {
        // GIVEN a FusionProgressNotifier
        const api = mockApi();
        const notifier = new FusionProgressNotifier(api);
        // WHEN every pipeline stage is notified
        const stages = [
            "fan-out",
            "panelist",
            "judging",
            "synthesis",
            "complete",
            "degraded",
            "error",
        ];
        for (const stage of stages) {
            notifier.notifyStage(stage);
        }
        // THEN toast is called once per stage (7 total)
        expect(api.ui.toast).toHaveBeenCalledTimes(stages.length);
        // AND each call has a title containing the stage name
        const calls = api.ui.toast.mock.calls;
        for (let i = 0; i < stages.length; i++) {
            expect(calls[i][0].title).toContain(stages[i]);
        }
    });
    // -----------------------------------------------------------------------
    // notifyCost
    // -----------------------------------------------------------------------
    test("notifyCost fires toast with cost info", () => {
        // GIVEN a FusionProgressNotifier
        const api = mockApi();
        const notifier = new FusionProgressNotifier(api);
        // WHEN notifyCost is called with an estimated cost
        notifier.notifyCost({ estimatedCost: 0.0042 });
        // THEN toast is called with info variant and cost in the message
        const call = lastToastCall(api);
        expect(call.variant).toBe("info");
        expect(call.title).toContain("Cost");
        expect(call.message).toContain("0.0042");
    });
    test("notifyCost auto-dismisses (duration > 0)", () => {
        // GIVEN a FusionProgressNotifier
        const api = mockApi();
        const notifier = new FusionProgressNotifier(api);
        // WHEN notifyCost is called
        notifier.notifyCost({ estimatedCost: 1.5 });
        // THEN the toast has a positive duration (auto-dismiss)
        const call = lastToastCall(api);
        expect(call.duration).toBeGreaterThan(0);
    });
    test("progress bus events can be forwarded into notifier toasts", () => {
        const api = mockApi();
        const notifier = new FusionProgressNotifier(api);
        const unsubscribe = subscribeToFusionProgress((event) => {
            notifier.notifyStage(event.stage, event.detail);
        });
        expect(getFusionProgressListenerCount()).toBe(1);
        emitFusionProgress({
            sessionID: "ses_test",
            stage: "panelist",
            detail: "openai/gpt-4o-mini completed.",
        });
        const call = lastToastCall(api);
        expect(call.title).toContain("panelist");
        expect(call.message).toContain("completed");
        unsubscribe();
        expect(getFusionProgressListenerCount()).toBe(0);
    });
});
//# sourceMappingURL=progress.test.js.map