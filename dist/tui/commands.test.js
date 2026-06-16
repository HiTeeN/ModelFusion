import { describe, expect, test, mock } from "bun:test";
import { createFusionCommand } from "./commands.js";
import { emitFusionProgress, getFusionProgressListenerCount, } from "../progress-bus.js";
function mockApi(overrides = {}) {
    const store = new Map();
    return {
        app: { version: "1.0.0-test" },
        attention: {
            notify: mock(async () => ({ ok: true, notification: true, sound: false })),
            soundboard: {
                registerPack: mock(() => () => { }),
                activate: mock(() => true),
                current: mock(() => "default"),
                list: mock(() => []),
            },
        },
        command: {
            register: mock(() => () => { }),
            trigger: mock(() => { }),
            show: mock(() => { }),
        },
        keys: {
            formatSequence: mock(() => ""),
            formatBindings: mock(() => undefined),
        },
        keymap: {
            registerLayer: mock(() => { }),
        },
        mode: {
            current: mock(() => "normal"),
            push: mock(() => () => { }),
        },
        route: {
            register: mock(() => () => { }),
            navigate: mock(() => { }),
            current: { name: "home" },
        },
        ui: {
            Dialog: (() => null),
            DialogAlert: (() => null),
            DialogConfirm: (() => null),
            DialogPrompt: (() => null),
            DialogSelect: (() => null),
            Slot: (() => null),
            Prompt: (() => null),
            toast: mock(() => { }),
            dialog: {
                replace: mock(() => { }),
                clear: mock(() => { }),
                setSize: mock(() => { }),
                size: "medium",
                depth: 0,
                open: false,
            },
        },
        tuiConfig: {},
        kv: {
            get: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
            set: (key, value) => {
                store.set(key, value);
            },
            ready: true,
        },
        state: {},
        theme: {},
        client: {
            session: {
                prompt: mock(async () => ({})),
            },
        },
        event: {
            on: mock(() => () => { }),
        },
        renderer: {},
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
            onDispose: mock(() => () => { }),
        },
        ...overrides,
    };
}
function openDialogStack(overrides = {}) {
    return {
        replace: mock(() => { }),
        clear: mock(() => { }),
        setSize: mock(() => { }),
        size: "medium",
        depth: 0,
        open: true,
        ...overrides,
    };
}
describe("createFusionCommand", () => {
    // GIVEN a TuiPluginApi instance
    // WHEN createFusionCommand is called
    // THEN it returns a keymap command with correct metadata
    test("command has correct keymap metadata", () => {
        const api = mockApi();
        const cmd = createFusionCommand(api);
        expect(cmd.value).toBe("fusion:deliberate");
        expect(cmd.title).toBe("Fusion: Deliberate");
        expect(cmd.description).toContain("Multi-model deliberation");
        expect(cmd.description).toContain("panel of models");
        expect(cmd.description).toContain("judge");
        expect(cmd.description).toContain("structured analysis");
        expect(cmd.category).toBe("fusion");
        expect(cmd.slash?.name).toBe("fusion");
        expect(cmd.slash?.aliases).toContain("deliberate");
        expect(cmd.slash?.aliases).toContain("panel");
        expect(typeof cmd.onSelect).toBe("function");
    });
    // GIVEN a command with an open dialog stack
    // WHEN run() is called and the user confirms a question
    // THEN progress toasts are shown and pipeline is delegated
    test("run() shows progress toasts and delegates to pipeline", async () => {
        const api = mockApi();
        let capturedOnConfirm;
        const dialog = openDialogStack({
            replace: mock((renderFn) => {
                renderFn();
                capturedOnConfirm?.("What is the meaning of life?");
            }),
        });
        api.ui.dialog = dialog;
        api.ui.DialogPrompt = mock((props) => {
            capturedOnConfirm = props.onConfirm;
            return null;
        });
        const cmd = createFusionCommand(api);
        await cmd.onSelect?.();
        expect(api.client.session.prompt).toHaveBeenCalledWith(expect.objectContaining({
            variant: "fusion:manual",
            parts: [{ type: "text", text: "What is the meaning of life?" }],
        }));
        expect(api.client.session.prompt).toHaveBeenCalled();
        expect(getFusionProgressListenerCount()).toBe(1);
        emitFusionProgress({
            sessionID: "",
            stage: "judging",
            detail: "Evaluating 3 panel responses...",
        });
        const toastCalls = api.ui.toast.mock.calls;
        const infoToast = toastCalls.find((c) => c[0].variant === "info" &&
            String(c[0].title).includes("judging"));
        expect(infoToast).toBeDefined();
        expect(infoToast[0].message).toContain("Evaluating 3 panel responses");
        emitFusionProgress({
            sessionID: "",
            stage: "complete",
            detail: "Fusion complete.",
        });
        expect(getFusionProgressListenerCount()).toBe(0);
    });
    // GIVEN a command with a closed dialog stack (no question path)
    // WHEN run() is called
    // THEN a warning toast is shown and no pipeline delegation occurs
    test("run() handles closed dialog stack gracefully", async () => {
        const api = mockApi();
        api.ui.dialog = openDialogStack({ open: false });
        const cmd = createFusionCommand(api);
        await cmd.onSelect?.();
        const toastCalls = api.ui.toast.mock.calls;
        expect(toastCalls.length).toBeGreaterThanOrEqual(1);
        const warningToast = toastCalls.find((c) => c[0].variant === "warning");
        expect(warningToast).toBeDefined();
        expect(warningToast[0].title).toBe("Fusion");
        expect(warningToast[0].message).toContain("No question provided");
        expect(api.client.session.prompt).not.toHaveBeenCalled();
    });
    // GIVEN a command invoked with a dialog where the user cancels
    // WHEN run() is called and the dialog is cancelled
    // THEN a warning toast is shown and no pipeline delegation occurs
    test("run() handles dialog cancellation gracefully", async () => {
        const api = mockApi();
        let capturedOnCancel;
        const dialog = openDialogStack({
            replace: mock((renderFn) => {
                renderFn();
                capturedOnCancel?.();
            }),
        });
        api.ui.dialog = dialog;
        api.ui.DialogPrompt = mock((props) => {
            capturedOnCancel = props.onCancel;
            return null;
        });
        const cmd = createFusionCommand(api);
        await cmd.onSelect?.();
        const toastCalls = api.ui.toast.mock.calls;
        const warningToast = toastCalls.find((c) => c[0].variant === "warning");
        expect(warningToast).toBeDefined();
        expect(warningToast[0].message).toContain("No question provided");
        expect(api.client.session.prompt).not.toHaveBeenCalled();
    });
    // GIVEN the new keymap command
    // WHEN the command is registered via api.keymap.registerLayer
    // THEN it integrates with the layer registration shape
    test("command exposes runtime-compatible slash metadata", () => {
        const api = mockApi();
        const cmd = createFusionCommand(api);
        expect(cmd.value).toBe("fusion:deliberate");
        expect(cmd.slash?.name).toBe("fusion");
        expect(cmd.slash?.aliases).toContain("deliberate");
    });
    test("progress events from another session are ignored", async () => {
        const api = mockApi({
            route: {
                register: mock(() => () => { }),
                navigate: mock(() => { }),
                current: { name: "session", params: { sessionID: "ses_local" } },
            },
        });
        let capturedOnConfirm;
        api.ui.dialog = openDialogStack({
            replace: mock((renderFn) => {
                renderFn();
                capturedOnConfirm?.("Question");
            }),
        });
        api.ui.DialogPrompt = mock((props) => {
            capturedOnConfirm = props.onConfirm;
            return null;
        });
        const cmd = createFusionCommand(api);
        await cmd.onSelect?.();
        emitFusionProgress({
            sessionID: "ses_other",
            stage: "judging",
            detail: "Should be ignored",
        });
        const toastCalls = api.ui.toast.mock.calls;
        expect(toastCalls.some((c) => String(c[0].message).includes("Should be ignored"))).toBe(false);
        emitFusionProgress({
            sessionID: "ses_local",
            stage: "complete",
            detail: "Done",
        });
    });
});
//# sourceMappingURL=commands.test.js.map