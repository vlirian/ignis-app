import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/AppContext'
import { buildZones, unitAlertLevel, unitSummary } from '../data/units'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const { configs, items, revisionIncidents } = useApp()
  const navigate = useNavigate()
  const [vehicleIncidents, setVehicleIncidents] = useState([])
  const [installationIncidents, setInstallationIncidents] = useState([])

  useEffect(() => {
    loadVehicleIncidents()
    loadInstallationIncidents()
  }, [])

  async function loadVehicleIncidents() {
    const { data, error } = await supabase
      .from('vehicle_incidents')
      .select('id, created_at, unit_id, title, status')
      .eq('status', 'activa')
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) return
    setVehicleIncidents(data || [])
  }

  async function loadInstallationIncidents() {
    const { data, error } = await supabase
      .from('installation_incidents')
      .select('id, created_at, title, location, status')
      .eq('status', 'activa')
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) return
    setInstallationIncidents(data || [])
  }
  const activeUnitIds = Object.keys(configs || {})
    .map(Number)
    .filter(Number.isFinite)
    .filter(id => configs[id]?.isActive !== false)
    .sort((a, b) => a - b)

  // Calcula estadísticas globales
  let globalTotal = 0, globalMissing = 0, globalLow = 0
  activeUnitIds.forEach(id => {
    const cfg = configs[id]
    if (!cfg) return
    const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
    const s = unitSummary(items[id] || {}, zones)
    globalTotal += s.total
    globalMissing += s.missing
    globalLow += s.low
  })

  const incidentsByUnit = {}
  ;(revisionIncidents || []).forEach((inc) => {
    const unitId = Number(inc.unitId)
    if (!Number.isFinite(unitId)) return
    if (configs[unitId]?.isActive === false) return
    if (!incidentsByUnit[unitId]) incidentsByUnit[unitId] = new Set()
    const key = `${String(inc.zone || '').trim().toLowerCase()}|${String(inc.item || '').trim().toLowerCase()}`
    incidentsByUnit[unitId].add(key)
  })
  const vehicleIncidentsByUnit = useMemo(() => {
    const byUnit = {}
    ;(vehicleIncidents || []).forEach((inc) => {
      const unitId = Number(inc.unit_id)
      if (!Number.isFinite(unitId)) return
      if (configs[unitId]?.isActive === false) return
      byUnit[unitId] = (byUnit[unitId] || 0) + 1
    })
    return byUnit
  }, [vehicleIncidents, configs])

  const materialUnitsWithAlerts = useMemo(() => {
    return activeUnitIds
      .map((id) => {
        const cfg = configs[id]
        if (!cfg) return null
        const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
        const s = unitSummary(items[id] || {}, zones)
        const revisionCount = incidentsByUnit[id]?.size || 0
        const hasAlert = s.missing > 0 || s.low > 0 || revisionCount > 0
        if (!hasAlert) return null
        return {
          id,
          ...s,
          revisionCount,
          level: unitAlertLevel(items[id] || {}, zones),
        }
      })
      .filter(Boolean)
  }, [activeUnitIds, configs, items, incidentsByUnit])

  const globalIncidentsMaterial = Object.values(incidentsByUnit).reduce((acc, set) => acc + set.size, 0)
  const globalIncidentsVehicles = Object.values(vehicleIncidentsByUnit).reduce((acc, n) => acc + Number(n || 0), 0)
  const globalIncidentsInstallations = installationIncidents.length
  const globalIncidents = globalIncidentsMaterial + globalIncidentsVehicles + globalIncidentsInstallations

  const kpis = [
    { label: 'Total artículos',   value: globalTotal,   color: 'var(--blue-l)',   top: 'info',  icon: '📦' },
    { label: 'Completos',         value: globalTotal - globalMissing - globalLow, color: 'var(--green-l)', top: 'ok', icon: '✅' },
    { label: 'Incidencias',       value: globalIncidents, color: 'var(--yellow-l)', top: 'warn', icon: '⚠️' },
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
            <div
              className={(k.label === 'Incidencias' || k.label === 'Artículos faltantes') && Number(k.value) > 0 ? 'kpi-icon-alert' : ''}
              style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)', fontSize: 34, opacity: 0.12 }}
            >
              {k.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Incidencias material + vehículos */}
      {(materialUnitsWithAlerts.length > 0 || Object.keys(vehicleIncidentsByUnit).length > 0) && (
        <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(192,57,43,0.3)', background: 'rgba(192,57,43,0.06)' }}>
          <div className="card-header">
            <div className="card-title">🚨 Unidades con incidencias (material y vehículos)</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/incidencias')}>Ver todas</button>
          </div>
          <div style={{ padding: '8px 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {materialUnitsWithAlerts.map(u => (
              <button
                key={`mat-${u.id}`}
                onClick={() => navigate(`/unidades/${u.id}`)}
                style={{
                  background: u.level === 'alert' ? 'rgba(192,57,43,0.15)' : 'rgba(230,126,34,0.15)',
                  border: `1px solid ${u.level === 'alert' ? 'rgba(192,57,43,0.4)' : 'rgba(230,126,34,0.4)'}`,
                  color: u.level === 'alert' ? 'var(--red-l)' : 'var(--yellow-l)',
                  borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                  fontFamily: 'Barlow Condensed', fontSize: 14, fontWeight: 700, letterSpacing: 1
                }}
              >
                {(u.level !== 'ok' || u.revisionCount > 0) && (
                  <span className="incident-beacon incident-beacon-inline" />
                )}
                U{String(u.id).padStart(2,'0')} · {u.missing > 0 ? `${u.missing} faltante${u.missing>1?'s':''}` : `${u.low} bajo stock`}
              </button>
            ))}
            {Object.entries(vehicleIncidentsByUnit).map(([unitId, count]) => (
              <button
                key={`veh-${unitId}`}
                onClick={() => navigate('/vehiculos')}
                style={{
                  background: 'rgba(56,189,248,0.14)',
                  border: '1px solid rgba(56,189,248,0.45)',
                  color: '#7dd3fc',
                  borderRadius: 8,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontFamily: 'Barlow Condensed',
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: 1
                }}
              >
                <span className="incident-beacon incident-beacon-inline" />
                U{String(unitId).padStart(2,'0')} · 🚒 {count} incidencia{Number(count) > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Incidencias de instalaciones */}
      {installationIncidents.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 24,
            borderColor: 'rgba(168,85,247,0.35)',
            background: 'linear-gradient(180deg, rgba(168,85,247,0.11), rgba(168,85,247,0.05))',
          }}
        >
          <div className="card-header" style={{ borderBottom: '1px solid rgba(168,85,247,0.22)' }}>
            <div className="card-title" style={{ color: '#c084fc' }}>🏢 Incidencias de instalaciones</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/instalaciones')}>Ver instalaciones</button>
          </div>
          <div style={{ padding: '8px 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {installationIncidents.slice(0, 20).map((inc) => (
              <button
                key={inc.id}
                onClick={() => navigate('/instalaciones')}
                style={{
                  background: 'rgba(167,139,250,0.18)',
                  border: '1px solid rgba(167,139,250,0.5)',
                  color: '#e9d5ff',
                  borderRadius: 8,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  fontFamily: 'Barlow Condensed',
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: 1
                }}
                title={inc.title || ''}
              >
                {inc.location ? `${inc.location} · ` : ''}{inc.title || 'Incidencia'}
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
              <th>Incidencias</th>
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
              const totalUnitInc = (incidentsByUnit[id]?.size || 0) + (vehicleIncidentsByUnit[id] || 0)
              const hasIncident = level !== 'ok' || totalUnitInc > 0
              return (
                <tr key={id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/unidades/${id}`)}>
                  <td>
                    {hasIncident && <span className="incident-beacon incident-beacon-focus" />}
                    <span style={{ fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>
                      U{String(id).padStart(2,'0')}
                    </span>
                  </td>
                  <td>{s.zones}</td>
                  <td>{s.total}</td>
                  <td style={{ color: s.missing > 0 ? 'var(--red-l)' : 'var(--mid)' }}>{s.missing}</td>
                  <td style={{ color: totalUnitInc > 0 ? 'var(--yellow-l)' : 'var(--mid)' }}>
                    {totalUnitInc}
                  </td>
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
