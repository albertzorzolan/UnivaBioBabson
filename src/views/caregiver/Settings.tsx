// Caregiver Settings (SPEC-UI "Settings"): Margaret's profile (used by the review rules), the optional
// on-device AI, display preferences, the record itself (export / import / reset / delete), privacy, and the
// guided tour. Everything here is stored in this browser only.
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  Check,
  CircleCheck,
  CircleSlash,
  Cpu,
  Download,
  HardDriveDownload,
  LockKeyhole,
  MonitorCog,
  PlayCircle,
  Power,
  RotateCcw,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import type { ConditionTag, PatientProfile, Settings as SettingsData, StoreData } from "../../model/types";
import { validateStore, DEFAULT_SETTINGS } from "../../model/store";
import { useStore } from "../../app/StoreProvider";
import { useDerived } from "../../app/useDerived";
import { startTour } from "../../app/Tour";
import { MODEL_OPTIONS, DEFAULT_MODEL_ID, isModelCached, loadModel, removeModelCache, unloadModel, useLLM } from "../../ai";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Disclosure,
  Modal,
  PageHeader,
  ProgressBar,
  Segmented,
  Select,
  TextInput,
  cx,
  useToast,
} from "../../ui";
import "./settings.css";

// ---------------------------------------------------------------------------------------------
// Profile

/** Plain-language labels for every condition the review rules understand (ConditionTag). */
const CONDITIONS: { tag: ConditionTag; label: string; hint?: string }[] = [
  { tag: "history_of_falls", label: "Has fallen in the past year", hint: "Also switched on automatically when a fall is recorded in the diary" },
  { tag: "dementia_or_cognitive_impairment", label: "Memory problems or dementia" },
  { tag: "delirium_history", label: "Has had delirium (sudden confusion)" },
  { tag: "hypertension", label: "High blood pressure" },
  { tag: "heart_failure", label: "Heart failure" },
  { tag: "atrial_fibrillation", label: "Atrial fibrillation (irregular heartbeat)" },
  { tag: "type2_diabetes", label: "Type 2 diabetes" },
  { tag: "chronic_kidney_disease", label: "Kidney disease" },
  { tag: "urinary_incontinence", label: "Bladder leakage (incontinence)" },
  { tag: "benign_prostatic_hyperplasia", label: "Enlarged prostate" },
  { tag: "gi_bleeding_or_ulcer_history", label: "Stomach ulcer or stomach bleeding" },
  { tag: "insomnia", label: "Trouble sleeping (insomnia)" },
  { tag: "depression", label: "Depression" },
  { tag: "anxiety", label: "Anxiety" },
  { tag: "parkinson_disease", label: "Parkinson’s disease" },
  { tag: "seizure_disorder", label: "Epilepsy or seizures" },
  { tag: "osteoarthritis", label: "Osteoarthritis" },
  { tag: "osteoporosis", label: "Osteoporosis (thin bones)" },
];

interface ProfileDraft {
  displayName: string;
  preferredName: string;
  age: string;
  sex: "" | "female" | "male" | "other";
  conditions: ConditionTag[];
  crcl: string;
  caregiverName: string;
  caregiverRelation: string;
}

function toDraft(p: PatientProfile): ProfileDraft {
  return {
    displayName: p.displayName,
    preferredName: p.preferredName,
    age: p.age > 0 ? String(p.age) : "",
    sex: p.sex ?? "",
    conditions: [...p.conditions],
    crcl: p.crclMlMin == null ? "" : String(p.crclMlMin),
    caregiverName: p.caregiverName,
    caregiverRelation: p.caregiverRelation,
  };
}

function validate(d: ProfileDraft): Partial<Record<keyof ProfileDraft, string>> {
  const errors: Partial<Record<keyof ProfileDraft, string>> = {};
  if (!d.displayName.trim()) errors.displayName = "Add their name so the brief says who it is about.";
  const age = Number(d.age);
  if (!d.age.trim() || !Number.isInteger(age) || age < 18 || age > 120) errors.age = "Enter an age in whole years, from 18 to 120.";
  if (d.crcl.trim()) {
    const c = Number(d.crcl);
    if (!Number.isFinite(c) || c < 5 || c > 200) errors.crcl = "Enter a number between 5 and 200, or leave it empty.";
  }
  return errors;
}

function ProfileCard() {
  const { data, update } = useStore();
  const { review } = useDerived();
  const toast = useToast();
  const [draft, setDraft] = useState<ProfileDraft>(() => toDraft(data.profile));
  const [showErrors, setShowErrors] = useState(false);
  const saved = useMemo(() => toDraft(data.profile), [data.profile]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const errors = validate(draft);
  const visibleErrors = showErrors ? errors : {};
  const fromDiary = review.effectiveConditions.some((c) => c.tag === "history_of_falls" && c.from === "diary");

  // A reset, import or other tab replaces the record: start again from what is saved.
  const lastDataset = useRef(data.datasetId);
  useEffect(() => {
    if (lastDataset.current !== data.datasetId) {
      lastDataset.current = data.datasetId;
      setDraft(toDraft(data.profile));
      setShowErrors(false);
    }
  }, [data.datasetId, data.profile]);

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggle = (tag: ConditionTag) =>
    setDraft((d) => ({ ...d, conditions: d.conditions.includes(tag) ? d.conditions.filter((t) => t !== tag) : [...d.conditions, tag] }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    const profile: PatientProfile = {
      ...data.profile,
      displayName: draft.displayName.trim(),
      preferredName: draft.preferredName.trim() || draft.displayName.trim().split(/\s+/)[0],
      age: Number(draft.age),
      sex: draft.sex === "" ? null : draft.sex,
      // Keep the order of the list above so the record diff stays stable.
      conditions: CONDITIONS.map((c) => c.tag).filter((t) => draft.conditions.includes(t)),
      crclMlMin: draft.crcl.trim() ? Number(draft.crcl) : null,
      caregiverName: draft.caregiverName.trim(),
      caregiverRelation: draft.caregiverRelation.trim(),
    };
    const result = update("caregiver", (prev) => ({ ...prev, profile }));
    if (result.ok) {
      setShowErrors(false);
      toast.show({ title: "Profile saved", description: "The medication review now uses these details.", tone: "success" });
    } else {
      toast.show({ title: "The profile was not saved", description: result.error, tone: "attention" });
    }
  };

  const name = draft.preferredName.trim() || draft.displayName.trim().split(/\s+/)[0] || "your relative";

  return (
    <Card as="section" padding="lg" aria-labelledby="set-profile-title" className="cg-set-card">
      <CardHeader
        id="set-profile-title"
        icon={<UserRound size={20} />}
        title={`${name}’s profile`}
        subtitle="Age, conditions and kidney function decide which published review rules apply."
      />
      <form onSubmit={onSubmit} noValidate>
        <CardBody className="cg-set-profile">
          <fieldset className="cg-set-fieldset">
            <legend className="cg-set-legend">Who this record is about</legend>
            <div className="cg-set-grid">
              <TextInput label="Full name" value={draft.displayName} onChange={(e) => set("displayName", e.target.value)} error={visibleErrors.displayName} autoComplete="off" />
              <TextInput label="What they like to be called" optional value={draft.preferredName} onChange={(e) => set("preferredName", e.target.value)} autoComplete="off" />
              <TextInput
                label="Age"
                inputMode="numeric"
                value={draft.age}
                onChange={(e) => set("age", e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                error={visibleErrors.age}
                hint="The AGS Beers Criteria apply from age 65."
              />
              <Select
                label="Sex"
                optional
                value={draft.sex}
                onChange={(e) => set("sex", e.target.value as ProfileDraft["sex"])}
                options={[
                  { value: "", label: "Prefer not to say" },
                  { value: "female", label: "Female" },
                  { value: "male", label: "Male" },
                  { value: "other", label: "Another sex" },
                ]}
              />
              <TextInput label="Your name (caregiver)" value={draft.caregiverName} onChange={(e) => set("caregiverName", e.target.value)} autoComplete="off" />
              <TextInput label="Your relationship" optional placeholder="e.g. daughter" value={draft.caregiverRelation} onChange={(e) => set("caregiverRelation", e.target.value)} autoComplete="off" />
            </div>
          </fieldset>

          <fieldset className="cg-set-fieldset">
            <legend className="cg-set-legend">Health conditions</legend>
            <p className="cg-set-help">Tick what a clinician has told you about. These switch on condition-specific rules — they are never guessed.</p>
            <ul className="cg-set-checks" role="list">
              {CONDITIONS.map((c) => {
                const checked = draft.conditions.includes(c.tag);
                const auto = c.tag === "history_of_falls" && fromDiary && !checked;
                return (
                  <li key={c.tag}>
                    <label className={cx("cg-set-check", checked && "is-checked")}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(c.tag)} />
                      <span className="cg-set-check__box" aria-hidden="true">
                        <Check size={14} strokeWidth={3} />
                      </span>
                      <span className="cg-set-check__text">
                        <span>{c.label}</span>
                        {auto ? (
                          <span className="cg-set-check__hint cg-set-check__hint--auto">In use now: a fall is recorded in the diary</span>
                        ) : (
                          c.hint && <span className="cg-set-check__hint">{c.hint}</span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <fieldset className="cg-set-fieldset">
            <legend className="cg-set-legend">Kidney function</legend>
            <div className="cg-set-crcl">
              <TextInput
                label="Creatinine clearance (CrCl), mL/min"
                optional
                inputMode="decimal"
                value={draft.crcl}
                onChange={(e) => set("crcl", e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
                error={visibleErrors.crcl}
              />
              <Disclosure summary="What is this, and where do I find it?">
                <div className="cg-set-explain">
                  <p>
                    Creatinine clearance estimates how well the kidneys clear medicines. Some medicines are listed in the AGS
                    Beers Criteria for people below a certain clearance, so Kinwise only checks those rules when you enter it.
                  </p>
                  <p>
                    Ask the doctor’s office or pharmacist for the most recent value, or look in a lab report from the patient
                    portal. Leave it empty if you don’t know it — Kinwise will not estimate it, and nothing here changes a dose.
                  </p>
                </div>
              </Disclosure>
            </div>
          </fieldset>
        </CardBody>
        <CardFooter className="cg-set-footer">
          <p className="cg-set-status" aria-live="polite">
            {dirty ? "You have unsaved changes." : (
              <>
                <CircleCheck size={16} aria-hidden="true" /> Saved on this device
              </>
            )}
          </p>
          <div className="cg-set-actions">
            <Button variant="ghost" disabled={!dirty} onClick={() => { setDraft(saved); setShowErrors(false); }}>
              Discard changes
            </Button>
            <Button type="submit" variant="primary" disabled={!dirty}>
              Save profile
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// On-device AI

const AI_DOES = [
  "Drafts the visit brief’s sentences from the evidence package",
  "Answers questions about the records, citing the entries it used",
  "Rewrites a review finding in simpler words",
  "Suggests diary answers the rules missed — each tied to her exact words",
];
const AI_DOES_NOT = [
  "Decide any flag, count or comparison — code does that",
  "Give medical advice, or say what a symptom means",
  "Send anything off this device",
  "Reach the brief without passing the claim checker and your review",
];

/** Models listed before "Show more" (the registry lists the recommended and smallest first). */
const PRIMARY_MODELS = 3;

function formatMB(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`;
}

function AiCard() {
  const { data, update } = useStore();
  const llm = useLLM();
  const toast = useToast();
  const selected = MODEL_OPTIONS.some((m) => m.id === data.settings.aiModel) ? data.settings.aiModel : DEFAULT_MODEL_ID;
  const option = MODEL_OPTIONS.find((m) => m.id === selected) ?? MODEL_OPTIONS[0];
  const [cached, setCached] = useState<Record<string, boolean>>({});
  const busy = llm.status === "loading";
  const loaded = llm.status === "ready" || llm.status === "generating";
  const loadedOption = MODEL_OPTIONS.find((m) => m.id === llm.model);
  const [showAll, setShowAll] = useState(false);
  const hidden = MODEL_OPTIONS.filter((m, i) => !(i < PRIMARY_MODELS || m.id === selected || m.id === llm.model)).length;

  useEffect(() => {
    let alive = true;
    Promise.all(MODEL_OPTIONS.map(async (m) => [m.id, await isModelCached(m.id).catch(() => false)] as const)).then((rows) => {
      if (alive) setCached(Object.fromEntries(rows));
    });
    return () => {
      alive = false;
    };
  }, [llm.status]);

  const choose = (id: string) => {
    if (id === data.settings.aiModel) return;
    update("caregiver", (prev) => ({ ...prev, settings: { ...prev.settings, aiModel: id } }));
  };
  const load = async () => {
    try {
      await loadModel(selected);
      toast.show({ title: `${option.label} is ready`, description: "It runs on this device. Your records stay here.", tone: "success" });
    } catch (e) {
      toast.show({ title: "The model did not load", description: e instanceof Error ? e.message : String(e), tone: "caution" });
    }
  };
  const unload = async () => {
    await unloadModel();
    toast.show({ title: "On-device AI turned off", description: "Everything else keeps working without it." });
  };
  const remove = async () => {
    try {
      await removeModelCache(selected);
      setCached((c) => ({ ...c, [selected]: false }));
      toast.show({ title: "Downloaded model files removed", tone: "success" });
    } catch (e) {
      toast.show({ title: "Could not remove the files", description: e instanceof Error ? e.message : String(e), tone: "caution" });
    }
  };

  return (
    <Card as="section" padding="lg" aria-labelledby="set-ai-title" className="cg-set-card">
      <CardHeader
        id="set-ai-title"
        icon={<Cpu size={20} />}
        title="On-device AI"
        subtitle="Optional. Kinwise works fully without it; with it, wording gets friendlier."
        actions={
          <Badge tone={loaded ? "success" : llm.status === "error" ? "caution" : llm.status === "unsupported" ? "neutral" : busy ? "info" : "neutral"} icon>
            {loaded ? "On" : busy ? "Loading" : llm.status === "unsupported" ? "Not available here" : llm.status === "error" ? "Didn’t load" : "Off"}
          </Badge>
        }
      />
      <CardBody className="cg-set-ai">
        <p className="cg-set-privacy-line">
          <LockKeyhole size={16} aria-hidden="true" />
          <span>Model files download once from Hugging Face; your records never leave this device.</span>
        </p>

        {llm.status === "unsupported" && (
          <Callout tone="info" title="This browser can’t run the on-device model">
            {llm.message} Use a recent Chrome or Edge on a laptop or desktop with a graphics card that supports WebGPU.
          </Callout>
        )}

        <fieldset className="cg-set-fieldset" disabled={busy}>
          <legend className="cg-set-legend">Choose a model</legend>
          <ul className="cg-set-models" role="list">
            {MODEL_OPTIONS.filter((m, i) => showAll || i < PRIMARY_MODELS || m.id === selected || m.id === llm.model).map((m) => {
              const isSel = m.id === selected;
              return (
                <li key={m.id}>
                  <label className={cx("cg-set-model", isSel && "is-selected")}>
                    <input type="radio" name="ai-model" value={m.id} checked={isSel} onChange={() => choose(m.id)} />
                    <span className="cg-set-model__radio" aria-hidden="true" />
                    <span className="cg-set-model__main">
                      <span className="cg-set-model__name">
                        {m.label}
                        {m.recommended && (
                          <Badge tone="primary" size="sm">
                            Recommended
                          </Badge>
                        )}
                        {cached[m.id] && (
                          <Badge tone="success" size="sm" icon={<HardDriveDownload size={12} aria-hidden="true" />}>
                            Downloaded
                          </Badge>
                        )}
                        {llm.model === m.id && loaded && (
                          <Badge tone="success" size="sm" icon>
                            Loaded
                          </Badge>
                        )}
                      </span>
                      <span className="cg-set-model__note">{m.note}</span>
                    </span>
                    <span className="cg-set-model__specs ui-num">
                      <span>{formatMB(m.sizeMB)} download</span>
                      <span>{formatMB(m.vramMB)} GPU memory</span>
                      <span>{m.license}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {!showAll && hidden > 0 && (
            <button type="button" className="cg-set-more" onClick={() => setShowAll(true)}>
              Show {hidden} more {hidden === 1 ? "model" : "models"}
            </button>
          )}
        </fieldset>

        <div className="cg-set-ai-status" aria-live="polite">
          {busy ? (
            <ProgressBar label={llm.message} value={llm.progress > 0 ? llm.progress : null} detail="You can keep using Kinwise while this loads." />
          ) : (
            <p className={cx("cg-set-ai-message", llm.status === "error" && "is-error")}>{llm.message}</p>
          )}
          {loaded && llm.lastMs != null && <p className="cg-set-help">Last answer took {(llm.lastMs / 1000).toFixed(1)} s.</p>}
        </div>

        <div className="cg-set-actions cg-set-actions--start">
          {loaded && loadedOption?.id === selected ? (
            <Button variant="secondary" iconLeft={<Power size={18} />} onClick={unload}>
              Turn off the model
            </Button>
          ) : (
            <Button variant="primary" iconLeft={<Download size={18} />} onClick={load} loading={busy} disabled={llm.status === "unsupported"}>
              {loaded ? `Switch to ${option.label}` : cached[selected] ? `Load ${option.label}` : `Download and load ${option.label} (${formatMB(option.sizeMB)})`}
            </Button>
          )}
          {cached[selected] && !(loaded && llm.model === selected) && !busy && (
            <Button variant="ghost" iconLeft={<Trash2 size={18} />} onClick={remove}>
              Remove downloaded files
            </Button>
          )}
        </div>

        <div className="cg-set-does">
          <div>
            <h3 className="cg-set-does__title">What the AI does</h3>
            <ul role="list">
              {AI_DOES.map((t) => (
                <li key={t}>
                  <CircleCheck size={17} aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="cg-set-does__title">What it never does</h3>
            <ul role="list" className="cg-set-does__never">
              {AI_DOES_NOT.map((t) => (
                <li key={t}>
                  <CircleSlash size={17} aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Display

function DisplayCard() {
  const { data, update } = useStore();
  const setSetting = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) =>
    update("caregiver", (prev) => ({ ...prev, settings: { ...prev.settings, [key]: value } }));
  return (
    <Card as="section" padding="lg" aria-labelledby="set-display-title" className="cg-set-card">
      <CardHeader id="set-display-title" icon={<MonitorCog size={20} />} title="Display" subtitle="Applies to both views on this device." />
      <CardBody className="cg-set-display">
        <Segmented
          label="Text size"
          value={data.settings.textSize}
          onChange={(v) => setSetting("textSize", v)}
          options={[
            { value: "standard", label: "Standard" },
            { value: "large", label: "Large" },
            { value: "extra", label: "Extra large" },
          ]}
        />
        <Segmented
          label="Theme"
          value={data.settings.theme}
          onChange={(v) => setSetting("theme", v)}
          options={[
            { value: "system", label: "Match this device" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Data

/** A record with nothing in it (used by "Delete everything"). Keeps display settings. */
function emptyRecord(prev: StoreData, now: string): StoreData {
  return {
    schemaVersion: 2,
    datasetId: `empty-${now}`,
    revision: prev.revision + 1,
    isDemoData: false,
    profile: {
      displayName: "Your relative",
      preferredName: "Your relative",
      age: 0,
      sex: null,
      conditions: [],
      crclMlMin: null,
      caregiverName: "You",
      caregiverRelation: "",
    },
    medications: [],
    medEvents: [],
    checkIns: [],
    checkInHistory: [],
    notes: [],
    reviewDecisions: [],
    briefs: [],
    savedQuestions: [],
    settings: { ...prev.settings },
    createdAt: now,
    updatedAt: now,
  };
}

type Pending = { kind: "reset" } | { kind: "delete" } | { kind: "import"; data: StoreData; fileName: string } | null;

function DataRow({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action: ReactNode }) {
  return (
    <li className="cg-set-row">
      <span className="cg-set-row__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="cg-set-row__text">
        <h3 className="cg-set-row__title">{title}</h3>
        <p>{children}</p>
      </div>
      <div className="cg-set-row__action">{action}</div>
    </li>
  );
}

function DataCard() {
  const { data, today, resetDemo, replaceAll } = useStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const counts = `${data.medications.length} medicines · ${data.checkIns.length} check-ins · ${data.notes.length} notes`;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kinwise-record-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.show({ title: "Record exported", description: `Saved as kinwise-record-${today}.json in your downloads.`, tone: "success" });
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("That file is larger than a Kinwise record can be.");
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!validateStore(parsed)) throw new Error("That file isn’t a Kinwise record, or parts of it are missing.");
      setPending({ kind: "import", data: { ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } }, fileName: file.name });
    } catch (err) {
      setImportError(err instanceof SyntaxError ? "That file isn’t valid JSON." : err instanceof Error ? err.message : "That file could not be read.");
    }
  };

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === "reset") {
      resetDemo();
      toast.show({ title: "Demo record restored", description: "Margaret’s fictional record is back to its starting point.", tone: "success" });
    } else if (pending.kind === "delete") {
      const now = new Date().toISOString();
      const result = replaceAll(emptyRecord(data, now));
      toast.show(result.ok ? { title: "Everything deleted", description: "This device now holds an empty record.", tone: "success" } : { title: "Nothing was deleted", description: result.error, tone: "attention" });
    } else {
      const result = replaceAll(pending.data);
      toast.show(result.ok ? { title: "Record imported", description: pending.fileName, tone: "success" } : { title: "The record was not imported", description: result.error, tone: "attention" });
    }
    setPending(null);
  };

  const dialog = pending && {
    reset: {
      title: "Restore the demo record?",
      body: "Margaret’s fictional record goes back to how the demo starts. Check-ins, notes, review decisions and briefs added since then are removed.",
      action: "Restore demo record",
    },
    delete: {
      title: "Delete everything on this device?",
      body: `This removes the profile, medicines, check-ins, notes and briefs (${counts}). It can’t be undone — export a copy first if you might need it. Downloaded AI model files are kept.`,
      action: "Delete everything",
    },
    import: {
      title: "Replace this record with the file?",
      body: pending.kind === "import"
        ? `“${pending.fileName}” holds ${pending.data.medications.length} medicines and ${pending.data.checkIns.length} check-ins for ${pending.data.profile.displayName}. It replaces everything on this device now (${counts}).`
        : "",
      action: "Import and replace",
    },
  }[pending.kind];

  return (
    <Card as="section" padding="lg" aria-labelledby="set-data-title" className="cg-set-card">
      <CardHeader id="set-data-title" icon={<HardDriveDownload size={20} />} title="Your data" subtitle={`On this device: ${counts}.`} />
      <CardBody>
        <ul className="cg-set-rows" role="list">
          <DataRow
            icon={<Download size={20} />}
            title="Export a copy"
            action={
              <Button variant="secondary" iconLeft={<Download size={18} />} onClick={exportJson}>
                Export JSON
              </Button>
            }
          >
            The whole record as one file you keep — a backup, or to move to another browser. For the clinic, use the visit brief or its FHIR export.
          </DataRow>
          <DataRow
            icon={<Upload size={20} />}
            title="Import a copy"
            action={
              <>
                <input ref={fileRef} type="file" accept="application/json,.json" className="ui-visually-hidden" tabIndex={-1} aria-hidden="true" onChange={onFile} />
                <Button variant="secondary" iconLeft={<Upload size={18} />} onClick={() => fileRef.current?.click()}>
                  Choose file…
                </Button>
              </>
            }
          >
            Load a record exported from Kinwise. It is checked before anything changes, and you confirm first.
          </DataRow>
          {importError && (
            <li>
              <Callout tone="caution" title="That file was not imported">
                {importError}
              </Callout>
            </li>
          )}
          <DataRow
            icon={<RotateCcw size={20} />}
            title="Restore the demo record"
            action={
              <Button variant="secondary" iconLeft={<RotateCcw size={18} />} onClick={() => setPending({ kind: "reset" })}>
                Restore demo
              </Button>
            }
          >
            Bring back Margaret’s fictional story exactly as the demo starts.
          </DataRow>
          <DataRow
            icon={<Trash2 size={20} />}
            title="Delete everything"
            action={
              <Button variant="danger-quiet" iconLeft={<Trash2 size={18} />} onClick={() => setPending({ kind: "delete" })}>
                Delete everything
              </Button>
            }
          >
            Remove every record from this browser.
          </DataRow>
        </ul>
      </CardBody>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        role="alertdialog"
        size="sm"
        title={dialog?.title ?? ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant={pending?.kind === "delete" ? "danger-quiet" : "primary"} onClick={confirm}>
              {dialog?.action}
            </Button>
          </>
        }
      >
        <p className="cg-set-dialog-text">{dialog?.body}</p>
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

export function Settings() {
  const { data } = useStore();
  const name = data.profile.preferredName || data.profile.displayName;
  return (
    <div className="cg-set">
      <PageHeader
        eyebrow={`${name} · Settings`}
        title="Settings"
        subtitle="The profile the review uses, the optional on-device AI, display and your data. Everything here stays in this browser."
      />
      <div className="cg-set-layout">
        <div className="cg-set-main">
          <ProfileCard />
          <AiCard />
          <DataCard />
        </div>
        <aside className="cg-set-side" aria-label="Display, privacy and tour">
          <DisplayCard />
          <Card as="section" padding="lg" tone="tint" aria-labelledby="set-privacy-title" className="cg-set-card">
            <CardHeader id="set-privacy-title" icon={<LockKeyhole size={20} />} title="Privacy" />
            <CardBody className="cg-set-privacy">
              <p>
                Kinwise keeps this record in this browser, on this device. There is no Kinwise server or account, and no
                analytics or trackers.
              </p>
              <p>Nothing is shared unless you print, export or copy it. The only download Kinwise can start is the optional AI model.</p>
              <p className="cg-set-help">Clearing this browser’s site data deletes the record — export a copy to keep one.</p>
            </CardBody>
          </Card>
          <Card as="section" padding="lg" aria-labelledby="set-tour-title" className="cg-set-card">
            <CardHeader
              id="set-tour-title"
              icon={<PlayCircle size={20} />}
              title="Guided tour"
              subtitle={data.settings.tourCompleted ? "You’ve seen the tour. Take it again any time." : "Eight short steps through both views."}
            />
            <CardBody>
              <Button variant="secondary" block iconLeft={<PlayCircle size={18} />} onClick={() => startTour()}>
                {data.settings.tourCompleted ? "Replay the 2-minute tour" : "Take the 2-minute tour"}
              </Button>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
