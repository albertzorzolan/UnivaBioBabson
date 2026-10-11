import { useState } from 'react'
import { Check } from 'lucide-react'
import { addDays, formatDate, todayISO } from '../lib/dates'
import { useData } from '../store'
import type { SymptomLog } from '../types'
import { buildSeries } from './chartData'
import { DizzinessChart, EnergySleepChart } from './charts'
import { AnalysisCard, PageHeader } from './shared'

const RANGES = [
  { id: 14, label: '2 weeks' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
  { id: 0, label: 'All' },
]

const DIZZY = ['', 'A little', 'Some', 'A lot']
const APPETITE = { better: 'Better', same: 'Same', worse: 'Worse' }

export function Symptoms() {
  const { logs, meds, analyses } = useData()
  const [range, setRange] = useState(30)
  const [showAll, setShowAll] = useState(false)
  const today = todayISO()
  const from = range === 0 ? (logs[0]?.date ?? addDays(today, -13)) : addDays(today, -(range - 1))
  const series = buildSeries(logs, from, today)
  const inRange = logs.filter((l) => l.date >= from)
  const history = [...logs].reverse()
  const shown = showAll ? history : history.slice(0, 14)

  return (
    <div className="page">
      <PageHeader title="Symptoms" subtitle="Daily check-ins, trends and before/after comparisons around each medication start date." />

      <div className="segmented" role="tablist" aria-label="Date range">
        {RANGES.map((r) => (
          <button key={r.id} role="tab" aria-selected={range === r.id} onClick={() => setRange(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid-2 grid-2-wide">
        <section className="card stack">
          <div className="spread">
            <h2 className="card-title">Energy &amp; sleep</h2>
            <span className="faint small">1 = very low · 5 = very good</span>
          </div>
          <EnergySleepChart data={series} meds={meds} />
        </section>
        <section className="card stack">
          <div className="spread">
            <h2 className="card-title">Dizziness</h2>
            <span className="faint small">Severity reported each day</span>
          </div>
          <DizzinessChart data={series} meds={meds} height={260} />
        </section>
      </div>

      <section className="card stack">
        <h2 className="card-title">Other symptoms</h2>
        <EventStrip logs={inRange} from={from} to={today} />
      </section>

      <section className="card stack">
        <div>
          <h2 className="card-title">Medication start dates vs. symptoms</h2>
          <p className="muted small">
            For each medication: check-ins from the 14 days before it started, compared with the 14 days after. Shows notable changes only.
          </p>
        </div>
        <div className="analysis-list">
          {analyses.map((a) => (
            <AnalysisCard key={a.med.id} analysis={a} />
          ))}
          {analyses.length === 0 && <p className="muted">Add medications to see comparisons.</p>}
        </div>
      </section>

      <section className="card stack">
        <div className="spread">
          <h2 className="card-title">Check-in history</h2>
          <span className="faint small">{logs.length} check-ins total</span>
        </div>
        {logs.length === 0 ? (
          <p className="muted">No check-ins yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="log-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Energy</th>
                  <th>Sleep</th>
                  <th>Dizziness</th>
                  <th>Confusion</th>
                  <th>Appetite</th>
                  <th>Fall</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.date}>
                    <td>{formatDate(l.date, { year: true })}</td>
                    <td>{l.energy}/5</td>
                    <td>{l.sleep}/5</td>
                    <td>{l.dizziness ? DIZZY[l.dizzinessSeverity ?? 1] : '—'}</td>
                    <td>{l.confusion ? 'Yes' : '—'}</td>
                    <td className={l.appetite === 'worse' ? 'cell-note' : ''}>{APPETITE[l.appetite]}</td>
                    <td className={l.fall ? 'cell-note' : ''}>{l.fall ? 'Yes' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {history.length > 14 && (
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show recent only' : `Show all ${history.length}`}
          </button>
        )}
      </section>
    </div>
  )
}

/** Compact day grid for yes/no symptoms — exact, and readable without color. */
function EventStrip({ logs, from, to }: { logs: SymptomLog[]; from: string; to: string }) {
  const { meds } = useData()
  const byDate = new Map(logs.map((l) => [l.date, l]))
  const days: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  const rows: { label: string; hit: (l: SymptomLog) => boolean }[] = [
    { label: 'Confusion', hit: (l) => l.confusion },
    { label: 'Fall / near-fall', hit: (l) => l.fall },
    { label: 'Worse appetite', hit: (l) => l.appetite === 'worse' },
  ]
  const medStarts = new Map(meds.filter((m) => m.startDate >= from && m.startDate <= to).map((m) => [m.startDate, m.name]))

  return (
    <div className="strip-wrap">
      <div className="strip" style={{ gridTemplateColumns: `140px repeat(${days.length}, minmax(10px, 1fr))` }}>
        {rows.map((r) => (
          <div className="strip-row" key={r.label} style={{ display: 'contents' }}>
            <span className="strip-label">{r.label}</span>
            {days.map((d) => {
              const log = byDate.get(d)
              const hit = log ? r.hit(log) : false
              return (
                <span
                  key={d}
                  className={`strip-cell ${!log ? 'none' : hit ? 'hit' : ''} ${medStarts.has(d) ? 'start' : ''}`}
                  title={`${formatDate(d)}: ${!log ? 'no check-in' : hit ? 'yes' : 'no'}${medStarts.has(d) ? ` · ${medStarts.get(d)} started` : ''}`}
                >
                  {hit && <Check size={10} strokeWidth={3} aria-hidden="true" />}
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <div className="spread faint small strip-foot">
        <span>{formatDate(from)}</span>
        <span className="row" style={{ '--gap': '14px' } as React.CSSProperties}>
          <span className="row" style={{ '--gap': '6px' } as React.CSSProperties}>
            <span className="strip-cell hit legend-cell">
              <Check size={10} strokeWidth={3} />
            </span>
            Reported
          </span>
          <span className="row" style={{ '--gap': '6px' } as React.CSSProperties}>
            <span className="strip-cell none legend-cell" /> No check-in
          </span>
          <span className="row" style={{ '--gap': '6px' } as React.CSSProperties}>
            <span className="strip-cell start legend-cell" /> Medication started
          </span>
        </span>
        <span>{formatDate(to)}</span>
      </div>
    </div>
  )
}
