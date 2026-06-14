# Glossary

Terminology used throughout the ModelFusion plugin documentation and codebase.

---

### Attribution

The practice of tracing specific claims, insights, or analysis in the synthesized answer back to the panel model that contributed them. The synthesizer is instructed to include phrases like "Claude noted that..." or "GPT-4o uniquely observed..." to give credit to individual models.

---

### Blind Spots

Important aspects or dimensions of the user's query that no panel model addressed. Identified by the judge during comparison. Reported as an array of strings in the `JudgeOutput`.

---

### Consensus Point

A conclusion or observation where multiple panel models independently agreed. Recorded by the judge with `point` (the agreed-upon statement) and `supportingModels` (the models that expressed it).

---

### Contradiction

A topic where two or more panel models gave conflicting answers or took opposing stances. Recorded by the judge with `topic`, and `stances` (each model's position on the topic).

---

### Cost Tracker

A utility class (`CostTracker`) that accumulates token counts across all pipeline stages (panelist, judge, synthesis) and estimates dollar costs using configurable pricing tiers (budget, standard, premium).

---

### Degradation

Graceful fallback behavior when components of the fusion pipeline fail. Three scenarios:
1. **Judge fails**: Panel responses are shown directly to the user (status: "degraded")
2. **Partial panel failure**: Working responses proceed through judge + synthesis; failed models are listed
3. **All panelists fail**: The original session model handles the prompt (status: "error")

---

### Fan-Out

The stage in the pipeline where the user's prompt is dispatched to all panel models in parallel. Uses `Promise.allSettled` for concurrent execution with individual error isolation. Each panelist receives the exact same verbatim prompt.

---

### Fan-In

The stage where panelist responses are collected and passed to the judge for comparison. All successful responses are included in the judge prompt.

---

### Fusion Pipeline

The end-to-end process from user prompt to final answer: recursion guard check → fan-out to panel → judge comparison → synthesis → cost tracking → degradation handling. Orchestrated by `runFusionPipeline()`.

---

### Judge

The model responsible for comparing all panel responses and producing a structured JSON analysis. The judge evaluates each response across 4 dimensions (completeness, accuracy, novelty, clarity), identifies consensus/contradictions/blind spots, and optionally declares a winner. The judge does NOT produce the final answer.

---

### Panel

The set of AI models that receive the user's prompt in parallel. Configurable via `panel.models` (1-8 models). Each model on the panel is called simultaneously with the verbatim prompt. Panelists are blind to each other's responses.

---

### Partial Coverage

A subtopic or aspect of the query that only some panel models addressed. Identified by the judge. Recorded with `point` (the topic) and `models` (which models covered it).

---

### Recursion Guard

A mechanism (`RecursionGuard` class) that prevents nested fusion calls within the same session. Uses an in-memory `Map<string, boolean>` to track active fusion state. If fusion is already running when a second call is attempted, the guard blocks it and returns an error with `failureReason: "fusion_invocation_capped"`. Single-level only (no multi-turn recursion).

---

### Scoring

The judge's quantitative evaluation of each panel model's response across 4 dimensions (0-10 each): completeness, accuracy, novelty, and clarity. The total is the sum (0-40). Recorded per model in the `JudgeOutput`.

---

### Synthesizer

The stage that produces the final answer using the judge's structured analysis. Uses the **original session model** (not the judge model). The synthesis prompt includes the full judge JSON output, all panel responses, and instructions to produce a coherent, attributed answer.

---

### Threshold Mode

A triggering mode where deliberation activates automatically when the prompt meets certain conditions: length exceeds `minPromptLength` OR contains any configured `keywords`. A middle ground between manual control and full automation.

---

### Unique Insight

A valuable contribution made by only a single panel model that no other model mentioned. Identified by the judge. Recorded with `modelId` (the source) and `insight` (the contribution).

---

### Verbatim Prompting

The rule that panelists receive the exact user prompt with no modifications. No lenses, roles, personas, or system prompts are added. This ensures each model's response reflects its genuine capabilities without framing bias.