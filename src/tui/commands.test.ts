import { describe, expect, test, mock } from "bun:test";
import { createFusionCommand } from "./commands";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import {
  emitFusionProgress,
  getFusionProgressListenerCount,
} from "../progress-bus";

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
      register: mock(() => () => {}),
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
    ...overrides,
  } as TuiPluginApi;
}

function openDialogStack(
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

    let capturedOnConfirm: ((value: string) => void) | undefined;

    const dialog = openDialogStack({
      replace: mock((renderFn: () => unknown) => {
        renderFn();
        capturedOnConfirm?.("What is the meaning of life?");
      }),
    });
    api.ui.dialog = dialog;

    (api.ui.DialogPrompt as ReturnType<typeof mock>) = mock(
      (props: Record<string, unknown>) => {
        capturedOnConfirm = props.onConfirm as (value: string) => void;
        return null;
      },
    );

    const cmd = createFusionCommand(api);

    await cmd.onSelect?.();

    expect(api.client.session.prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "fusion:manual",
        parts: [{ type: "text", text: "What is the meaning of life?" }],
      }),
    );
    expect(api.client.session.prompt).toHaveBeenCalled();
    expect(getFusionProgressListenerCount()).toBe(1);

    emitFusionProgress({
      sessionID: "",
      stage: "judging",
      detail: "Evaluating 3 panel responses...",
    });

    const toastCalls = (api.ui.toast as ReturnType<typeof mock>).mock.calls;
    const infoToast = toastCalls.find(
      (c: unknown[]) =>
        (c[0] as Record<string, unknown>).variant === "info" &&
        String((c[0] as Record<string, unknown>).title).includes("judging"),
    );
    expect(infoToast).toBeDefined();
    expect((infoToast![0] as Record<string, unknown>).message).toContain(
      "Evaluating 3 panel responses",
    );

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

    const toastCalls = (api.ui.toast as ReturnType<typeof mock>).mock.calls;
    expect(toastCalls.length).toBeGreaterThanOrEqual(1);

    const warningToast = toastCalls.find(
      (c: unknown[]) => (c[0] as Record<string, unknown>).variant === "warning",
    );
    expect(warningToast).toBeDefined();
    expect((warningToast![0] as Record<string, unknown>).title).toBe("Fusion");
    expect((warningToast![0] as Record<string, unknown>).message).toContain(
      "No question provided",
    );

    expect(api.client.session.prompt).not.toHaveBeenCalled();
  });

  // GIVEN a command invoked with a dialog where the user cancels
  // WHEN run() is called and the dialog is cancelled
  // THEN a warning toast is shown and no pipeline delegation occurs
  test("run() handles dialog cancellation gracefully", async () => {
    const api = mockApi();

    let capturedOnCancel: (() => void) | undefined;

    const dialog = openDialogStack({
      replace: mock((renderFn: () => unknown) => {
        renderFn();
        capturedOnCancel?.();
      }),
    });
    api.ui.dialog = dialog;

    (api.ui.DialogPrompt as ReturnType<typeof mock>) = mock(
      (props: Record<string, unknown>) => {
        capturedOnCancel = props.onCancel as () => void;
        return null;
      },
    );

    const cmd = createFusionCommand(api);

    await cmd.onSelect?.();

    const toastCalls = (api.ui.toast as ReturnType<typeof mock>).mock.calls;

    const warningToast = toastCalls.find(
      (c: unknown[]) => (c[0] as Record<string, unknown>).variant === "warning",
    );
    expect(warningToast).toBeDefined();
    expect((warningToast![0] as Record<string, unknown>).message).toContain(
      "No question provided",
    );

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
        register: mock(() => () => {}),
        navigate: mock(() => {}),
        current: { name: "session", params: { sessionID: "ses_local" } },
      } as TuiPluginApi["route"],
    });

    let capturedOnConfirm: ((value: string) => void) | undefined;
    api.ui.dialog = openDialogStack({
      replace: mock((renderFn: () => unknown) => {
        renderFn();
        capturedOnConfirm?.("Question");
      }),
    });

    (api.ui.DialogPrompt as ReturnType<typeof mock>) = mock(
      (props: Record<string, unknown>) => {
        capturedOnConfirm = props.onConfirm as (value: string) => void;
        return null;
      },
    );

    const cmd = createFusionCommand(api);
    await cmd.onSelect?.();

    emitFusionProgress({
      sessionID: "ses_other",
      stage: "judging",
      detail: "Should be ignored",
    });

    const toastCalls = (api.ui.toast as ReturnType<typeof mock>).mock.calls;
    expect(
      toastCalls.some((c: unknown[]) =>
        String((c[0] as Record<string, unknown>).message).includes(
          "Should be ignored",
        ),
      ),
    ).toBe(false);

    emitFusionProgress({
      sessionID: "ses_local",
      stage: "complete",
      detail: "Done",
    });
  });
});
