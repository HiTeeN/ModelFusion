import { describe, expect, test } from "bun:test";
import { JUDGE_OUTPUT_SCHEMA } from "./schema";

function typeMatchesSchema(value: unknown, schemaDef: Record<string, unknown>): boolean {
  const expectedType = schemaDef.type as string;

  if (expectedType === "array") {
    if (!Array.isArray(value)) return false;
    if (schemaDef.items && value.length > 0) {
      return objectMatchesItemsSchema(value[0], schemaDef.items as Record<string, unknown>);
    }
    return true;
  }

  if (expectedType === "object") {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  if (expectedType === "string") {
    return typeof value === "string" || value === null;
  }

  if (expectedType === "number") {
    return typeof value === "number";
  }

  return typeof value === expectedType;
}

function objectMatchesItemsSchema(
  obj: unknown,
  itemSchema: Record<string, unknown>,
): boolean {
  const itemType = itemSchema.type as string;

  if (itemType !== "object" && itemType !== "array") {
    return typeof obj === itemType;
  }

  if (typeof obj !== "object" || obj === null) return false;

  const required = (itemSchema.required as string[]) ?? [];
  const props = (itemSchema.properties as Record<string, Record<string, unknown>>) ?? {};
  for (const field of required) {
    if (!(field in (obj as Record<string, unknown>))) return false;
    if (!typeMatchesSchema((obj as Record<string, unknown>)[field], props[field])) return false;
  }

  const addlProps = itemSchema.additionalProperties;
  if (addlProps === false) {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      if (!(key in props)) return false;
    }
  }
  return true;
}

function validateAgainstSchema(
  obj: unknown,
  schema: typeof JUDGE_OUTPUT_SCHEMA,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof obj !== "object" || obj === null) {
    return { valid: false, errors: ["Root value is not an object"] };
  }

  const record = obj as Record<string, unknown>;

  for (const field of schema.required) {
    if (!(field in record)) {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  for (const [field, value] of Object.entries(record)) {
    const propDef = schema.properties[field as keyof typeof schema.properties];
    if (propDef) {
      if (!typeMatchesSchema(value, propDef as unknown as Record<string, unknown>)) {
        errors.push(
          `Field "${field}" has wrong type. Expected "${(propDef as { type: string }).type}", got ${Array.isArray(value) ? "array" : typeof value}`,
        );
      }
    }
  }

  for (const key of Object.keys(record)) {
    if (!(key in schema.properties)) {
      errors.push(`Unexpected additional property: "${key}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function validJudgeOutputRaw(): Record<string, unknown> {
  return {
    consensus: [
      {
        point: "Both models agree on the core architecture",
        supporting_models: ["gpt-4o", "claude-3-opus"],
      },
    ],
    contradictions: [
      {
        topic: "Best database for high-throughput writes",
        stances: [
          { model_id: "gpt-4o", stance: "Recommends PostgreSQL with partitioning" },
          { model_id: "claude-3-opus", stance: "Recommends Cassandra for write-heavy workloads" },
        ],
      },
    ],
    partial_coverage: [
      {
        point: "Rate-limiting strategies",
        models: ["gpt-4o"],
      },
    ],
    unique_insights: [
      {
        model_id: "claude-3-opus",
        insight: "Suggests using a write-ahead log for crash recovery",
      },
    ],
    blind_spots: ["Load testing under peak traffic"],
    scoring: [
      {
        model_id: "gpt-4o",
        scores: { completeness: 8, accuracy: 7, novelty: 6, clarity: 9 },
        total: 30,
      },
      {
        model_id: "claude-3-opus",
        scores: { completeness: 9, accuracy: 9, novelty: 8, clarity: 8 },
        total: 34,
      },
    ],
    winner: "claude-3-opus",
  };
}

describe("JUDGE_OUTPUT_SCHEMA", () => {
  test("GIVEN a fully populated JudgeOutput WHEN validated THEN it passes all schema checks", () => {
    // GIVEN
    const output = validJudgeOutputRaw();
    // WHEN
    const result = validateAgainstSchema(output, JUDGE_OUTPUT_SCHEMA);
    // THEN
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("GIVEN a JudgeOutput missing a required field WHEN validated THEN it identifies the gap", () => {
    // GIVEN
    const output = validJudgeOutputRaw();
    const { consensus, ...withoutConsensus } = output;
    // WHEN
    const result = validateAgainstSchema(withoutConsensus, JUDGE_OUTPUT_SCHEMA);
    // THEN
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: "consensus"');
    expect(result.errors.length).toBe(1);
  });

  test("GIVEN a JudgeOutput with a wrong type for scoring WHEN validated THEN it detects the type mismatch", () => {
    // GIVEN
    const output = validJudgeOutputRaw();
    const badOutput = { ...output, scoring: "should be an array" };
    // WHEN
    const result = validateAgainstSchema(badOutput, JUDGE_OUTPUT_SCHEMA);
    // THEN
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Field "scoring" has wrong type. Expected "array", got string',
    );
    expect(result.errors.length).toBe(1);
  });

  test("GIVEN a JudgeOutput with extra unknown fields WHEN validated THEN it rejects additional properties", () => {
    // GIVEN
    const output = validJudgeOutputRaw();
    output.metadata = "leaked";
    // WHEN
    const result = validateAgainstSchema(output, JUDGE_OUTPUT_SCHEMA);
    // THEN
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Unexpected additional property: "metadata"');
  });

  test("GIVEN a valid output serialised to JSON WHEN round-tripped THEN structure is preserved", () => {
    // GIVEN
    const output = validJudgeOutputRaw();
    // WHEN
    const roundTripped = JSON.parse(JSON.stringify(output));
    // THEN
    const result = validateAgainstSchema(roundTripped, JUDGE_OUTPUT_SCHEMA);
    expect(result.valid).toBe(true);
  });
});