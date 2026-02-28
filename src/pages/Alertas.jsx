import { useMemo, useState } from 'react'
import { useApp } from '../lib/AppContext'
import { UNIT_IDS, buildZones } from '../data/units'
import { useNavigate } from 'react-router-dom'

export default function Alertas() {
  const { configs, items, revisionIncidents } = useApp()
  const navigate = useNavigate()
  const [sortMode, setSortMode] = useState('fecha_desc')

  // ── Alertas de stock ─────────────────────────────────
  const stockAlerts = []
  UNIT_IDS.forEach(unitId => {
    const cfg   = configs[unitId]
    const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
    zones.forEach(zone => {
      const zItems = items[unitId][zone.id] || []
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

  // ── Incidencias generales (única fuente: revisiones diarias) ─────────
  const reviewIssueAlerts = (revisionIncidents || []).map(inc => ({
    unitId: inc.unitId,
    zone: inc.zone,
    zoneId: inc.zoneId || '',
    item: inc.item,
    note: inc.note || '',
    bomberoId: inc.bomberoId,
    source: 'revision',
    reportDate: inc.reportDate || null,
  }))

  const issueMap = new Map()
  ;[...reviewIssueAlerts].forEach(inc => {
    const key = `${inc.unitId}|${String(inc.zone).trim().toLowerCase()}|${String(inc.item).trim().toLowerCase()}`
    if (!issueMap.has(key)) issueMap.set(key, inc)
  })
  const issueAlerts = useMemo(() => {
    const list = Array.from(issueMap.values())
    const sorted = [...list].sort((a, b) => {
      const ta = a.reportDate ? new Date(a.reportDate + 'T00:00:00').getTime() : null
      const tb = b.reportDate ? new Date(b.reportDate + 'T00:00:00').getTime() : null
      if (sortMode === 'unidad_asc') return a.unitId - b.unitId
      if (sortMode === 'unidad_desc') return b.unitId - a.unitId
      if (ta === null && tb === null) return a.unitId - b.unitId
      if (ta === null) return 1
      if (tb === null) return -1
      return sortMode === 'fecha_desc' ? tb - ta : ta - tb
    })
    return sorted
  }, [sortMode, issueMap])

  const sortedStockAlerts = useMemo(() => {
    const priority = { alert: 0, warn: 1 }
    return [...stockAlerts].sort((a, b) => {
      if (sortMode === 'unidad_asc') return a.unitId - b.unitId || priority[a.level] - priority[b.level]
      if (sortMode === 'unidad_desc') return b.unitId - a.unitId || priority[a.level] - priority[b.level]
      return priority[a.level] - priority[b.level] || a.unitId - b.unitId
    })
  }, [stockAlerts, sortMode])

  const critical = stockAlerts.filter(a => a.level === 'alert')
  const low      = stockAlerts.filter(a => a.level === 'warn')
  const totalAlerts = stockAlerts.length + issueAlerts.length

  return (
    <div className="animate-in" style={{ padding: '24px 28px' }}>

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
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 36, fontWeight: 900, color: '#e67e22' }}>{issueAlerts.length}</div>
          <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Incidencias de revisión</div>
        </div>
        <div className="card" style={{ padding: '14px 22px', borderTop: '3px solid var(--green)' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 36, fontWeight: 900, color: 'var(--green-l)' }}>{UNIT_IDS.length - new Set([...stockAlerts, ...issueAlerts].map(a => a.unitId)).size}</div>
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

          {/* Incidencias generales */}
          {issueAlerts.length > 0 && (
            <div className="card" style={{ border: '1px solid rgba(230,126,34,0.3)' }}>
              <div className="card-header" style={{ borderBottom: '1px solid rgba(230,126,34,0.2)', background: 'rgba(230,126,34,0.05)' }}>
                <div className="card-title" style={{ color: '#e67e22' }}>
                  ⚠ Incidencias generales ({issueAlerts.length})
                </div>
                <div style={{ fontSize: 11, color: 'var(--mid)' }}>Fuente única compartida entre Revisiones y Unidades</div>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Unidad</th>
                    <th>Zona</th>
                    <th>Artículo</th>
                    <th>Descripción</th>
                    <th>Origen</th>
                    <th>Fecha</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {issueAlerts.map((a, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(230,126,34,0.03)' : 'transparent' }}>
                      <td>
                        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 800, color: '#e67e22' }}>
                          U{String(a.unitId).padStart(2,'0')}
                        </span>
                      </td>
                      <td><span className="chip chip-gray">{a.zone}</span></td>
                      <td><span style={{ fontWeight: 600, color: 'var(--light)' }}>{a.item}</span></td>
                      <td>
                        {a.note ? (
                          <span style={{ fontSize: 12, color: 'var(--mid)', fontStyle: 'italic' }}>
                            "{a.note}"
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--mid)', opacity: 0.5 }}>Sin descripción</span>
                        )}
                      </td>
                      <td>
                        <span className="chip chip-gray">
                          {a.source === 'unidad'
                            ? 'Unidades'
                            : `Revisión${a.bomberoId ? ` BV${a.bomberoId}` : ''}`}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                        {a.reportDate
                          ? new Date(a.reportDate + 'T12:00:00').toLocaleDateString('es-ES')
                          : 'Sin fecha'}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/unidades/${a.unitId}`)}>
                          Ver unidad
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Alertas de stock */}
          {stockAlerts.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">🚨 Alertas de stock ({stockAlerts.length})</div>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Prioridad</th>
                    <th>Unidad</th>
                    <th>Zona</th>
                    <th>Artículo</th>
                    <th>Actual</th>
                    <th>Mínimo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStockAlerts.map((a, i) => (
                    <tr key={i}>
                      <td>
                        <span className={`chip ${a.level === 'alert' ? 'chip-alert' : 'chip-warn'}`}>
                          {a.level === 'alert' ? '🔴 Crítico' : '🟡 Bajo stock'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 800 }}>
                          U{String(a.unitId).padStart(2,'0')}
                        </span>
                      </td>
                      <td><span className="chip chip-gray">{a.zone}</span></td>
                      <td><span style={{ fontWeight: 600 }}>{a.item}</span></td>
                      <td style={{ color: a.level === 'alert' ? 'var(--red-l)' : 'var(--yellow-l)', fontFamily: 'Roboto Mono', fontWeight: 600 }}>{a.qty}</td>
                      <td style={{ color: 'var(--mid)', fontFamily: 'Roboto Mono' }}>{a.min}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/unidades/${a.unitId}`)}>
                          Ver unidad
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
