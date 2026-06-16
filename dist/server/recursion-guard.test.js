import { describe, expect, test } from "bun:test";
import { RecursionGuard } from "./recursion-guard.js";
describe("RecursionGuard", () => {
    // GIVEN a fresh guard and a session ID
    const sessionID = "test-session-1";
    test("active / inactive lifecycle", () => {
        // GIVEN a fresh RecursionGuard
        const guard = new RecursionGuard();
        // WHEN no fusion is active
        // THEN isFusionActive returns false
        expect(guard.isFusionActive(sessionID)).toBe(false);
        // WHEN markFusionActive succeeds
        const result = guard.markFusionActive(sessionID);
        // THEN it returns true and fusion is now active
        expect(result).toBe(true);
        expect(guard.isFusionActive(sessionID)).toBe(true);
        // WHEN markFusionComplete is called
        guard.markFusionComplete(sessionID);
        // THEN fusion is no longer active
        expect(guard.isFusionActive(sessionID)).toBe(false);
    });
    test("double activation is blocked", () => {
        // GIVEN a fresh RecursionGuard with an active fusion
        const guard = new RecursionGuard();
        guard.markFusionActive(sessionID);
        // WHEN markFusionActive is called again
        const result = guard.markFusionActive(sessionID);
        // THEN it returns false (double activation blocked)
        expect(result).toBe(false);
        // AND fusion remains active
        expect(guard.isFusionActive(sessionID)).toBe(true);
    });
    test("getDepth returns 0 when inactive, 1 when active", () => {
        // GIVEN a fresh RecursionGuard
        const guard = new RecursionGuard();
        // WHEN no fusion is active
        // THEN depth is 0
        expect(guard.getDepth(sessionID)).toBe(0);
        // WHEN fusion becomes active
        guard.markFusionActive(sessionID);
        // THEN depth is 1
        expect(guard.getDepth(sessionID)).toBe(1);
        // WHEN fusion completes
        guard.markFusionComplete(sessionID);
        // THEN depth returns to 0
        expect(guard.getDepth(sessionID)).toBe(0);
    });
});
//# sourceMappingURL=recursion-guard.test.js.map