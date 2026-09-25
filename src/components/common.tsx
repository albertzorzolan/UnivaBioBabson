import { HeartPulse, Info, Watch } from 'lucide-react'
import { SEVERITY_LABEL } from '../lib/flags'
import type { Severity } from '../types'

export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <span className="brand-mark" aria-hidden="true">
      <HeartPulse size={size} strokeWidth={2.25} />
    </span>
  )
}

export function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <span className={`pill sev-${severity}`}>
      <span className="dot" aria-hidden="true" />
      {SEVERITY_LABEL[severity]}
    </span>
  )
}

export function Disclaimer({ children }: { children?: React.ReactNode }) {
  return (
    <div className="notice" role="note">
      <Info size={18} aria-hidden="true" />
      <p>
        {children ??
          'MedWatch is a discussion aid, not medical advice. Flags come from a small illustrative rule set and are not a diagnosis. Never stop or change a medicine without talking to a doctor or pharmacist.'}
      </p>
    </div>
  )
}

/** Phase 2 placeholder — intentionally not wired to any API. */
export function TrackerPlaceholder() {
  return (
    <div className="card tracker-card">
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <span className="tracker-icon" aria-hidden="true">
          <Watch size={22} />
        </span>
        <div className="stack" style={{ '--gap': '4px' } as React.CSSProperties}>
          <h3 className="card-title">Health tracker</h3>
          <p className="muted small">Heart rate, steps and sleep from a wearable could add context to symptom logs.</p>
        </div>
      </div>
      <span className="tip" style={{ marginTop: 14 }}>
        <button className="btn btn-ghost btn-sm" disabled aria-describedby="tracker-tip">
          Connect a health tracker
        </button>
        <span className="tip-bubble" id="tracker-tip" role="tooltip">
          Coming soon — Fitbit &amp; Google Fit integration
        </span>
      </span>
      <span className="pill" style={{ marginLeft: 10 }}>Coming soon</span>
    </div>
  )
}
