import { describe, expect, test, mock } from "bun:test";
import pluginModule, { FusionTuiPlugin, tui } from "./index.js";
// ---------------------------------------------------------------------------
// Mock TuiPluginApi factory
// ---------------------------------------------------------------------------
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
            register: mock((cb) => () => { }),
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
        client: {},
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
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("FusionTuiPlugin", () => {
    test("is a function", () => {
        expect(typeof FusionTuiPlugin).toBe("function");
        expect(typeof tui).toBe("function");
        expect(pluginModule).toBe(FusionTuiPlugin);
    });
    test("registers the /fusion command via api.keymap.registerLayer", async () => {
        const api = mockApi();
        await FusionTuiPlugin(api, undefined, undefined);
        expect(api.command?.register).toHaveBeenCalledTimes(2);
        const fusionCommands = (api.command?.register)
            .mock.calls[0][0]();
        const configCommands = (api.command?.register)
            .mock.calls[1][0]();
        const fusionCmd = fusionCommands.find((c) => c.value === "fusion:deliberate");
        const configCmd = configCommands.find((c) => c.value === "fusion:config");
        expect(fusionCmd).toBeDefined();
        expect(configCmd).toBeDefined();
        expect(fusionCmd.title).toContain("Fusion");
        expect(fusionCmd.slash.name).toBe("fusion");
        expect((fusionCmd.slash.aliases ?? [])).toContain("deliberate");
        expect(fusionCmd.category).toBe("fusion");
        expect(typeof fusionCmd.onSelect).toBe("function");
    });
    test("initializes plugin state in api.kv", async () => {
        const api = mockApi();
        await FusionTuiPlugin(api, undefined, undefined);
        expect(api.kv.get("fusion.initialized")).toBe(true);
        expect(api.kv.get("fusion.version")).toBe("0.1.0");
    });
    test("subscribes to session lifecycle events", async () => {
        const api = mockApi();
        await FusionTuiPlugin(api, undefined, undefined);
        expect(api.event.on).toHaveBeenCalledTimes(2);
        // Verify the event types subscribed to
        const calls = api.event.on.mock.calls;
        const eventTypes = calls.map((c) => c[0]);
        expect(eventTypes).toContain("session.created");
        expect(eventTypes).toContain("session.deleted");
    });
    test("registers cleanup via lifecycle.onDispose", async () => {
        const api = mockApi();
        await FusionTuiPlugin(api, undefined, undefined);
        expect(api.lifecycle.onDispose).toHaveBeenCalledTimes(1);
    });
    test("run handler calls ui.toast for missing prompt", async () => {
        const api = mockApi();
        await FusionTuiPlugin(api, undefined, undefined);
        const commands = (api.command?.register)
            .mock.calls[0][0]();
        const fusionCmd = commands.find((c) => c.value === "fusion:deliberate");
        await fusionCmd.onSelect();
        expect(api.ui.toast).toHaveBeenCalledTimes(1);
        const toastCall = api.ui.toast.mock.calls[0][0];
        expect(toastCall.variant).toBe("warning");
        expect(toastCall.title).toBe("Fusion");
        expect(toastCall.message).toContain("No question provided");
    });
});
//# sourceMappingURL=index.test.js.map