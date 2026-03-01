import { useApp } from '../lib/AppContext'
import { buildZones, unitAlertLevel, unitSummary } from '../data/units'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { configs, items, revisionIncidents } = useApp()
  const navigate = useNavigate()
  const activeUnitIds = Object.keys(configs || {})
    .map(Number)
    .filter(Number.isFinite)
    .filter(id => configs[id]?.isActive !== false)
    .sort((a, b) => a - b)

  // Calcula estadísticas globales
  let globalTotal = 0, globalMissing = 0, globalLow = 0
  const unitsWithAlerts = []

  activeUnitIds.forEach(id => {
    const cfg = configs[id]
    if (!cfg) return
    const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
    const s = unitSummary(items[id] || {}, zones)
    globalTotal += s.total
    globalMissing += s.missing
    globalLow += s.low
    if (s.missing > 0 || s.low > 0) {
      unitsWithAlerts.push({ id, ...s, level: unitAlertLevel(items[id] || {}, zones) })
    }
  })

  const unitsWithRevisionIncidents = new Set(
    (revisionIncidents || []).map(inc => Number(inc.unitId)).filter(Number.isFinite)
  )

  const kpis = [
    { label: 'Total artículos',   value: globalTotal,   color: 'var(--blue-l)',   top: 'info',  icon: '📦' },
    { label: 'Completos',         value: globalTotal - globalMissing - globalLow, color: 'var(--green-l)', top: 'ok', icon: '✅' },
    { label: 'Stock bajo',        value: globalLow,     color: 'var(--yellow-l)', top: 'warn',  icon: '⚠️' },
    { label: 'Artículos faltantes', value: globalMissing, color: 'var(--red-l)', top: 'alert', icon: '🚨' },
  ]

  const topColors = { info: 'var(--blue)', ok: 'var(--green)', warn: 'var(--yellow)', alert: 'var(--red)' }

  return (
    <div className="animate-in page-container">

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label} className="card" style={{ borderTop: `3px solid ${topColors[k.top]}`, padding: '18px 22px', position: 'relative' }}>
            <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)', fontWeight: 700, marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 44, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', fontSize: 34, opacity: 0.12 }}>{k.icon}</div>
          </div>
        ))}
      </div>

      {/* Alertas de unidades */}
      {unitsWithAlerts.length > 0 && (
        <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(192,57,43,0.3)', background: 'rgba(192,57,43,0.06)' }}>
          <div className="card-header">
            <div className="card-title">🚨 Unidades con incidencias</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/alertas')}>Ver todas</button>
          </div>
          <div style={{ padding: '8px 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unitsWithAlerts.map(u => (
              <button
                key={u.id}
                onClick={() => navigate(`/unidades/${u.id}`)}
                style={{
                  background: u.level === 'alert' ? 'rgba(192,57,43,0.15)' : 'rgba(230,126,34,0.15)',
                  border: `1px solid ${u.level === 'alert' ? 'rgba(192,57,43,0.4)' : 'rgba(230,126,34,0.4)'}`,
                  color: u.level === 'alert' ? 'var(--red-l)' : 'var(--yellow-l)',
                  borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                  fontFamily: 'Barlow Condensed', fontSize: 14, fontWeight: 700, letterSpacing: 1
                }}
              >
                {(u.level !== 'ok' || unitsWithRevisionIncidents.has(u.id)) && (
                  <span className="incident-beacon incident-beacon-inline" />
                )}
                U{String(u.id).padStart(2,'0')} · {u.missing > 0 ? `${u.missing} faltante${u.missing>1?'s':''}` : `${u.low} bajo stock`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabla de unidades */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">🚒 Estado de unidades</div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/unidades')}>Ver detalle</button>
        </div>
        <div className="table-wrap"><table className="table">
          <thead>
            <tr>
              <th>Unidad</th>
              <th>Zonas</th>
              <th>Artículos</th>
              <th>Faltantes</th>
              <th>Stock bajo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {activeUnitIds.map(id => {
              const cfg = configs[id]
              if (!cfg) return null
              const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
              const s = unitSummary(items[id] || {}, zones)
              const level = unitAlertLevel(items[id] || {}, zones)
              const hasIncident = level !== 'ok' || unitsWithRevisionIncidents.has(id)
              return (
                <tr key={id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/unidades/${id}`)}>
                  <td>
                    {hasIncident && <span className="incident-beacon" />}
                    <span style={{ fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>
                      U{String(id).padStart(2,'0')}
                    </span>
                  </td>
                  <td>{s.zones}</td>
                  <td>{s.total}</td>
                  <td style={{ color: s.missing > 0 ? 'var(--red-l)' : 'var(--mid)' }}>{s.missing}</td>
                  <td style={{ color: s.low > 0 ? 'var(--yellow-l)' : 'var(--mid)' }}>{s.low}</td>
                  <td>
                    <span className={`chip chip-${level === 'ok' ? 'ok' : level === 'warn' ? 'warn' : 'alert'}`}>
                      {level === 'ok' ? '✓ Completa' : level === 'warn' ? 'Stock bajo' : 'Faltante'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}
