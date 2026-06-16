import { JUDGE_OUTPUT_SCHEMA } from "../types/schema.js";
// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------
function buildJudgePrompt(panelResults) {
    const responses = panelResults
        .map((r, i) => `### Response ${i + 1} — ${r.providerId}/${r.modelId}\n\n${r.content}`)
        .join("\n\n---\n\n");
    return `You are a judge comparing responses from multiple AI models to the same prompt. Analyze their responses and produce structured JSON output. Do NOT merge or synthesize — compare and contrast.

Below are the responses from each model:

${responses}

---
Analyze these responses and return a JSON object with the following sections:
- **consensus**: Points where multiple models agree
- **contradictions**: Topics where models gave conflicting answers
- **partial_coverage**: Topics addressed by only some models
- **unique_insights**: Valuable contributions from a single model
- **blind_spots**: Important aspects no model addressed
- **scoring**: Quality scores (0-10) for each model on completeness, accuracy, novelty, clarity, plus a total (0-40)
- **winner**: The model ID with the best overall response, or null if no clear winner

Return ONLY valid JSON — no markdown, no commentary.`;
}
// ---------------------------------------------------------------------------
// Normalization: convert snake_case JSON schema output to camelCase JudgeOutput
// ---------------------------------------------------------------------------
function normalizeJudgeOutput(raw) {
    return {
        consensus: raw.consensus?.map((c) => ({
            point: String(c.point ?? ""),
            supportingModels: c.supporting_models ?? [],
        })) ?? [],
        contradictions: raw.contradictions?.map((c) => ({
            topic: String(c.topic ?? ""),
            stances: c.stances?.map((s) => ({
                modelId: String(s.model_id ?? ""),
                stance: String(s.stance ?? ""),
            })) ?? [],
        })) ?? [],
        partial_coverage: raw.partial_coverage?.map((p) => ({
            point: String(p.point ?? ""),
            models: p.models ?? [],
        })) ?? [],
        unique_insights: raw.unique_insights?.map((u) => ({
            modelId: String(u.model_id ?? ""),
            insight: String(u.insight ?? ""),
        })) ?? [],
        blind_spots: raw.blind_spots ?? [],
        scoring: raw.scoring?.map((s) => ({
            modelId: String(s.model_id ?? ""),
            scores: {
                completeness: Number(s.scores?.completeness ?? 0),
                accuracy: Number(s.scores?.accuracy ?? 0),
                novelty: Number(s.scores?.novelty ?? 0),
                clarity: Number(s.scores?.clarity ?? 0),
            },
            total: Number(s.total ?? 0),
        })) ?? [],
        winner: raw.winner != null ? String(raw.winner) : null,
    };
}
// ---------------------------------------------------------------------------
// JSON repair: attempt to extract valid JSON from malformed LLM output
// ---------------------------------------------------------------------------
/**
 * Attempts to extract a JSON object from a string that may contain
 * markdown code fences, extra text, or truncated content.
 *
 * Strategies (tried in order):
 *   1. Exact parse (no repair needed)
 *   2. Strip markdown ```json ... ``` fences and parse
 *   3. Find first `{` — last `}` span via regex and parse
 */
function tryJSONRepair(raw) {
    // Strategy 1: Try direct parse first (common case, no overhead)
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            return parsed;
        }
    }
    catch {
        // Fall through to repair strategies
    }
    // Strategy 2: Strip markdown code fences (```json ... ```)
    const fenceStripped = raw.replace(/```(?:json)?\s*\n?/gi, "").replace(/```/g, "");
    try {
        const parsed = JSON.parse(fenceStripped);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            return parsed;
        }
    }
    catch {
        // Fall through to next strategy
    }
    // Strategy 3: Regex extract — find the first { to the matching }
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            // Unrecoverable
        }
    }
    return null;
}
// ---------------------------------------------------------------------------
// Validation: check that the parsed object has all required fields
// ---------------------------------------------------------------------------
function hasRequiredFields(obj) {
    const required = JUDGE_OUTPUT_SCHEMA.required;
    return required.every((key) => key in obj);
}
// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export async function runJudge(client, sessionID, panelResults, config) {
    // Sanitize panel result content before building the prompt
    const sanitizedResults = sanitizePanelResults(panelResults);
    const prompt = buildJudgePrompt(sanitizedResults);
    try {
        const response = (await client.session.prompt({
            sessionID,
            model: {
                providerID: config.judge.providerId,
                modelID: config.judge.modelId,
            },
            parts: [{ type: "text", text: prompt }],
            format: {
                type: "json_schema",
                schema: JUDGE_OUTPUT_SCHEMA,
            },
        }));
        const content = response?.parts
            ?.filter((p) => p.type === "text" && typeof p.text === "string")
            .map((p) => p.text)
            .join("");
        if (!content || content.trim() === "") {
            return null;
        }
        const parsed = tryJSONRepair(content);
        if (!parsed) {
            return null;
        }
        if (!hasRequiredFields(parsed)) {
            return null;
        }
        return normalizeJudgeOutput(parsed);
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// Input sanitization for config values
// ---------------------------------------------------------------------------
/**
 * Trims whitespace and escapes control characters from panel results
 * before they're included in the judge prompt, preventing prompt injection
 * or malformed content from breaking the judge.
 */
function sanitizePanelResults(results) {
    return results.map((r) => ({
        ...r,
        content: r.content
            .trim()
            // Strip null bytes and other control characters (except newlines)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""),
    }));
}
/**
 * Sanitizes a single config string value: trims whitespace and strips
 * characters that could cause issues in API calls.
 */
export function sanitizeConfigValue(value) {
    return value
        .trim()
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .replace(/[\u200B-\u200D\uFEFF]/g, ""); // zero-width chars
}
//# sourceMappingURL=judge.js.map