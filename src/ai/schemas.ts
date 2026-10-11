// JSON Schemas handed to WebLLM's grammar engine (response_format: { type: "json_object", schema }).
//
// The grammar makes the model's output *structurally* valid while it is being generated:
//   - evidenceIds can only be ids that exist in the evidence the model was shown (enum),
//   - array sizes are bounded (no runaway lists),
//   - each sentence object lists evidenceIds BEFORE text ("cite, then write"), so the model commits to
//     its sources before it writes the sentence that restates them.
// Content (numbers, wording, medicine names) is checked afterwards by src/engine/brief/verify.ts.

import type { DiaryField } from "../model/types";

export type JSONSchema = Record<string, unknown>;

export interface SentenceSchemaOptions {
  /** Upper bound on characters per sentence (enforced again host-side). */
  maxChars?: number;
  /** Maximum evidence ids per sentence. */
  maxIds?: number;
}

function object(properties: Record<string, JSONSchema>, required = Object.keys(properties)): JSONSchema {
  return { type: "object", properties, required, additionalProperties: false };
}

/** A cited sentence: { evidenceIds: [ids…], text }. */
export function sentenceSchema(ids: string[], opts: SentenceSchemaOptions = {}): JSONSchema {
  if (!ids.length) throw new Error("A cited sentence needs at least one evidence id to choose from.");
  return object({
    evidenceIds: {
      type: "array",
      items: { type: "string", enum: [...new Set(ids)] },
      minItems: 1,
      maxItems: opts.maxIds ?? 3,
    },
    text: { type: "string", maxLength: opts.maxChars ?? 280 },
  });
}

function sentences(ids: string[], min: number, max: number, opts?: SentenceSchemaOptions): JSONSchema {
  return { type: "array", items: sentenceSchema(ids, opts), minItems: min, maxItems: max };
}

export interface BriefSchemaOptions extends SentenceSchemaOptions {
  noticed?: [number, number];
  questions?: [number, number];
  /** Whether a "reason" sentence may be written (only when a caregiver concern is in the evidence). */
  allowReason?: boolean;
}

/** Visit-brief draft in one generation: optional reason (≤1), 2–4 "noticed" statements, 3–5 questions. */
export function briefSchema(ids: string[], opts: BriefSchemaOptions = {}): JSONSchema {
  const [nMin, nMax] = opts.noticed ?? [2, 4];
  const [qMin, qMax] = opts.questions ?? [3, 5];
  return object({
    reason: sentences(ids, 0, opts.allowReason === false ? 0 : 1, opts),
    noticed: sentences(ids, nMin, nMax, opts),
    questions: sentences(ids, qMin, qMax, opts),
  });
}

/** Brief step 1: optional reason (≤1) and 2–4 "noticed" statements. */
export function noticedSchema(ids: string[], opts: BriefSchemaOptions = {}): JSONSchema {
  const [nMin, nMax] = opts.noticed ?? [2, 4];
  return object({
    reason: sentences(ids, 0, opts.allowReason === false ? 0 : 1, opts),
    noticed: sentences(ids, nMin, nMax, opts),
  });
}

/** Brief step 2: 3–5 clinician questions. */
export function questionsSchema(ids: string[], opts: BriefSchemaOptions = {}): JSONSchema {
  const [qMin, qMax] = opts.questions ?? [3, 5];
  return object({ questions: sentences(ids, qMin, qMax, opts) });
}

/** Record Q&A: 0–3 cited statements (the host decides whether the records answered the question). */
export function answerSchema(ids: string[], opts: SentenceSchemaOptions = {}): JSONSchema {
  return object({ answer: sentences(ids, 0, 3, opts) });
}

/** Value grammar for each diary field. */
export function fieldValueSchema(field: DiaryField): JSONSchema {
  switch (field) {
    case "energy":
    case "sleep":
      return { type: "integer", enum: [1, 2, 3, 4, 5] };
    case "dizzinessSeverity":
      return { type: "integer", enum: [1, 2, 3] };
    case "appetite":
      return { type: "string", enum: ["better", "same", "worse"] };
    default:
      return { type: "boolean" };
  }
}

/**
 * Extraction refinement: proposals for still-open diary fields only. Each proposal quotes the story
 * first ("quote, then label"); the host locates the quote and computes offsets itself.
 */
export function refineSchema(openFields: DiaryField[], maxQuoteChars = 120): JSONSchema {
  const fields = [...new Set(openFields)];
  if (!fields.length) return object({ proposals: { type: "array", items: { type: "object" }, maxItems: 0 } });
  const variants = fields.map((field) =>
    object({
      quote: { type: "string", maxLength: maxQuoteChars },
      field: { type: "string", enum: [field] },
      value: fieldValueSchema(field),
    }),
  );
  return object({
    proposals: {
      type: "array",
      items: variants.length === 1 ? variants[0] : { anyOf: variants },
      minItems: 0,
      maxItems: Math.min(fields.length, 6),
    },
  });
}

/** Finding explanation: 2–3 plain sentences grounded in the finding + KB text. */
export function explainSchema(maxChars = 260): JSONSchema {
  return object({
    sentences: { type: "array", items: object({ text: { type: "string", maxLength: maxChars } }), minItems: 2, maxItems: 3 },
  });
}

/**
 * Remove keywords a grammar engine might not support (used as a fallback if a schema is rejected).
 * Keeps structure, enums and array bounds — the parts that matter for grounding.
 */
export function stripLengthLimits(schema: JSONSchema): JSONSchema {
  return JSON.parse(JSON.stringify(schema, (k, v) => (k === "maxLength" || k === "minLength" ? undefined : v))) as JSONSchema;
}

// ---------------------------------------------------------------------------
// JSON Schema → EBNF (compact JSON grammar)
//
// WebLLM compiles `json_object` schemas with unlimited whitespace allowed between tokens. A greedy
// small model can fall into emitting whitespace until the token limit (observed with Qwen2.5-1.5B:
// 89 s of tabs). We therefore compile the schemas above into an EBNF grammar for compact JSON — no
// optional whitespace, bounded strings, no control characters, keys in schema order — and send that
// as `response_format: { type: "grammar" }`. Supports exactly the subset these builders emit.

export interface EBNFOptions {
  /** Emit `{0,N}` repetition for maxLength (needs xgrammar repetition ranges). Default true. */
  boundedStrings?: boolean;
}

/** JSON-encode a value and wrap it as an EBNF string literal (C-style escapes). */
function lit(jsonText: string): string {
  return JSON.stringify(jsonText);
}

export function schemaToEBNF(schema: JSONSchema, opts: EBNFOptions = {}): string {
  const bounded = opts.boundedStrings ?? true;
  const rules = new Map<string, string>(); // name → body
  const byKey = new Map<string, string>(); // structural key → name
  let n = 0;

  const define = (key: string, build: () => string): string => {
    const existing = byKey.get(key);
    if (existing) return existing;
    const name = `r${n++}`;
    byKey.set(key, name);
    rules.set(name, ""); // reserve (no recursion in our schemas, but keeps names stable)
    rules.set(name, build());
    return name;
  };

  const strChar = define("char", () => `[^\\0-\\x1f"\\\\] | "\\\\" ["\\\\/bfnrt]`);

  const visit = (s: JSONSchema): string => {
    const key = JSON.stringify(s);
    if (Array.isArray(s.anyOf)) {
      return define(key, () => (s.anyOf as JSONSchema[]).map(visit).join(" | "));
    }
    if (Array.isArray(s.enum)) {
      return define(key, () => (s.enum as unknown[]).map((v) => lit(JSON.stringify(v))).join(" | "));
    }
    switch (s.type) {
      case "boolean":
        return define(key, () => `"true" | "false"`);
      case "string": {
        const max = typeof s.maxLength === "number" ? s.maxLength : null;
        return define(key, () => (bounded && max !== null ? `"\\"" (${strChar}){0,${max}} "\\""` : `"\\"" (${strChar})* "\\""`));
      }
      case "integer":
        return define(key, () => `"-"? ("0" | [1-9] [0-9]*)`);
      case "array": {
        const item = visit(s.items as JSONSchema);
        const min = typeof s.minItems === "number" ? s.minItems : 0;
        const max = typeof s.maxItems === "number" ? s.maxItems : null;
        return define(key, () => {
          if (max === 0) return `"[" "]"`;
          if (max === null) {
            const rest = `("," ${item})*`;
            return min === 0 ? `"[" ("]" | ${item} ${rest} "]")` : `"[" ${item}${` "," ${item}`.repeat(min - 1)} ${rest} "]"`;
          }
          // Optional tail with exactly the allowed number of extra items, nested: ("," x ("," x)?)?
          const required = Math.max(min, 1);
          let tail = "";
          for (let i = 0; i < max - required; i++) tail = `("," ${item} ${tail})?`;
          const head = `${item}${` "," ${item}`.repeat(required - 1)} ${tail}`.trim();
          return min === 0 ? `"[" ("]" | ${head} "]")` : `"[" ${head} "]"`;
        });
      }
      case "object": {
        const props = (s.properties ?? {}) as Record<string, JSONSchema>;
        const keys = Object.keys(props);
        return define(key, () => {
          if (!keys.length) return `"{" "}"`;
          const parts = keys.map((k, i) => `${lit(`${i ? "," : ""}${JSON.stringify(k)}:`)} ${visit(props[k])}`);
          return `"{" ${parts.join(" ")} "}"`;
        });
      }
      default:
        throw new Error(`schemaToEBNF: unsupported schema ${key.slice(0, 80)}`);
    }
  };

  const root = visit(schema);
  const lines = [`root ::= ${root}`];
  for (const [name, body] of rules) lines.push(`${name} ::= ${body}`);
  return lines.join("\n");
}
