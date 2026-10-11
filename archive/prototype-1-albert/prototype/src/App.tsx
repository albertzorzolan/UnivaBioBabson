import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Leaf,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Pill,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Answers, Day, Field, Role, Source } from "./types";
import {
  dateLabel,
  displayValue,
  EMPTY,
  factsFor,
  KEYS,
  LABELS,
  localDate,
  newDay,
  rangeDays,
  seedSource,
  shiftDate,
  sourceCommit,
  validSource,
} from "./domain";

import { CheckIn } from "./Capture";
import { Records } from "./Records";
import { Medicines } from "./Medicines";
import { VisitBrief } from "./VisitBrief";
import { Settings, Recovery } from "./Settings";
import { EvidenceDialog } from "./Evidence";
import { cancelGeneration } from "./ai";
import { useWebMCP } from "./webmcp";
import { Button, Badge, Modal } from "./ui";

type Page =
  | "overview"
  | "checkin"
  | "history"
  | "medicines"
  | "brief"
  | "settings";
function Logo() {
  return (
    <div className="logo">
      <span className="logo-symbol">
        <Activity size={25} />
      </span>
      MedWatch<span className="logo-dot">.</span>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (r: Role) => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="login-page">
      <div className="login-story">
        <Logo />
        <div className="login-copy">
          <span className="eyebrow">SMALL DETAILS. A SHARED PICTURE.</span>
          <h1>
            Every day has
            <br />a story worth
            <br />
            <em>remembering.</em>
          </h1>
          <p>
            A little help capturing how you feel.
            <br />A clearer record for the people who care.
          </p>
        </div>
        <div className="story-preview">
          <div className="row">
            <span className="round-icon">
              <Leaf size={19} />
            </span>
            <div>
              <strong>A moment from Margaret’s day</strong>
              <small>Fictional patient · daily check-in</small>
            </div>
            <CheckCircle2 size={20} />
          </div>
          <blockquote>“I enjoyed a short walk after breakfast.”</blockquote>
          <div className="mini-week">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>
                <small>{d}</small>
                <i className={i === 4 ? "current" : ""}>
                  {i < 4 ? <Check size={14} /> : i === 4 ? "•" : "–"}
                </i>
              </span>
            ))}
          </div>
        </div>
        <span className="login-foot">
          <ShieldCheck size={16} /> Stored in this browser. AI runs on this
          device.
        </span>
      </div>
      <div className="login-form-wrap">
        <Badge>UNIVABIO · WORKING PROTOTYPE</Badge>
        <h2>
          Welcome to your
          <br />
          shared care space.
        </h2>
        <p className="muted">
          Sign in to explore Margaret’s fictional records.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name === "babson" && password === "babson") onLogin("patient");
            else if (name === "babson1" && password === "babson1")
              onLogin("caregiver");
            else
              setError(
                "Those details do not match a demo account. Try the credentials below.",
              );
          }}
        >
          <label>
            Username
            <input
              autoComplete="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your username"
              required
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="full">
            Enter your space <ArrowRight size={18} />
          </Button>
        </form>
        <div className="demo-accounts">
          <span className="eyebrow">TAKE A LOOK AROUND</span>
          <button
            onClick={() => {
              setName("babson");
              setPassword("babson");
              setError("");
            }}
          >
            <span>
              <strong>Patient demo</strong>
              <small>babson / babson</small>
            </span>
            <ArrowRight size={17} />
          </button>
          <button
            onClick={() => {
              setName("babson1");
              setPassword("babson1");
              setError("");
            }}
          >
            <span>
              <strong>Caregiver demo</strong>
              <small>babson1 / babson1</small>
            </span>
            <ArrowRight size={17} />
          </button>
        </div>
        <p className="login-notice">
          Fictional-data prototype. Please do not enter real health information.
          Demo credentials are not secure authentication.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [role, setRole] = useState<Role | null>(() => {
    try {
      const r = sessionStorage.getItem(KEYS.session);
      return r === "patient" || r === "caregiver" ? r : null;
    } catch {
      return null;
    }
  });
  const [source, setSource] = useState<Source>(() => {
    try {
      const raw = localStorage.getItem(KEYS.source);
      if (raw) {
        const s = JSON.parse(raw);
        if (!validSource(s)) throw new Error("unsupported");
        return s;
      }
      const s = seedSource();
      localStorage.setItem(KEYS.source, JSON.stringify(s));
      return s;
    } catch {
      return {
        ...seedSource(),
        schemaVersion: "recovery",
      } as unknown as Source;
    }
  });
  const [page, setPage] = useState<Page>(
    role === "patient" ? "checkin" : "overview",
  );
  const [toast, setToast] = useState("");
  const [help, setHelp] = useState(false);
  const [evidence, setEvidence] = useState<Day | null>(null);
  const [evidenceRef, setEvidenceRef] = useState<{
    id: string;
    from: string;
    to: string;
  } | null>(null);
  const [editDate, setEditDate] = useState<string | undefined>();
  useWebMCP(source, role, page);
  const today = localDate();
  const [period, setPeriod] = useState(14);
  const from = shiftDate(today, -period + 1);
  const facts = factsFor(source, from, today);
  const [writer, setWriter] = useState(false);
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    let alive = true;
    const lock = navigator.locks;
    if (!lock) {
      setWriter(false);
      return;
    }
    const abort = new AbortController();
    void lock
      .request("medwatch.demo.writer", { signal: abort.signal }, async () => {
        if (!alive) return;
        setWriter(true);
        await new Promise<void>((resolve) => {
          release.current = resolve;
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
      abort.abort();
      release.current?.();
      release.current = null;
    };
  }, []);
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key === KEYS.source && e.newValue) {
        try {
          setSource(JSON.parse(e.newValue));
        } catch {
          setToast("This record could not be read. Reload to recover.");
        }
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(id);
  }, [toast]);
  const commit = (next: Source) => {
    if (!role || !writer) {
      setToast(
        "This tab is read-only. Close the other MedWatch tab and reload.",
      );
      return false;
    }
    try {
      setSource(sourceCommit(source, next, localStorage, role));
      return true;
    } catch (e) {
      setToast(
        e instanceof Error
          ? e.message
          : "Could not save. Your previous record is unchanged.",
      );
      return false;
    }
  };
  useEffect(() => {
    cancelGeneration();
  }, [role, source.sourceRevision, source.datasetId]);
  const replace = (next: Source) => {
    if (!writer) {
      setToast(
        "This tab is read-only. Close the other tab before changing records.",
      );
      return false;
    }
    try {
      localStorage.setItem(KEYS.source, JSON.stringify(next));
      for (const k of [KEYS.derived, KEYS.drafts, KEYS.reports])
        localStorage.removeItem(k);
      setSource(next);
      return true;
    } catch {
      setToast("Could not save. The previous record is unchanged.");
      return false;
    }
  };
  const openEvidence = (id: string, a = from, b = today) =>
    setEvidenceRef({ id, from: a, to: b });
  const login = (r: Role) => {
    sessionStorage.setItem(KEYS.session, r);
    setRole(r);
    setPage(r === "patient" ? "checkin" : "overview");
  };
  if (source.schemaVersion !== "1.0") return <Recovery writer={writer} />;
  if (!role) return <Login onLogin={login} />;
  const nav =
    role === "caregiver"
      ? [
          { id: "overview", name: "Overview", icon: LayoutDashboard },
          { id: "history", name: "Daily records", icon: CalendarDays },
          { id: "medicines", name: "Medication list", icon: Pill },
          { id: "brief", name: "Visit brief", icon: FileText },
        ]
      : [
          { id: "checkin", name: "My check-in", icon: Leaf },
          { id: "history", name: "My history", icon: CalendarDays },
          { id: "medicines", name: "My medicines", icon: Pill },
        ];
  return (
    <div className={`app ${role}`}>
      <aside className="sidebar">
        <Logo />
        <button
          className="profile-switch"
          onClick={() => {
            setPage(role === "patient" ? "checkin" : "overview");
          }}
        >
          <span className="avatar">MR</span>
          <span>
            <strong>Margaret’s space</strong>
            <small>
              {role === "patient" ? "Your personal record" : "Caregiver view"}
            </small>
          </span>
          <ChevronDown size={16} />
        </button>
        <span className="nav-caption">YOUR SPACE</span>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => setPage(n.id as Page)}
            >
              <n.icon size={20} />
              {n.name}
              {page === n.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="status-dot" />
            <strong>Made for your device</strong>
            <p>Your records stay in this browser.</p>
            <button onClick={() => setPage("settings")}>
              Privacy & local AI <ArrowRight size={14} />
            </button>
          </div>
          <button className="sidebar-link" onClick={() => setHelp(true)}>
            <HelpCircle size={19} /> Need help now?
          </button>
          <button
            className="sidebar-link"
            onClick={() => {
              sessionStorage.removeItem(KEYS.session);
              cancelGeneration();
              setRole(null);
            }}
          >
            <LogOut size={18} /> Sign out
          </button>
          <span className="build-label">MedWatch · UnivaBio prototype</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Your space <ChevronRight size={14} />{" "}
            <strong>
              {page === "settings"
                ? "Privacy & local AI"
                : nav.find((n) => n.id === page)?.name}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="top-date">
              <CalendarDays size={16} />
              {dateLabel(today, true)}
            </span>
            <Badge tone="outline">Fictional demo</Badge>
            <button
              className="icon-button mobile-help"
              aria-label="Help and settings"
              onClick={() => setPage("settings")}
            >
              <Settings2 size={18} />
            </button>
            <button
              className="icon-button mobile-help"
              aria-label="Need help now"
              onClick={() => setHelp(true)}
            >
              <HelpCircle size={18} />
            </button>
            <button
              className="icon-button mobile-help"
              aria-label="Sign out"
              onClick={() => {
                cancelGeneration();
                sessionStorage.removeItem(KEYS.session);
                setRole(null);
              }}
            >
              <LogOut size={18} />
            </button>
            <span className="user-avatar">
              {role === "patient" ? "M" : "A"}
            </span>
          </div>
        </header>
        <div className="demo-banner">
          <span>
            <ShieldCheck size={15} /> Fictional records for demonstration.
            Please don’t enter real health information.
          </span>
          <button onClick={() => setPage("settings")}>
            About this prototype <ArrowRight size={14} />
          </button>
        </div>
        {!writer && (
          <div className="readonly">
            Read-only tab. Close the other MedWatch tab and reload to make
            changes.
          </div>
        )}
        <main id="main-content">
          {page === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    A SHARED PICTURE OF THE EVERYDAY
                  </span>
                  <h1>
                    Good to see you, Alex<span className="sage-dot">.</span>
                  </h1>
                  <p>Here’s what Margaret has been recording.</p>
                </div>
                <Button variant="white" onClick={() => setPage("brief")}>
                  <FileText size={17} /> Prepare a visit brief{" "}
                  <ArrowRight size={16} />
                </Button>
              </div>
              <div className="overview-layout">
                <div className="overview-main">
                  <section className="welcome-card">
                    <div>
                      <Badge tone="light">
                        <Leaf size={13} /> ONE DAY AT A TIME
                      </Badge>
                      <h2>
                        Small observations.
                        <br />
                        More meaningful conversations.
                      </h2>
                      <p>
                        Bring the everyday details together, in Margaret’s own
                        words.
                      </p>
                      <button onClick={() => setPage("history")}>
                        Explore her daily records <ArrowRight size={17} />
                      </button>
                    </div>
                    <div className="welcome-art" aria-hidden="true">
                      <span className="art-orbit one" />
                      <span className="art-orbit two" />
                      <span className="art-orbit three" />
                      <div className="art-note">
                        <Leaf size={22} />
                        <i />
                        <i />
                        <span>Today’s story</span>
                        <div className="art-line" />
                      </div>
                    </div>
                  </section>
                  <div className="section-title">
                    <h2>The recent picture</h2>
                    <select
                      aria-label="Overview period"
                      value={period}
                      onChange={(e) => setPeriod(Number(e.target.value))}
                    >
                      <option value="7">Last 7 days</option>
                      <option value="14">Last 14 days</option>
                      <option value="28">Last 28 days</option>
                    </select>
                  </div>
                  <div className="stats-grid">
                    {facts.slice(0, 3).map((f, i) => (
                      <button
                        className="stat-card"
                        key={f.id}
                        onClick={() => setPage("history")}
                      >
                        <span className={`stat-icon color-${i}`}>
                          {i === 0 ? (
                            <CalendarDays size={19} />
                          ) : i === 1 ? (
                            <Activity size={19} />
                          ) : (
                            <Leaf size={19} />
                          )}
                        </span>
                        <span className="stat-label">{f.label}</span>
                        <strong>
                          {f.value}
                          {i === 2 && <small>/ 5</small>}
                        </strong>
                        <span className="stat-detail">{f.detail}</span>
                      </button>
                    ))}
                  </div>
                  <Trend source={source} from={from} to={today} />
                  <div className="section-title">
                    <h2>In Margaret’s own words</h2>
                    <button
                      className="text-button"
                      onClick={() => setPage("history")}
                    >
                      All records <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="quote-list">
                    {source.days
                      .filter((d) => d.rawStory)
                      .slice(-2)
                      .reverse()
                      .map((d) => (
                        <button key={d.id} onClick={() => setEvidence(d)}>
                          <span className="quote-date">
                            <strong>
                              {new Date(`${d.dateLocal}T12:00:00`).getDate()}
                            </strong>
                            <small>
                              {new Date(
                                `${d.dateLocal}T12:00:00`,
                              ).toLocaleDateString("en-US", { month: "short" })}
                            </small>
                          </span>
                          <div>
                            <span className="eyebrow">PATIENT CHECK-IN</span>
                            <p>“{d.rawStory}”</p>
                          </div>
                          <ArrowRight size={17} />
                        </button>
                      ))}
                  </div>
                </div>
                <aside className="overview-aside">
                  <section className="panel patient-card">
                    <div className="row">
                      <span className="avatar big">MR</span>
                      <span>
                        <h3>Margaret Rivera</h3>
                        <small>Fictional patient · age 72</small>
                      </span>
                    </div>
                    <div className="divider" />
                    <div className="row between">
                      <span className="muted">Today’s check-in</span>
                      <Badge tone="sand">
                        {source.days.some((d) => d.dateLocal === today)
                          ? "Recorded"
                          : "Not recorded"}
                      </Badge>
                    </div>
                    <p className="small muted">
                      A missing check-in means no information was recorded.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setPage("history")}
                    >
                      View record history <ArrowRight size={15} />
                    </button>
                  </section>
                  <section className="panel ai-teaser">
                    <span className="round-icon">
                      <Sparkles size={20} />
                    </span>
                    <span className="eyebrow">ASSISTED, NOT ASSUMED</span>
                    <h2>
                      Make room for
                      <br />a better conversation.
                    </h2>
                    <p>
                      Turn recorded observations into a visit brief. Every
                      detail links back to its source.
                    </p>
                    <Button
                      variant="secondary"
                      className="full"
                      onClick={() => setPage("brief")}
                    >
                      Build a visit brief <ArrowRight size={16} />
                    </Button>
                    <small>
                      <ShieldCheck size={13} /> You review before sharing
                    </small>
                  </section>
                  <section className="panel">
                    <div className="row between">
                      <h3>Medication list</h3>
                      <Pill size={18} />
                    </div>
                    {source.medications
                      .filter((m) => !m.endDate)
                      .map((m) => (
                        <div className="mini-med" key={m.id}>
                          <span className="pill-dot" />
                          <div>
                            <strong>{m.name}</strong>
                            <small>
                              {m.dose} · {m.schedule.split(" · ")[0]}
                            </small>
                          </div>
                        </div>
                      ))}
                    <button
                      className="text-button"
                      onClick={() => setPage("medicines")}
                    >
                      Review medication list <ArrowRight size={15} />
                    </button>
                  </section>
                </aside>
              </div>
            </>
          )}
          {page === "checkin" && (
            <CheckIn
              key={editDate ?? "new"}
              initialDate={editDate}
              source={source}
              commit={commit}
              onSaved={() => {
                setToast("Your check-in is saved in this browser.");
                setEditDate(undefined);
                setPage("history");
              }}
            />
          )}
          {page === "history" && (
            <Records
              source={source}
              role={role}
              commit={commit}
              onEvidence={openEvidence}
              onEdit={(date) => {
                setEditDate(date);
                setPage("checkin");
              }}
              notify={setToast}
              Trend={Trend}
            />
          )}
          {page === "medicines" && (
            <Medicines
              source={source}
              role={role}
              commit={commit}
              notify={setToast}
            />
          )}
          {page === "brief" && role === "caregiver" && (
            <VisitBrief source={source} onEvidence={openEvidence} />
          )}
          {page === "settings" && (
            <Settings source={source} replace={replace} notify={setToast} />
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            <Leaf size={14} /> Small details, thoughtfully kept.
          </span>
          <span>On-device records · No continuous monitoring</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {help && (
        <Modal title="Need help now?" onClose={() => setHelp(false)}>
          <p>
            If you think you are having a medical emergency in the United
            States, call <strong>911</strong>.
          </p>
          <p>
            No one is monitoring this app. MedWatch cannot assess urgency or
            notify a clinician.
          </p>
          <a className="button primary" href="tel:911">
            Call 911
          </a>
          <p className="small muted">
            Outside the U.S., use your local emergency number.
          </p>
          <a
            href="https://www.911.gov/calling-911/"
            target="_blank"
            rel="noreferrer"
          >
            National 911 Program <ArrowRight size={14} />
          </a>
        </Modal>
      )}
      {evidence && (
        <EvidenceDialog
          id={`entry:${evidence.id}`}
          from={from}
          to={today}
          source={source}
          role={role}
          onClose={() => setEvidence(null)}
          commit={commit}
          notify={setToast}
        />
      )}{" "}
      {evidenceRef && (
        <EvidenceDialog
          key={evidenceRef.id}
          {...evidenceRef}
          source={source}
          role={role}
          onClose={() => setEvidenceRef(null)}
          commit={commit}
          notify={setToast}
        />
      )}
    </div>
  );
}

function Trend({
  source,
  from,
  to,
}: {
  source: Source;
  from: string;
  to: string;
}) {
  const records = rangeDays(source, from, to);
  const days = [];
  for (let d = from; d <= to; d = shiftDate(d, 1)) {
    const entry = records.find((x) => x.dateLocal === d);
    days.push({
      date: dateLabel(d),
      energy: entry?.answers.energy ?? null,
      sleep: entry?.answers.sleep ?? null,
    });
  }
  return (
    <section className="panel trend">
      <div className="row between">
        <div>
          <h2>The rhythm of her days</h2>
          <p className="small muted">
            Self-reported ratings · gaps mean no answer
          </p>
        </div>
        <div className="chart-legend">
          <span>
            <i className="energy-key" />
            Energy
          </span>
          <span>
            <i className="sleep-key" />
            Sleep
          </span>
        </div>
      </div>
      <div
        className="chart"
        role="img"
        aria-label="Energy and sleep ratings over time, out of five. Missing answers appear as gaps."
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={days}
            margin={{ top: 20, right: 18, left: -29, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="#ecece5"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              minTickGap={36}
              tick={{ fill: "#69765e", fontSize: 12 }}
              dy={8}
            />
            <YAxis
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#69765e", fontSize: 12 }}
            />
            {source.medicationEvents
              .filter(
                (e) =>
                  e.kind === "started" &&
                  e.dateLocal >= from &&
                  e.dateLocal <= to,
              )
              .map((e) => (
                <ReferenceLine
                  key={e.id}
                  x={dateLabel(e.dateLocal)}
                  stroke="#a6b394"
                  strokeDasharray="3 4"
                  label={{
                    value: "List change",
                    position: "insideTopRight",
                    fill: "#69785c",
                    fontSize: 11,
                  }}
                />
              ))}
            <Tooltip
              contentStyle={{ borderRadius: 12, borderColor: "#e3e4da" }}
            />
            <Line
              type="linear"
              dataKey="energy"
              name="Energy"
              stroke="#527c67"
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="sleep"
              name="Sleep"
              stroke="#c7ad84"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-foot">
        <span>1 = low · 5 = high</span>
        <span>Observations, not a clinical assessment</span>
      </div>
    </section>
  );
}
