// The guided tour's floating card + spotlight (loaded lazily by TourHost in Tour.tsx).
//
// Each step names the role and route it needs and the [data-tour] targets to highlight, in priority order.
// On entering a step we switch role/route if needed, then look for the best target for up to 10 s (views
// are lazy-loaded and render their data a moment later; the benchmark step waits up to 60 s for its scores). If nothing appears, the card is centred instead
// — the tour never depends on another screen's markup to work.
//
// While the page scrolls to a new target (or the step's view is still loading), the card and the ring wait out
// of sight, keeping their size, and appear once the target has stopped moving — so no frame shows a card
// sliding across a half-scrolled page.
//
// The overlay is non-modal (pointer-events pass through the dimmed page, so the highlighted element can be
// used), but keyboard focus moves to the card on every step, and back to it each time it reappears after a
// settle (tourFocus.ts) unless the user has moved into the page; Esc closes, ←/→ move between steps.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Stethoscope, UserRound, UsersRound, X } from "lucide-react";
import type { Role } from "../model/types";
import { navigate, useRoute, type Route } from "./router";
import { loginAs, useSession } from "./session";
import { useStore } from "./StoreProvider";
import { useDerived } from "./useDerived";
import { goToTourStep, stopTour, TOUR_STEP_COUNT } from "./Tour";
import { cx, useMediaQuery } from "../ui";
import { countPrescribers } from "../views/caregiver/meds/medRecords";
import { clampSpot, placeDocked, placeFloating, scrollGoal, type Box, type Placement, type Viewport } from "./tourPlacement";
import { focusWhere, shouldReclaimFocus } from "./tourFocus";
import "./tour.css";

interface TourContext {
  name: string;
  age: number;
  medCount: number;
  prescribers: number;
  findings: number;
  topSignal: string | null;
}

interface TourStep {
  role: Role;
  route: Route;
  /** data-tour ids (or "css:<selector>" for a part of another screen), best first. Empty = centred card. */
  targets: string[];
  eyebrow: string;
  title: string;
  /** `matched` is the target id that was found (null while searching or when the card is centred). */
  body: (c: TourContext, matched: string | null) => ReactNode;
  /** Step 2: type an example story into the check-in and run the extraction. */
  fillCheckIn?: boolean;
  /** Step 8: press "Run the extraction benchmark now" once the button is on screen. */
  runBenchmark?: boolean;
}

/** Fictional example story used by the tour (covers a symptom, a near-fall, a negation and someone else). */
export const TOUR_EXAMPLE_STORY =
  "Felt woozy getting up this morning and nearly went over in the kitchen. Slept badly. No headache. My granddaughter Sofia fell off her bike but she is fine.";

/** Exported for tourSteps.test.ts (copy and targets); the overlay itself only reads it through `index`. */
export const TOUR_STEPS: TourStep[] = [
  {
    role: "caregiver",
    route: "/c/overview",
    targets: [],
    eyebrow: "Welcome to Kinwise",
    title: "From “Mom seems off” to a clear question for her doctor",
    body: (c) => (
      <>
        <p>
          {c.name}
          {c.age > 0 ? `, ${c.age},` : ""} takes {c.medCount} {c.medCount === 1 ? "medicine" : "medicines"}
          {c.prescribers > 1 ? ` from ${c.prescribers} prescribers` : ""}. In one primary-care study, 37% of medication
          side effects whose harm could have been reduced were attributed to the patient not telling the doctor about
          the symptom (Gandhi, NEJM 2003).
        </p>
        <p>This tour follows one week of her story — from her own words to a one-page brief for the visit.</p>
      </>
    ),
  },
  {
    role: "patient",
    route: "/p/today",
    // The highlighted story first: the whole "Here's what I heard" panel is taller than most screens, so the
    // card would cover the very highlights it describes. The panel, the empty story box (which the tour fills)
    // and the saved state remain as fallbacks.
    targets: ['css:[data-tour="checkin-heard"] .pt-story', "checkin-heard", "checkin-story", "checkin-saved"],
    fillCheckIn: true,
    eyebrow: "Margaret’s view · daily check-in",
    title: "She tells it in her own words",
    body: (_c, matched) =>
      matched === "checkin-saved" ? (
        <p>
          Today’s check-in is already saved. Each answer is kept with her own words, and Alex sees exactly what she
          confirmed.
        </p>
      ) : (
      <p>
        On-device clinical language processing turns her story into proposed answers. It understands “no headache”,
        “yesterday” and “my granddaughter fell” — and nothing is saved until she confirms each answer.
      </p>
      ),
  },
  {
    role: "caregiver",
    route: "/c/overview",
    // The featured finding's before/after block first: the whole section is taller than most screens.
    targets: ['css:[data-tour="overview-noticed"] .cg-ov-insight.is-featured .cg-ov-insight__aside', "overview-noticed", "overview-chart"],
    eyebrow: "Alex’s view · overview",
    title: "What Kinwise noticed",
    body: (c) => (
      <>
        {c.topSignal ? <blockquote className="tour-quote">{c.topSignal}</blockquote> : null}
        <p>Signals from her diary and review findings, side by side — always with numerators and denominators, and a link to the records behind every number.</p>
        <p>Today both views share one device (or a backup file); family sharing is planned.</p>
      </>
    ),
  },
  {
    role: "caregiver",
    route: "/c/timeline",
    targets: ["timeline-compare"],
    eyebrow: "Symptoms & timeline",
    title: "Before and after, on answered days",
    body: () => (
      <p>
        Each medication start or stop is compared with the weeks before it (Fisher’s exact test). It shows a change in
        what was recorded — not why it happened — and lists other changes in the same period.
      </p>
    ),
  },
  {
    role: "caregiver",
    route: "/c/review",
    targets: ["review-finding", "review-acb"],
    eyebrow: "Medication review",
    title: "Checked against published criteria",
    body: (c) => (
      <p>
        {c.findings > 0 ? `${c.findings} review ${c.findings === 1 ? "prompt" : "prompts"}` : "Review prompts"} from the
        AGS Beers Criteria® 2023, the anticholinergic burden scale, fall-risk drug lists and prescribing cascades. Each
        cites its source and ends in a question for the clinician. The rules are code, not a chatbot.
      </p>
    ),
  },
  {
    role: "caregiver",
    route: "/c/brief",
    targets: ["brief-doc"],
    eyebrow: "Visit brief",
    title: "One page for a 15-minute visit",
    body: () => (
      <p>
        What we noticed, the review prompts and our questions — written from the evidence by a template, or drafted by
        the optional on-device AI and checked sentence by sentence. Alex reviews it before it can be printed.
      </p>
    ),
  },
  {
    role: "caregiver",
    route: "/c/brief",
    targets: ["brief-fhir"],
    eyebrow: "Interoperability",
    title: "Ready for the clinic’s systems",
    body: () => (
      <p>
        The same record exports as an HL7® FHIR® R4 bundle — medicines, symptom observations and flagged issues —
        checked for structure in the browser before download.
      </p>
    ),
  },
  {
    role: "caregiver",
    route: "/how-it-works",
    // "how-eval" (the benchmark card) is found first and its Run button pressed; then the held-out scorecard (the
    // headline result) appears and the spotlight moves to it. The other ids are fallbacks.
    targets: ["how-eval-heldout", "how-eval-scores", "how-eval", "how-arch"],
    runBenchmark: true,
    eyebrow: "How it works",
    title: "Check our work",
    // Rule "benchmark copy true in every state": while this card is up the benchmark may be idle, scoring ("Scoring
    // every story on this device…"), failed ("The benchmark could not run"), finished, or re-running after "Run
    // again", and the spotlit target does not say which (after "Run again" the spotlight can stay on the benchmark
    // card with the scores back on screen). So the copy is the same for every target and says what the benchmark
    // does, never that it "just ran" or "is running".
    body: () => (
      <p>
        The language benchmark runs live in this browser, over hundreds of fictional, AI-written stories with gold
        labels. When a run finishes, its scores appear on the benchmark card; the held-out set was never used for
        tuning. Below it: the medication-review test cases, the architecture, every source, and an honest list of what
        is finished and planned.
      </p>
    ),
  },
];

const SEARCH_MS = 10_000;
/**
 * Rule "wait for the benchmark": step 8's best target (the held-out scorecard) appears only when the benchmark
 * finishes, which can take longer than SEARCH_MS on a slow device. If the search stopped first, the spotlight would
 * stay on the benchmark card after the scores were on screen, so that step keeps looking for a minute. (The step's
 * copy does not depend on the target, so it stays true either way.)
 */
const BENCHMARK_SEARCH_MS = 60_000;

/** How long a step polls for its best target. Exported for tourBenchmark.test.ts. */
export function searchWindowMs(step: Pick<TourStep, "runBenchmark">): number {
  return step.runBenchmark ? BENCHMARK_SEARCH_MS : SEARCH_MS;
}
/** Longest the card stays hidden while the page scrolls to a target (then it is shown wherever things are). */
const SETTLE_MS = 600;
/** Longest the card stays hidden while the step's view loads; then it is shown centred until a target appears. */
const FIRST_TARGET_MS = 900;
/** When to check, after a step's first focus, that a view has not taken focus to its own <h1>. */
const LATE_FOCUS_MS = 700;

function findTarget(ids: string[]): { el: HTMLElement; rank: number } | null {
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const el = document.querySelector<HTMLElement>(id.startsWith("css:") ? id.slice(4) : `[data-tour="${id}"]`);
    if (el && el.getClientRects().length > 0) return { el, rank: i };
  }
  return null;
}

/** Type the example story into the check-in box (only if it is empty) and press "Fill in my check-in". */
function fillCheckIn(story: HTMLElement): void {
  const area = story instanceof HTMLTextAreaElement ? story : story.querySelector("textarea");
  if (!area || area.disabled) return;
  if (area.value.trim() === "") {
    // React tracks the value through the native setter; set it that way so onChange fires.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(area, TOUR_EXAMPLE_STORY);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }
  window.setTimeout(() => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("#main-content button")].find(
      (b) => !b.disabled && /fill in (my|the|today’s|today's)? ?check-?in/i.test(b.textContent ?? ""),
    );
    button?.click();
  }, 180);
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

/** Sticky/fixed bars across the page (patient tabs, phone top bar), found once per target. */
let bars: HTMLElement[] = [];

function findBars(): void {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  bars = [...document.querySelectorAll<HTMLElement>("body *")].filter((el) => {
    if (el.closest(".tour")) return false;
    const pos = getComputedStyle(el).position;
    if (pos !== "sticky" && pos !== "fixed") return false;
    const r = el.getBoundingClientRect();
    return r.width > vw / 2 && r.height > 0 && r.height < vh * 0.4;
  });
}

/**
 * Bottom edge of the bars covering the top of the viewport. `afterScroll`: the inset once the page has
 * scrolled down (a sticky bar further down the page sticks to the top by then).
 */
function topInset(afterScroll = false): number {
  let inset = 0;
  for (const el of bars) {
    if (!el.isConnected) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.position === "fixed") {
      if (r.top <= 1) inset = Math.max(inset, r.bottom);
    } else if (cs.position === "sticky") {
      const stickTop = parseFloat(cs.top);
      if (Number.isNaN(stickTop) || stickTop > 1) continue;
      if (afterScroll) inset = Math.max(inset, stickTop + r.height);
      else if (r.top <= stickTop + 1) inset = Math.max(inset, r.bottom);
    }
  }
  return inset;
}

function viewport(afterScroll = false): Viewport {
  return { width: document.documentElement.clientWidth, height: window.innerHeight, topInset: topInset(afterScroll) };
}

function rectOf(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Call `done` once `el` has stopped moving: its box is unchanged for 2 animation frames and, if a scroll was
 * started, the page has reached `scrollTop` (or the browser reported `scrollend`, e.g. when the page could not
 * scroll that far) — or SETTLE_MS has passed. Returns a cancel function.
 */
function whenStill(el: HTMLElement, scrollTop: number | null, done: () => void): () => void {
  let frame = 0;
  let stable = 0;
  let last: Box | null = null;
  let ended = false;
  const onScrollEnd = () => {
    ended = true;
  };
  const cancel = () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    window.removeEventListener("scrollend", onScrollEnd);
  };
  const finish = () => {
    cancel();
    done();
  };
  const tick = () => {
    const now = rectOf(el);
    stable = sameBox(last, now) ? stable + 1 : 0;
    last = now;
    // A smooth scroll can take a frame to start, so a still box only counts once the page is where it was sent.
    // Two still frames also let the spotlight state catch up, so the ring appears in place rather than easing in.
    const arrived = scrollTop === null || ended || Math.abs(window.scrollY - scrollTop) < 1;
    if (stable >= 2 && arrived) finish();
    else frame = requestAnimationFrame(tick);
  };
  const timer = window.setTimeout(finish, SETTLE_MS);
  window.addEventListener("scrollend", onScrollEnd);
  frame = requestAnimationFrame(tick);
  return cancel;
}

function samePlacement(a: Placement | null, b: Placement): boolean {
  return (
    !!a &&
    a.mode === b.mode &&
    sameBox(a.spot, b.spot) &&
    Math.abs(a.card.top - b.card.top) < 0.5 &&
    Math.abs(a.card.left - b.card.left) < 0.5 &&
    a.card.width === b.card.width
  );
}

export function TourOverlay({ step: index }: { step: number }) {
  const step = TOUR_STEPS[Math.min(index, TOUR_STEPS.length - 1)];
  const { data, update } = useStore();
  const { active, review, timeline } = useDerived();
  const role = useSession();
  const { path } = useRoute();
  const phone = useMediaQuery("(max-width: 640px)");
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [target, setTarget] = useState<{ el: HTMLElement; rank: number } | null>(null);
  /** The target's visible box (padded, clipped to the viewport), updated every frame. */
  const [spot, setSpot] = useState<Box | null>(null);
  /** Where the card goes and the (possibly trimmed) spotlight actually drawn. */
  const [placement, setPlacement] = useState<Placement | null>(null);
  /** Bumped when the card's own size changes (text size, step content). */
  const [cardSizeTick, setCardSizeTick] = useState(0);
  /**
   * The card and ring are shown only once this matches `settleKey` (this step and its current target, or "-"
   * while there is none): a new step or a new target hides them until the page has stopped moving.
   */
  const settleKey = `${index}:${target ? target.rank : "-"}`;
  const [shownKey, setShownKey] = useState<string | null>(null);
  const settling = shownKey !== settleKey;
  /** Set when a step opens another page: its first scroll jumps instead of gliding (nobody saw the old spot). */
  const jumpScroll = useRef(true);
  /** Docked (phone) card: part of the step's text is below the bottom of the scrolling sheet. */
  const [moreBelow, setMoreBelow] = useState(false);
  /** The last step whose title received focus (focus waits until the card is visible). */
  const focusedStep = useRef(-1);
  /** The card should hold keyboard focus: it had it, and the user has not since clicked or tabbed into the page. */
  const ownsFocus = useRef(false);
  /** `settling` as of the last commit, for the late focus check (a hidden card cannot take focus). */
  const settlingNow = useRef(settling);
  /** The late focus check of the current step; it survives settles within the step, not a change of step. */
  const lateFocus = useRef(0);

  const ctx = useMemo<TourContext>(() => {
    // Count clinicians only (same rule as the Medications page): "self (OTC)" entries are not prescribers.
    const prescribers = countPrescribers(active);
    return {
      name: data.profile.preferredName || data.profile.displayName || "Your relative",
      age: data.profile.age,
      medCount: active.length,
      prescribers,
      findings: review.findings.length,
      topSignal: timeline.signals[0]?.text ?? null,
    };
  }, [data.profile, active, review, timeline]);

  const isLast = index >= TOUR_STEPS.length - 1;

  // Finishing or skipping both mark the tour as seen (settings.tourCompleted), so it is not offered again.
  const finish = useCallback(() => {
    if (!data.settings.tourCompleted) {
      update(role ?? "system", (prev) => ({ ...prev, settings: { ...prev.settings, tourCompleted: true } }));
    }
    stopTour();
    requestAnimationFrame(() => document.querySelector<HTMLElement>("#main-content h1")?.focus({ preventScroll: true }));
  }, [data.settings.tourCompleted, update, role]);

  const next = useCallback(() => (isLast ? finish() : goToTourStep(index + 1)), [isLast, finish, index]);
  const back = useCallback(() => goToTourStep(index - 1), [index]);

  // Enter the step: switch role and route if this step needs another view.
  useEffect(() => {
    jumpScroll.current = path !== step.route;
    if (role !== step.role) loginAs(step.role);
    navigate(step.route);
    // Keyed on the step index alone: this runs once as a step begins. Listing `role` or `step` would pull the user
    // back to the step's view whenever they sign in as someone else or wander off mid-step, which is allowed.
  }, [index]);

  // Find the best target for this step (polling while lazy views render), and run the step's action once.
  useEffect(() => {
    setTarget(null);
    if (step.targets.length === 0) return;
    let cancelled = false;
    let timer = 0;
    let clickTimer = 0;
    let filled = false;
    const started = performance.now();
    const searchFor = searchWindowMs(step);
    const tick = () => {
      if (cancelled) return;
      const found = findTarget(step.targets);
      if (found) {
        setTarget((prev) => (prev?.el === found.el ? prev : found));
        if (step.fillCheckIn && !filled && step.targets[found.rank] === "checkin-story") {
          filled = true;
          fillCheckIn(found.el);
        }
        if (step.runBenchmark && !filled) {
          // Rule "press Run once, and only on this step": look for the button in the benchmark card (the spotlit
          // fallback may be another section), count the action as done only once the button exists, and cancel
          // the delayed press if the visitor finishes, skips or leaves the step first (cleanup below).
          const run = [...document.querySelectorAll<HTMLButtonElement>('[data-tour="how-eval"] button')].find((b) =>
            /run the extraction benchmark/i.test(b.textContent ?? ""),
          );
          if (run) {
            filled = true;
            clickTimer = window.setTimeout(() => {
              if (!cancelled && run.isConnected && !run.disabled) run.click();
            }, 600);
          }
        }
        if (found.rank === 0) return; // best target present: stop searching
      }
      if (performance.now() - started < searchFor) timer = window.setTimeout(tick, 120);
    };
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(clickTimer);
    };
  }, [index, step, path]);

  // Bring the target into view once per target: tall or wide targets go to the top (the card then fits
  // beside or below them); narrow ones are centred. On phones the target goes to the top, above the sheet.
  // The first scroll on a newly opened page jumps, as does a long one (gliding past several screens only blurs)
  // and every scroll with reduced motion; a short one within the same page glides. Either way the card and ring
  // are shown once the target has stopped moving.
  useEffect(() => {
    const el = target?.el;
    const card = cardRef.current;
    if (!el || !card) return;
    findBars();
    const r = rectOf(el);
    const goal = scrollGoal(r, { width: card.offsetWidth, height: card.offsetHeight }, viewport(true), phone);
    const firstOnPage = jumpScroll.current;
    jumpScroll.current = false;
    let scrollTop: number | null = null;
    if (Math.abs(r.top - goal) > 24) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollTop = Math.round(Math.min(Math.max(0, window.scrollY + r.top - goal), Math.max(0, max)));
      const glide = !reduceMotion && !firstOnPage && Math.abs(scrollTop - window.scrollY) <= window.innerHeight;
      window.scrollTo({ top: scrollTop, behavior: glide ? "smooth" : "instant" });
    }
    const key = `${index}:${target.rank}`;
    return whenStill(el, scrollTop, () => setShownKey(key));
  }, [target, phone, reduceMotion]);

  // No target (yet): a step without one shows its centred card at once; otherwise wait a moment for the view
  // to load, then show the card centred (it moves to the target if one turns up later).
  useLayoutEffect(() => {
    if (target) return;
    const key = `${index}:-`;
    if (step.targets.length === 0) {
      setShownKey(key);
      return;
    }
    const timer = window.setTimeout(() => setShownKey(key), FIRST_TARGET_MS);
    return () => window.clearTimeout(timer);
  }, [index, target, step]);

  // Track the target's position (scrolling, layout shifts, lazy content) every frame while visible.
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      const el = target?.el;
      const nextSpot = el && el.isConnected ? clampSpot(rectOf(el), viewport()) : null;
      setSpot((prev) => (sameBox(prev, nextSpot) ? prev : nextSpot));
      if (el && !el.isConnected) setTarget(findTarget(step.targets));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [target, step]);

  // Re-place the card when its own size changes (text size setting, a step with a longer body).
  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof ResizeObserver === "undefined") return;
    let last = "";
    const ro = new ResizeObserver(() => {
      const key = `${card.offsetWidth}x${card.offsetHeight}`;
      if (key !== last) {
        last = key;
        setCardSizeTick((n) => n + 1);
      }
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, []);

  // Place the card so it never covers the spotlight. Desktop: beside, below or above the target; else a
  // narrower card in the side gutter; else the spotlight is trimmed to the part above the card. Phones: the
  // card is docked to the bottom by CSS and the spotlight ends above it.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let next: Placement;
    if (phone) {
      next = placeDocked(spot, card.getBoundingClientRect().top);
    } else {
      // Measure at the natural width, then (if the card must be narrower) again at the compact width. The
      // inline width is restored to the final choice, which React also renders from `placement`.
      const vp = viewport();
      card.style.width = "";
      const natural = { width: card.offsetWidth, height: card.offsetHeight };
      next = placeFloating(spot, natural, vp);
      if (next.card.width !== undefined) {
        card.style.width = `${next.card.width}px`;
        next = placeFloating(spot, natural, vp, card.offsetHeight);
      }
      card.style.width = next.card.width !== undefined && spot ? `${next.card.width}px` : "";
    }
    setPlacement((prev) => (samePlacement(prev, next) ? prev : next));
  }, [spot, phone, index, cardSizeTick]);

  useLayoutEffect(() => {
    settlingNow.current = settling;
  }, [settling]);

  /** Focus the title again if the browser or a view moved focus out of the card (see tourFocus.ts). */
  const reclaimFocus = useCallback(() => {
    const card = cardRef.current;
    if (!card || settlingNow.current) return;
    if (shouldReclaimFocus(focusWhere(card, document.activeElement, document.body), ownsFocus.current)) {
      titleRef.current?.focus({ preventScroll: true });
    }
  }, []);

  // Keep track of whether the card owns focus: focus inside it claims it; a click outside it, or Tab (which may
  // leave it), gives it up until focus comes back into the card. While it owns focus, focus moved into the page
  // by code — a view focusing its <h1> after navigation, however late its lazy chunk loads — is taken back.
  useEffect(() => {
    const inCard = (node: EventTarget | null) => node instanceof Node && !!cardRef.current?.contains(node);
    let frame = 0;
    const onFocusIn = (e: FocusEvent) => {
      if (inCard(e.target)) ownsFocus.current = true;
      else if (ownsFocus.current) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => reclaimFocus());
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!inCard(e.target)) ownsFocus.current = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") ownsFocus.current = false;
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [reclaimFocus]);

  // Each time the card becomes visible: on a step's first showing, focus its title so keyboard and screen-reader
  // users follow along, and check again a moment later (views focus their own <h1> after navigation). When it
  // reappears later in the same step (the spotlight moved to a new target), take back the focus that hiding it
  // dropped.
  useEffect(() => {
    if (settling) return;
    if (focusedStep.current !== index) {
      focusedStep.current = index;
      titleRef.current?.focus({ preventScroll: true });
      ownsFocus.current = true;
      window.clearTimeout(lateFocus.current);
      lateFocus.current = window.setTimeout(reclaimFocus, LATE_FOCUS_MS);
    } else {
      reclaimFocus();
    }
  }, [settling, index, reclaimFocus]);
  // The late check belongs to its step: cancelled when the step changes or the tour closes, not when it re-settles.
  useEffect(() => () => window.clearTimeout(lateFocus.current), [index]);

  // Phones: each step's text starts at the top of the sheet, and a fade over the controls shows when more of
  // it is below (the sheet is capped at 40% of the screen and scrolls).
  useLayoutEffect(() => {
    if (cardRef.current) cardRef.current.scrollTop = 0;
  }, [index]);
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !phone) {
      setMoreBelow(false);
      return;
    }
    const check = () => setMoreBelow(card.scrollHeight - card.clientHeight - card.scrollTop > 4);
    check();
    card.addEventListener("scroll", check, { passive: true });
    return () => card.removeEventListener("scroll", check);
  }, [phone, index, cardSizeTick, settling]);

  // Esc closes the tour from anywhere (unless a dialog is open — it gets Esc first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("dialog[open]")) return;
      finish();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [finish]);

  // The spotlight actually drawn: the placement's (possibly trimmed) box once placed; phones wait for it so
  // the spotlight never runs under the docked sheet. While settling, the page is simply dimmed.
  const drawnSpot = settling ? null : spot && placement ? placement.spot : phone ? null : spot;

  const RoleIcon = step.role === "patient" ? UserRound : UsersRound;
  const roleLabel = step.role === "patient" ? `Viewing as ${ctx.name} (patient)` : `Viewing as ${data.profile.caregiverName || "the caregiver"} (caregiver)`;

  return (
    <div className={cx("tour", reduceMotion && "tour--still", settling && "tour--settling")}>
      {/* Keyed apart: reusing one element would animate the ring in from the scrim's corner (inset: 0). */}
      {drawnSpot ? (
        <div
          key="spot"
          className="tour-spot"
          aria-hidden="true"
          style={{ top: drawnSpot.top, left: drawnSpot.left, width: drawnSpot.width, height: drawnSpot.height }}
        />
      ) : (
        <div key="scrim" className="tour-scrim" aria-hidden="true" />
      )}
      <div
        ref={cardRef}
        className={cx("tour-card", phone && "tour-card--docked", !spot && !phone && "tour-card--centered")}
        data-placement={placement?.mode}
        data-more={moreBelow || undefined}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        style={
          !phone && spot && placement
            ? {
                top: placement.card.top,
                left: placement.card.left,
                right: "auto",
                bottom: "auto",
                ...(placement.card.width !== undefined ? { width: placement.card.width } : {}),
              }
            : undefined
        }
        onKeyDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("button") && (e.key === "ArrowRight" || e.key === "ArrowLeft")) return;
          if (e.key === "ArrowRight" && !isLast) {
            e.preventDefault();
            next();
          } else if (e.key === "ArrowLeft" && index > 0) {
            e.preventDefault();
            back();
          }
        }}
      >
        <div className="tour-card__top">
          <p className="tour-card__count">
            <Stethoscope size={15} aria-hidden="true" />
            <span>
              Step {index + 1} of {TOUR_STEP_COUNT}
            </span>
          </p>
          <ol className="tour-dots" aria-hidden="true">
            {TOUR_STEPS.map((_, i) => (
              <li key={i} className={cx("tour-dot", i === index && "is-current", i < index && "is-done")} />
            ))}
          </ol>
          <button type="button" className="tour-close" aria-label="Close the tour" onClick={() => finish()}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="tour-card__eyebrow">{step.eyebrow}</p>
        <h2 ref={titleRef} id={titleId} className="tour-card__title" tabIndex={-1}>
          {step.title}
        </h2>
        <div id={bodyId} className="tour-card__body">
          {step.body(ctx, target ? step.targets[target.rank] : null)}
        </div>
        <p className="tour-card__role">
          <RoleIcon size={15} aria-hidden="true" />
          <span>{roleLabel}</span>
        </p>

        <div className="tour-card__actions">
          <button type="button" className="tour-skip" onClick={() => finish()}>
            Skip tour
          </button>
          <div className="tour-card__nav">
            {index > 0 && (
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={back}>
                <ArrowLeft size={16} aria-hidden="true" />
                <span className="ui-btn__label">Back</span>
              </button>
            )}
            <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={next}>
              <span className="ui-btn__label">{isLast ? "Finish tour" : "Next"}</span>
              {isLast ? <Check size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
