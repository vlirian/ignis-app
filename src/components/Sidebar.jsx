import { NavLink } from 'react-router-dom'
import { useApp } from '../lib/AppContext'
import { UNIT_IDS, buildZones, unitAlertLevel } from '../data/units'
import styles from './Sidebar.module.css'

const NAV = [
  { to: '/',             icon: '📊', label: 'Panel General' },
  { to: '/alertas',      icon: '🚨', label: 'Alertas',       badge: 'alert' },
  { to: '/unidades',     icon: '🚒', label: 'Unidades' },
  { to: '/revision',     icon: '📅', label: 'Revisión' },
  { to: '/registros',    icon: '🗂️', label: 'Registros diarios' },
  { to: '/epi',          icon: '🦺', label: 'EPI' },
  { to: '/herramientas', icon: '⚙️',  label: 'Herramientas' },
  { to: '/sanitario',    icon: '🩺', label: 'Sanitario' },
  { to: '/mantenimiento',icon: '🔧', label: 'Mantenimiento' },
  { to: '/turnos',       icon: '📋', label: 'Turnos' },
  { to: '/admin',        icon: '🛡️', label: 'Administración', adminOnly: true },
]

export default function Sidebar({ open, onClose }) {
  const { configs, items, isAdmin } = useApp()
  const navItems = NAV.filter(item => !item.adminOnly || isAdmin)

  const totalAlerts = UNIT_IDS.reduce((acc, id) => {
    const cfg = configs[id]
    const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
    const level = unitAlertLevel(items[id], zones)
    return level === 'alert' ? acc + 1 : acc
  }, 0)

  return (
    <>
      {open && <div className={styles.backdrop} onClick={onClose} />}
      <aside className={`${styles.sidebar} ${open ? styles.open : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoTitle}>🔥 IGNIS</div>
          <div className={styles.logoSub}>Gestión de Material · v1.0</div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.sectionLabel}>Principal</div>
          {navItems.slice(0, 2).map(item => (
            <NavItem key={item.to} item={item} alerts={item.badge === 'alert' ? totalAlerts : 0} onClose={onClose} />
          ))}

          <div className={styles.sectionLabel}>Operaciones</div>
          {navItems.filter(i => ['/unidades', '/revision', '/registros'].includes(i.to)).map(item => (
            <NavItem key={item.to} item={item} onClose={onClose} />
          ))}

          <div className={styles.sectionLabel}>Material</div>
          {navItems.filter(i => ['/epi', '/herramientas', '/sanitario'].includes(i.to)).map(item => (
            <NavItem key={item.to} item={item} onClose={onClose} />
          ))}

          <div className={styles.sectionLabel}>Sistema</div>
          {navItems.filter(i => ['/mantenimiento', '/turnos', '/admin'].includes(i.to)).map(item => (
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

function NavItem({ item, alerts = 0, onClose }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
      onClick={onClose}
    >
      <span className={styles.navIcon}>{item.icon}</span>
      <span className={styles.navLabel}>{item.label}</span>
      {alerts > 0 && <span className={styles.badge}>{alerts}</span>}
    </NavLink>
  )
}
