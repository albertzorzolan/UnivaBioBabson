// Caregiver › Ask Kinwise (/c/ask, SPEC-UI "Ask", SPEC §7): bounded questions about the person's own records.
//
//   routeQuestion      out of scope (diagnosis, treatment, doses, "is it safe", urgency) → a fixed, kind redirect card
//                      with "Add to visit questions"; emergency words → the 911 line (no button).
//   retrieveForQuestion in scope → a deterministic answer immediately, labelled "From the records", each sentence
//                      with evidence chips that open the records behind it.
//   aiAnswer           only when the on-device model is loaded: a plainer-language draft labelled
//                      "AI draft · on this device · <model> · <time>", checked sentence by sentence. If it fails or
//                      every sentence is dropped, the records-based answer simply stays. A draft that only repeats
//                      the records answer (or is empty) is not shown twice: one muted line says so instead.
// The conversation lives in component state (nothing is stored); saved visit questions go to data.savedQuestions.
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, BookOpenCheck, Check, FileText, ListChecks, MessageCircleQuestion, PhoneCall, RotateCcw, ShieldCheck, Sparkles, Stethoscope } from "lucide-react";
import type { BriefSentence, EvidenceItem } from "../../model/types";
import { newId } from "../../model/ids";
import { buildEvidence, defaultPeriod, retrieveForQuestion, routeQuestion, SUGGESTED_QUESTIONS, NOT_FOUND_TEXT } from "../../engine/brief";
import type { QaResult, QuestionRoute } from "../../engine/brief";
import { AIValidationError, LLMError, aiAnswer, getModelOption, useLLM } from "../../ai";
import { useStore } from "../../app/StoreProvider";
import { useDerived } from "../../app/useDerived";
import { href } from "../../app/router";
import { AIBadge, Badge, Button, ButtonLink, PageHeader, Skeleton, cx, useToast } from "../../ui";
import { EvidenceChips, EvidenceDrawer } from "./brief/EvidenceDrawer";
import { normalize, repeatsRecords } from "./askDraft";
import "./ask.css";

const MAX_CHARS = 400;

interface AiPart {
  status: "pending" | "done" | "empty" | "failed";
  sentences: BriefSentence[];
  ms: number | null;
  model: string | null;
  dropped: number;
  note: string | null;
}

interface Turn {
  id: number;
  question: string;
  route: QuestionRoute;
  result: QaResult | null;
  ai: AiPart | null;
  savedId: string | null;
}

/** Shown instead of an AI draft that is empty or adds nothing to the records answer. */
const ALREADY_PLAIN = "The records answer is already plain.";

export function Ask() {
  const { data, today, update } = useStore();
  const { review, timeline } = useDerived();
  const llm = useLLM();
  const toast = useToast();
  const p = data.profile;
  const name = p.preferredName || "they";
  const whose = p.preferredName ? `${p.preferredName}’s` : "their";

  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [evidence, setEvidence] = useState<{ ids: string[]; focus: string; claim: string | null; lookup: Map<string, EvidenceItem> } | null>(null);
  const nextId = useRef(1);
  const box = useRef<HTMLTextAreaElement>(null);
  const lastTurn = useRef<HTMLLIElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const aiReady = llm.status === "ready" || llm.status === "generating";
  const modelLabel = llm.model ? (getModelOption(llm.model)?.label ?? llm.model) : null;

  // The evidence the answers draw on: the last 30 days (questions about other periods are rendered from the record).
  const pkg = useMemo(() => {
    const per = defaultPeriod(today, 30);
    try {
      return buildEvidence({ data, from: per.from, to: per.to, review, timeline });
    } catch {
      return null;
    }
  }, [data, review, timeline, today]);
  const pkgLookup = useMemo(() => new Map((pkg?.items ?? []).map((i) => [i.id, i as EvidenceItem])), [pkg]);

  // Keep the newest exchange in view.
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    lastTurn.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [turns.length]);

  // Resize the input to its content (1–5 lines).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const patchTurn = (id: number, fn: (t: Turn) => Turn) => {
    if (!mounted.current) return;
    setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));
  };

  const runAI = async (id: number, question: string, result: QaResult) => {
    if (!pkg) return;
    try {
      const res = await aiAnswer(question, result.items, pkg, {
        medNames: data.medications.map((m) => m.name),
        patientNames: [p.preferredName, p.displayName, "Mom"].filter(Boolean),
      });
      if (!res) {
        patchTurn(id, (t) => ({ ...t, ai: null }));
        return;
      }
      // Nothing to add (empty, or the same words as the records answer): one muted line, not a duplicate block.
      if (res.status === "not_in_records" || res.sentences.length === 0 || repeatsRecords(res.sentences, result.deterministicAnswer)) {
        patchTurn(id, (t) => ({
          ...t,
          ai: { status: "empty", sentences: [], ms: res.ms, model: modelLabel, dropped: res.dropped, note: ALREADY_PLAIN },
        }));
        return;
      }
      patchTurn(id, (t) => ({ ...t, ai: { status: "done", sentences: res.sentences, ms: res.ms, model: modelLabel, dropped: res.dropped, note: null } }));
    } catch (e) {
      const note =
        e instanceof AIValidationError
          ? "The AI draft didn’t pass the evidence check, so only the records-based answer is shown."
          : e instanceof LLMError && e.code === "cancelled"
            ? "The AI draft was cancelled."
            : e instanceof LLMError && e.code === "timeout"
              ? "The on-device AI took too long; the records-based answer above is complete."
              : "The on-device AI couldn’t answer this time; the records-based answer above is complete.";
      patchTurn(id, (t) => ({ ...t, ai: { status: "failed", sentences: [], ms: null, model: modelLabel, dropped: 0, note } }));
    }
  };

  const ask = (raw: string) => {
    const question = raw.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
    if (!question) return;
    const id = nextId.current++;
    const route = routeQuestion(question, { patientName: p.preferredName });
    let result: QaResult | null = null;
    if (route.inScope && pkg) {
      try {
        result = retrieveForQuestion(question, { data, pkg, today, review });
      } catch {
        result = null;
      }
    }
    const wantsAI = Boolean(route.inScope && result && result.status === "answered" && aiReady);
    const turn: Turn = {
      id,
      question,
      route,
      result,
      ai: wantsAI ? { status: "pending", sentences: [], ms: null, model: modelLabel, dropped: 0, note: null } : null,
      savedId: null,
    };
    setTurns((ts) => [...ts, turn]);
    setText("");
    if (wantsAI && result) void runAI(id, question, result);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(text);
    }
  };

  const saveQuestion = (turn: Turn) => {
    const existing = data.savedQuestions.find((q) => normalize(q.text) === normalize(turn.question));
    if (existing) {
      patchTurn(turn.id, (t) => ({ ...t, savedId: existing.id }));
      return;
    }
    const q = { id: newId("q"), text: turn.question, source: `ask:${turn.route.inScope ? "records" : turn.route.category}`, createdAt: new Date().toISOString() };
    const res = update("caregiver", (prev) => ({ ...prev, savedQuestions: [...prev.savedQuestions, q] }));
    if (!res.ok) {
      toast.show({ tone: "attention", title: "Couldn’t save that", description: res.error });
      return;
    }
    patchTurn(turn.id, (t) => ({ ...t, savedId: q.id }));
    toast.show({ tone: "success", title: "Added to visit questions", description: "It will appear in the visit brief." });
  };

  const openEvidence = (ids: string[], focus: string, claim: string, items: EvidenceItem[]) => {
    const lookup = new Map(pkgLookup);
    for (const it of items) lookup.set(it.id, it);
    setEvidence({ ids, focus, claim, lookup });
  };

  const suggestions = (
    <ul className="cg-ask-suggest" role="list" aria-label="Suggested questions">
      {SUGGESTED_QUESTIONS.map((q) => (
        <li key={q}>
          <button type="button" className="cg-ask-suggest__chip" onClick={() => ask(q)}>
            <MessageCircleQuestion size={16} aria-hidden="true" />
            <span>{q}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="cg-ask">
      <PageHeader
        eyebrow={`Caring for ${p.displayName || "your relative"} · questions about the records`}
        title="Ask Kinwise"
        subtitle={`Questions about ${whose} diary and medicine list, answered from the records — every sentence links to the entries it came from.`}
      />

      <div className="cg-ask-layout">
        <section className="cg-ask-chat" aria-label="Conversation">
          {turns.length === 0 ? (
            <div className="cg-ask-intro">
              <span className="cg-ask-intro__icon" aria-hidden="true">
                <MessageCircleQuestion size={24} />
              </span>
              <h2 className="cg-ask-intro__title">What would you like to know about {whose} records?</h2>
              <p className="cg-ask-intro__text">
                Try one of these, or type your own. Counts always say how many days were answered.
              </p>
              {suggestions}
            </div>
          ) : (
            <div className="cg-ask-log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation">
              <ol className="cg-ask-thread">
                {turns.map((t, i) => (
                  <li key={t.id} className="cg-ask-turn" ref={i === turns.length - 1 ? lastTurn : undefined}>
                    <p className="cg-ask-q">
                      <span className="ui-visually-hidden">You asked: </span>
                      {t.question}
                    </p>
                    <TurnAnswer
                      turn={t}
                      name={name}
                      onSave={() => saveQuestion(t)}
                      onEvidence={openEvidence}
                      lookup={(items) => {
                        const m = new Map(pkgLookup);
                        for (const it of items) m.set(it.id, it);
                        return m;
                      }}
                    />
                  </li>
                ))}
              </ol>
            </div>
          )}

          <form className={cx("cg-ask-form", turns.length > 0 && "cg-ask-form--sticky")} onSubmit={onSubmit} data-tour="ask-box">
            <label htmlFor="cg-ask-input" className="ui-visually-hidden">
              Ask a question about {whose} records
            </label>
            <textarea
              id="cg-ask-input"
              ref={box}
              className="cg-ask-input"
              rows={1}
              maxLength={MAX_CHARS}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Ask about ${whose} symptoms, medicines or dates…`}
              aria-describedby="cg-ask-hint"
            />
            <button type="submit" className="cg-ask-send" disabled={!text.trim()} aria-label="Ask">
              <ArrowUp size={20} aria-hidden="true" />
            </button>
          </form>
          <p id="cg-ask-hint" className="cg-ask-hint">
            Enter to ask · Shift + Enter for a new line. Answers come only from {whose} records on this device — Kinwise doesn’t give medical advice.
          </p>
          {turns.length > 0 && (
            <div className="cg-ask-more">
              <p className="cg-ask-more__label">Try another</p>
              {suggestions}
              <button type="button" className="cg-ask-clear" onClick={() => setTurns([])}>
                <RotateCcw size={15} aria-hidden="true" />
                Clear conversation
              </button>
            </div>
          )}
        </section>

        <aside className="cg-ask-side" aria-label="About Ask Kinwise">
          <div className="cg-ask-card">
            <h2 className="cg-ask-card__title">
              <BookOpenCheck size={18} aria-hidden="true" />
              What it can answer
            </h2>
            <ul className="cg-ask-list" role="list">
              <li>When a symptom was first or last recorded</li>
              <li>How often, before and after a medicine change</li>
              <li>What {name === "they" ? "they" : name} said in {p.sex === "male" ? "his" : p.sex === "female" ? "her" : "their"} own words</li>
              <li>Which medicines appear in published criteria</li>
            </ul>
          </div>
          <div className="cg-ask-card">
            <h2 className="cg-ask-card__title">
              <Stethoscope size={18} aria-hidden="true" />
              For the doctor or pharmacist
            </h2>
            <p className="cg-ask-card__text">
              Questions about diagnosis, doses, starting or stopping a medicine, or whether a medicine is right for {name === "they" ? "them" : p.sex === "male" ? "him" : p.sex === "female" ? "her" : "them"} get a kind redirect — with a
              one-tap “Add to visit questions”.
            </p>
          </div>
          <div className={cx("cg-ask-card", aiReady && "cg-ask-card--ai")}>
            <h2 className="cg-ask-card__title">
              <Sparkles size={18} aria-hidden="true" />
              On-device AI {aiReady ? "is on" : "is off"}
            </h2>
            <p className="cg-ask-card__text" aria-live="polite">
              {aiReady
                ? `${modelLabel ?? "The model"} adds a plainer-language draft under an answer when it can say it more simply. Every sentence is checked against the records first.`
                : llm.status === "loading"
                  ? `Loading (${Math.round(llm.progress * 100)}%). Answers from the records work meanwhile.`
                  : "Answers come straight from the records. Optionally, load the on-device AI in Settings for a plainer-language draft."}
            </p>
            {!aiReady && llm.status !== "unsupported" && llm.status !== "loading" && (
              <a className="cg-ask-link" href={href("/c/settings")}>
                Open Settings
              </a>
            )}
          </div>
          <p className="cg-ask-privacy">
            <ShieldCheck size={16} aria-hidden="true" />
            Nothing you ask leaves this device.
          </p>
        </aside>
      </div>

      <EvidenceDrawer
        ids={evidence?.ids ?? null}
        focus={evidence?.focus}
        claim={evidence?.claim}
        lookup={evidence?.lookup ?? pkgLookup}
        onClose={() => setEvidence(null)}
      />
    </div>
  );
}

function TurnAnswer({
  turn,
  name,
  onSave,
  onEvidence,
  lookup,
}: {
  turn: Turn;
  name: string;
  onSave: () => void;
  onEvidence: (ids: string[], focus: string, claim: string, items: EvidenceItem[]) => void;
  lookup: (items: EvidenceItem[]) => Map<string, EvidenceItem>;
}) {
  const { route, result, ai } = turn;

  // Out of scope: emergency → 911 line; otherwise a redirect with "Add to visit questions".
  if (!route.inScope) {
    if (route.category === "emergency") {
      return (
        <div className="cg-ask-a cg-ask-a--emergency" role="alert">
          <p className="cg-ask-a__label">
            <PhoneCall size={16} aria-hidden="true" />
            Emergency
          </p>
          <p className="cg-ask-a__lead">{route.redirect}</p>
        </div>
      );
    }
    return (
      <div className="cg-ask-a cg-ask-a--redirect">
        <p className="cg-ask-a__label">
          <Stethoscope size={16} aria-hidden="true" />
          For {name === "they" ? "the" : `${name}’s`} doctor or pharmacist
        </p>
        <p className="cg-ask-a__lead">{route.redirect}</p>
        <p className="cg-ask-a__reason">{route.reason}</p>
        {route.offerVisitQuestion && (
          <div className="cg-ask-a__actions">
            {turn.savedId ? (
              <>
                <Badge tone="success" icon={<Check size={14} aria-hidden="true" />}>
                  Added to visit questions
                </Badge>
                <ButtonLink href={href("/c/brief")} size="sm" variant="ghost" iconLeft={<FileText size={16} aria-hidden="true" />}>
                  Open visit brief
                </ButtonLink>
              </>
            ) : (
              <Button size="sm" variant="primary" onClick={onSave}>
                Add to visit questions
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!result || result.status === "not_found" || result.deterministicAnswer.length === 0) {
    return (
      <div className="cg-ask-a cg-ask-a--empty">
        <p className="cg-ask-a__label">
          <ListChecks size={16} aria-hidden="true" />
          From the records
        </p>
        <p className="cg-ask-a__lead">{result?.notFound ?? NOT_FOUND_TEXT}</p>
        <div className="cg-ask-a__actions">
          {turn.savedId ? (
            <Badge tone="success" icon={<Check size={14} aria-hidden="true" />}>
              Added to visit questions
            </Badge>
          ) : (
            <Button size="sm" variant="ghost" onClick={onSave}>
              Save it as a visit question instead
            </Button>
          )}
        </div>
      </div>
    );
  }

  const items = result.items;
  const map = lookup(items);
  return (
    <div className="cg-ask-a">
      <p className="cg-ask-a__label">
        <ListChecks size={16} aria-hidden="true" />
        From the records
      </p>
      <ul className="cg-ask-sents" role="list">
        {result.deterministicAnswer.map((s, i) => (
          <li key={i} className="cg-ask-sent">
            <span>{s.text}</span>{" "}
            <EvidenceChips ids={s.evidenceIds} lookup={map} onOpen={(ids, focus) => onEvidence(ids, focus, s.text, items)} context={`answer sentence ${i + 1}`} />
          </li>
        ))}
      </ul>

      {ai && (
        <div className={cx("cg-ask-ai", `cg-ask-ai--${ai.status}`)} aria-live="polite">
          {ai.status === "pending" ? (
            <>
              <p className="cg-ask-ai__label">
                <Sparkles size={15} aria-hidden="true" />
                Drafting a plainer answer on this device…
              </p>
              <Skeleton lines={2} label="" />
            </>
          ) : ai.status === "done" ? (
            <>
              <AIBadge model={ai.model} ms={ai.ms} />
              <ul className="cg-ask-sents" role="list">
                {ai.sentences.map((s, i) => (
                  <li key={i} className="cg-ask-sent">
                    <span>{s.text}</span>{" "}
                    <EvidenceChips ids={s.evidenceIds} lookup={map} onOpen={(ids, focus) => onEvidence(ids, focus, s.text, items)} context={`AI sentence ${i + 1}`} />
                  </li>
                ))}
              </ul>
              <p className="cg-ask-ai__note">
                Checked against the records{ai.dropped ? ` · ${ai.dropped} ${ai.dropped === 1 ? "sentence" : "sentences"} removed by the check` : ""}. If anything differs, the
                records-based answer above is the reference.
              </p>
            </>
          ) : (
            <p className="cg-ask-ai__note">
              <Sparkles size={14} aria-hidden="true" />
              {ai.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
