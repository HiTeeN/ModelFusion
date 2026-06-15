import { describe, expect, test, mock } from "bun:test";
import pluginModule, { FusionTuiPlugin, tui } from "./index";
import type { TuiPluginApi, TuiCommand } from "@opencode-ai/plugin/tui";

// ---------------------------------------------------------------------------
// Mock TuiPluginApi factory
// ---------------------------------------------------------------------------

function mockApi(overrides: Partial<TuiPluginApi> = {}): TuiPluginApi {
  const store = new Map<string, unknown>();

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
      DialogPrompt: (() => null) as TuiPluginApi["ui"]["DialogPrompt"],
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
    client: {} as TuiPluginApi["client"],
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
    ...overrides,
  } as TuiPluginApi;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FusionTuiPlugin", () => {
  test("is a function", () => {
    expect(typeof FusionTuiPlugin).toBe("function");
    expect(typeof tui).toBe("function");
    expect(pluginModule.tui).toBe(tui);
  });

  test("registers the /fusion command via api.keymap.registerLayer", async () => {
    const api = mockApi();

    await FusionTuiPlugin(api, undefined, undefined as any);

    expect(api.keymap.registerLayer).toHaveBeenCalledTimes(2);

    const firstLayer = (api.keymap.registerLayer as ReturnType<typeof mock>)
      .mock.calls[0][0] as { commands: Array<Record<string, unknown>> };
    const secondLayer = (api.keymap.registerLayer as ReturnType<typeof mock>)
      .mock.calls[1][0] as { commands: Array<Record<string, unknown>> };

    const fusionCommands = firstLayer.commands;
    const configCommands = secondLayer.commands;

    const fusionCmd = fusionCommands.find((c) => c.name === "fusion:deliberate");
    const configCmd = configCommands.find((c) => c.name === "fusion:config");
    expect(fusionCmd).toBeDefined();
    expect(configCmd).toBeDefined();
    expect(fusionCmd!.title).toContain("Fusion");
    expect(fusionCmd!.slashName).toBe("fusion");
    expect((fusionCmd!.slashAliases as string[])).toContain("deliberate");
    expect(fusionCmd!.category).toBe("fusion");
    expect(typeof fusionCmd!.run).toBe("function");
  });

  test("initializes plugin state in api.kv", async () => {
    const api = mockApi();

    await FusionTuiPlugin(api, undefined, undefined as any);

    expect(api.kv.get("fusion.initialized") as unknown).toBe(true);
    expect(api.kv.get("fusion.version") as unknown).toBe("0.1.0");
  });

  test("subscribes to session lifecycle events", async () => {
    const api = mockApi();

    await FusionTuiPlugin(api, undefined, undefined as any);

    expect(api.event.on).toHaveBeenCalledTimes(2);

    // Verify the event types subscribed to
    const calls = (api.event.on as ReturnType<typeof mock>).mock.calls;
    const eventTypes = calls.map((c) => c[0]);
    expect(eventTypes).toContain("session.created");
    expect(eventTypes).toContain("session.deleted");
  });

  test("registers cleanup via lifecycle.onDispose", async () => {
    const api = mockApi();

    await FusionTuiPlugin(api, undefined, undefined as any);

    expect(api.lifecycle.onDispose).toHaveBeenCalledTimes(1);
  });

  test("run handler calls ui.toast for missing prompt", async () => {
    const api = mockApi();

    await FusionTuiPlugin(api, undefined, undefined as any);

    const layer = (api.keymap.registerLayer as ReturnType<typeof mock>)
      .mock.calls[0][0] as { commands: Array<Record<string, unknown>> };

    const commands = layer.commands;
    const fusionCmd = commands.find((c) => c.name === "fusion:deliberate")!;

    await (fusionCmd.run as () => Promise<void>)();

    expect(api.ui.toast).toHaveBeenCalledTimes(1);
    const toastCall = (api.ui.toast as ReturnType<typeof mock>).mock.calls[0][0];
    expect(toastCall.variant).toBe("warning");
    expect(toastCall.title).toBe("Fusion");
    expect(toastCall.message).toContain("No question provided");
  });
});
