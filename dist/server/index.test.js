import { describe, expect, test } from "bun:test";
import pluginModule, { FusionPlugin, server } from "./index.js";
import { DEFAULT_FUSION_CONFIG } from "../types/config.js";
// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
function mockPluginInput(overrides = {}) {
    return {
        client: {},
        project: { id: "test-project" },
        directory: "/tmp/test",
        worktree: "/tmp/test",
        serverUrl: new URL("http://localhost:1234"),
        $: {},
        experimental_workspace: { register: () => { } },
        ...overrides,
    };
}
describe("FusionPlugin", () => {
    // -----------------------------------------------------------------------
    test("is a function", () => {
        expect(typeof FusionPlugin).toBe("function");
        expect(typeof server).toBe("function");
        expect(pluginModule.server).toBe(server);
    });
    // -----------------------------------------------------------------------
    test("returns a Hooks object with all required keys", async () => {
        const hooks = await FusionPlugin(mockPluginInput());
        // All 8 required hook keys present (bracket access — dots in key names)
        expect(hooks["chat.message"]).toBeDefined();
        expect(hooks["chat.params"]).toBeDefined();
        expect(hooks["experimental.chat.messages.transform"]).toBeDefined();
        expect(hooks["experimental.chat.system.transform"]).toBeDefined();
        expect(hooks.tool).toBeDefined();
        expect(hooks["tool.execute.before"]).toBeDefined();
        expect(hooks["tool.execute.after"]).toBeDefined();
        expect(hooks.event).toBeDefined();
        // Each hook is a function where expected
        expect(typeof hooks["chat.message"]).toBe("function");
        expect(typeof hooks["chat.params"]).toBe("function");
        expect(typeof hooks["experimental.chat.messages.transform"]).toBe("function");
        expect(typeof hooks["experimental.chat.system.transform"]).toBe("function");
        expect(typeof hooks["tool.execute.before"]).toBe("function");
        expect(typeof hooks["tool.execute.after"]).toBe("function");
        expect(typeof hooks.event).toBe("function");
        // tool is an object (not a function)
        expect(typeof hooks.tool).toBe("object");
        expect(hooks.tool).not.toBeNull();
    });
    // -----------------------------------------------------------------------
    test("registers the fusion:deliberate tool", async () => {
        const hooks = await FusionPlugin(mockPluginInput());
        expect(hooks.tool).toHaveProperty("fusion:deliberate");
        expect(hooks.tool["fusion:deliberate"]).toHaveProperty("description");
        expect(hooks.tool["fusion:deliberate"]).toHaveProperty("args");
        expect(typeof hooks.tool["fusion:deliberate"].execute).toBe("function");
    });
    // -----------------------------------------------------------------------
    test("invalid config — uses defaults and does not crash", async () => {
        const hooks = await FusionPlugin(mockPluginInput(), { panel: null });
        // Plugin returns hooks (didn't crash)
        expect(hooks["chat.message"]).toBeDefined();
        expect(hooks["chat.params"]).toBeDefined();
        expect(hooks["experimental.chat.messages.transform"]).toBeDefined();
        expect(hooks["experimental.chat.system.transform"]).toBeDefined();
        expect(hooks.tool).toBeDefined();
        expect(hooks["tool.execute.before"]).toBeDefined();
        expect(hooks["tool.execute.after"]).toBeDefined();
        expect(hooks.event).toBeDefined();
    });
    // -----------------------------------------------------------------------
    test("valid config — parses successfully", async () => {
        const hooks = await FusionPlugin(mockPluginInput(), DEFAULT_FUSION_CONFIG);
        expect(hooks["chat.message"]).toBeDefined();
        expect(typeof hooks["chat.message"]).toBe("function");
    });
    // -----------------------------------------------------------------------
    test("hooks are callable (placeholders execute without error)", async () => {
        const hooks = await FusionPlugin(mockPluginInput());
        // Chat hooks — call with minimal valid input
        await expect(hooks["chat.message"]({ sessionID: "s1" }, {
            message: {},
            parts: [],
        })).resolves.toBeUndefined();
        await expect(hooks["chat.params"]({ sessionID: "s2", agent: "a1" }, {})).resolves.toBeUndefined();
        // Transform hooks
        await expect(hooks["experimental.chat.messages.transform"]({}, { messages: [] })).resolves.toBeUndefined();
        await expect(hooks["experimental.chat.system.transform"]({}, { system: [] })).resolves.toBeUndefined();
        // Tool hooks
        await expect(hooks["tool.execute.before"]({ tool: "t", sessionID: "s3" }, {})).resolves.toBeUndefined();
        await expect(hooks["tool.execute.after"]({ tool: "t", sessionID: "s4" }, {})).resolves.toBeUndefined();
        // Event hook
        await expect(hooks.event({ event: {} })).resolves.toBeUndefined();
        // Tool execution — resolves even without a valid pipeline client (pipeline catches errors)
        await expect(hooks.tool["fusion:deliberate"].execute({ prompt: "test" }, {})).resolves.toBeDefined();
    });
});
//# sourceMappingURL=index.test.js.map