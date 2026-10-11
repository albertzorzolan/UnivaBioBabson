import { useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { Disclaimer } from '../components/common'
import { SEVERITY_LABEL, SEVERITY_ORDER } from '../lib/flags'
import { useData } from '../store'
import type { FlagStatus } from '../types'
import { FlagCard, PageHeader } from './shared'

const FILTERS: { id: FlagStatus | 'all'; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'acknowledged', label: 'Acknowledged' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
]

const SEVERITY_HELP = {
  soon: 'Worth calling or messaging the doctor about before the next routine visit.',
  'next-visit': 'Bring up at the next scheduled appointment.',
  monitor: 'Keep an eye on it; mention if symptoms appear.',
}

export function FlagsPage() {
  const { flags, flagStatus } = useData()
  const [filter, setFilter] = useState<FlagStatus | 'all'>('open')
  const count = (id: FlagStatus | 'all') => (id === 'all' ? flags.length : flags.filter((f) => flagStatus(f) === id).length)
  const visible = flags.filter((f) => filter === 'all' || flagStatus(f) === filter)

  return (
    <div className="page">
      <PageHeader
        title="Flags"
        subtitle="Medication risks found by MedWatch’s rules. Acknowledge a flag once you’ve noted it for the doctor, or dismiss it if it doesn’t apply."
      />

      <div className="spread">
        <div className="segmented" role="tablist" aria-label="Filter flags">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <span className="seg-count">{count(f.id)}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card empty">
          <CircleCheck size={32} aria-hidden="true" />
          <p>{filter === 'open' ? 'No open flags right now.' : 'Nothing here.'}</p>
        </div>
      ) : (
        SEVERITY_ORDER.map((sev) => {
          const group = visible.filter((f) => f.severity === sev)
          if (group.length === 0) return null
          return (
            <section key={sev} className="stack" style={{ '--gap': '12px' } as React.CSSProperties}>
              <div className={`sev-heading sev-${sev}`}>
                <span className="sev-bar" aria-hidden="true" />
                <h2>{SEVERITY_LABEL[sev]}</h2>
                <span className="faint small">{SEVERITY_HELP[sev]}</span>
              </div>
              <div className="flag-grid">
                {group.map((f) => (
                  <FlagCard key={f.id} flag={f} />
                ))}
              </div>
            </section>
          )
        })
      )}

      <Disclaimer>
        Flags come from a small, illustrative rule set inspired by deprescribing guidance for older adults (such as the Beers Criteria). They are
        not exhaustive, not a diagnosis, and not a recommendation to change any medicine. Always talk to a doctor or pharmacist first.
      </Disclaimer>
    </div>
  )
}
