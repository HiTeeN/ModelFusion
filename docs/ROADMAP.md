# Roadmap

Current state, planned improvements, and long-term vision for the ModelFusion plugin.

---

## v1.0 (Current — 0.1.0)

**Status**: Complete. 162 tests, 624 expect() calls, all passing.

**v1.17.6 API Migration**: All source code and documentation have been migrated to the OpenCode v1.17.6 API. Key changes:
- `session.prompt()` now uses a single params object with `sessionID`, `model`, and `parts` (instead of two arguments with `prompt` string)
- Response shape changed from `choices[0].message.content` to `parts.filter(p => p.type === "text")`
- Token counting changed from `usage.prompt_tokens` to `info.tokens.input` / `output`
- Tool registration uses `tool()` from `@opencode-ai/plugin/tool` with `tool.schema.string()`
- TUI commands use `api.keymap.registerLayer` instead of `api.command`
- All hook signatures updated to match v1.17.6 types (`UserMessage`, `Part`, `Model`, `ProviderContext`)

### Features

- Core fusion pipeline: fan-out to panel models, judge comparison, synthesis
- 3 triggering modes: manual, auto, threshold
- Structured JSON judge output with 6 analysis sections (consensus, contradictions, partial coverage, unique insights, blind spots, scoring)
- TUI plugin with `/fusion` slash command (aliases: `/deliberate`, `/panel`)
- Config UI with `/fusion:config` command for runtime configuration editing
- Graceful degradation: judge failure, partial panel failure, all-panel failure, recursion guard
- Cost tracking with 3 pricing tiers (budget, standard, premium)
- Recursion guard (single-level, prevents nested fusion)
- Toast-based progress notifications at each pipeline stage
- Provider/model discovery and validation
- Error hardening: per-panelist timeout (120s), retry logic (1 retry), JSON repair (3 strategies), input sanitization
- Loose typing throughout — no SDK coupling
- Full test suite with mock isolation (`--isolate`)

### Known Limitations

- Judge and synthesis token counts not captured from API responses (tracked as 0)
- Config persistence uses TUI plugin KV — not persisted to opencode.json
- TUI progress toasts use fixed `setTimeout` durations (not actual pipeline events)
- No web search or web fetch augmentation
- No multi-turn deliberation
- No code merge workflows

---

## v1.1 (Next)

**Target**: Token tracking, streaming, config persistence improvements.

### Proposed Features

- **Real token counting for judge and synthesis stages**
  - Current: `trackJudge(0, 0)` and `trackSynthesis(0, 0)` because token counts are not extracted from the response
  - Fix: Extract `usage` from judge and synthesis API responses, pass to CostTracker
  - Impact: Accurate cost reporting for all pipeline stages

- **Fix zod type conflict at plugin boundary**
  - Current: `as unknown as Hooks` cast needed because of zod v4 vs SDK zod v1 mismatch
  - Fix: Either align zod versions or add a proper adapter layer
  - Impact: Cleaner type safety at the plugin boundary

- **Streaming progress for panel responses**
  - Current: Users see nothing until all panelists complete
  - Fix: Stream each panelist's response as it arrives
  - Impact: Better UX for long-running deliberations

- **Config persistence to opencode.json**
  - Current: Config stored in TUI plugin KV only
  - Fix: Write config changes back to `opencode.json` via the API
  - Impact: Config survives full restarts and is visible in config file

---

## v1.5 (Medium-term)

**Target**: Pricing, A/B comparison, auto-discovery.

### Proposed Features

- **Model-specific pricing tiers**
  - Current: 3 fixed tiers (budget/standard/premium) per model
  - Fix: Map individual model IDs to specific pricing, or fetch real pricing from provider APIs
  - Impact: Accurate cost estimation for any model combination

- **A/B panel comparison mode**
  - Run two different panel configurations on the same prompt and compare results
  - Useful for evaluating which panel models or judge settings produce better outputs

- **Panel model auto-discovery from opencode providers**
  - Current: Providers are discovered but auto-selection is not implemented
  - Fix: When panel models are not specified, auto-select diverse models from available providers
  - Impact: Zero-config fusion for users who don't want to manually configure models

---

## v2.0 (Long-term)

**Target**: Web augmentation, code merge, multi-turn deliberation.

### Proposed Features

- **`web_search` and `web_fetch` for panel and judge**
  - Panel models get web search results as context
  - Judge can verify claims against live sources
  - Marked as "Track B (research)" in original plan

- **Track A: Code merge via execution sandbox**
  - Beyond analysis: merge code from multiple panelists into a unified implementation
  - Requires an execution sandbox for running and testing merged code
  - Marked as "Track A (code merge)" in original plan — deferred from v1

- **Multi-turn deliberation**
  - Current: Panel runs once per trigger, single round of responses
  - Future: Panelists respond, see each other's answers, refine their own
  - Multiple rounds of judge evaluation with iterative improvement
  - Requires significant architectural changes to the pipeline

- **Custom judge prompts and evaluation rubrics**
  - Current: Judge prompt is hardcoded with fixed analysis sections
  - Future: Users can configure custom evaluation criteria, scoring dimensions, and analysis sections

- **Deliberation history persistence**
  - Current: Fusion results are ephemeral (injected into message history only)
  - Future: Store deliberation results in a queryable database for later reference

---

## Design Principles (All Versions)

1. **No SDK coupling** — All client interfaces are locally defined, loosely typed. The plugin should survive OpenCode SDK version bumps without changes.
2. **Graceful degradation** — Every failure mode has a defined fallback. The user never gets a broken experience.
3. **Verbatim prompting** — Panelists receive the exact user prompt. No lenses, roles, or personas that could bias responses.
4. **Attribution** — All claims in synthesized answers are traceable to specific panel models.
5. **User control** — Manual mode is default. Auto and threshold modes are opt-in. The user decides when deliberation runs.
6. **Test isolation** — Every test file runs in its own worker process (`--isolate`). No mock leaks between tests.