import { useState, type FormEvent } from 'react'
import { Database, RotateCcw, Trash2 } from 'lucide-react'
import { Disclaimer, TrackerPlaceholder } from '../components/common'
import { DEMO_PROFILE } from '../lib/seed'
import { useData } from '../store'
import { PageHeader } from './shared'

export function SettingsPage() {
  const { profile, updateProfile, resetDemo, clearAll, meds, logs } = useData()
  const [draft, setDraft] = useState(profile)
  const [saved, setSaved] = useState(false)
  const [confirm, setConfirm] = useState<'reset' | 'clear' | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.patientName.trim() || !draft.caregiverName.trim()) return
    updateProfile({ ...draft, patientName: draft.patientName.trim(), caregiverName: draft.caregiverName.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="page">
      <PageHeader title="Settings" />

      <div className="grid-2">
        <form className="card stack" onSubmit={submit}>
          <h2 className="card-title">Profile</h2>
          <div className="field">
            <label htmlFor="s-name">Patient’s first name</label>
            <input id="s-name" className="input" value={draft.patientName} onChange={(e) => setDraft({ ...draft, patientName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="s-age">Patient’s age</label>
            <input
              id="s-age"
              className="input"
              type="number"
              min={40}
              max={120}
              value={draft.patientAge}
              onChange={(e) => setDraft({ ...draft, patientAge: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="s-cg">Caregiver’s first name</label>
            <input id="s-cg" className="input" value={draft.caregiverName} onChange={(e) => setDraft({ ...draft, caregiverName: e.target.value })} />
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit">
              Save profile
            </button>
            {saved && (
              <span className="muted small" role="status">
                Saved.
              </span>
            )}
          </div>
        </form>

        <section className="card stack">
          <h2 className="card-title">
            <Database size={18} aria-hidden="true" /> Data on this device
          </h2>
          <p className="muted small">
            All MedWatch data ({meds.length} medications, {logs.length} check-ins) is stored in this browser’s local storage. Nothing is uploaded.
            Clearing browser data will erase it.
          </p>
          {confirm ? (
            <div className="notice notice-warm stack" style={{ '--gap': '10px' } as React.CSSProperties}>
              <p>
                {confirm === 'reset'
                  ? 'Replace all current data with the demo dataset (Margaret, 4 medications, ~4 weeks of check-ins)?'
                  : 'Erase all medications, check-ins and flag reviews? This can’t be undone.'}
              </p>
              <div className="row">
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    if (confirm === 'reset') resetDemo()
                    else clearAll()
                    setConfirm(null)
                    setDraft(DEMO_PROFILE)
                  }}
                >
                  Yes, {confirm === 'reset' ? 'reset' : 'erase'}
                </button>
                <button className="btn btn-quiet btn-sm" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm('reset')}>
                <RotateCcw size={16} aria-hidden="true" /> Reset demo data
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setConfirm('clear')}>
                <Trash2 size={16} aria-hidden="true" /> Erase all data
              </button>
            </div>
          )}
        </section>
      </div>

      <TrackerPlaceholder />
      <Disclaimer />
    </div>
  )
}
