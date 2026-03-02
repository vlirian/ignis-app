import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/AppContext'
import { buildZones } from '../data/units'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Alertas() {
  const { configs, items, revisionIncidents } = useApp()
  const activeUnitIds = Object.keys(configs || {})
    .map(Number)
    .filter(Number.isFinite)
    .filter(id => configs[id]?.isActive !== false)
    .sort((a, b) => a - b)
  const navigate = useNavigate()
  const [sortMode, setSortMode] = useState('fecha_desc')
  const [incidentCategory, setIncidentCategory] = useState('all') // all | material | vehiculos | instalaciones
  const [photoViewer, setPhotoViewer] = useState(null) // { urls: string[], index: number, title?: string }
  const [installationIncidents, setInstallationIncidents] = useState([])
  const [vehicleIncidents, setVehicleIncidents] = useState([])

  useEffect(() => {
    loadInstallationIncidents()
    loadVehicleIncidents()
  }, [])

  async function loadInstallationIncidents() {
    const { data, error } = await supabase
      .from('installation_incidents')
      .select('id, created_at, title, location, description, severity, status, reported_by')
      .eq('status', 'activa')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return
    setInstallationIncidents(data || [])
  }

  async function loadVehicleIncidents() {
    const { data, error } = await supabase
      .from('vehicle_incidents')
      .select('id, created_at, unit_id, title, description, severity, status, reported_by')
      .eq('status', 'activa')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return
    setVehicleIncidents(data || [])
  }

  const goToUnitFromAlert = (alert) => {
    const params = new URLSearchParams()
    if (alert.zone) params.set('zone', alert.zone)
    if (alert.zoneId) params.set('zoneId', alert.zoneId)
    if (alert.item) params.set('item', alert.item)
    params.set('src', 'alertas')
    navigate(`/unidades/${alert.unitId}?${params.toString()}`)
  }

  // ── Alertas de stock ─────────────────────────────────
  const stockAlerts = []
  activeUnitIds.forEach(unitId => {
    const cfg   = configs[unitId]
    if (!cfg) return
    const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
    zones.forEach(zone => {
      const zItems = items[unitId]?.[zone.id] || []
      zItems.forEach(item => {
        if (item.qty < item.min) {
          stockAlerts.push({
            unitId, zone: zone.label, zoneId: zone.id,
            item: item.name, qty: item.qty, min: item.min,
            level: item.qty === 0 ? 'alert' : 'warn'
          })
        }
      })
    })
  })

  // ── Incidencias de material (fuente: revisión diaria + unidades) ──────
  const reviewIssueAlerts = (revisionIncidents || [])
    .filter(inc => configs[Number(inc.unitId)]?.isActive !== false)
    .map(inc => ({
    unitId: inc.unitId,
    zone: inc.zone,
    zoneId: inc.zoneId || '',
    item: inc.item,
    note: inc.note || '',
    bomberoId: inc.bomberoId,
    source: 'revision',
    reportDate: inc.reportDate || null,
    photoUrls: Array.isArray(inc.photoUrls) ? inc.photoUrls : [],
  }))

  const issueMap = new Map()
  ;[...reviewIssueAlerts].forEach(inc => {
    const key = `${inc.unitId}|${String(inc.zone).trim().toLowerCase()}|${String(inc.item).trim().toLowerCase()}`
    if (!issueMap.has(key)) issueMap.set(key, inc)
  })

  const openIssuePhoto = (alert) => {
    const urls = (alert.photoUrls || []).filter(Boolean)
    if (!urls.length) return
    setPhotoViewer({ urls, index: 0, title: `U${String(alert.unitId).padStart(2, '0')} · ${alert.item}` })
  }

  const onIssueRowClick = (alert) => {
    const hasPhoto = (alert.photoUrls || []).length > 0
    if (hasPhoto) {
      openIssuePhoto(alert)
      return
    }
    if (!Number.isFinite(alert.unitId)) return
    goToUnitFromAlert(alert)
  }

  const materialIssueAlerts = useMemo(() => {
    const list = Array.from(issueMap.values()).map(a => ({ ...a, incidentType: 'material' }))
    return list.sort((a, b) => {
      const ta = a.reportDate ? new Date(a.reportDate + 'T00:00:00').getTime() : null
      const tb = b.reportDate ? new Date(b.reportDate + 'T00:00:00').getTime() : null
      if (sortMode === 'unidad_asc') return a.unitId - b.unitId
      if (sortMode === 'unidad_desc') return b.unitId - a.unitId
      if (ta === null && tb === null) return a.unitId - b.unitId
      if (ta === null) return 1
      if (tb === null) return -1
      return sortMode === 'fecha_desc' ? tb - ta : ta - tb
    })
  }, [sortMode, issueMap])

  const vehicleIssueAlerts = useMemo(() => {
    const list = (vehicleIncidents || []).map(r => ({
      id: r.id,
      unitId: Number(r.unit_id),
      zone: 'Vehículo',
      zoneId: 'vehiculo',
      item: r.title || 'Incidencia de vehículo',
      note: r.description || '',
      bomberoId: null,
      source: 'vehiculos',
      reportDate: r.created_at ? String(r.created_at).slice(0, 10) : null,
      createdAt: r.created_at || null,
      photoUrls: [],
      incidentType: 'vehiculos',
    }))
    return list.sort((a, b) => {
      const ta = a.reportDate ? new Date(a.reportDate + 'T00:00:00').getTime() : null
      const tb = b.reportDate ? new Date(b.reportDate + 'T00:00:00').getTime() : null
      if (sortMode === 'unidad_asc') return a.unitId - b.unitId
      if (sortMode === 'unidad_desc') return b.unitId - a.unitId
      if (ta === null && tb === null) return a.unitId - b.unitId
      if (ta === null) return 1
      if (tb === null) return -1
      return sortMode === 'fecha_desc' ? tb - ta : ta - tb
    })
  }, [sortMode, vehicleIncidents])

  const installationIssueAlerts = useMemo(() => {
    const list = (installationIncidents || []).map(r => ({
      id: r.id,
      unitId: null,
      zone: r.location || 'Instalaciones',
      zoneId: 'instalaciones',
      item: r.title || 'Incidencia de instalaciones',
      note: r.description || '',
      bomberoId: null,
      source: 'instalaciones',
      reportDate: r.created_at ? String(r.created_at).slice(0, 10) : null,
      createdAt: r.created_at || null,
      photoUrls: [],
      incidentType: 'instalaciones',
    }))
    return list.sort((a, b) => {
      const ta = a.reportDate ? new Date(a.reportDate + 'T00:00:00').getTime() : null
      const tb = b.reportDate ? new Date(b.reportDate + 'T00:00:00').getTime() : null
      if (ta === null && tb === null) return a.unitId - b.unitId
      if (ta === null) return 1
      if (tb === null) return -1
      return sortMode === 'fecha_desc' ? tb - ta : ta - tb
    })
  }, [sortMode, installationIncidents])

  const sortedStockAlerts = useMemo(() => {
    const priority = { alert: 0, warn: 1 }
    return [...stockAlerts].map(a => ({ ...a, incidentType: 'material' })).sort((a, b) => {
      if (sortMode === 'unidad_asc') return a.unitId - b.unitId || priority[a.level] - priority[b.level]
      if (sortMode === 'unidad_desc') return b.unitId - a.unitId || priority[a.level] - priority[b.level]
      return priority[a.level] - priority[b.level] || a.unitId - b.unitId
    })
  }, [stockAlerts, sortMode])

  const showMaterial = incidentCategory === 'all' || incidentCategory === 'material'
  const showVehiculos = incidentCategory === 'all' || incidentCategory === 'vehiculos'
  const showInstalaciones = incidentCategory === 'all' || incidentCategory === 'instalaciones'

  const categoryCounts = useMemo(() => {
    const material = sortedStockAlerts.length + materialIssueAlerts.length
    const vehiculos = vehicleIssueAlerts.length
    const instalaciones = installationIssueAlerts.length
    return { material, vehiculos, instalaciones }
  }, [sortedStockAlerts, materialIssueAlerts, vehicleIssueAlerts, installationIssueAlerts])

  const critical = stockAlerts.filter(a => a.level === 'alert')
  const low      = stockAlerts.filter(a => a.level === 'warn')
  const totalAlerts = sortedStockAlerts.length + materialIssueAlerts.length + vehicleIssueAlerts.length + installationIssueAlerts.length
  const totalIssueAlerts = materialIssueAlerts.length + vehicleIssueAlerts.length + installationIssueAlerts.length

  return (
    <div className="animate-in page-container">

      {/* Selector principal por tipo de incidencia */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { key: 'material', icon: '🧰', label: 'Incidencias de material', count: categoryCounts.material, tone: 'var(--fire)' },
          { key: 'vehiculos', icon: '🚒', label: 'Incidencias de vehículos', count: categoryCounts.vehiculos, tone: '#38bdf8' },
          { key: 'instalaciones', icon: '🏢', label: 'Incidencias instalaciones', count: categoryCounts.instalaciones, tone: '#a78bfa' },
        ].map(card => {
          const active = incidentCategory === card.key
          return (
            <button
              key={card.key}
              onClick={() => setIncidentCategory(card.key)}
              className="card"
              style={{
                textAlign: 'left',
                padding: 16,
                border: active ? `1px solid ${card.tone}` : '1px solid var(--border2)',
                boxShadow: active ? `0 0 0 1px ${card.tone} inset, 0 0 18px color-mix(in srgb, ${card.tone} 28%, transparent)` : 'none',
                background: active ? 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.06))' : undefined,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 28, lineHeight: 1 }}>{card.icon}</span>
                <span style={{ fontFamily: 'Barlow Condensed', fontSize: 34, fontWeight: 900, color: card.tone }}>{card.count}</span>
              </div>
              <div style={{ fontFamily: 'Barlow Condensed', fontSize: 22, fontWeight: 800, lineHeight: 1.1, color: active ? 'var(--white)' : 'var(--light)' }}>
                {card.label}
              </div>
            </button>
          )
        })}
      </div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setIncidentCategory('all')}>
          Ver todas
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '14px 22px', borderTop: '3px solid var(--red)' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 36, fontWeight: 900, color: 'var(--red-l)' }}>{critical.length}</div>
          <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Artículos a cero</div>
        </div>
        <div className="card" style={{ padding: '14px 22px', borderTop: '3px solid var(--yellow)' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 36, fontWeight: 900, color: 'var(--yellow-l)' }}>{low.length}</div>
          <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Stock bajo mínimo</div>
        </div>
        <div className="card" style={{ padding: '14px 22px', borderTop: '3px solid #e67e22' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 36, fontWeight: 900, color: '#e67e22' }}>{totalIssueAlerts}</div>
          <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Incidencias activas</div>
        </div>
        <div className="card" style={{ padding: '14px 22px', borderTop: '3px solid var(--green)' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 36, fontWeight: 900, color: 'var(--green-l)' }}>
            {activeUnitIds.length - new Set([...stockAlerts, ...materialIssueAlerts, ...vehicleIssueAlerts].map(a => a.unitId).filter(v => Number.isFinite(v))).size}
          </div>
          <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Unidades sin alertas</div>
        </div>
      </div>

      <div className="card" style={{ padding: '10px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>Ordenar alertas</span>
          <select className="form-select" style={{ maxWidth: 300 }} value={sortMode} onChange={e => setSortMode(e.target.value)}>
            <option value="fecha_desc">Fecha: más recientes</option>
            <option value="fecha_asc">Fecha: más antiguas</option>
            <option value="unidad_asc">Unidad: menor a mayor</option>
            <option value="unidad_desc">Unidad: mayor a menor</option>
          </select>
        </div>
      </div>

      {totalAlerts === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--mid)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 20, fontWeight: 700 }}>Sin alertas activas</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Todo el material está completo y sin incidencias.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Incidencias de material */}
          {showMaterial && (sortedStockAlerts.length > 0 || materialIssueAlerts.length > 0) && (
            <div className="card" style={{ border: '1px solid rgba(255,92,39,0.28)' }}>
              <div className="card-header" style={{ borderBottom: '1px solid rgba(255,92,39,0.2)', background: 'rgba(255,92,39,0.05)' }}>
                <div className="card-title" style={{ color: 'var(--fire)' }}>
                  🧰 Incidencias de material ({sortedStockAlerts.length + materialIssueAlerts.length})
                </div>
              </div>
              <div className="table-wrap"><table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Unidad</th>
                    <th>Zona</th>
                    <th>Artículo</th>
                    <th>Detalle</th>
                    <th>Fecha</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStockAlerts.map((a, i) => (
                    <tr key={`stock-${i}`} style={{ cursor: 'pointer' }} onClick={() => goToUnitFromAlert(a)}>
                      <td>
                        <span className={`chip ${a.level === 'alert' ? 'chip-alert' : 'chip-warn'}`}>
                          {a.level === 'alert' ? 'Faltante crítico' : 'Faltante'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 800 }}>
                          U{String(a.unitId).padStart(2,'0')}
                        </span>
                      </td>
                      <td><span className="chip chip-gray">{a.zone}</span></td>
                      <td><span style={{ fontWeight: 600 }}>{a.item}</span></td>
                      <td style={{ fontFamily: 'Roboto Mono', color: 'var(--mid)' }}>
                        {a.qty}/{a.min}
                      </td>
                      <td style={{ color: 'var(--mid)' }}>-</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); goToUnitFromAlert(a) }}>
                          Ver unidad
                        </button>
                      </td>
                    </tr>
                  ))}
                  {materialIssueAlerts.map((a, i) => (
                    <tr
                      key={`material-issue-${i}`}
                      style={{ background: i % 2 === 0 ? 'rgba(230,126,34,0.03)' : 'transparent', cursor: 'pointer' }}
                      onClick={() => onIssueRowClick(a)}
                    >
                      <td><span className="chip chip-alert">Incidencia</span></td>
                      <td>
                        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 800, color: '#e67e22' }}>
                          U{String(a.unitId).padStart(2,'0')}
                        </span>
                      </td>
                      <td><span className="chip chip-gray">{a.zone}</span></td>
                      <td><span style={{ fontWeight: 600, color: 'var(--light)' }}>{a.item}</span></td>
                      <td>
                        {a.note ? (
                          <span style={{ fontSize: 12, color: 'var(--mid)', fontStyle: 'italic' }}>"{a.note}"</span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--mid)', opacity: 0.5 }}>Sin descripción</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                        {a.reportDate ? new Date(a.reportDate + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin fecha'}
                      </td>
                      <td>
                        {(a.photoUrls || []).length > 0 ? (
                          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openIssuePhoto(a) }}>Ver foto</button>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); goToUnitFromAlert(a) }}>Ver unidad</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

          {/* Incidencias de vehículos */}
          {showVehiculos && vehicleIssueAlerts.length > 0 && (
            <div className="card" style={{ border: '1px solid rgba(56,189,248,0.28)' }}>
              <div className="card-header" style={{ borderBottom: '1px solid rgba(56,189,248,0.22)', background: 'rgba(56,189,248,0.05)' }}>
                <div className="card-title" style={{ color: '#38bdf8' }}>
                  🚒 Incidencias de vehículos ({vehicleIssueAlerts.length})
                </div>
              </div>
              <div className="table-wrap"><table className="table">
                <thead>
                  <tr>
                    <th>Unidad</th>
                    <th>Incidencia</th>
                    <th>Descripción</th>
                    <th>Fecha</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleIssueAlerts.map((a, i) => (
                    <tr key={`veh-${i}`} style={{ cursor: 'pointer' }} onClick={() => onIssueRowClick(a)}>
                      <td>
                        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 800, color: '#38bdf8' }}>
                          U{String(a.unitId).padStart(2,'0')}
                        </span>
                      </td>
                      <td><span style={{ fontWeight: 600, color: 'var(--light)' }}>{a.item}</span></td>
                      <td>
                        {a.note ? <span style={{ fontSize: 12, color: 'var(--mid)', fontStyle: 'italic' }}>"{a.note}"</span> : <span style={{ fontSize: 11, color: 'var(--mid)', opacity: 0.5 }}>Sin descripción</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                        {a.reportDate ? new Date(a.reportDate + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin fecha'}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); if (Number.isFinite(a.unitId)) goToUnitFromAlert(a) }}>
                          Ver unidad
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

          {/* Incidencias de instalaciones */}
          {showInstalaciones && installationIssueAlerts.length > 0 && (
            <div className="card" style={{ border: '1px solid rgba(167,139,250,0.28)' }}>
              <div className="card-header" style={{ borderBottom: '1px solid rgba(167,139,250,0.22)', background: 'rgba(167,139,250,0.05)' }}>
                <div className="card-title" style={{ color: '#a78bfa' }}>
                  🏢 Incidencias de instalaciones ({installationIssueAlerts.length})
                </div>
              </div>
              <div className="table-wrap"><table className="table">
                <thead>
                  <tr>
                    <th>Ubicación</th>
                    <th>Incidencia</th>
                    <th>Descripción</th>
                    <th>Fecha</th>
                    <th>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {installationIssueAlerts.map((a, i) => (
                    <tr key={`inst-${i}`} style={{ cursor: 'pointer' }} onClick={() => onIssueRowClick(a)}>
                      <td><span className="chip chip-gray">{a.zone || 'Instalaciones'}</span></td>
                      <td><span style={{ fontWeight: 600, color: 'var(--light)' }}>{a.item}</span></td>
                      <td>
                        {a.note ? <span style={{ fontSize: 12, color: 'var(--mid)', fontStyle: 'italic' }}>"{a.note}"</span> : <span style={{ fontSize: 11, color: 'var(--mid)', opacity: 0.5 }}>Sin descripción</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                        {a.reportDate ? new Date(a.reportDate + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin fecha'}
                      </td>
                      <td><span className="chip chip-gray">Instalaciones</span></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

        </div>
      )}

      {photoViewer && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setPhotoViewer(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 260, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 20 }}
        >
          <div style={{ width: '100%', maxWidth: 1100 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ color: 'var(--light)', fontFamily: 'Barlow Condensed', fontSize: 20, letterSpacing: 0.5 }}>
                {photoViewer.title || 'Foto de incidencia'}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPhotoViewer(null)}>Cerrar</button>
            </div>
            <div style={{ position: 'relative', border: '1px solid var(--border2)', borderRadius: 12, overflow: 'hidden', background: '#111' }}>
              <img
                src={photoViewer.urls[photoViewer.index]}
                alt={`Foto ${photoViewer.index + 1}`}
                style={{ width: '100%', maxHeight: '76vh', objectFit: 'contain', display: 'block', margin: '0 auto' }}
              />
              {photoViewer.urls.length > 1 && (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)' }}
                    onClick={() => setPhotoViewer(v => ({ ...v, index: (v.index - 1 + v.urls.length) % v.urls.length }))}
                  >
                    ‹
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)' }}
                    onClick={() => setPhotoViewer(v => ({ ...v, index: (v.index + 1) % v.urls.length }))}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
