import { useEffect, useState } from 'react'
import { getSession, logout } from './lib/auth'
import { navigate, useHashRoute } from './lib/router'
import { Login } from './pages/Login'
import { PatientApp } from './patient/PatientApp'
import { CaregiverApp } from './caregiver/CaregiverApp'
import { DataProvider } from './store'
import type { Session } from './types'

export default function App() {
  const [session, setSession] = useState<Session | null>(getSession)
  const [area] = useHashRoute()

  // Keep the URL in step with who is signed in
  useEffect(() => {
    if (!session && area) navigate('/')
    if (session && area !== session.role) navigate(`/${session.role}`)
  }, [session, area])

  const handleLogout = () => {
    logout()
    setSession(null)
    navigate('/')
  }

  if (!session) {
    return (
      <Login
        onLogin={(s) => {
          setSession(s)
          navigate(`/${s.role}`)
        }}
      />
    )
  }

  return (
    <DataProvider>
      {session.role === 'patient' ? <PatientApp onLogout={handleLogout} /> : <CaregiverApp onLogout={handleLogout} />}
    </DataProvider>
  )
}
