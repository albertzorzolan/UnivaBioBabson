import { Check, Hourglass, MessageCircleQuestion, RotateCcw, TrendingDown, TrendingUp, X } from 'lucide-react'
import { SeverityPill } from '../components/common'
import type { Insight, MedAnalysis } from '../lib/correlation'
import { MIN_LOGS_PER_WINDOW, WINDOW_DAYS } from '../lib/correlation'
import { daysBetween, formatDate, todayISO } from '../lib/dates'
import { useData } from '../store'
import type { Flag } from '../types'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  )
}

export function InsightLine({ insight }: { insight: Insight }) {
  const worse = insight.direction === 'worse'
  return (
    <li className={`insight ${worse ? 'insight-worse' : 'insight-better'}`}>
      <span className="insight-icon" aria-hidden="true">
        {worse ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
      </span>
      <span>
        <span className="sr-only">{worse ? 'Worse: ' : 'Better: '}</span>
        {insight.text}
      </span>
    </li>
  )
}

export function AnalysisCard({ analysis }: { analysis: MedAnalysis }) {
  const { med, status, insights, beforeLogged, afterLogged, overlapping } = analysis
  const daysOn = daysBetween(med.startDate, todayISO())
  return (
    <article className="analysis">
      <div className="spread">
        <h3>
          {med.name} <span className="faint small">started {formatDate(med.startDate, { year: true })}</span>
        </h3>
        {status === 'ok' && insights.some((i) => i.direction === 'worse') && <span className="pill sev-next-visit">Changes noticed</span>}
        {status === 'ok' && insights.length === 0 && <span className="pill pill-teal">No notable change</span>}
        {status !== 'ok' && (
          <span className="pill">
            <Hourglass size={13} aria-hidden="true" /> Not enough data yet
          </span>
        )}
      </div>

      {status === 'ok' && insights.length > 0 && (
        <ul className="insight-list">
          {insights.map((i) => (
            <InsightLine key={i.metric} insight={i} />
          ))}
        </ul>
      )}
      {status === 'ok' && insights.length === 0 && (
        <p className="muted small">
          Symptoms in the {WINDOW_DAYS} days after starting look similar to the {WINDOW_DAYS} days before ({beforeLogged} vs {afterLogged} check-ins
          compared).
        </p>
      )}
      {status === 'too-early' && (
        <p className="muted small">
          Started {daysOn} {daysOn === 1 ? 'day' : 'days'} ago. Keep logging symptoms daily — a comparison appears after 7 days.
        </p>
      )}
      {status === 'future' && <p className="muted small">Start date is in the future.</p>}
      {status === 'insufficient' && (
        <p className="muted small">
          Not enough data yet — keep logging symptoms daily. A fair comparison needs at least {MIN_LOGS_PER_WINDOW} check-ins in the {WINDOW_DAYS}{' '}
          days before and after the start date (have {beforeLogged} before, {afterLogged} after).
        </p>
      )}
      {status === 'ok' && overlapping.length > 0 && (
        <p className="faint small">
          Note: {overlapping.map((m) => m.name).join(', ')} also started during this window, so changes can’t be attributed to one medicine alone.
        </p>
      )}
    </article>
  )
}

export function FlagCard({ flag, compact = false }: { flag: Flag; compact?: boolean }) {
  const { flagStatus, reviewFlag, analyses } = useData()
  const status = flagStatus(flag)
  const related = analyses
    .filter((a) => flag.medIds.includes(a.med.id))
    .flatMap((a) => a.insights.filter((i) => i.direction === 'worse'))

  return (
    <article className={`flag-card sev-${flag.severity} ${status !== 'open' ? 'is-reviewed' : ''}`}>
      <div className="spread">
        <SeverityPill severity={flag.severity} />
        {status !== 'open' && (
          <span className="pill">
            {status === 'acknowledged' ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
            {status === 'acknowledged' ? 'Acknowledged' : 'Dismissed'}
          </span>
        )}
      </div>
      <h3>{flag.title}</h3>
      {!compact && (
        <div className="flag-meds">
          {flag.medNames.map((n) => (
            <span key={n} className="pill pill-teal">
              {n}
            </span>
          ))}
        </div>
      )}
      <p className={compact ? 'muted small clamp-2' : ''}>{flag.explanation}</p>

      {!compact && related.length > 0 && (
        <div className="flag-related">
          <p className="field-label small">Related symptom change in check-ins</p>
          <ul className="insight-list">
            {related.slice(0, 3).map((i) => (
              <InsightLine key={`${i.medId}-${i.metric}`} insight={i} />
            ))}
          </ul>
        </div>
      )}

      {!compact && (
        <div className="flag-question">
          <MessageCircleQuestion size={18} aria-hidden="true" />
          <p>
            <strong>Ask the doctor:</strong> {flag.question}
          </p>
        </div>
      )}

      {!compact && (
        <div className="row flag-actions">
          {status === 'open' ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => reviewFlag(flag.id, 'acknowledged')}>
                <Check size={16} aria-hidden="true" /> Acknowledge
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => reviewFlag(flag.id, 'dismissed')}>
                Dismiss
              </button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => reviewFlag(flag.id, 'open')}>
              <RotateCcw size={15} aria-hidden="true" /> Reopen
            </button>
          )}
        </div>
      )}
    </article>
  )
}
