import { useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './lib/AppContext'
import Sidebar from './components/Sidebar'
import Toast from './components/Toast'
import GlobalSearch from './components/GlobalSearch'
import IncidentBanner from './components/IncidentBanner'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import Dashboard from './pages/Dashboard'
import UnidadesList from './pages/UnidadesList'
import UnidadDetail from './pages/UnidadDetail'
import Alertas from './pages/Alertas'
import Revision from './pages/Revision'
import RegistrosDiarios from './pages/RegistrosDiarios'
import Administracion from './pages/Administracion'
import { EPI, Herramientas, Sanitario, Mantenimiento, Turnos } from './pages/Placeholders'

const PAGE_TITLES = {
  '/':              'Panel General',
  '/alertas':       'Alertas',
  '/unidades':      'Unidades',
  '/revision':      'Revisión Diaria',
  '/registros':     'Registros Diarios',
  '/admin':         'Administración',
  '/epi':           'EPI',
  '/herramientas':  'Herramientas',
  '/sanitario':     'Sanitario',
  '/mantenimiento': 'Mantenimiento',
  '/turnos':        'Turnos',
}

function LoadingScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--smoke)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, zIndex: 999,
    }}>
      <div style={{ fontFamily: 'Barlow Condensed', fontSize: 42, fontWeight: 900, color: 'var(--fire)', letterSpacing: 4 }}>
        🔥 IGNIS
      </div>
      <div style={{ fontSize: 13, color: 'var(--mid)', letterSpacing: 2 }}>CARGANDO DATOS...</div>
      <div style={{ width: 200, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginTop: 8 }}>
        <div style={{ height: '100%', background: 'var(--fire)', borderRadius: 2, animation: 'loadbar 1.5s ease-in-out infinite' }} />
      </div>
      <style>{`@keyframes loadbar { 0%{width:0%;margin-left:0} 50%{width:60%;margin-left:20%} 100%{width:0%;margin-left:100%} }`}</style>
    </div>
  )
}

function AppInner() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { loading, session, authReady, recovering, logout } = useApp()
  const location = useLocation()

  if (recovering) return <ResetPasswordPage />

  if (!authReady || (!session && !loading)) {
    if (!authReady) return <LoadingScreen />
    return <LoginPage />
  }

  if (loading) return <LoadingScreen />

  const base  = '/' + location.pathname.split('/')[1]
  const title = PAGE_TITLES[base] || 'IGNIS'
  const userEmail = session?.user?.email || ''

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-main">
        <div className="topbar">
          <div className="topbar-left">
            <button className="btn-icon" id="hamburger" onClick={() => setSidebarOpen(o => !o)}>☰</button>
            <div className="topbar-title">{title}</div>
          </div>

          <div className="topbar-search-wrap">
            <GlobalSearch />
          </div>

          <div className="topbar-right">
            <span className="user-chip" title={userEmail}>👤 {userEmail}</span>
            <button onClick={logout} className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--mid)', padding: '4px 10px' }} title="Cerrar sesión">
              ⎋ Salir
            </button>
          </div>
        </div>

        <Routes>
          <Route path="/"              element={<Dashboard />} />
          <Route path="/alertas"       element={<Alertas />} />
          <Route path="/unidades"      element={<UnidadesList />} />
          <Route path="/unidades/:id"  element={<UnidadDetail />} />
          <Route path="/revision"      element={<Revision />} />
          <Route path="/registros"     element={<RegistrosDiarios />} />
          <Route path="/admin"         element={<Administracion />} />
          <Route path="/epi"           element={<EPI />} />
          <Route path="/herramientas"  element={<Herramientas />} />
          <Route path="/sanitario"     element={<Sanitario />} />
          <Route path="/mantenimiento" element={<Mantenimiento />} />
          <Route path="/turnos"        element={<Turnos />} />
        </Routes>
      </div>

      <IncidentBanner />
      <Toast />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}
