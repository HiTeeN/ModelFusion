import { describe, expect, test } from "bun:test";
import { createConfigHook } from "./config.js";

describe("createConfigHook", () => {
  test("GIVEN empty config WHEN hook runs THEN fusion commands are registered", async () => {
    const hook = createConfigHook();
    const config: Record<string, unknown> = {};

    await hook(config);

    const commands = config.command as Record<string, { template: string; description: string }>;
    expect(commands.fusion).toBeDefined();
    expect(commands.fusion.template).toBe("/fusion $ARGUMENTS");
    expect(commands["fusion:config"].template).toBe("/fusion:config");
  });

  test("GIVEN existing commands WHEN hook runs THEN existing commands are preserved", async () => {
    const hook = createConfigHook();
    const config: Record<string, unknown> = {
      command: {
        helpme: {
          template: "show help",
          description: "custom help",
        },
      },
    };

    await hook(config);

    const commands = config.command as Record<string, { template: string; description: string }>;
    expect(commands.helpme).toBeDefined();
    expect(commands.fusion).toBeDefined();
  });
});
