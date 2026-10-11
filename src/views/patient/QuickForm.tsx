// The quick check-in form: big tap cards (≥56px), one question per row, nothing pre-selected.
// Every option in a row carries an icon so labels line up (a row with one icon would sit its label lower).
// "Not sure" is its own choice but is saved as unanswered. Fields filled from her words carry a
// "from your words" tag that shows the exact quote on hover, focus or tap.
import type { ReactNode } from "react";
import {
  Battery,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Check,
  CircleHelp,
  Equal,
  Frown,
  Laugh,
  Meh,
  Annoyed,
  Signal,
  SignalLow,
  SignalMedium,
  Smile,
  TextQuote,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import type { DiaryAnswers, DiaryField } from "../../model/types";
import { Segmented, Tooltip, type SegmentedOption } from "../../ui";
import {
  APPETITE_WORDS,
  ENERGY_WORDS,
  MAIN_FIELDS,
  SEVERITY_WORDS,
  SLEEP_WORDS,
  answeredCount,
  type CheckInForm,
} from "./checkin";
import { FallCallout } from "./SavedDay";

type Choice = string | number | boolean;
const UNSURE = "unsure";

interface Question {
  field: DiaryField;
  label: string;
  hint?: string;
  options: SegmentedOption<Choice>[];
}

const unsureOption: SegmentedOption<Choice> = { value: UNSURE, label: "Not sure", icon: <CircleHelp size={24} /> };

const YES_NO: SegmentedOption<Choice>[] = [
  { value: true, label: "Yes", icon: <Check size={24} /> },
  { value: false, label: "No", icon: <X size={24} /> },
  unsureOption,
];

const ENERGY_ICONS: Record<number, ReactNode> = {
  1: <BatteryWarning size={24} />,
  2: <BatteryLow size={24} />,
  3: <BatteryMedium size={24} />,
  4: <Battery size={24} />,
  5: <BatteryFull size={24} />,
};
const SLEEP_ICONS: Record<number, ReactNode> = {
  1: <Frown size={24} />,
  2: <Annoyed size={24} />,
  3: <Meh size={24} />,
  4: <Smile size={24} />,
  5: <Laugh size={24} />,
};

const scale = (words: Record<number, string>, icons: Record<number, ReactNode>): SegmentedOption<Choice>[] => [
  ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: words[n], description: `${n} of 5`, icon: icons[n] })),
  unsureOption,
];

const FEELINGS: Question[] = [
  { field: "energy", label: "How was your energy today?", options: scale(ENERGY_WORDS, ENERGY_ICONS) },
  { field: "sleep", label: "How did you sleep last night?", options: scale(SLEEP_WORDS, SLEEP_ICONS) },
  {
    field: "appetite",
    label: "How was your appetite?",
    options: [
      { value: "worse", label: APPETITE_WORDS.worse, icon: <TrendingDown size={24} /> },
      { value: "same", label: APPETITE_WORDS.same, icon: <Equal size={24} /> },
      { value: "better", label: APPETITE_WORDS.better, icon: <TrendingUp size={24} /> },
      unsureOption,
    ],
  },
];

const HAPPENINGS: Question[] = [
  { field: "dizziness", label: "Did you feel dizzy or light-headed?", options: YES_NO },
  { field: "drowsiness", label: "Were you drowsy during the day?", options: YES_NO },
  { field: "confusion", label: "Did you feel confused or foggy?", options: YES_NO },
  { field: "fall", label: "Did you have a fall today?", options: YES_NO },
  {
    field: "nearFall",
    label: "Did you nearly fall or lose your balance?",
    hint: "For example, you tripped or had to catch yourself.",
    options: YES_NO,
  },
  { field: "swelling", label: "Were your ankles or feet swollen?", options: YES_NO },
];

const SEVERITY: Question = {
  field: "dizzinessSeverity",
  label: "How strong was the dizziness?",
  options: [
    { value: 1, label: SEVERITY_WORDS[1], icon: <SignalLow size={24} /> },
    { value: 2, label: SEVERITY_WORDS[2], icon: <SignalMedium size={24} /> },
    { value: 3, label: SEVERITY_WORDS[3], icon: <Signal size={24} /> },
    unsureOption,
  ],
};

export interface QuickFormProps {
  form: CheckInForm;
  onAnswer: (field: DiaryField, value: DiaryAnswers[DiaryField] | "unsure") => void;
}

function FromWordsTag({ form, field }: { form: CheckInForm; field: DiaryField }) {
  const src = form.fromWords[field];
  if (!src || src.spans.length === 0) return null;
  const quotes = [...new Set(src.spans.map((s) => s.quote))].slice(0, 2);
  return (
    <Tooltip
      align="start"
      className="pt-q__tag"
      triggerClassName="pt-q__tag-trigger"
      content={
        <>
          From your words: {quotes.map((q) => `“${q}”`).join(" · ")}
          {src.origin === "llm" ? " (suggested by on-device AI)" : ""}
        </>
      }
    >
      <TextQuote size={16} aria-hidden="true" />
      <span>from your words</span>
    </Tooltip>
  );
}

function QuestionRow({ q, form, onAnswer }: { q: Question; form: CheckInForm; onAnswer: QuickFormProps["onAnswer"] }) {
  const v = form.answers[q.field];
  const value: Choice | null = form.unsure.includes(q.field) ? UNSURE : (v as Choice | null);
  const tag = <FromWordsTag form={form} field={q.field} />;
  return (
    <div className={`pt-q pt-q--n${q.options.length}`} id={`pt-q-${q.field}`} data-field={q.field}>
      <Segmented<Choice>
        size="lg"
        labelAs="h3"
        label={q.label}
        hint={
          q.hint || form.fromWords[q.field] ? (
            <>
              {q.hint && <span className="pt-q__hint-text">{q.hint}</span>}
              {tag}
            </>
          ) : undefined
        }
        value={value}
        options={q.options}
        onChange={(next) => onAnswer(q.field, next === UNSURE ? "unsure" : (next as DiaryAnswers[DiaryField]))}
        className="pt-q__seg"
      />
    </div>
  );
}

/** The two groups of questions plus the dizziness follow-up. */
export function QuickForm({ form, onAnswer }: QuickFormProps) {
  const answered = answeredCount(form.answers);
  return (
    <section className="pt-form" aria-labelledby="pt-form-title">
      <div className="pt-section-head">
        <div>
          <h2 id="pt-form-title" className="pt-section-title">
            Your answers
          </h2>
          <p className="pt-section-lead">Tap to answer. If you’re not sure, choose “Not sure” — it stays blank, never “No”.</p>
        </div>
        <p className="pt-form__count ui-num" aria-live="polite">
          <strong>{answered}</strong> of {MAIN_FIELDS.length} answered
        </p>
      </div>

      <fieldset className="pt-form__group">
        <legend className="pt-form__legend">How you felt</legend>
        {FEELINGS.map((q) => (
          <QuestionRow key={q.field} q={q} form={form} onAnswer={onAnswer} />
        ))}
      </fieldset>

      <fieldset className="pt-form__group">
        <legend className="pt-form__legend">Anything that happened today</legend>
        {HAPPENINGS.map((q) => (
          <div key={q.field} className="pt-form__item">
            <QuestionRow q={q} form={form} onAnswer={onAnswer} />
            {q.field === "dizziness" && form.answers.dizziness === true && (
              <div className="pt-q-follow">
                <QuestionRow q={SEVERITY} form={form} onAnswer={onAnswer} />
              </div>
            )}
            {q.field === "fall" && form.answers.fall === true && <FallCallout />}
          </div>
        ))}
      </fieldset>
    </section>
  );
}
