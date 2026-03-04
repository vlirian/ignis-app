import { Component, useEffect, useState } from 'react'
import { Routes, Route, useLocation, NavLink, useNavigate } from 'react-router-dom'
import { AppProvider, useApp } from './lib/AppContext'
import { supabase } from './lib/supabase'
import Sidebar from './components/Sidebar'
import Toast from './components/Toast'
import GlobalSearch from './components/GlobalSearch'
import IncidentBanner from './components/IncidentBanner'
import NewsBanner from './components/NewsBanner'
import BrandLogo from './components/BrandLogo'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import Dashboard from './pages/Dashboard'
import UnidadesList from './pages/UnidadesList'
import UnidadDetail from './pages/UnidadDetail'
import Alertas from './pages/Alertas'
import Revision from './pages/Revision'
import RegistrosDiarios from './pages/RegistrosDiarios'
import Administracion from './pages/Administracion'
import InformeDiarioIncidencias from './pages/InformeDiarioIncidencias'
import ResultadoBusqueda from './pages/ResultadoBusqueda'
import Instalaciones from './pages/Instalaciones'
import Jefatura from './pages/Jefatura'
import Vehiculos from './pages/Vehiculos'
import Novedades from './pages/Novedades'
import Repostaje from './pages/Repostaje'
import CambiosTurno from './pages/CambiosTurno'
import CallesCortadasHoy from './pages/CallesCortadasHoy'
import RutaMasRapida from './pages/RutaMasRapida'
import { EPI, Herramientas, Sanitario, Mantenimiento, Turnos } from './pages/Placeholders'

const PAGE_TITLES = {
  '/':              'Revisión Diaria',
  '/panel':         'Panel General',
  '/alertas':       'Alertas',
  '/incidencias':   'Incidencias',
  '/novedades':     'Novedades',
  '/unidades':      'Material Unidades',
  '/vehiculos':     'Vehículos',
  '/revision':      'Revisión Diaria',
  '/registros':     'Registros Diarios',
  '/jefatura':      'Jefatura',
  '/instalaciones': 'Instalaciones',
  '/repostaje': 'Repostaje',
  '/cambios-turno': 'Cambios de turno',
  '/calles-cortadas-hoy': 'Calles cortadas hoy',
  '/ruta-mas-rapida': 'Ruta más rápida',
  '/admin':         'Administración',
  '/informe-incidencias': 'Informe diario de incidencias',
  '/resultado-busqueda': 'Resultado de búsqueda',
  '/epi':           'Cuarto NBQ',
  '/herramientas':  'Herramientas',
  '/sanitario':     'Material de Rescate',
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
      <BrandLogo
        size="md"
        title="IGNIS"
        subtitle=""
      />
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
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return window.localStorage.getItem('ignis-theme') || 'dark'
  })
  const { loading, session, authReady, recovering, logout } = useApp()
  const location = useLocation()

  useEffect(() => {
    const next = theme === 'light' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try {
      window.localStorage.setItem('ignis-theme', next)
    } catch {}
  }, [theme])

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
            <div className="topbar-search-row">
              <GlobalSearch />
              <StreetTopSearch />
            </div>
          </div>

          <div className="topbar-right">
            <button
              onClick={() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, padding: '4px 10px' }}
              title={theme === 'dark' ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
            >
              {theme === 'dark' ? '☀️ Día' : '🌙 Noche'}
            </button>
            <span className="user-chip" title={userEmail}>👤 {userEmail}</span>
            <button onClick={logout} className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--mid)', padding: '4px 10px' }} title="Cerrar sesión">
              ⎋ Salir
            </button>
          </div>
        </div>

        <Routes>
          <Route path="/"              element={<Revision />} />
          <Route path="/panel"         element={<Dashboard />} />
          <Route path="/alertas"       element={<Alertas />} />
          <Route path="/incidencias"   element={<Alertas />} />
          <Route path="/novedades"     element={<Novedades />} />
          <Route path="/unidades"      element={<UnidadesList />} />
          <Route path="/unidades/:id"  element={<UnidadDetail />} />
          <Route path="/vehiculos"     element={<Vehiculos />} />
          <Route path="/revision"      element={<Revision />} />
          <Route path="/registros"     element={<RegistrosDiarios />} />
          <Route path="/jefatura"      element={<Jefatura />} />
          <Route path="/instalaciones" element={<Instalaciones />} />
          <Route path="/repostaje" element={<Repostaje />} />
          <Route path="/cambios-turno" element={<CambiosTurno />} />
          <Route path="/calles-cortadas-hoy" element={<CallesCortadasHoy />} />
          <Route path="/ruta-mas-rapida" element={<RutaMasRapida />} />
          <Route path="/admin"         element={<Administracion />} />
          <Route path="/informe-incidencias" element={<InformeDiarioIncidencias />} />
          <Route path="/resultado-busqueda" element={<ResultadoBusqueda />} />
          <Route path="/epi"           element={<EPI />} />
          <Route path="/herramientas"  element={<Herramientas />} />
          <Route path="/sanitario"     element={<Sanitario />} />
          <Route path="/mantenimiento" element={<Mantenimiento />} />
          <Route path="/turnos"        element={<Turnos />} />
        </Routes>
      </div>

      <NewsBanner />
      <IncidentBanner />
      <Toast />
      <MobileQuickNav />
    </div>
  )
}

function StreetTopSearch() {
  const navigate = useNavigate()
  const [street, setStreet] = useState('')
  const [allStreets, setAllStreets] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [openSuggestions, setOpenSuggestions] = useState(false)

  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  }

  function streetLabel(st) {
    return `${st?.via_type || ''} ${st?.name || ''}`.trim()
  }

  useEffect(() => {
    let mounted = true
    async function loadStreets() {
      const { data, error } = await supabase
        .from('jaen_streets')
        .select('id, via_type, name')
        .order('name', { ascending: true })
        .limit(5000)
      if (!mounted || error) return
      setAllStreets(data || [])
    }
    loadStreets()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const q = normalizeSearchText(street)
    if (q.length < 2) {
      setSuggestions([])
      setOpenSuggestions(false)
      return
    }
    const filtered = (allStreets || [])
      .map((s) => {
        const name = normalizeSearchText(s.name)
        const label = normalizeSearchText(streetLabel(s))
        const tokens = name.split(/\s+/).filter(Boolean)
        let rank = 99
        if (name.startsWith(q)) rank = 0
        else if (label.startsWith(q)) rank = 1
        else if (tokens.some((t) => t.startsWith(q))) rank = 2
        else if (name.includes(q) || label.includes(q)) rank = 3
        if (rank === 99) return null
        return { s, rank }
      })
      .filter(Boolean)
      .sort((a, b) => (a.rank - b.rank) || streetLabel(a.s).localeCompare(streetLabel(b.s)))
      .slice(0, 18)
      .map((x) => x.s)
    setSuggestions(filtered)
    setOpenSuggestions(filtered.length > 0)
  }, [street, allStreets])

  const submit = (e) => {
    e.preventDefault()
    const q = street.trim()
    if (!q) return
    navigate(`/ruta-mas-rapida?street=${encodeURIComponent(q)}&auto=1`)
    setStreet('')
  }

  return (
    <form className="street-top-search" onSubmit={submit}>
      <span className="street-top-search-icon">🛣️</span>
      <input
        className="street-top-search-input"
        value={street}
        onChange={(e) => setStreet(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpenSuggestions(true) }}
        onBlur={() => setTimeout(() => setOpenSuggestions(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && suggestions.length > 0) {
            const best = suggestions[0]
            if (best) setStreet(streetLabel(best))
          }
        }}
        placeholder="Buscar calle..."
      />
      <button type="submit" className="street-top-search-btn">Buscar</button>
      {openSuggestions && (
        <div className="street-top-search-suggestions">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              className="street-top-search-option"
              onClick={() => {
                const label = streetLabel(s)
                setStreet(label)
                setOpenSuggestions(false)
                navigate(`/ruta-mas-rapida?street=${encodeURIComponent(label)}&auto=1`)
              }}
            >
              {streetLabel(s)}
            </button>
          ))}
        </div>
      )}
    </form>
  )
}

function MobileQuickNav() {
  return (
    <nav className="mobile-quick-nav">
      <NavLink
        to="/unidades"
        className={({ isActive }) => `mobile-quick-item ${isActive ? 'active' : ''}`}
      >
        <span className="mobile-quick-icon">🚒</span>
        <span className="mobile-quick-label">Material</span>
      </NavLink>
      <NavLink
        to="/revision"
        className={({ isActive }) => `mobile-quick-item ${isActive ? 'active' : ''}`}
      >
        <span className="mobile-quick-icon">📅</span>
        <span className="mobile-quick-label">Revisión</span>
      </NavLink>
    </nav>
  )
}

function MobileRotateHint() {
  const { mobileRotateHintEnabled } = useApp()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onCheck = () => {
      const isMobile = window.matchMedia('(max-width: 900px)').matches
      const isPortrait = window.matchMedia('(orientation: portrait)').matches
      setVisible(isMobile && isPortrait)
    }
    onCheck()
    window.addEventListener('resize', onCheck)
    window.addEventListener('orientationchange', onCheck)
    return () => {
      window.removeEventListener('resize', onCheck)
      window.removeEventListener('orientationchange', onCheck)
    }
  }, [])

  if (!mobileRotateHintEnabled || !visible) return null

  return (
    <div className="mobile-rotate-hint" aria-live="polite">
      <span className="mobile-rotate-icon">📱</span>
      <span>Mejor visualización en horizontal</span>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppErrorBoundary>
        <AppInner />
        <MobileRotateHint />
      </AppErrorBoundary>
    </AppProvider>
  )
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('IGNIS runtime error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const message = String(this.state.error?.message || this.state.error || 'Error desconocido')
      return (
        <div style={{
          minHeight: '100vh',
          background: 'var(--smoke)',
          color: 'var(--light)',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
        }}>
          <div className="card" style={{ maxWidth: 760, width: '100%', padding: 20, border: '1px solid rgba(192,57,43,0.45)' }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 30, fontWeight: 900, color: 'var(--red-l)', marginBottom: 8 }}>
              Error en la app
            </div>
            <div style={{ fontSize: 14, color: 'var(--light)', marginBottom: 12 }}>
              Se produjo un error de ejecución en el frontend.
            </div>
            <div style={{
              fontFamily: 'Roboto Mono, monospace',
              fontSize: 13,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border2)',
              borderRadius: 8,
              padding: 10,
              color: 'var(--red-l)',
              wordBreak: 'break-word',
            }}>
              {message}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--mid)' }}>
              Recarga la página. Si persiste, copia este error y pásamelo.
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
