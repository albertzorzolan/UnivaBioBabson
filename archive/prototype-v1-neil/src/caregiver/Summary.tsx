import { Printer } from 'lucide-react'
import { METRICS, type SymptomKey } from '../lib/correlation'
import { addDays, formatDate, todayISO } from '../lib/dates'
import { SEVERITY_LABEL, SEVERITY_ORDER } from '../lib/flags'
import { useData } from '../store'
import type { SymptomLog } from '../types'
import { PageHeader } from './shared'

const QUESTION_FOR: Partial<Record<SymptomKey, string>> = {
  dizziness: 'dizziness',
  confusion: 'the confusion or memory fog',
  fall: 'the falls or near-falls',
  appetite: 'the lower appetite',
  energy: 'the lower energy',
  sleep: 'the poorer sleep',
}

function periodStats(logs: SymptomLog[]) {
  const n = logs.length
  const avg = (f: (l: SymptomLog) => number) => (n ? (logs.reduce((s, l) => s + f(l), 0) / n).toFixed(1) : '—')
  return {
    n,
    dizzy: logs.filter((l) => l.dizziness).length,
    confusion: logs.filter((l) => l.confusion).length,
    falls: logs.filter((l) => l.fall).length,
    appetite: logs.filter((l) => l.appetite === 'worse').length,
    energy: avg((l) => l.energy),
    sleep: avg((l) => l.sleep),
  }
}

export function Summary() {
  const { profile, meds, logs, flags, flagStatus, analyses } = useData()
  const today = todayISO()
  const active = flags.filter((f) => flagStatus(f) !== 'dismissed')
  const dismissed = flags.length - active.length
  const insights = analyses.flatMap((a) => a.insights)
  const worse = insights.filter((i) => i.direction === 'worse')
  const better = insights.filter((i) => i.direction === 'better')
  const waiting = analyses.filter((a) => a.status !== 'ok')

  const recent = periodStats(logs.filter((l) => l.date > addDays(today, -14)))
  const prior = periodStats(logs.filter((l) => l.date > addDays(today, -28) && l.date <= addDays(today, -14)))

  // Questions: one per symptom change, then one per active flag, de-duplicated
  const questions: string[] = []
  const byMed = new Map<string, SymptomKey[]>()
  for (const i of worse) byMed.set(i.medName, [...(byMed.get(i.medName) ?? []), i.metric])
  for (const [med, keys] of byMed) {
    const things = keys.map((k) => QUESTION_FOR[k]).filter(Boolean) as string[]
    const list = things.length > 1 ? `${things.slice(0, -1).join(', ')} and ${things[things.length - 1]}` : things[0]
    questions.push(`Could ${med} be contributing to ${list} we’ve noticed since it was started?`)
  }
  for (const f of active) if (!questions.includes(f.question)) questions.push(f.question)
  if (meds.length > 0) questions.push('Are there any medicines on this list we could reduce or stop, and what would that plan look like?')

  return (
    <div className="page">
      <div className="no-print">
        <PageHeader
          title="Doctor-visit summary"
          subtitle="A one-page discussion aid. Print it or save it as a PDF to bring to the appointment."
          actions={
            <button className="btn btn-accent" onClick={() => window.print()}>
              <Printer size={18} aria-hidden="true" /> Print / Save as PDF
            </button>
          }
        />
      </div>

      <article className="summary-sheet">
        <header className="sum-head">
          <div>
            <p className="sum-kicker">MedWatch · Doctor-visit summary</p>
            <h1>
              {profile.patientName}, {profile.patientAge}
            </h1>
          </div>
          <div className="sum-meta">
            <p>Prepared {formatDate(today, { year: true })}</p>
            <p>by {profile.caregiverName} (caregiver)</p>
          </div>
        </header>

        <p className="sum-disclaimer">
          <strong>This is a discussion aid for a doctor visit, not a diagnosis or medical recommendation.</strong> It was put together from a
          caregiver-managed medication list and the patient’s own daily check-ins. Flags come from a simplified rule set and may not apply.
        </p>

        <section>
          <h2>1. Current medications ({meds.length})</h2>
          {meds.length === 0 ? (
            <p>No medications recorded.</p>
          ) : (
            <table className="sum-table">
              <thead>
                <tr>
                  <th>Medication</th>
                  <th>Dose</th>
                  <th>Schedule</th>
                  <th>For</th>
                  <th>Started</th>
                  <th>Prescriber</th>
                </tr>
              </thead>
              <tbody>
                {[...meds]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.name}</strong>
                      </td>
                      <td>{m.dosage}</td>
                      <td>{m.frequency}</td>
                      <td>{m.reason || '—'}</td>
                      <td>{formatDate(m.startDate, { year: true })}</td>
                      <td>{m.doctor || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2>2. Medication concerns to discuss ({active.length})</h2>
          {active.length === 0 ? (
            <p>No active flags from MedWatch’s rules.</p>
          ) : (
            <ul className="sum-flags">
              {SEVERITY_ORDER.flatMap((s) => active.filter((f) => f.severity === s)).map((f) => (
                <li key={f.id} className={`sev-${f.severity}`}>
                  <span className="sum-sev">{SEVERITY_LABEL[f.severity]}</span>
                  <strong>{f.title}</strong>
                  <span className="sum-meds"> — {f.medNames.join(', ')}</span>
                  <p>{f.explanation}</p>
                </li>
              ))}
            </ul>
          )}
          {dismissed > 0 && (
            <p className="sum-note">
              {dismissed} {dismissed === 1 ? 'flag was' : 'flags were'} reviewed and dismissed by the caregiver.
            </p>
          )}
        </section>

        <section>
          <h2>3. Symptom trends from daily check-ins</h2>
          <table className="sum-table sum-compare">
            <thead>
              <tr>
                <th />
                <th>Last 14 days</th>
                <th>14 days before that</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Check-ins completed</td>
                <td>{recent.n}</td>
                <td>{prior.n}</td>
              </tr>
              <tr>
                <td>Days with dizziness</td>
                <td>{recent.dizzy}</td>
                <td>{prior.dizzy}</td>
              </tr>
              <tr>
                <td>Days with confusion / memory fog</td>
                <td>{recent.confusion}</td>
                <td>{prior.confusion}</td>
              </tr>
              <tr>
                <td>Falls or near-falls</td>
                <td>{recent.falls}</td>
                <td>{prior.falls}</td>
              </tr>
              <tr>
                <td>Days with worse appetite</td>
                <td>{recent.appetite}</td>
                <td>{prior.appetite}</td>
              </tr>
              <tr>
                <td>Average energy (1–5)</td>
                <td>{recent.energy}</td>
                <td>{prior.energy}</td>
              </tr>
              <tr>
                <td>Average sleep quality (1–5)</td>
                <td>{recent.sleep}</td>
                <td>{prior.sleep}</td>
              </tr>
            </tbody>
          </table>

          {(worse.length > 0 || better.length > 0) && (
            <>
              <h3>Changes around medication start dates</h3>
              <ul className="sum-list">
                {[...worse, ...better].map((i) => (
                  <li key={`${i.medId}-${i.metric}`}>
                    <strong>{i.direction === 'worse' ? 'Worse: ' : 'Better: '}</strong>
                    {i.text}
                  </li>
                ))}
              </ul>
            </>
          )}
          {worse.length === 0 && better.length === 0 && <p>No notable symptom changes around medication start dates.</p>}
          {waiting.length > 0 && (
            <p className="sum-note">
              Not enough check-in data yet to compare before/after for: {waiting.map((a) => a.med.name).join(', ')}.
            </p>
          )}
          <p className="sum-note">
            Method: for each medication, the share of days each symptom was reported (or the average score) in the 14 days before it started is
            compared with the 14 days after. Tracked: {METRICS.map((m) => m.label).join(', ')}. A pattern is a prompt for discussion, not
            evidence of cause.
          </p>
        </section>

        <section>
          <h2>4. Questions to ask</h2>
          <ol className="sum-questions">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </section>

        <section className="sum-notes">
          <h2>Notes from the visit</h2>
          <div className="lines" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>

        <footer className="sum-foot">
          Generated by MedWatch on this device. Not a medical record. Do not stop or change any medicine without speaking to a doctor or pharmacist.
        </footer>
      </article>
    </div>
  )
}
