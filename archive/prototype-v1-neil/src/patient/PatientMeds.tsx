import { CalendarDays, Clock, HandHeart, Pill, Stethoscope } from 'lucide-react'
import { formatDate } from '../lib/dates'
import { useData } from '../store'

export function PatientMeds() {
  const { meds, profile } = useData()
  const sorted = [...meds].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="pt-meds">
      <div className="pt-intro">
        <h2>My medicines</h2>
        <p className="muted">
          {meds.length} {meds.length === 1 ? 'medicine' : 'medicines'} on your list
        </p>
      </div>

      <p className="pt-note pt-note-teal">
        <HandHeart size={22} aria-hidden="true" />
        {profile.caregiverName} looks after this list. If something looks wrong, let them know. Please don’t stop a medicine without
        talking to your doctor.
      </p>

      {sorted.length === 0 ? (
        <div className="pt-card empty">No medicines have been added yet.</div>
      ) : (
        <ul className="med-cards">
          {sorted.map((m) => (
            <li key={m.id} className="pt-card med-card">
              <div className="med-card-head">
                <span className="med-icon" aria-hidden="true">
                  <Pill size={28} />
                </span>
                <div>
                  <h3>{m.name}</h3>
                  <p className="med-dose">{m.dosage}</p>
                </div>
              </div>
              <dl className="med-facts">
                <div>
                  <dt>
                    <Clock size={20} aria-hidden="true" /> When
                  </dt>
                  <dd>{m.frequency}</dd>
                </div>
                <div>
                  <dt>
                    <HandHeart size={20} aria-hidden="true" /> What it’s for
                  </dt>
                  <dd>{m.reason || '—'}</dd>
                </div>
                <div>
                  <dt>
                    <CalendarDays size={20} aria-hidden="true" /> Started
                  </dt>
                  <dd>{formatDate(m.startDate, { year: true })}</dd>
                </div>
                {m.doctor && (
                  <div>
                    <dt>
                      <Stethoscope size={20} aria-hidden="true" /> Doctor
                    </dt>
                    <dd>{m.doctor}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
