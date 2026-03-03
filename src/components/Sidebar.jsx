import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../lib/AppContext'
import { supabase } from '../lib/supabase'
import { buildZones, unitAlertLevel } from '../data/units'
import BrandLogo from './BrandLogo'
import styles from './Sidebar.module.css'

const DEFAULT_BV_UNITS = {
  1: [3, 7, 19],
  2: [0, 6, 14],
  3: [1, 16, 22],
  4: [10, 11, 15],
  5: [4, 9, 18, 21],
  6: [2, 12, 17],
  7: [5, 8, 20],
}

const NAV = [
  { to: '/panel',        icon: '📊', label: 'Panel General' },
  { to: '/novedades',    icon: '🆕', label: 'Novedades', badge: 'news' },
  { to: '/incidencias',  icon: '🚨', label: 'Incidencias',   badge: 'alert' },
  { to: '/registros',    icon: '🗂️', label: 'Registros diarios' },
  { to: '/jefatura',     icon: '👨‍💼', label: 'Jefatura' },
  { to: '/revision',     icon: '📅', label: 'Revisión diaria' },
  { to: '/unidades',     icon: '🚒', label: 'Material Unidades' },
  { to: '/vehiculos',    icon: '🚚', label: 'Vehículos' },
  { to: '/instalaciones', icon: '🏢', label: 'Instalaciones' },
  { to: '/epi',          icon: '🦺', label: 'EPI' },
  { to: '/herramientas', icon: '⚙️',  label: 'Herramientas' },
  { to: '/sanitario',    icon: '🩺', label: 'Sanitario' },
  { to: '/mantenimiento',icon: '🔧', label: 'Mantenimiento' },
  { to: '/turnos',       icon: '📋', label: 'Turnos' },
  { to: '/admin',        icon: '🛡️', label: 'Administración', adminOnly: true },
  { to: '/informe-incidencias', icon: '🧾', label: 'Informe incidencias', adminOnly: true },
]

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function getActiveUnitsForBv(bvId, configs, bvUnits = DEFAULT_BV_UNITS) {
  return (bvUnits[bvId] || []).filter(unitId => configs?.[unitId]?.isActive !== false)
}

function isDraftReviewedBy(reviewedBy = '') {
  return String(reviewedBy || '').toLowerCase().startsWith('borrador:')
}

export default function Sidebar({ open, onClose }) {
  const { configs, items, isAdmin, revisionIncidents, bvUnits: assignedBvUnits, materialMenuEnabled } = useApp()
  const effectiveBvUnits = assignedBvUnits || DEFAULT_BV_UNITS
  const navItems = NAV.filter(item => !item.adminOnly || isAdmin)
  const [revisionPending, setRevisionPending] = useState(false)
  const [newsCount, setNewsCount] = useState(0)

  const activeUnitIds = Object.keys(configs || {})
    .map(Number)
    .filter(Number.isFinite)
    .filter(id => configs[id]?.isActive !== false)

  const stockAlertUnits = activeUnitIds.reduce((acc, id) => {
    const cfg = configs[id]
    if (!cfg) return acc
    const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
    const level = unitAlertLevel(items[id], zones)
    return level === 'alert' ? acc + 1 : acc
  }, 0)

  const reviewAlertCount = (() => {
    const keys = new Set()
    ;(revisionIncidents || []).forEach(inc => {
      if (configs[inc.unitId]?.isActive === false) return
      const key = `${inc.unitId}|${String(inc.zone || '').trim().toLowerCase()}|${String(inc.item || '').trim().toLowerCase()}`
      keys.add(key)
    })
    return keys.size
  })()

  const totalAlerts = stockAlertUnits + reviewAlertCount
  const hasActiveAlerts = totalAlerts > 0

  const activeUnitsByBv = useMemo(() => {
    const map = {}
    Object.keys(effectiveBvUnits).forEach((raw) => {
      const bvId = Number(raw)
      map[bvId] = getActiveUnitsForBv(bvId, configs, effectiveBvUnits)
    })
    return map
  }, [configs, effectiveBvUnits])

  useEffect(() => {
    let mounted = true

    async function refreshRevisionPending() {
      try {
        const today = todayStr()
        const { data, error } = await supabase
          .from('revision_reports')
          .select('bombero_id,unit_id,reviewed_by')
          .eq('report_date', today)

        if (error) {
          if (mounted) setRevisionPending(false)
          return
        }

        let pending = false
        for (const raw of Object.keys(effectiveBvUnits)) {
          const bvId = Number(raw)
          const requiredUnits = activeUnitsByBv[bvId] || []
          if (requiredUnits.length === 0) continue

          const doneUnits = new Set(
            (data || [])
              .filter(r => Number(r.bombero_id) === bvId)
              .filter(r => r.reviewed_by !== 'unidades' && !isDraftReviewedBy(r.reviewed_by))
              .map(r => Number(r.unit_id))
          )

          const allDone = requiredUnits.every(u => doneUnits.has(Number(u)))
          if (!allDone) {
            pending = true
            break
          }
        }

        if (mounted) setRevisionPending(pending)
      } catch {
        if (mounted) setRevisionPending(false)
      }
    }

    refreshRevisionPending()
    const timer = window.setInterval(refreshRevisionPending, 45000)
    const onFocus = () => refreshRevisionPending()
    window.addEventListener('focus', onFocus)

    return () => {
      mounted = false
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [activeUnitsByBv, effectiveBvUnits])

  useEffect(() => {
    let mounted = true

    async function refreshNewsCount() {
      try {
        const { count, error } = await supabase
          .from('news_messages')
          .select('*', { count: 'exact', head: true })
        if (error) return
        if (mounted) setNewsCount(Number(count || 0))
      } catch {
        // ignore
      }
    }

    refreshNewsCount()
    const timer = window.setInterval(refreshNewsCount, 60000)
    const onFocus = () => refreshNewsCount()
    window.addEventListener('focus', onFocus)
    return () => {
      mounted = false
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return (
    <>
      {open && <div className={styles.backdrop} onClick={onClose} />}
      <aside className={`${styles.sidebar} ${open ? styles.open : ''}`}>
        <div className={styles.logo}>
          <BrandLogo
            size="sm"
            title="IGNIS"
            subtitle="Gestión de Parques"
            version="v1.0"
          />
        </div>

        <nav className={styles.nav}>
          <div className={styles.sectionLabel}>Principal</div>
          {navItems.filter(i => ['/panel', '/novedades', '/incidencias', '/registros', '/jefatura'].includes(i.to)).map(item => (
            <NavItem
              key={item.to}
              item={item}
              alerts={item.badge === 'alert' ? totalAlerts : item.badge === 'news' ? newsCount : 0}
              pulse={item.badge === 'alert' ? hasActiveAlerts : false}
              badgeType={item.badge}
              onClose={onClose}
            />
          ))}

          <div className={styles.sectionLabel}>Operaciones</div>
          {navItems.filter(i => ['/revision', '/unidades', '/vehiculos', '/instalaciones'].includes(i.to)).map(item => (
            <NavItem
              key={item.to}
              item={item}
              onClose={onClose}
              reviewPending={item.to === '/revision' ? revisionPending : false}
            />
          ))}

          {materialMenuEnabled && (
            <>
              <div className={styles.sectionLabel}>Material</div>
              {navItems.filter(i => ['/epi', '/herramientas', '/sanitario'].includes(i.to)).map(item => (
                <NavItem key={item.to} item={item} onClose={onClose} />
              ))}
            </>
          )}

          <div className={styles.sectionLabel}>Sistema</div>
          {navItems.filter(i => ['/mantenimiento', '/turnos', '/admin', '/informe-incidencias'].includes(i.to)).map(item => (
            <NavItem key={item.to} item={item} onClose={onClose} />
          ))}
        </nav>

        <div className={styles.footer}>
          <div className={styles.stationName}>🏠 Parque 01 — Centro</div>
          <div className={styles.stationSub}>Guardia: <strong>Turno A</strong></div>
        </div>
      </aside>
    </>
  )
}

function NavItem({ item, alerts = 0, pulse = false, reviewPending = false, badgeType = '', onClose }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
      onClick={onClose}
    >
      <span className={`${styles.navIcon} ${pulse ? styles.alertPulse : ''}`}>{item.icon}</span>
      <span className={styles.navLabel}>{item.label}</span>
      {reviewPending && <span className={`${styles.pendingChip} ${styles.pendingPulse}`}>pend.</span>}
      {alerts > 0 && (
        <span
          className={`${styles.badge} ${pulse ? styles.badgePulse : ''} ${badgeType === 'news' ? styles.badgeNews : ''}`}
        >
          {alerts}
        </span>
      )}
    </NavLink>
  )
}
