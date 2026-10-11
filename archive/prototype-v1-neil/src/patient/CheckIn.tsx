import { useState, type ComponentType } from 'react'
import {
  Annoyed,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  CircleCheck,
  Frown,
  Heart,
  Laugh,
  Meh,
  Smile,
  Zap,
  type LucideProps,
} from 'lucide-react'
import { todayISO } from '../lib/dates'
import { useData } from '../store'
import type { Appetite, DizzinessSeverity, SymptomLog } from '../types'

type Draft = {
  energy?: number
  dizziness?: boolean
  dizzinessSeverity?: DizzinessSeverity
  confusion?: boolean
  appetite?: Appetite
  sleep?: number
  fall?: boolean
}

interface Option<T> {
  value: T
  label: string
  icon?: ComponentType<LucideProps>
}

const ENERGY: Option<number>[] = [
  { value: 1, label: 'Very tired', icon: BatteryWarning },
  { value: 2, label: 'Tired', icon: BatteryLow },
  { value: 3, label: 'Okay', icon: BatteryMedium },
  { value: 4, label: 'Good', icon: BatteryFull },
  { value: 5, label: 'Great', icon: Zap },
]
const SLEEP: Option<number>[] = [
  { value: 1, label: 'Very poorly', icon: Frown },
  { value: 2, label: 'Poorly', icon: Annoyed },
  { value: 3, label: 'Okay', icon: Meh },
  { value: 4, label: 'Well', icon: Smile },
  { value: 5, label: 'Very well', icon: Laugh },
]
const YES_NO: Option<boolean>[] = [
  { value: false, label: 'No' },
  { value: true, label: 'Yes' },
]
const DIZZY_LEVEL: Option<DizzinessSeverity>[] = [
  { value: 1, label: 'A little' },
  { value: 2, label: 'Some' },
  { value: 3, label: 'A lot' },
]
const APPETITE: Option<Appetite>[] = [
  { value: 'better', label: 'Better' },
  { value: 'same', label: 'Same as usual' },
  { value: 'worse', label: 'Worse' },
]

function Choices<T extends string | number | boolean>({
  name,
  options,
  value,
  onChange,
  iconic,
}: {
  name: string
  options: Option<T>[]
  value: T | undefined
  onChange: (v: T) => void
  iconic?: boolean
}) {
  return (
    <div className={`choices ${iconic ? 'choices-icons' : ''}`} role="radiogroup" aria-label={name}>
      {options.map((o) => {
        const Icon = o.icon
        const selected = value === o.value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            className="choice"
            onClick={() => onChange(o.value)}
          >
            {Icon && <Icon size={34} strokeWidth={1.75} aria-hidden="true" />}
            <span>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function fromLog(log: SymptomLog): Draft {
  const { energy, dizziness, dizzinessSeverity, confusion, appetite, sleep, fall } = log
  return { energy, dizziness, dizzinessSeverity, confusion, appetite, sleep, fall }
}

export function CheckIn() {
  const { todayLog, saveLog, profile } = useData()
  const [editing, setEditing] = useState(!todayLog)
  const [draft, setDraft] = useState<Draft>(todayLog ? fromLog(todayLog) : {})
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const answers = [
    draft.energy !== undefined,
    draft.dizziness !== undefined && (!draft.dizziness || draft.dizzinessSeverity !== undefined),
    draft.confusion !== undefined,
    draft.appetite !== undefined,
    draft.sleep !== undefined,
    draft.fall !== undefined,
  ]
  const answered = answers.filter(Boolean).length
  const complete = answered === answers.length

  const submit = () => {
    if (!complete) return
    saveLog({
      date: todayISO(),
      energy: draft.energy!,
      dizziness: draft.dizziness!,
      dizzinessSeverity: draft.dizziness ? draft.dizzinessSeverity : undefined,
      confusion: draft.confusion!,
      appetite: draft.appetite!,
      sleep: draft.sleep!,
      fall: draft.fall!,
    })
    setEditing(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!editing && todayLog) {
    return (
      <section className="pt-card done-card" aria-live="polite">
        <CircleCheck size={56} strokeWidth={1.75} className="done-icon" aria-hidden="true" />
        <h2>You’ve checked in today</h2>
        <p>Thank you! Checking in every day helps you, {profile.caregiverName} and your doctor notice changes early.</p>
        {todayLog.fall && (
          <p className="pt-note">
            You mentioned a fall or near-fall. Please make sure {profile.caregiverName} or your doctor knows about it.
          </p>
        )}
        <div className="done-actions">
          <a href="#/patient/doing" className="btn btn-primary pt-btn">
            See how I’m doing
          </a>
          <button
            className="btn btn-ghost pt-btn"
            onClick={() => {
              setDraft(fromLog(todayLog))
              setEditing(true)
            }}
          >
            Change my answers
          </button>
        </div>
      </section>
    )
  }

  return (
    <form
      className="checkin"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="pt-intro">
        <h2>Today’s check-in</h2>
        <p className="muted">Six quick questions. Tap the answer that fits best.</p>
      </div>

      <fieldset className="pt-card q">
        <legend>How is your energy today?</legend>
        <Choices name="Energy" iconic options={ENERGY} value={draft.energy} onChange={(v) => set('energy', v)} />
      </fieldset>

      <fieldset className="pt-card q">
        <legend>Have you felt dizzy today?</legend>
        <Choices
          name="Dizziness"
          options={YES_NO}
          value={draft.dizziness}
          onChange={(v) => setDraft((d) => ({ ...d, dizziness: v, dizzinessSeverity: v ? d.dizzinessSeverity : undefined }))}
        />
        {draft.dizziness && (
          <div className="q-follow">
            <p className="q-sub">How dizzy?</p>
            <Choices
              name="How dizzy"
              options={DIZZY_LEVEL}
              value={draft.dizzinessSeverity}
              onChange={(v) => set('dizzinessSeverity', v)}
            />
          </div>
        )}
      </fieldset>

      <fieldset className="pt-card q">
        <legend>Any confusion or trouble remembering things today?</legend>
        <Choices name="Confusion" options={YES_NO} value={draft.confusion} onChange={(v) => set('confusion', v)} />
      </fieldset>

      <fieldset className="pt-card q">
        <legend>How is your appetite, compared with usual?</legend>
        <Choices name="Appetite" options={APPETITE} value={draft.appetite} onChange={(v) => set('appetite', v)} />
      </fieldset>

      <fieldset className="pt-card q">
        <legend>How did you sleep last night?</legend>
        <Choices name="Sleep" iconic options={SLEEP} value={draft.sleep} onChange={(v) => set('sleep', v)} />
      </fieldset>

      <fieldset className="pt-card q">
        <legend>Did you have a fall, or nearly fall, today?</legend>
        <Choices name="Falls" options={YES_NO} value={draft.fall} onChange={(v) => set('fall', v)} />
        {draft.fall && (
          <p className="pt-note">
            <Heart size={20} aria-hidden="true" /> Thank you for telling us. Please let {profile.caregiverName} or your doctor know.
          </p>
        )}
      </fieldset>

      <div className="submit-bar">
        <p className="progress" aria-live="polite">
          {complete ? 'All done — ready to save.' : `${answered} of ${answers.length} answered`}
        </p>
        <button type="submit" className="btn btn-primary pt-btn pt-btn-wide" disabled={!complete}>
          Save my check-in
        </button>
      </div>
    </form>
  )
}
