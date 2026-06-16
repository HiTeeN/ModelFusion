import { describe, expect, test } from "bun:test";
import { createEventHook } from "./event.js";
import { RecursionGuard } from "../recursion-guard.js";
import { CostTracker } from "../cost-tracker.js";
describe("createEventHook", () => {
    // GIVEN a fresh plugin state with RecursionGuard and CostTracker
    const pluginState = {
        recursionGuard: new RecursionGuard(),
        costTracker: new CostTracker(),
    };
    test("session.created — handler processes the event", () => {
        // GIVEN the event hook
        const hook = createEventHook(pluginState);
        // WHEN a session.created event fires
        const input = {
            event: { type: "session.created", sessionID: "session-1" },
        };
        // THEN the handler resolves without error
        expect(hook(input)).resolves.toBeUndefined();
    });
    test("session.deleted — handler processes the event", () => {
        // GIVEN the event hook
        const hook = createEventHook(pluginState);
        // WHEN a session.deleted event fires
        const input = {
            event: { type: "session.deleted", sessionID: "session-1" },
        };
        // THEN the handler resolves without error
        expect(hook(input)).resolves.toBeUndefined();
    });
    test("other event — handler ignores it (no side effects)", () => {
        // GIVEN the event hook
        const hook = createEventHook(pluginState);
        // WHEN a non-session event fires (e.g. message.updated)
        const input = {
            event: { type: "message.updated", sessionID: "session-1" },
        };
        // THEN the handler resolves without error (default case — no side effects)
        expect(hook(input)).resolves.toBeUndefined();
    });
    test("session.error — handler processes the event with error details", () => {
        // GIVEN the event hook
        const hook = createEventHook(pluginState);
        // WHEN a session.error event fires with an error
        const input = {
            event: {
                type: "session.error",
                sessionID: "session-1",
                error: new Error("test error"),
            },
        };
        // THEN the handler resolves without error
        expect(hook(input)).resolves.toBeUndefined();
    });
});
//# sourceMappingURL=event.test.js.map