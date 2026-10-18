// Welcome: the product story + one-click entry into both demo views (SPEC §8).
// Left: value proposition, privacy promise and checked results. Right: the guided tour (the main way in) and
// "Try as Margaret / Alex" as the only visible choices; the demo-credential form waits behind a closed
// "Have the demo credentials? Sign in" disclosure. Below: an HTML/CSS walk-through of one check-in
// becoming a clinician question. On phones the access card comes straight after the headline, and a
// "Try the demo" button in the top bar jumps to it, so a way in is always on the first screen.
import { useId, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CircleCheck,
  FileHeart,
  Lock,
  PlayCircle,
  ScanText,
  Sparkles,
  Stethoscope,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { Role } from "../../model/types";
import { DEMO_ACCOUNTS, login, loginAs, logout, useSession } from "../../app/session";
import { homeFor, href, isRoute, navigate, parseHash, ROUTES, routeRole, useRoute, type Route } from "../../app/router";
import { useShellAttribute } from "../../app/layouts/useDocumentSettings";
import { SkipLink } from "../../app/layouts/ShellParts";
import { Badge, Button, Callout, DemoDataChip, Disclosure, Logo, TextInput, useMediaQuery } from "../../ui";
import { JOURNEY_AFTER_LABEL, JOURNEY_AFTER_PCT, JOURNEY_BEFORE_LABEL, JOURNEY_BEFORE_PCT, JOURNEY_QUESTION } from "./journeyFigures";
import { PROOF_POINTS } from "./proofPoints";
import { SOURCE_CODE_URL } from "./links";
import "./public.css";

const ROLE_NAME: Record<Role, string> = { patient: "Margaret (patient view)", caregiver: "Alex (caregiver view)" };

/** Shown on Welcome when the address named a page that doesn't exist (the router maps it to "/"). */
export const NOT_FOUND_HINT = "That page doesn’t exist; choose a view below.";

/** True when `hash` names a path that is not a route ("#/c/nope"). The empty hash and "#/" are the home page. */
export function isUnknownHash(hash: string): boolean {
  return !parseHash(hash).known;
}

/** A `?next=` route is honoured only if it belongs to the role being entered. */
function destinationFor(role: Role, next: string | null): Route {
  return next && isRoute(next) && routeRole(next) === role ? next : homeFor(role);
}

const VALUES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <ScanText size={22} />,
    title: "On-device clinical language processing",
    body: "“Felt woozy, nearly went over in the kitchen” becomes dizziness + near-fall — with negation, timing and who it happened to handled. She confirms every answer.",
  },
  {
    icon: <BookOpenCheck size={22} />,
    title: "Citation-backed medication review",
    body: "Checks the list against the AGS Beers Criteria® 2023, the Anticholinergic Cognitive Burden scale, fall-risk-increasing drugs and known prescribing cascades.",
  },
  {
    icon: <FileHeart size={22} />,
    title: "A clinician-ready brief + FHIR export",
    body: "One printable page with counts, sources and questions for the doctor or pharmacist — plus an HL7® FHIR® R4 bundle for the record.",
  },
];

function RoleButton({
  role,
  title,
  description,
  icon,
  onChoose,
}: {
  role: Role;
  title: string;
  description: string;
  icon: ReactNode;
  onChoose: (r: Role) => void;
}) {
  const descId = useId();
  return (
    <button type="button" className={`pub-role pub-role--${role}`} aria-describedby={descId} onClick={() => onChoose(role)}>
      <span className="pub-role__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="pub-role__text">
        <span className="pub-role__title">{title}</span>
        <span className="pub-role__desc" id={descId}>
          {description}
        </span>
      </span>
      <span className="pub-role__go" aria-hidden="true">
        <ArrowRight size={20} />
      </span>
    </button>
  );
}

export function Welcome() {
  useShellAttribute("public");
  const role = useSession();
  const { params } = useRoute();
  const next = params.get("next");
  // useRoute() re-renders on every hash change, so reading the hash here stays current. The router keeps an
  // unknown address in the bar and renders Welcome; this only explains why.
  const unknownRoute = typeof window !== "undefined" && isUnknownHash(window.location.hash);
  const nextLabel = next && isRoute(next) ? ROUTES[next].title : null;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tourCaptionId = useId();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  /** Phones: bring the access card into view and move focus to its heading. */
  const showAccess = () => {
    const heading = document.getElementById("access-title");
    heading?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    heading?.focus({ preventScroll: true });
  };

  const enter = (r: Role) => {
    loginAs(r);
    navigate(destinationFor(r, next));
  };

  const startTour = () => {
    loginAs("caregiver");
    navigate("/c/overview", { tour: "1" });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const r = login(username, password);
    if (!r) {
      setError("Those details don’t match a demo account. Use one of the accounts in the table below.");
      return;
    }
    setError(null);
    navigate(destinationFor(r, next));
  };

  return (
    <div className="pub-welcome">
      <SkipLink />
      <header className="pub-top">
        <div className="pub-top__inner">
          <a href={href("/")} className="pub-top__brand" aria-label="Kinwise — Welcome">
            <Logo size={36} />
          </a>
          <nav className="pub-top__nav" aria-label="About Kinwise">
            <a href={href("/how-it-works")} className="pub-top__link">
              How it works
            </a>
            <DemoDataChip />
            {/* Phones and tablets only (CSS): the access card is below the headline there. */}
            <Button variant="primary" size="sm" className="pub-top__try" onClick={showAccess}>
              Try the demo
            </Button>
          </nav>
        </div>
      </header>

      <main id="main-content" className="pub-main-welcome" tabIndex={-1}>
        <div className="pub-grid">
          {/* ---- Story ---- */}
          <section className="pub-hero" aria-labelledby="welcome-title">
            <p className="pub-kicker">
              <Sparkles size={15} aria-hidden="true" />
              <span>Medicines and older adults · UnivaBio 2026</span>
            </p>
            <h1 id="welcome-title" className="pub-hero__title" tabIndex={-1} data-route-focus="">
              Notice what changes after a medicine change, <em>and bring a clear question to the visit.</em>
            </h1>
            <p className="pub-hero__lead">
              Kinwise helps families caring for an older adult on many medicines notice possible side effects early — and
              bring a clear, evidence-backed question to the doctor or pharmacist.
            </p>
          </section>

          {/* Privacy promise + checked results: its own grid item so phones show the access card first. */}
          <div className="pub-hero-proof">
            <p className="pub-privacy">
              <Lock size={16} aria-hidden="true" />
              <span>Runs in your browser. No Kinwise server, no sign-up, no tracking.</span>
            </p>
            <ul role="list" className="pub-proof" aria-label="Checked results">
              {PROOF_POINTS.map((pt) => (
                <li key={pt.key}>
                  <a className="pub-proof__item" href={href("/how-it-works", { section: pt.section })}>
                    <span className="pub-proof__figure ui-num">{pt.figure}</span>
                    <span className="pub-proof__label">{pt.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <section className="pub-values" aria-labelledby="values-title">
            <h2 id="values-title" className="ui-visually-hidden">
              What Kinwise does
            </h2>
            <ul role="list" className="pub-values__list">
              {VALUES.map((v) => (
                <li key={v.title} className="pub-value">
                  <span className="pub-value__icon" aria-hidden="true">
                    {v.icon}
                  </span>
                  <div>
                    <h3 className="pub-value__title">{v.title}</h3>
                    <p className="pub-value__body">{v.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* ---- Access ---- */}
          <section className="pub-access" aria-labelledby="access-title">
            <div className="pub-access__card">
              {role && (
                <Callout
                  tone="success"
                  className="pub-access__session"
                  title={`You’re signed in as ${ROLE_NAME[role]}.`}
                  action={
                    <div className="pub-access__session-actions">
                      <Button size="sm" variant="primary" onClick={() => navigate(destinationFor(role, next))}>
                        Continue
                      </Button>
                      <Button size="sm" variant="ghost" onClick={logout}>
                        Sign out
                      </Button>
                    </div>
                  }
                />
              )}
              {!role && nextLabel && (
                <Callout tone="info" className="pub-access__session" title={`Choose a view to open “${nextLabel}”.`} />
              )}
              {unknownRoute && <Callout tone="info" className="pub-access__session" title={NOT_FOUND_HINT} />}
              <h2 id="access-title" className="pub-access__title" tabIndex={-1}>
                See it from both sides
              </h2>
              <p className="pub-access__lead">
                Margaret Rivera (78) and her daughter Alex are fictional. One click, no sign-up.
              </p>

              <Button
                variant="primary"
                size="lg"
                block
                className="pub-tour"
                iconLeft={<PlayCircle size={22} aria-hidden="true" />}
                aria-describedby={tourCaptionId}
                onClick={startTour}
              >
                Take the 2-minute guided tour
              </Button>
              <p className="pub-tour__caption" id={tourCaptionId}>
                8 steps, both views, about 2 minutes
              </p>

              <p className="pub-roles__label">Or explore on your own</p>
              <div className="pub-roles">
                <RoleButton
                  role="patient"
                  title="Try as Margaret — patient view"
                  description="Her daily check-in, in her own words"
                  icon={<UserRound size={24} />}
                  onChoose={enter}
                />
                <RoleButton
                  role="caregiver"
                  title="Try as Alex — caregiver view"
                  description="Review, timeline and visit brief"
                  icon={<UsersRound size={24} />}
                  onChoose={enter}
                />
              </div>

              {/* Closed by default: the tour and the two buttons above are the ways in. Judges handed the demo
                  credentials can still open the form; the trigger is a real button with aria-expanded. */}
              <Disclosure className="pub-signin" summary="Have the demo credentials? Sign in">
                <form className="pub-form" onSubmit={onSubmit} noValidate aria-describedby="demo-auth-note">
                  <div className="pub-form__fields">
                    <TextInput
                      label="Username"
                      name="username"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={username}
                      aria-invalid={error ? true : undefined}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                    <TextInput
                      label="Password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      error={error ?? undefined}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" variant="secondary" block iconRight={<ArrowRight size={18} aria-hidden="true" />}>
                    Sign in
                  </Button>
                </form>

                <table className="pub-creds">
                  <caption className="ui-visually-hidden">Demo accounts</caption>
                  <thead>
                    <tr>
                      <th scope="col">View</th>
                      <th scope="col">Username</th>
                      <th scope="col">Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEMO_ACCOUNTS.map((a) => (
                      <tr key={a.username}>
                        <th scope="row">{a.label}</th>
                        <td data-label="Username">
                          <code>{a.username}</code>
                        </td>
                        <td data-label="Password">
                          <code>{a.password}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p id="demo-auth-note" className="pub-access__note">
                  Demo role picker — not real authentication. Please don’t enter real health information.
                </p>
              </Disclosure>
            </div>
          </section>
        </div>

        <JourneyPreview />
      </main>

      <footer className="pub-footer-welcome">
        <div>
          <p>Fictional data · Student prototype for UnivaBio 2026 · Not medical advice</p>
          <p className="pub-footer-welcome__fine">Demo dates are generated relative to today.</p>
        </div>
        <ul role="list" className="pub-footer-welcome__links">
          <li>
            <a href={href("/how-it-works")}>How Kinwise works</a>
          </li>
          <li>
            <a href={SOURCE_CODE_URL} target="_blank" rel="noreferrer noopener">
              Source code on GitHub<span className="ui-visually-hidden"> (opens in a new tab)</span>
            </a>
          </li>
        </ul>
      </footer>
    </div>
  );
}

/**
 * Illustrative product preview built in HTML/CSS (not an image): one check-in travelling from Margaret's
 * words to a question for her doctor. Numbers match the fictional seed story (SPEC §2).
 */
function JourneyPreview() {
  return (
    <section className="pub-journey" aria-labelledby="journey-title">
      <div className="pub-journey__head">
        <p className="ui-eyebrow">How it fits together</p>
        <h2 id="journey-title" className="pub-journey__title">
          From “Mom seems off” to a clear question for her doctor
        </h2>
        <p className="pub-journey__lead">One of Margaret’s check-ins, step by step — all of it on her own device.</p>
      </div>

      <ol className="pub-steps" role="list">
        <li className="pub-step">
          <p className="pub-step__label">
            <span className="pub-step__num" aria-hidden="true">
              1
            </span>
            She says it her way
          </p>
          <div className="pub-mini pub-mini--quote">
            <p className="pub-mini__meta">Margaret · Thursday check-in</p>
            <blockquote className="pub-quote">
              “Felt <mark className="pub-hl pub-hl--pos">woozy</mark> after breakfast and{" "}
              <mark className="pub-hl pub-hl--pos">nearly went over</mark> in the kitchen.{" "}
              <mark className="pub-hl pub-hl--neg">No headache</mark> though.”
            </blockquote>
          </div>
        </li>

        <li className="pub-step">
          <p className="pub-step__label">
            <span className="pub-step__num" aria-hidden="true">
              2
            </span>
            Kinwise structures it
          </p>
          <div className="pub-mini">
            <dl className="pub-facts">
              <div>
                <dt>Dizziness</dt>
                <dd>
                  <Badge tone="primary" size="sm">
                    Yes
                  </Badge>
                  <span>from “woozy”</span>
                </dd>
              </div>
              <div>
                <dt>Near-fall</dt>
                <dd>
                  <Badge tone="primary" size="sm">
                    Yes
                  </Badge>
                  <span>from “nearly went over”</span>
                </dd>
              </div>
              <div>
                <dt>Headache</dt>
                <dd>
                  <Badge tone="neutral" size="sm">
                    No
                  </Badge>
                  <span>negated: “No headache”</span>
                </dd>
              </div>
            </dl>
            <p className="pub-mini__foot">
              <CircleCheck size={15} aria-hidden="true" />
              <span>She confirms before anything is saved</span>
            </p>
          </div>
        </li>

        <li className="pub-step">
          <p className="pub-step__label">
            <span className="pub-step__num" aria-hidden="true">
              3
            </span>
            The review connects the dots
          </p>
          <div className="pub-mini">
            <p className="pub-mini__heading">Dizziness recorded</p>
            <div className="pub-bars">
              <div className="pub-bar">
                <span className="pub-bar__label">Before lorazepam</span>
                <span className="pub-bar__track" aria-hidden="true">
                  <span className="pub-bar__fill pub-bar__fill--before" style={{ width: `${JOURNEY_BEFORE_PCT}%` }} />
                </span>
                <span className="pub-bar__value ui-num">{JOURNEY_BEFORE_LABEL}</span>
              </div>
              <div className="pub-bar">
                <span className="pub-bar__label">After it started</span>
                <span className="pub-bar__track" aria-hidden="true">
                  <span className="pub-bar__fill pub-bar__fill--after" style={{ width: `${JOURNEY_AFTER_PCT}%` }} />
                </span>
                <span className="pub-bar__value ui-num">{JOURNEY_AFTER_LABEL}</span>
              </div>
            </div>
            <p className="pub-mini__finding">
              <Badge tone="caution" icon size="sm">
                AGS Beers 2023
              </Badge>
              <span>Lorazepam is listed as a medicine older adults should generally avoid.</span>
            </p>
          </div>
        </li>

        <li className="pub-step">
          <p className="pub-step__label">
            <span className="pub-step__num" aria-hidden="true">
              4
            </span>
            Alex brings one clear question
          </p>
          <div className="pub-mini pub-mini--brief">
            <p className="pub-mini__meta">
              <Stethoscope size={14} aria-hidden="true" />
              <span>Visit brief · question for Dr. Lee</span>
            </p>
            <p className="pub-brief-q">{JOURNEY_QUESTION}</p>
            <div className="pub-mini__chips">
              <span className="pub-tag">Print · 1 page</span>
              <span className="pub-tag">FHIR R4</span>
            </div>
          </div>
        </li>
      </ol>
      <p className="pub-journey__caption">
        Illustration with fictional data. Kinwise shows changes in what was recorded — it doesn’t say a medicine caused
        them, and it never suggests stopping one.
      </p>
    </section>
  );
}
