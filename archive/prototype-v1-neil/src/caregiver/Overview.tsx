import { ArrowRight, CalendarDays, CircleCheck, ClipboardCheck, FileText, Flag, Pill, Plus } from 'lucide-react'
import { TrackerPlaceholder } from '../components/common'
import { addDays, daysBetween, formatDate, todayISO } from '../lib/dates'
import { SEVERITY_LABEL, SEVERITY_ORDER } from '../lib/flags'
import { useData } from '../store'
import { buildSeries } from './chartData'
import { DizzinessChart, EnergySleepChart } from './charts'
import { FlagCard, InsightLine, PageHeader } from './shared'

export function Overview() {
  const { profile, meds, logs, flags, flagStatus, analyses } = useData()
  const today = todayISO()
  const openFlags = flags.filter((f) => flagStatus(f) === 'open')
  const recent = logs.filter((l) => l.date > addDays(today, -14))
  const lastLog = logs[logs.length - 1]
  const worse = analyses.flatMap((a) => a.insights.filter((i) => i.direction === 'worse'))
  const series = buildSeries(logs, addDays(today, -20), today)

  const lastCheckIn = !lastLog
    ? 'No check-ins yet'
    : lastLog.date === today
      ? 'Today'
      : daysBetween(lastLog.date, today) === 1
        ? 'Yesterday'
        : formatDate(lastLog.date)

  return (
    <div className="page">
      <PageHeader
        title={`${profile.patientName}’s overview`}
        subtitle={`${profile.patientName}, ${profile.patientAge} · Everything here is stored only on this device.`}
        actions={
          <>
            <a className="btn btn-ghost" href="#/caregiver/meds/new">
              <Plus size={18} aria-hidden="true" /> Add medication
            </a>
            <a className="btn btn-accent" href="#/caregiver/summary">
              <FileText size={18} aria-hidden="true" /> Prepare doctor visit
            </a>
          </>
        }
      />

      <section className="stats">
        <a className="card stat" href="#/caregiver/meds">
          <Pill size={20} className="stat-icon" aria-hidden="true" />
          <p className="stat-value">{meds.length}</p>
          <p className="stat-label">Medications</p>
        </a>
        <a className="card stat" href="#/caregiver/flags">
          <Flag size={20} className="stat-icon" aria-hidden="true" />
          <p className="stat-value">{openFlags.length}</p>
          <p className="stat-label">Open flags</p>
          <div className="sev-counts">
            {SEVERITY_ORDER.map((s) => {
              const n = openFlags.filter((f) => f.severity === s).length
              return n > 0 ? (
                <span key={s} className={`pill sev-${s}`} title={SEVERITY_LABEL[s]}>
                  <span className="dot" /> {n}
                </span>
              ) : null
            })}
          </div>
        </a>
        <a className="card stat" href="#/caregiver/symptoms">
          <ClipboardCheck size={20} className="stat-icon" aria-hidden="true" />
          <p className="stat-value">
            {recent.length}
            <span className="stat-of">/14</span>
          </p>
          <p className="stat-label">Check-ins, last 14 days</p>
        </a>
        <a className="card stat" href="#/caregiver/symptoms">
          <CalendarDays size={20} className="stat-icon" aria-hidden="true" />
          <p className="stat-value stat-value-text">{lastCheckIn}</p>
          <p className="stat-label">Last check-in</p>
        </a>
      </section>

      <div className="grid-2">
        <section className="card stack">
          <div className="spread">
            <h2 className="card-title">Needs attention</h2>
            <a href="#/caregiver/flags" className="link-more">
              All flags <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
          {openFlags.length === 0 ? (
            <div className="empty">
              <CircleCheck size={32} aria-hidden="true" />
              <p>No open flags. Nice work staying on top of things.</p>
            </div>
          ) : (
            <div className="stack" style={{ '--gap': '10px' } as React.CSSProperties}>
              {openFlags.slice(0, 3).map((f) => (
                <a key={f.id} href="#/caregiver/flags" className="flag-link">
                  <FlagCard flag={f} compact />
                </a>
              ))}
              {openFlags.length > 3 && <p className="faint small">+ {openFlags.length - 3} more</p>}
            </div>
          )}
        </section>

        <section className="card stack">
          <div className="spread">
            <h2 className="card-title">What the check-ins show</h2>
            <a href="#/caregiver/symptoms" className="link-more">
              Symptom trends <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
          {worse.length === 0 ? (
            <p className="muted">
              {logs.length < 10
                ? 'Not enough data yet — keep logging symptoms daily and patterns will show here.'
                : 'No notable symptom changes linked to a medication start date.'}
            </p>
          ) : (
            <ul className="insight-list">
              {worse.slice(0, 4).map((i) => (
                <InsightLine key={`${i.medId}-${i.metric}`} insight={i} />
              ))}
            </ul>
          )}
          <p className="faint small">Before/after comparisons of daily check-ins. A pattern is a reason to ask, not proof of cause.</p>
        </section>
      </div>

      <section className="card stack">
        <div className="spread">
          <h2 className="card-title">Last 3 weeks</h2>
          <span className="faint small">Dashed lines mark medication start dates</span>
        </div>
        <EnergySleepChart data={series} meds={meds} height={220} />
        <h3 className="chart-title">Dizziness</h3>
        <DizzinessChart data={series} meds={meds} height={150} />
      </section>

      <TrackerPlaceholder />
    </div>
  )
}
