import { ClipboardCheck, LogOut, Pill, Smile } from 'lucide-react'
import { BrandMark } from '../components/common'
import { formatLongDate, todayISO } from '../lib/dates'
import { useHashRoute } from '../lib/router'
import { useData } from '../store'
import { CheckIn } from './CheckIn'
import { HowAmIDoing } from './HowAmIDoing'
import { PatientMeds } from './PatientMeds'
import './patient.css'

const TABS = [
  { id: 'checkin', label: 'Check-in', icon: ClipboardCheck },
  { id: 'doing', label: 'How am I doing?', icon: Smile },
  { id: 'meds', label: 'My medicines', icon: Pill },
] as const

export function PatientApp({ onLogout }: { onLogout: () => void }) {
  const [, page = 'checkin'] = useHashRoute()
  const { profile } = useData()
  const active = TABS.some((t) => t.id === page) ? page : 'checkin'

  return (
    <div className="pt">
      <header className="pt-header">
        <div className="pt-header-inner">
          <div className="brand">
            <BrandMark size={18} />
            <span>MedWatch</span>
          </div>
          <button className="btn btn-ghost pt-logout" onClick={onLogout}>
            <LogOut size={20} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </header>

      <main className="pt-main">
        <div className="pt-greeting">
          <p className="pt-date">{formatLongDate(todayISO())}</p>
          <h1>Hello, {profile.patientName}</h1>
        </div>
        {active === 'checkin' && <CheckIn />}
        {active === 'doing' && <HowAmIDoing />}
        {active === 'meds' && <PatientMeds />}
      </main>

      <nav className="pt-tabs" aria-label="Main">
        {TABS.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#/patient/${id}`} className="pt-tab" aria-current={active === id ? 'page' : undefined}>
            <Icon size={28} strokeWidth={2} aria-hidden="true" />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
