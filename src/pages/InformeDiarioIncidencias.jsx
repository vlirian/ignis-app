import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/AppContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { buildAndStoreDailyIncidentReport } from '../lib/dailyIncidentReport'

const DEFAULT_BV_UNITS = {
  1: [3, 7, 19],
  2: [0, 6, 14],
  3: [1, 16, 22],
  4: [10, 11, 15],
  5: [4, 9, 18, 21],
  6: [2, 12, 17],
  7: [5, 8, 20],
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function InformeDiarioIncidencias() {
  const { isAdmin, configs, session, showToast, bvUnits } = useApp()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const [regenerating, setRegenerating] = useState(false)

  const canView = !!isAdmin

  async function loadReports() {
    if (!canView) return
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('daily_incident_reports')
      .select('*')
      .order('report_date', { ascending: false })
    if (error) {
      setError(error.message || 'No se pudo cargar el informe diario de incidencias')
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadReports() }, [canView])

  const totalIncidents = useMemo(() => rows.reduce((acc, r) => acc + (Number(r.total_incidents) || 0), 0), [rows])
  const totalChanges = useMemo(() => rows.reduce((acc, r) => acc + (Number(r.total_inventory_changes) || 0), 0), [rows])

  async function regenerate(reportDate, force = true) {
    if (!isAdmin) return
    setRegenerating(true)
    const res = await buildAndStoreDailyIncidentReport({
      supabase,
      reportDate,
      configs,
      actorEmail: session?.user?.email || null,
      bvUnits: bvUnits || DEFAULT_BV_UNITS,
      force,
    })
    setRegenerating(false)

    if (!res?.ok) {
      showToast(`No se pudo regenerar: ${res?.error || 'error'}`, 'error')
      return
    }
    if (!res.generated) {
      showToast(`Pendientes BV: ${res.pendingBvs.join(', ')}`, 'warn')
      return
    }

    showToast(`Informe ${reportDate} actualizado`, 'ok')
    await loadReports()
  }

  if (!canView) {
    return (
      <div className="animate-in page-container">
        <div className="card" style={{ padding: 18, borderColor: 'rgba(192,57,43,0.35)' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 24, fontWeight: 900, color: 'var(--red-l)' }}>⛔ Acceso restringido</div>
          <div style={{ marginTop: 6, color: 'var(--mid)' }}>Solo administradores pueden ver el informe diario de incidencias.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in page-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>📌 Informe diario de incidencias</div>
          <div style={{ color: 'var(--mid)', marginTop: 3, fontSize: 13 }}>Se genera automáticamente cuando los 7 BV finalizan su revisión diaria.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={loadReports}>↻ Recargar</button>
          <button className="btn btn-primary btn-sm" disabled={regenerating} onClick={() => regenerate(todayStr(), true)}>
            {regenerating ? 'Generando...' : 'Regenerar hoy'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: '12px 14px', borderTop: '3px solid #e67e22' }}>
          <div style={{ fontSize: 11, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Informes</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 34, fontWeight: 900 }}>{rows.length}</div>
        </div>
        <div className="card" style={{ padding: '12px 14px', borderTop: '3px solid var(--red)' }}>
          <div style={{ fontSize: 11, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Incidencias</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 34, fontWeight: 900, color: 'var(--red-l)' }}>{totalIncidents}</div>
        </div>
        <div className="card" style={{ padding: '12px 14px', borderTop: '3px solid var(--blue)' }}>
          <div style={{ fontSize: 11, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Cambios inventario</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 34, fontWeight: 900, color: 'var(--blue-l)' }}>{totalChanges}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Histórico diario</div>
        </div>

        {loading && <div style={{ padding: 16, color: 'var(--mid)' }}>Cargando...</div>}
        {!loading && error && (
          <div style={{ padding: 16, color: 'var(--red-l)' }}>
            Error: {error}. Ejecuta el SQL `daily-incident-reports.sql` en Supabase.
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div style={{ padding: 16, color: 'var(--mid)' }}>No hay informes diarios generados aún.</div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="table-wrap"><table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Incidencias</th>
                <th>Cambios inventario</th>
                <th>Generado por</th>
                <th>Generado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 800 }}>
                    {new Date(`${r.report_date}T12:00:00`).toLocaleDateString('es-ES')}
                  </td>
                  <td><span className="chip chip-alert">{r.total_incidents || 0}</span></td>
                  <td><span className="chip chip-warn">{r.total_inventory_changes || 0}</span></td>
                  <td style={{ color: 'var(--mid)' }}>{r.generated_by || 'sistema'}</td>
                  <td style={{ color: 'var(--mid)' }}>{r.generated_at ? new Date(r.generated_at).toLocaleString('es-ES') : '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDetail(r)}>Ver detalle</button>
                      <button className="btn btn-primary btn-sm" onClick={() => regenerate(r.report_date, true)}>Regenerar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {detail && (
        <Modal
          title={`Informe diario · ${new Date(`${detail.report_date}T12:00:00`).toLocaleDateString('es-ES')}`}
          onClose={() => setDetail(null)}
          footer={<button className="btn btn-ghost btn-sm" onClick={() => setDetail(null)}>Cerrar</button>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginBottom: 12 }}>
            <div className="card" style={{ padding: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--mid)', textTransform: 'uppercase' }}>Incidencias</div>
              <div style={{ fontFamily: 'Barlow Condensed', fontSize: 30, fontWeight: 900, color: 'var(--red-l)' }}>{detail.total_incidents || 0}</div>
            </div>
            <div className="card" style={{ padding: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--mid)', textTransform: 'uppercase' }}>Cambios inventario</div>
              <div style={{ fontFamily: 'Barlow Condensed', fontSize: 30, fontWeight: 900, color: 'var(--blue-l)' }}>{detail.total_inventory_changes || 0}</div>
            </div>
          </div>

          <div className="card" style={{ padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--mid)', textTransform: 'uppercase', marginBottom: 8 }}>Incidencias detectadas</div>
            {Array.isArray(detail?.payload?.incidents) && detail.payload.incidents.length > 0 ? (
              <div style={{ display: 'grid', gap: 6 }}>
                {detail.payload.incidents.map((inc, idx) => (
                  <div key={idx} style={{ border: '1px solid rgba(192,57,43,0.25)', background: 'rgba(192,57,43,0.07)', borderRadius: 8, padding: '6px 10px' }}>
                    <div style={{ color: 'var(--red-l)', fontWeight: 700 }}>U{String(inc.unitId).padStart(2, '0')} · {inc.zone} · {inc.item}</div>
                    <div style={{ color: 'var(--mid)', fontSize: 12 }}>{inc.note || 'Sin detalle'} · {inc.source}</div>
                  </div>
                ))}
              </div>
            ) : <div style={{ color: 'var(--mid)' }}>Sin incidencias.</div>}
          </div>

          <div className="card" style={{ padding: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--mid)', textTransform: 'uppercase', marginBottom: 8 }}>Cambios de inventario</div>
            {Array.isArray(detail?.payload?.inventoryChanges) && detail.payload.inventoryChanges.length > 0 ? (
              <div className="table-wrap"><table className="table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Unidad</th>
                    <th>Tipo</th>
                    <th>Artículo</th>
                    <th>Detalle</th>
                    <th>Por</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.payload.inventoryChanges.slice(0, 200).map((ch, idx) => (
                    <tr key={`${ch.id || idx}`}>
                      <td>{ch.createdAt ? new Date(ch.createdAt).toLocaleTimeString('es-ES') : '-'}</td>
                      <td>U{String(ch.unitId).padStart(2, '0')}</td>
                      <td>{ch.changeType || '-'}</td>
                      <td>{ch.itemName || '-'}</td>
                      <td style={{ color: 'var(--mid)' }}>{ch.detail || '-'}</td>
                      <td style={{ color: 'var(--mid)' }}>{ch.changedBy || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : <div style={{ color: 'var(--mid)' }}>Sin cambios de inventario.</div>}
          </div>
        </Modal>
      )}
    </div>
  )
}
