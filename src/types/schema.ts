import type { JudgeOutput } from "./results.js";

/**
 * JSON Schema (draft-07) for the judge model's structured output.
 * Validates that the judge returns all required analysis sections.
 */
export const JUDGE_OUTPUT_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object" as const,
  additionalProperties: false,
  required: [
    "consensus",
    "contradictions",
    "partial_coverage",
    "unique_insights",
    "blind_spots",
    "scoring",
  ],
  properties: {
    consensus: {
      type: "array",
      description:
        "Points where multiple models agree on the same conclusion",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["point", "supporting_models"],
        properties: {
          point: {
            type: "string",
            description: "The agreed-upon point or conclusion",
          },
          supporting_models: {
            type: "array",
            description: "Models that expressed this point",
            items: { type: "string" },
          },
        },
      },
    },
    contradictions: {
      type: "array",
      description: "Topics where models gave conflicting answers",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "stances"],
        properties: {
          topic: {
            type: "string",
            description: "The topic where disagreement exists",
          },
          stances: {
            type: "array",
            description: "Each model's stance on the topic",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["model_id", "stance"],
              properties: {
                model_id: {
                  type: "string",
                  description: "ID of the model that took this stance",
                },
                stance: {
                  type: "string",
                  description: "The stance or position taken by this model",
                },
              },
            },
          },
        },
      },
    },
    partial_coverage: {
      type: "array",
      description:
        "Topics or subtopics that only some models addressed",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["point", "models"],
        properties: {
          point: {
            type: "string",
            description: "The topic with partial coverage",
          },
          models: {
            type: "array",
            description: "Models that addressed this topic",
            items: { type: "string" },
          },
        },
      },
    },
    unique_insights: {
      type: "array",
      description:
        "Valuable contributions made by only a single model",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["model_id", "insight"],
        properties: {
          model_id: {
            type: "string",
            description: "The model that provided this unique insight",
          },
          insight: {
            type: "string",
            description: "The unique contribution or perspective",
          },
        },
      },
    },
    blind_spots: {
      type: "array",
      description:
        "Important aspects of the query that no model addressed",
      items: { type: "string" },
    },
    scoring: {
      type: "array",
      description: "Quality scores for each model's response",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["model_id", "scores", "total"],
        properties: {
          model_id: {
            type: "string",
            description: "The model being scored",
          },
          scores: {
            type: "object",
            additionalProperties: false,
            required: ["completeness", "accuracy", "novelty", "clarity"],
            properties: {
              completeness: {
                type: "number",
                minimum: 0,
                maximum: 10,
                description: "How thoroughly the model addressed the query",
              },
              accuracy: {
                type: "number",
                minimum: 0,
                maximum: 10,
                description: "Factual correctness of the response",
              },
              novelty: {
                type: "number",
                minimum: 0,
                maximum: 10,
                description: "Unique or original insights provided",
              },
              clarity: {
                type: "number",
                minimum: 0,
                maximum: 10,
                description: "How well-structured and clear the response is",
              },
            },
          },
          total: {
            type: "number",
            minimum: 0,
            maximum: 40,
            description: "Sum of all score dimensions",
          },
        },
      },
    },
    winner: {
      type: "string",
      description:
        "The model ID judged to have provided the best overall response, or null if no clear winner",
    },
  },
} as const;

/**
 * Type helper to extract the inferred shape from the JSON schema.
 */
export type JudgeOutputSchemaType = typeof JUDGE_OUTPUT_SCHEMA;

// Re-export the JudgeOutput type for convenience
export type { JudgeOutput };