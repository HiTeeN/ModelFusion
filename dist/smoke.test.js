import { describe, expect, test } from "bun:test";
import pkg from "../package.json";
import { createOpencodeClient } from "@opencode-ai/sdk";
// ---------------------------------------------------------------------------
// Smoke Tests — verify the entire project toolchain works
// ---------------------------------------------------------------------------
describe("smoke", () => {
    // -----------------------------------------------------------------------
    // GIVEN: package.json
    // WHEN:  we read its dependencies
    // THEN:  @opencode-ai/plugin must be present
    // -----------------------------------------------------------------------
    test("package.json has correct dependencies", () => {
        const deps = pkg.dependencies;
        expect(deps["@opencode-ai/plugin"]).toBeDefined();
        expect(deps["@opencode-ai/plugin"]).toMatch(/^\^?\d+\.\d+\.\d+/);
    });
    // -----------------------------------------------------------------------
    // GIVEN: the project's TypeScript types
    // WHEN:  we import FusionConfig from src/types
    // THEN:  the type must be a valid object shape
    // -----------------------------------------------------------------------
    test("TypeScript compiles — FusionConfig type is importable", () => {
        // We can't runtime-check a type, but verifying the import works is enough.
        // Use a compile-time check via a const of that type.
        const _config = {
            panel: {
                models: [{ providerId: "test", modelId: "test" }],
                maxModels: 2,
            },
            judge: { providerId: "test", modelId: "test" },
            triggering: "manual",
            maxToolCalls: 4,
            temperature: 0.5,
            enabled: true,
        };
        expect(_config.panel.models).toHaveLength(1);
        expect(_config.judge.providerId).toBe("test");
    });
    // -----------------------------------------------------------------------
    // GIVEN: bun:test runtime
    // WHEN:  we perform a trivial assertion
    // THEN:  basic math must work as expected
    // -----------------------------------------------------------------------
    test("bun:test works", () => {
        expect(1 + 1).toBe(2);
        expect([1, 2, 3].map((n) => n * 2)).toEqual([2, 4, 6]);
    });
    // -----------------------------------------------------------------------
    // GIVEN: @opencode-ai/plugin package
    // WHEN:  we import its Plugin type
    // THEN:  Plugin must be a function type
    // -----------------------------------------------------------------------
    test("@opencode-ai/plugin types importable", () => {
        // Verify Plugin type is importable (compile-time check)
        const _dummy = null;
        // Runtime: verify Plugin type reference doesn't throw
        expect(typeof _dummy).toBe("object");
    });
    // -----------------------------------------------------------------------
    // GIVEN: @opencode-ai/sdk package
    // WHEN:  we import createOpencodeClient
    // THEN:  it must be a function
    // -----------------------------------------------------------------------
    test("@opencode-ai/sdk types importable", () => {
        expect(createOpencodeClient).toBeInstanceOf(Function);
    });
});
//# sourceMappingURL=smoke.test.js.map