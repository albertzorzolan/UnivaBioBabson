import { Activity, FileText, Flag, LayoutDashboard, LogOut, Pill, Settings as SettingsIcon } from 'lucide-react'
import { BrandMark } from '../components/common'
import { useHashRoute } from '../lib/router'
import { useData } from '../store'
import { FlagsPage } from './FlagsPage'
import { Medications } from './Medications'
import { Overview } from './Overview'
import { SettingsPage } from './SettingsPage'
import { Summary } from './Summary'
import { Symptoms } from './Symptoms'
import './caregiver.css'

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'meds', label: 'Medications', icon: Pill },
  { id: 'flags', label: 'Flags', icon: Flag },
  { id: 'symptoms', label: 'Symptoms', icon: Activity },
  { id: 'summary', label: 'Doctor summary', icon: FileText },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
] as const

type PageId = (typeof NAV)[number]['id']

export function CaregiverApp({ onLogout }: { onLogout: () => void }) {
  const [, page = 'overview', sub] = useHashRoute()
  const { flags, flagStatus, profile } = useData()
  const active: PageId = NAV.some((n) => n.id === page) ? (page as PageId) : 'overview'
  const openFlags = flags.filter((f) => flagStatus(f) === 'open').length

  return (
    <div className="cg">
      <aside className="cg-side no-print">
        <div className="brand">
          <BrandMark size={18} />
          MedWatch
        </div>
        <div className="cg-patient">
          <span className="avatar" aria-hidden="true">
            {profile.patientName[0]}
          </span>
          <div>
            <p className="cg-patient-name">{profile.patientName}</p>
            <p className="faint small">Caring as {profile.caregiverName}</p>
          </div>
        </div>
        <nav className="cg-nav" aria-label="Main">
          {NAV.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#/caregiver/${id}`} aria-current={active === id ? 'page' : undefined}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
              {id === 'flags' && openFlags > 0 && (
                <span className="nav-badge" aria-label={`${openFlags} open`}>
                  {openFlags}
                </span>
              )}
            </a>
          ))}
        </nav>
        <button className="btn btn-quiet cg-logout" onClick={onLogout}>
          <LogOut size={18} aria-hidden="true" />
          Log out
        </button>
      </aside>

      <main className="cg-main">
        {active === 'overview' && <Overview />}
        {active === 'meds' && <Medications startWithNew={sub === 'new'} />}
        {active === 'flags' && <FlagsPage />}
        {active === 'symptoms' && <Symptoms />}
        {active === 'summary' && <Summary />}
        {active === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
