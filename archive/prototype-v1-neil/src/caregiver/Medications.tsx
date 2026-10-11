import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import { BookOpen, LoaderCircle, Pencil, Pill, Plus, Trash2, X } from 'lucide-react'
import { SeverityPill } from '../components/common'
import { daysBetween, formatDate, todayISO } from '../lib/dates'
import { SEVERITY_ORDER, computeFlags, medGroupLabels } from '../lib/flags'
import { lookupLabel, type LabelInfo } from '../lib/openfda'
import { navigate } from '../lib/router'
import { useData } from '../store'
import type { Medication } from '../types'
import { PageHeader } from './shared'

type Draft = Omit<Medication, 'id'> & { id?: string }

const EMPTY: Draft = { name: '', dosage: '', frequency: '', reason: '', startDate: todayISO(), doctor: '' }

export function Medications({ startWithNew }: { startWithNew: boolean }) {
  const { meds, flags, deleteMed } = useData()
  const [editing, setEditing] = useState<Draft | null>(startWithNew ? { ...EMPTY, startDate: todayISO() } : null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [fdaOpen, setFdaOpen] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const sorted = [...meds].sort((a, b) => b.startDate.localeCompare(a.startDate))

  const topSeverity = (medId: string) => {
    const mine = flags.filter((f) => f.medIds.includes(medId))
    return SEVERITY_ORDER.find((s) => mine.some((f) => f.severity === s))
  }

  const closeForm = () => {
    setEditing(null)
    if (startWithNew) navigate('/caregiver/meds')
  }

  return (
    <div className="page">
      <PageHeader
        title="Medications"
        subtitle="Every add or edit is checked against MedWatch’s risk rules right away."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY, startDate: todayISO() })}>
            <Plus size={18} aria-hidden="true" /> Add medication
          </button>
        }
      />

      {toast && (
        <div className="toast" role="status">
          {toast}
          <button className="icon-btn" onClick={() => setToast('')} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="card empty">
          <Pill size={32} aria-hidden="true" />
          <p>No medications yet. Add the first one to start checking for risks.</p>
        </div>
      ) : (
        <div className="card table-card">
          <table className="med-table">
            <thead>
              <tr>
                <th>Medication</th>
                <th>Schedule</th>
                <th>Reason</th>
                <th>Started</th>
                <th>Flags</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => {
                const sev = topSeverity(m.id)
                const groups = medGroupLabels(m.name)
                const days = daysBetween(m.startDate, todayISO())
                return (
                  <Fragment key={m.id}>
                    <tr>
                      <td data-label="Medication">
                        <div className="med-name">
                          {m.name} <span className="muted">{m.dosage}</span>
                        </div>
                        {groups.length > 0 && <div className="faint small">{groups.join(' · ')}</div>}
                        {m.doctor && <div className="faint small">{m.doctor}</div>}
                      </td>
                      <td data-label="Schedule">{m.frequency}</td>
                      <td data-label="Reason">{m.reason || '—'}</td>
                      <td data-label="Started">
                        {formatDate(m.startDate, { year: true })}
                        <div className="faint small">{days < 0 ? 'upcoming' : days === 0 ? 'today' : `${days} days ago`}</div>
                      </td>
                      <td data-label="Flags">{sev ? <SeverityPill severity={sev} /> : <span className="faint small">None</span>}</td>
                      <td className="actions">
                        {confirmDelete === m.id ? (
                          <div className="row" style={{ '--gap': '6px' } as React.CSSProperties}>
                            <span className="small">Remove?</span>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => {
                                deleteMed(m.id)
                                setConfirmDelete(null)
                                setToast(`${m.name} removed from the list.`)
                              }}
                            >
                              Remove
                            </button>
                            <button className="btn btn-quiet btn-sm" onClick={() => setConfirmDelete(null)}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="row" style={{ '--gap': '2px', flexWrap: 'nowrap' } as React.CSSProperties}>
                            <button
                              className="icon-btn"
                              title="Look up FDA label"
                              aria-label={`Look up FDA label for ${m.name}`}
                              aria-expanded={fdaOpen === m.id}
                              onClick={() => setFdaOpen(fdaOpen === m.id ? null : m.id)}
                            >
                              <BookOpen size={18} />
                            </button>
                            <button className="icon-btn" title="Edit" aria-label={`Edit ${m.name}`} onClick={() => setEditing({ ...m })}>
                              <Pencil size={18} />
                            </button>
                            <button className="icon-btn" title="Remove" aria-label={`Remove ${m.name}`} onClick={() => setConfirmDelete(m.id)}>
                              <Trash2 size={18} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {fdaOpen === m.id && (
                      <tr className="fda-row">
                        <td colSpan={6}>
                          <FdaPanel medName={m.name} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <MedForm
          initial={editing}
          onClose={closeForm}
          onSaved={(msg) => {
            closeForm()
            setToast(msg)
          }}
        />
      )}
    </div>
  )
}

function MedForm({ initial, onClose, onSaved }: { initial: Draft; onClose: () => void; onSaved: (msg: string) => void }) {
  const { meds, flags, saveMed } = useData()
  const [draft, setDraft] = useState<Draft>(initial)
  const [touched, setTouched] = useState(false)
  const isEdit = !!initial.id
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }))

  const errors = {
    name: !draft.name.trim() ? 'Enter the medication name.' : '',
    dosage: !draft.dosage.trim() ? 'Enter the dose, e.g. 10 mg.' : '',
    frequency: !draft.frequency.trim() ? 'Enter how often it’s taken.' : '',
    startDate: !draft.startDate ? 'Choose a start date.' : '',
  }
  const valid = Object.values(errors).every((e) => !e)

  // Live preview: what flags would exist after saving this medication?
  const previewId = initial.id ?? '__draft__'
  const newFlags = useMemo(() => {
    if (!draft.name.trim()) return []
    const next = [...meds.filter((m) => m.id !== previewId), { ...draft, id: previewId, name: draft.name.trim() }]
    const existing = new Set(flags.map((f) => f.id))
    return computeFlags(next).filter((f) => f.medIds.includes(previewId) && !existing.has(f.id))
  }, [draft, meds, flags, previewId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    const clean: Draft = {
      ...draft,
      name: draft.name.trim(),
      dosage: draft.dosage.trim(),
      frequency: draft.frequency.trim(),
      reason: draft.reason.trim(),
      doctor: draft.doctor?.trim() || undefined,
    }
    saveMed(clean)
    const n = newFlags.length
    onSaved(
      `${clean.name} ${isEdit ? 'updated' : 'added'}.` +
        (n > 0 ? ` ${n} new ${n === 1 ? 'flag' : 'flags'} raised — see Flags.` : ' No new flags raised.'),
    )
  }

  const fieldProps = (k: keyof typeof errors) => ({
    'aria-invalid': touched && !!errors[k],
    'aria-describedby': touched && errors[k] ? `err-${k}` : undefined,
  })
  const err = (k: keyof typeof errors) =>
    touched && errors[k] ? (
      <span id={`err-${k}`} className="error-text">
        {errors[k]}
      </span>
    ) : null

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="med-form-title" onSubmit={submit} noValidate>
        <div className="spread">
          <h2 id="med-form-title">{isEdit ? `Edit ${initial.name}` : 'Add medication'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="m-name">Medication name</label>
            <input id="m-name" className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Lorazepam" autoFocus {...fieldProps('name')} />
            {err('name')}
          </div>
          <div className="field">
            <label htmlFor="m-dose">Dosage</label>
            <input id="m-dose" className="input" value={draft.dosage} onChange={(e) => set('dosage', e.target.value)} placeholder="e.g. 0.5 mg" {...fieldProps('dosage')} />
            {err('dosage')}
          </div>
          <div className="field">
            <label htmlFor="m-freq">Frequency</label>
            <input id="m-freq" className="input" value={draft.frequency} onChange={(e) => set('frequency', e.target.value)} placeholder="e.g. At bedtime" list="freq-options" {...fieldProps('frequency')} />
            <datalist id="freq-options">
              <option value="Once daily, morning" />
              <option value="Once daily, evening" />
              <option value="Twice daily" />
              <option value="Three times daily" />
              <option value="At bedtime" />
              <option value="As needed" />
            </datalist>
            {err('frequency')}
          </div>
          <div className="field span-2">
            <label htmlFor="m-reason">Prescribing reason</label>
            <input id="m-reason" className="input" value={draft.reason} onChange={(e) => set('reason', e.target.value)} placeholder="e.g. Trouble sleeping" />
          </div>
          <div className="field">
            <label htmlFor="m-start">Start date</label>
            <input id="m-start" type="date" className="input" value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} {...fieldProps('startDate')} />
            {err('startDate')}
          </div>
          <div className="field">
            <label htmlFor="m-doc">
              Prescribing doctor <span className="faint">(optional)</span>
            </label>
            <input id="m-doc" className="input" value={draft.doctor ?? ''} onChange={(e) => set('doctor', e.target.value)} placeholder="e.g. Dr. Patel" />
          </div>
        </div>

        {newFlags.length > 0 && (
          <div className="preview-flags" aria-live="polite">
            <p className="field-label small">Saving this will raise {newFlags.length === 1 ? 'a flag' : `${newFlags.length} flags`}:</p>
            {newFlags.map((f) => (
              <div key={f.id} className="row" style={{ '--gap': '8px' } as React.CSSProperties}>
                <SeverityPill severity={f.severity} />
                <span className="small">{f.title}</span>
              </div>
            ))}
          </div>
        )}

        <div className="row modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {isEdit ? 'Save changes' : 'Add medication'}
          </button>
        </div>
      </form>
    </div>
  )
}

function FdaPanel({ medName }: { medName: string }) {
  const [state, setState] = useState<{ status: 'loading' | 'done' | 'error'; info?: LabelInfo | null; error?: string }>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    lookupLabel(medName)
      .then((info) => !cancelled && setState({ status: 'done', info }))
      .catch((e: Error) => !cancelled && setState({ status: 'error', error: e.message }))
    return () => {
      cancelled = true
    }
  }, [medName])

  return (
    <div className="fda">
      <p className="faint small">
        Public FDA drug label via OpenFDA. Only the drug name is sent — no patient information. Label text is for reference, not advice.
      </p>
      {state.status === 'loading' && (
        <p className="row small">
          <LoaderCircle size={16} className="spin" aria-hidden="true" /> Looking up label…
        </p>
      )}
      {state.status === 'error' && (
        <p className="small">Couldn’t reach OpenFDA right now ({state.error}). The local risk rules still work offline.</p>
      )}
      {state.status === 'done' && !state.info && <p className="small">No FDA label found for “{medName}”. Try the generic name.</p>}
      {state.status === 'done' && state.info && (
        <div className="fda-sections">
          <p className="small">
            <strong>{state.info.genericName ?? state.info.query}</strong>
            {state.info.brandName ? ` (${state.info.brandName})` : ''}
          </p>
          {state.info.geriatricUse && (
            <div>
              <p className="field-label small">Geriatric use</p>
              <p className="small">{state.info.geriatricUse}</p>
            </div>
          )}
          {state.info.interactions && (
            <div>
              <p className="field-label small">Drug interactions</p>
              <p className="small">{state.info.interactions}</p>
            </div>
          )}
          {!state.info.geriatricUse && !state.info.interactions && state.info.warnings && (
            <div>
              <p className="field-label small">Warnings</p>
              <p className="small">{state.info.warnings}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
