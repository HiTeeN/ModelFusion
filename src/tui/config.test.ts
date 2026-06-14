import { describe, expect, test, mock } from "bun:test";
import {
  createConfigUI,
  handlePanelAdd,
  handlePanelRemove,
  handleSetJudge,
  handleSetMode,
  handleConfigInput,
  formatConfigForDisplay,
  saveConfig,
} from "./config";
import type { TuiPluginApi, TuiCommand } from "@opencode-ai/plugin/tui";
import { DEFAULT_FUSION_CONFIG, type FusionConfig } from "../types/config";

// ---------------------------------------------------------------------------
// Mock TuiPluginApi factory
// ---------------------------------------------------------------------------

function mockApi(
  configOverride?: Partial<FusionConfig>,
): TuiPluginApi {
  const store = new Map<string, unknown>();

  const defaultConfig = structuredClone(DEFAULT_FUSION_CONFIG);
  if (configOverride) Object.assign(defaultConfig, configOverride);
  store.set("fusion.config", defaultConfig);

  let capturedPromptProps: Record<string, unknown> | null = null;

  return {
    app: { version: "1.0.0-test" },
    attention: {
      notify: mock(async () => ({ ok: true, notification: true, sound: false })),
      soundboard: {
        registerPack: mock(() => () => {}),
        activate: mock(() => true),
        current: mock(() => "default"),
        list: mock(() => []),
      },
    },
    command: {
      register: mock((cb: () => TuiCommand[]) => () => {}),
      trigger: mock(() => {}),
      show: mock(() => {}),
    },
    keys: {
      formatSequence: mock(() => ""),
      formatBindings: mock(() => undefined),
    },
    keymap: {
      registerLayer: mock(() => {}),
    } as TuiPluginApi["keymap"],
    mode: {
      current: mock(() => "normal"),
      push: mock(() => () => {}),
    },
    route: {
      register: mock(() => () => {}),
      navigate: mock(() => {}),
      current: { name: "home" },
    },
    ui: {
      Dialog: (() => null) as TuiPluginApi["ui"]["Dialog"],
      DialogAlert: (() => null) as TuiPluginApi["ui"]["DialogAlert"],
      DialogConfirm: (() => null) as TuiPluginApi["ui"]["DialogConfirm"],
      DialogPrompt: mock(
        (props: Record<string, unknown>) => {
          capturedPromptProps = props;
          return null;
        },
      ) as unknown as TuiPluginApi["ui"]["DialogPrompt"],
      DialogSelect: (() => null) as TuiPluginApi["ui"]["DialogSelect"],
      Slot: (() => null) as TuiPluginApi["ui"]["Slot"],
      Prompt: (() => null) as TuiPluginApi["ui"]["Prompt"],
      toast: mock(() => {}),
      dialog: {
        replace: mock(() => {}),
        clear: mock(() => {}),
        setSize: mock(() => {}),
        size: "medium",
        depth: 0,
        open: false,
      },
    },
    tuiConfig: {} as TuiPluginApi["tuiConfig"],
    kv: {
      get: <Value = unknown>(key: string, fallback?: Value): Value =>
        (store.has(key) ? store.get(key) : fallback) as Value,
      set: (key: string, value: unknown) => {
        store.set(key, value);
      },
      ready: true,
    },
    state: {} as TuiPluginApi["state"],
    theme: {} as TuiPluginApi["theme"],
    client: {
      session: {
        prompt: mock(async () => ({})),
      },
    } as unknown as TuiPluginApi["client"],
    event: {
      on: mock(() => () => {}),
    },
    renderer: {} as TuiPluginApi["renderer"],
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
      onDispose: mock(() => () => {}),
    },
  } as TuiPluginApi;
}

function mockDialogStack(
  overrides: Partial<TuiPluginApi["ui"]["dialog"]> = {},
): TuiPluginApi["ui"]["dialog"] {
  return {
    replace: mock(() => {}),
    clear: mock(() => {}),
    setSize: mock(() => {}),
    size: "medium",
    depth: 0,
    open: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createConfigUI", () => {
  // GIVEN a TuiPluginApi instance
  // WHEN createConfigUI is called
  // THEN it registers a command with the correct title, value, and category
  test("command registered with correct title", () => {
    const api = mockApi();
    createConfigUI(api);

    expect(api.keymap.registerLayer).toHaveBeenCalledTimes(1);

    const layer = (api.keymap.registerLayer as ReturnType<typeof mock>)
      .mock.calls[0][0] as { commands: Array<Record<string, unknown>> };

    expect(layer.commands).toHaveLength(1);

    const cmd = layer.commands[0];
    expect(cmd.title).toContain("Fusion");
    expect(cmd.title).toContain("Configuration");
    expect(cmd.name).toBe("fusion:config");
    expect(cmd.category).toBe("fusion");
    expect(cmd.slashName).toBe("fusion:config");
    expect((cmd.slashAliases as string[])).toContain("config");
    expect(typeof cmd.run).toBe("function");
  });

  // GIVEN a config command without a dialog context
  // WHEN onSelect is called with no dialog
  // THEN it shows the current config as a toast
  test("display current config via toast when no dialog", async () => {
    const api = mockApi();

    createConfigUI(api);

    const layer = (api.keymap.registerLayer as ReturnType<typeof mock>)
      .mock.calls[0][0] as { commands: Array<Record<string, unknown>> };

    const cmd = layer.commands[0];

    api.ui.dialog = mockDialogStack({
      replace: mock((renderFn: () => unknown) => {
        renderFn();
        const promptProps = (
          api.ui.DialogPrompt as ReturnType<typeof mock>
        ).mock.calls[
          (api.ui.DialogPrompt as ReturnType<typeof mock>).mock.calls
            .length - 1
        ][0] as Record<string, unknown>;

        const onConfirm = promptProps.onConfirm as (value: string) => void;
        onConfirm("");
      }),
    }) as TuiPluginApi["ui"]["dialog"];

    await (cmd.run as () => Promise<void>)();

    expect(api.ui.dialog.replace).toHaveBeenCalled();
    expect(api.ui.toast).toHaveBeenCalled();

    const toastCall = (api.ui.toast as ReturnType<typeof mock>).mock
      .calls[0][0] as Record<string, unknown>;
    expect(toastCall.variant).toBe("info");
    expect(toastCall.title).toBe("Fusion Configuration");
    expect(toastCall.message).toContain("Panel models");
  });

  // GIVEN a config command with a dialog
  // WHEN onSelect is called and user confirms "panel add openai gpt-4-turbo"
  // THEN the model is added and persisted
  test("panel add command adds a model to the panel", async () => {
    const api = mockApi();

    createConfigUI(api);

    const layer = (api.keymap.registerLayer as ReturnType<typeof mock>)
      .mock.calls[0][0] as { commands: Array<Record<string, unknown>> };

    const cmd = layer.commands[0];

    const dialogInput = "panel add openai gpt-4-turbo";
    api.ui.dialog = mockDialogStack({
      replace: mock((renderFn: () => unknown) => {
        renderFn();
        const promptProps = (
          api.ui.DialogPrompt as ReturnType<typeof mock>
        ).mock.calls[
          (api.ui.DialogPrompt as ReturnType<typeof mock>).mock.calls
            .length - 1
        ][0] as Record<string, unknown>;

        const onConfirm = promptProps.onConfirm as (value: string) => void;
        onConfirm(dialogInput);
      }),
    }) as TuiPluginApi["ui"]["dialog"];

    await (cmd.run as () => Promise<void>)();

    const stored = api.kv.get("fusion.config") as FusionConfig;
    const added = stored.panel.models.find(
      (m) => m.providerId === "openai" && m.modelId === "gpt-4-turbo",
    );
    expect(added).toBeDefined();

    const toastCalls = (api.ui.toast as ReturnType<typeof mock>).mock.calls;
    const successToast = toastCalls.find(
      (c: unknown[]) =>
        (c[0] as Record<string, unknown>).variant === "success",
    );
    expect(successToast).toBeDefined();
    expect((successToast![0] as Record<string, unknown>).title).toBe(
      "Fusion Config Updated",
    );
  });

  // GIVEN a panel with "gpt-4o-mini" model
  // WHEN panel remove gpt-4o-mini is executed
  // THEN the model is removed from the panel
  test("panel remove command removes a model from the panel", async () => {
    const api = mockApi({
      panel: {
        models: [
          { providerId: "openai", modelId: "gpt-4o-mini" },
          { providerId: "anthropic", modelId: "claude-3-haiku" },
        ],
        maxModels: 8,
      },
    });

    createConfigUI(api);

    const layer = (api.keymap.registerLayer as ReturnType<typeof mock>)
      .mock.calls[0][0] as { commands: Array<Record<string, unknown>> };

    const cmd = layer.commands[0];

    const dialogInput = "panel remove gpt-4o-mini";
    api.ui.dialog = mockDialogStack({
      replace: mock((renderFn: () => unknown) => {
        renderFn();
        const promptProps = (
          api.ui.DialogPrompt as ReturnType<typeof mock>
        ).mock.calls[
          (api.ui.DialogPrompt as ReturnType<typeof mock>).mock.calls
            .length - 1
        ][0] as Record<string, unknown>;

        const onConfirm = promptProps.onConfirm as (value: string) => void;
        onConfirm(dialogInput);
      }),
    }) as TuiPluginApi["ui"]["dialog"];

    await (cmd.run as () => Promise<void>)();

    const stored = api.kv.get("fusion.config") as FusionConfig;
    const removed = stored.panel.models.find(
      (m) => m.modelId === "gpt-4o-mini",
    );
    expect(removed).toBeUndefined();
    expect(stored.panel.models).toHaveLength(1);

    const toastCalls = (api.ui.toast as ReturnType<typeof mock>).mock.calls;
    const successToast = toastCalls.find(
      (c: unknown[]) =>
        (c[0] as Record<string, unknown>).variant === "success",
    );
    expect(successToast).toBeDefined();
  });

  // GIVEN a config with the default judge
  // WHEN judge command is executed
  // THEN the judge is updated and persisted
  test("judge command changes the judge model", async () => {
    const api = mockApi();

    createConfigUI(api);

    const layer = (api.keymap.registerLayer as ReturnType<typeof mock>)
      .mock.calls[0][0] as { commands: Array<Record<string, unknown>> };

    const cmd = layer.commands[0];

    const dialogInput = "judge anthropic claude-3-opus";
    api.ui.dialog = mockDialogStack({
      replace: mock((renderFn: () => unknown) => {
        renderFn();
        const promptProps = (
          api.ui.DialogPrompt as ReturnType<typeof mock>
        ).mock.calls[
          (api.ui.DialogPrompt as ReturnType<typeof mock>).mock.calls
            .length - 1
        ][0] as Record<string, unknown>;

        const onConfirm = promptProps.onConfirm as (value: string) => void;
        onConfirm(dialogInput);
      }),
    }) as TuiPluginApi["ui"]["dialog"];

    await (cmd.run as () => Promise<void>)();

    const stored = api.kv.get("fusion.config") as FusionConfig;
    expect(stored.judge.providerId).toBe("anthropic");
    expect(stored.judge.modelId).toBe("claude-3-opus");
  });

  // GIVEN a config with manual triggering
  // WHEN mode auto is executed
  // THEN the trigger mode changes to "auto"
  test("mode command changes the triggering mode", async () => {
    const api = mockApi({ triggering: "manual" });

    createConfigUI(api);

    const layer = (api.keymap.registerLayer as ReturnType<typeof mock>)
      .mock.calls[0][0] as { commands: Array<Record<string, unknown>> };

    const cmd = layer.commands[0];

    const dialogInput = "mode auto";
    api.ui.dialog = mockDialogStack({
      replace: mock((renderFn: () => unknown) => {
        renderFn();
        const promptProps = (
          api.ui.DialogPrompt as ReturnType<typeof mock>
        ).mock.calls[
          (api.ui.DialogPrompt as ReturnType<typeof mock>).mock.calls
            .length - 1
        ][0] as Record<string, unknown>;

        const onConfirm = promptProps.onConfirm as (value: string) => void;
        onConfirm(dialogInput);
      }),
    }) as TuiPluginApi["ui"]["dialog"];

    await (cmd.run as () => Promise<void>)();

    const stored = api.kv.get("fusion.config") as FusionConfig;
    expect(stored.triggering).toBe("auto");
  });

  // GIVEN a valid config
  // WHEN an invalid change is submitted ("mode blarg")
  // THEN an error toast is shown
  test("invalid change shows error", async () => {
    const api = mockApi();

    createConfigUI(api);

    const layer = (api.keymap.registerLayer as ReturnType<typeof mock>)
      .mock.calls[0][0] as { commands: Array<Record<string, unknown>> };

    const cmd = layer.commands[0];

    const dialogInput = "mode blarg";
    api.ui.dialog = mockDialogStack({
      replace: mock((renderFn: () => unknown) => {
        renderFn();
        const promptProps = (
          api.ui.DialogPrompt as ReturnType<typeof mock>
        ).mock.calls[
          (api.ui.DialogPrompt as ReturnType<typeof mock>).mock.calls
            .length - 1
        ][0] as Record<string, unknown>;

        const onConfirm = promptProps.onConfirm as (value: string) => void;
        onConfirm(dialogInput);
      }),
    }) as TuiPluginApi["ui"]["dialog"];

    await (cmd.run as () => Promise<void>)();

    const toastCalls = (api.ui.toast as ReturnType<typeof mock>).mock.calls;
    const errorToast = toastCalls.find(
      (c: unknown[]) =>
        (c[0] as Record<string, unknown>).variant === "error",
    );
    expect(errorToast).toBeDefined();
    expect((errorToast![0] as Record<string, unknown>).title).toBe(
      "Fusion Config Error",
    );
  });

  // GIVEN a config displayed in a dialog
  // WHEN the user cancels the dialog
  // THEN no config changes are persisted
  test("dialog cancellation does not persist changes", async () => {
    const api = mockApi();

    createConfigUI(api);

    const layer = (api.keymap.registerLayer as ReturnType<typeof mock>)
      .mock.calls[0][0] as { commands: Array<Record<string, unknown>> };

    const cmd = layer.commands[0];

    api.ui.dialog = mockDialogStack({
      replace: mock((renderFn: () => unknown) => {
        renderFn();
        const promptProps = (
          api.ui.DialogPrompt as ReturnType<typeof mock>
        ).mock.calls[
          (api.ui.DialogPrompt as ReturnType<typeof mock>).mock.calls
            .length - 1
        ][0] as Record<string, unknown>;

        const onCancel = promptProps.onCancel as () => void;
        onCancel();
      }),
    }) as TuiPluginApi["ui"]["dialog"];

    await (cmd.run as () => Promise<void>)();

    const stored = api.kv.get("fusion.config") as FusionConfig;
    expect(stored.panel.models).toHaveLength(
      DEFAULT_FUSION_CONFIG.panel.models.length,
    );
    expect(stored.triggering).toBe(DEFAULT_FUSION_CONFIG.triggering);
  });
});

describe("handlePanelAdd", () => {
  const baseConfig = structuredClone(DEFAULT_FUSION_CONFIG);

  test("successfully adds a new model", () => {
    const result = handlePanelAdd(baseConfig, ["google", "gemini-pro"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.panel.models).toHaveLength(4);
      expect(
        result.config.panel.models.find(
          (m) => m.providerId === "google" && m.modelId === "gemini-pro",
        ),
      ).toBeDefined();
    }
  });

  test("rejects duplicate model", () => {
    const result = handlePanelAdd(baseConfig, ["openai", "gpt-4o-mini"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("already in the panel");
    }
  });

  test("rejects missing arguments", () => {
    const result = handlePanelAdd(baseConfig, ["openai"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Usage");
    }
  });
});

describe("handlePanelRemove", () => {
  test("successfully removes an existing model", () => {
    const config = structuredClone(DEFAULT_FUSION_CONFIG);
    const result = handlePanelRemove(config, ["gpt-4o-mini"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const removed = result.config.panel.models.find(
        (m) => m.modelId === "gpt-4o-mini",
      );
      expect(removed).toBeUndefined();
    }
  });

  test("rejects removing last model", () => {
    const config: FusionConfig = {
      ...DEFAULT_FUSION_CONFIG,
      panel: {
        models: [{ providerId: "openai", modelId: "gpt-4o-mini" }],
        maxModels: 8,
      },
    };
    const result = handlePanelRemove(config, ["gpt-4o-mini"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("last panel model");
    }
  });

  test("rejects non-existent model", () => {
    const config = structuredClone(DEFAULT_FUSION_CONFIG);
    const result = handlePanelRemove(config, ["nonexistent-model"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not found");
    }
  });
});

describe("handleSetJudge", () => {
  test("successfully updates judge", () => {
    const config = structuredClone(DEFAULT_FUSION_CONFIG);
    const result = handleSetJudge(config, ["google", "gemini-ultra"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.judge.providerId).toBe("google");
      expect(result.config.judge.modelId).toBe("gemini-ultra");
    }
  });

  test("rejects missing arguments", () => {
    const config = structuredClone(DEFAULT_FUSION_CONFIG);
    const result = handleSetJudge(config, ["openai"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Usage");
    }
  });
});

describe("handleSetMode", () => {
  test("successfully changes to threshold mode", () => {
    const config = structuredClone(DEFAULT_FUSION_CONFIG);
    const result = handleSetMode(config, ["threshold"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.triggering).toBe("threshold");
    }
  });

  test("rejects invalid mode", () => {
    const config = structuredClone(DEFAULT_FUSION_CONFIG);
    const result = handleSetMode(config, ["blarg"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid option");
    }
  });

  test("rejects empty args", () => {
    const config = structuredClone(DEFAULT_FUSION_CONFIG);
    const result = handleSetMode(config, []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Usage");
    }
  });
});

describe("formatConfigForDisplay", () => {
  test("includes panel models, judge, and trigger mode", () => {
    const output = formatConfigForDisplay(DEFAULT_FUSION_CONFIG);
    expect(output).toContain("Panel models");
    expect(output).toContain("openai / gpt-4o-mini");
    expect(output).toContain("Judge:");
    expect(output).toContain("Trigger mode:");
    expect(output).toContain("manual");
  });
});

describe("saveConfig", () => {
  test("persists config to kv", () => {
    const api = mockApi();
    const config = structuredClone(DEFAULT_FUSION_CONFIG);
    config.triggering = "auto";

    saveConfig(api.kv, config);

    const stored = api.kv.get("fusion.config") as FusionConfig;
    expect(stored.triggering).toBe("auto");
  });
});

describe("handleConfigInput", () => {
  test("unknown subcommand shows error", () => {
    const api = mockApi();
    handleConfigInput(api, "banana something");
    const toastCalls = (api.ui.toast as ReturnType<typeof mock>).mock.calls;
    const errorToast = toastCalls.find(
      (c: unknown[]) =>
        (c[0] as Record<string, unknown>).variant === "error",
    );
    expect(errorToast).toBeDefined();
    expect((errorToast![0] as Record<string, unknown>).message).toContain(
      "Unknown subcommand",
    );
  });

  test("panel without action shows error", () => {
    const api = mockApi();
    handleConfigInput(api, "panel");
    const toastCalls = (api.ui.toast as ReturnType<typeof mock>).mock.calls;
    const errorToast = toastCalls.find(
      (c: unknown[]) =>
        (c[0] as Record<string, unknown>).variant === "error",
    );
    expect(errorToast).toBeDefined();
    expect((errorToast![0] as Record<string, unknown>).message).toContain(
      "Unknown panel action",
    );
  });
});
