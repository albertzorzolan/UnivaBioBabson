// A small, dependency-free TypeScript/TSX highlighter for the code tour. It only has to be readable on paper:
// comments, strings (incl. template literals), regex literals, keywords, numbers and Capitalised identifiers.
// Output: one HTML string per source line (spans never cross a line, so lines can be paginated freely).
import { escapeHtml } from "./lib.mjs";

const KEYWORDS = new Set(
  (
    "abstract as async await break case catch class const continue debugger declare default delete do else enum export " +
    "extends false finally for from function get if implements import in infer instanceof interface is keyof let new null " +
    "of private protected public readonly return satisfies set static super switch this throw true try type typeof undefined " +
    "unique var void while with yield never unknown any number string boolean bigint symbol object"
  ).split(" "),
);
const REGEX_AFTER_KEYWORD = new Set(["return", "typeof", "case", "in", "of", "new", "delete", "void", "throw", "yield", "await", "else", "do"]);
const REGEX_AFTER_PUNCT = new Set([..."(,=:[!&|?{};+-*%<>~^"]);

/** Tokenise into [{ t: kind | null, s: text }]. Kinds: com, str, re, kw, num, ty. */
export function tokenize(src) {
  const out = [];
  let i = 0;
  let lastSig = ""; // last significant token text (for regex detection)
  let lastSigKind = "";
  const push = (t, s) => {
    out.push({ t, s });
    if (t !== "com" && !/^\s+$/.test(s)) {
      lastSig = s;
      lastSigKind = t;
    }
  };
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    // whitespace
    if (/\s/.test(c)) {
      let j = i + 1;
      while (j < n && /\s/.test(src[j])) j++;
      out.push({ t: null, s: src.slice(i, j) });
      i = j;
      continue;
    }
    // comments
    if (c === "/" && c2 === "/") {
      let j = src.indexOf("\n", i);
      if (j < 0) j = n;
      out.push({ t: "com", s: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "/" && c2 === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j < 0 ? n : j + 2;
      out.push({ t: "com", s: src.slice(i, j) });
      i = j;
      continue;
    }
    // strings
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      j = Math.min(n, j + 1);
      push("str", src.slice(i, j));
      i = j;
      continue;
    }
    if (c === "`") {
      // Template literal; ${…} bodies are kept inside the string colour (simple and good enough on paper).
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (depth === 0 && src[j] === "`") break;
        if (src[j] === "$" && src[j + 1] === "{") {
          depth++;
          j += 2;
          continue;
        }
        if (depth > 0 && src[j] === "}") depth--;
        j++;
      }
      j = Math.min(n, j + 1);
      push("str", src.slice(i, j));
      i = j;
      continue;
    }
    // regex literal
    if (c === "/") {
      const prevOk =
        lastSig === "" ||
        (lastSigKind !== "str" && lastSigKind !== "num" && lastSig.length === 1 && REGEX_AFTER_PUNCT.has(lastSig)) ||
        (lastSigKind === "kw" && REGEX_AFTER_KEYWORD.has(lastSig)) ||
        lastSig === "=>" || lastSig === "&&" || lastSig === "||" || lastSig === "??" || lastSig === "===" || lastSig === "!==" || lastSig === "==";
      if (prevOk) {
        let j = i + 1;
        let inClass = false;
        let ok = false;
        while (j < n && src[j] !== "\n") {
          const d = src[j];
          if (d === "\\") {
            j += 2;
            continue;
          }
          if (d === "[") inClass = true;
          else if (d === "]") inClass = false;
          else if (d === "/" && !inClass) {
            ok = true;
            break;
          }
          j++;
        }
        if (ok) {
          j++;
          while (j < n && /[a-z]/i.test(src[j])) j++;
          push("re", src.slice(i, j));
          i = j;
          continue;
        }
      }
    }
    // numbers
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(c2 ?? ""))) {
      const m = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?n?)/.exec(src.slice(i, i + 40));
      const s = m && m[0] ? m[0] : c;
      push("num", s);
      i += s.length;
      continue;
    }
    // identifiers / keywords
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const w = src.slice(i, j);
      const prevDot = lastSig === "." || lastSig === "?.";
      if (!prevDot && KEYWORDS.has(w)) push("kw", w);
      else if (/^[A-Z]/.test(w) && !/^[A-Z0-9_]+$/.test(w)) push("ty", w);
      else push(null, w);
      i = j;
      continue;
    }
    // multi-char operators (only for regex detection bookkeeping)
    const op = /^(?:===|!==|=>|&&|\|\||\?\?|\?\.|==|<=|>=|\+\+|--|\.\.\.)/.exec(src.slice(i, i + 3));
    const s = op ? op[0] : c;
    push(null, s);
    i += s.length;
  }
  return out;
}

/** Highlight source text into an array of per-line HTML strings. */
export function highlightLines(src) {
  const lines = [""];
  for (const tok of tokenize(src.replace(/\r\n/g, "\n"))) {
    const parts = tok.s.split("\n");
    parts.forEach((p, k) => {
      if (k > 0) lines.push("");
      if (!p) return;
      const e = escapeHtml(p);
      lines[lines.length - 1] += tok.t ? `<span class="${tok.t}">${e}</span>` : e;
    });
  }
  if (src.endsWith("\n")) lines.pop();
  return lines;
}
