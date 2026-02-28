import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

function emptyEditState(report) {
  return {
    id: report.id,
    unit_id: report.unit_id,
    bombero_id: report.bombero_id,
    report_date: report.report_date,
    reviewed_by: report.reviewed_by || '',
    is_ok: !!report.is_ok,
    general_notes: report.general_notes || '',
    incidents: Array.isArray(report.incidents) ? report.incidents.map(i => ({
      zone: i?.zone || '',
      item: i?.item || '',
      note: i?.note || '',
    })) : [],
  }
}

function fmtDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-ES', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  })
}

export default function RegistrosDiarios() {
  const { showToast, refreshRevisionIncidents } = useApp()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [bvFilter, setBvFilter] = useState('')
  const [dateOrder, setDateOrder] = useState('desc')
  const [unitOrder, setUnitOrder] = useState('asc')
  const [editState, setEditState] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadReports() }, [])

  async function loadReports() {
    setLoading(true)
    setLoadError('')

    const baseSelect = 'id, report_date, bombero_id, unit_id, is_ok, incidents, general_notes, reviewed_by, created_at'
    let { data, error } = await supabase
      .from('revision_reports')
      .select(baseSelect)
      .order('report_date', { ascending: false })

    // Fallback a una consulta mínima si el orden/columnas no coinciden en algún entorno
    if (error) {
      const fallback = await supabase
        .from('revision_reports')
        .select('*')
        .order('created_at', { ascending: false })
      data = fallback.data
      error = fallback.error
    }

    if (error) {
      const msg = `Error cargando registros: ${error.message || 'desconocido'}`
      setLoadError(msg)
      showToast('Error cargando registros', 'error')
      setLoading(false)
      return
    }
    setReports(data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return reports.filter(r => {
      if (dateFilter && r.report_date !== dateFilter) return false
      if (bvFilter && String(r.bombero_id) !== String(bvFilter)) return false
      return true
    })
  }, [reports, dateFilter, bvFilter])

  const groups = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const key = `${r.report_date}__${r.bombero_id}`
      if (!map[key]) map[key] = { key, date: r.report_date, bomberoId: r.bombero_id, reports: [] }
      map[key].reports.push(r)
    })
    return Object.values(map).sort((a, b) => {
      if (a.date === b.date) return a.bomberoId - b.bomberoId
      return dateOrder === 'desc'
        ? (a.date < b.date ? 1 : -1)
        : (a.date > b.date ? 1 : -1)
    })
  }, [filtered, dateOrder])

  async function saveEdit() {
    if (!editState) return
    setSaving(true)
    const payload = {
      is_ok: editState.is_ok,
      general_notes: editState.general_notes || '',
      incidents: editState.incidents
        .filter(i => i.item.trim())
        .map(i => ({ zone: i.zone || '', item: i.item.trim(), note: i.note || '' })),
    }
    const { error } = await supabase.from('revision_reports').update(payload).eq('id', editState.id)
    setSaving(false)
    if (error) {
      showToast('Error al guardar el informe', 'error')
      return
    }
    showToast('Informe actualizado', 'ok')
    setEditState(null)
    await loadReports()
    await refreshRevisionIncidents()
  }

  async function deleteReport(reportId) {
    const ok = window.confirm('¿Seguro que quieres borrar este informe?')
    if (!ok) return
    const { error } = await supabase.from('revision_reports').delete().eq('id', reportId)
    if (error) {
      showToast('No se pudo borrar', 'error')
      return
    }
    showToast('Informe borrado', 'warn')
    await loadReports()
    await refreshRevisionIncidents()
  }

  async function deleteGroup(group) {
    const ok = window.confirm(`¿Borrar todos los informes de BV${group.bomberoId} del ${group.date}?`)
    if (!ok) return
    const ids = group.reports.map(r => r.id)
    const { error } = await supabase.from('revision_reports').delete().in('id', ids)
    if (error) {
      showToast('No se pudo borrar el bloque', 'error')
      return
    }
    showToast('Bloque eliminado', 'warn')
    await loadReports()
    await refreshRevisionIncidents()
  }

  return (
    <div className="animate-in" style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>🗂️ Registros diarios</div>
          <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 3 }}>Informes guardados por fecha y bombero. Puedes editar o borrar.</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadReports}>↻ Recargar</button>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 220px 220px auto', gap: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Filtrar por fecha</label>
            <input className="form-input" type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Filtrar BV</label>
            <select className="form-select" value={bvFilter} onChange={e => setBvFilter(e.target.value)}>
              <option value="">Todos</option>
              {[1,2,3,4,5,6,7].map(bv => <option key={bv} value={bv}>BV{bv}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Orden por fecha</label>
            <select className="form-select" value={dateOrder} onChange={e => setDateOrder(e.target.value)}>
              <option value="desc">Más recientes primero</option>
              <option value="asc">Más antiguas primero</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Orden por unidad</label>
            <select className="form-select" value={unitOrder} onChange={e => setUnitOrder(e.target.value)}>
              <option value="asc">Menor a mayor</option>
              <option value="desc">Mayor a menor</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setDateFilter(''); setBvFilter(''); setDateOrder('desc'); setUnitOrder('asc') }}>Limpiar</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 30, color: 'var(--mid)' }}>Cargando registros...</div>
      ) : loadError ? (
        <div className="card" style={{ padding: 20, border: '1px solid rgba(192,57,43,0.35)' }}>
          <div style={{ color: 'var(--red-l)', fontWeight: 700, marginBottom: 6 }}>No se pudieron cargar los informes</div>
          <div style={{ color: 'var(--mid)', fontSize: 12 }}>{loadError}</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={loadReports}>Reintentar</button>
        </div>
      ) : groups.length === 0 ? (
        <div className="card" style={{ padding: 30, color: 'var(--mid)' }}>No hay informes para esos filtros.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map(group => {
            const incidentsCount = group.reports.reduce((acc, r) => acc + (r.incidents?.length || 0), 0)
            const allOk = group.reports.every(r => r.is_ok)
            return (
              <div key={group.key} className="card" style={{ overflow: 'hidden' }}>
                <div className="card-header" style={{ background: allOk ? 'rgba(39,174,96,0.06)' : 'rgba(192,57,43,0.08)' }}>
                  <div>
                    <div className="card-title">BV{group.bomberoId} · {fmtDate(group.date)}</div>
                    <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>{group.reports.length} unidad(es) · {incidentsCount} incidencia(s)</div>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteGroup(group)}>Borrar bloque</button>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Unidad</th>
                      <th>Estado</th>
                      <th>Incidencias</th>
                      <th>Revisado por</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...group.reports]
                      .sort((a, b) => unitOrder === 'asc' ? a.unit_id - b.unit_id : b.unit_id - a.unit_id)
                      .map(r => (
                      <tr key={r.id}>
                        <td style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 800 }}>U{String(r.unit_id).padStart(2, '0')}</td>
                        <td>
                          <span className={`chip ${r.is_ok ? 'chip-ok' : 'chip-alert'}`}>{r.is_ok ? '✔ Correcto' : '⚠ Incidencias'}</span>
                        </td>
                        <td>{r.incidents?.length || 0}</td>
                        <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.reviewed_by || '—'}</td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditState(emptyEditState(r))}>Editar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteReport(r.id)}>Borrar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {editState && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditState(null) }} className="modal-overlay">
          <div className="modal" style={{ maxWidth: 760 }}>
            <div className="modal-header">
              <div className="modal-title">Editar informe · BV{editState.bombero_id} · U{String(editState.unit_id).padStart(2, '0')}</div>
              <button className="btn-icon" onClick={() => setEditState(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-select" value={editState.is_ok ? 'ok' : 'inc'} onChange={e => setEditState(p => ({ ...p, is_ok: e.target.value === 'ok' }))}>
                  <option value="ok">Correcto</option>
                  <option value="inc">Con incidencias</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Incidencias</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {editState.incidents.map((inc, idx) => (
                    <div key={idx} style={{ border: '1px solid var(--border2)', borderRadius: 8, padding: 10 }}>
                      <div className="form-row">
                        <input className="form-input" placeholder="Artículo" value={inc.item} onChange={e => setEditState(p => {
                          const incidents = [...p.incidents]
                          incidents[idx] = { ...incidents[idx], item: e.target.value }
                          return { ...p, incidents }
                        })} />
                        <input className="form-input" placeholder="Zona" value={inc.zone} onChange={e => setEditState(p => {
                          const incidents = [...p.incidents]
                          incidents[idx] = { ...incidents[idx], zone: e.target.value }
                          return { ...p, incidents }
                        })} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <input className="form-input" placeholder="Nota" value={inc.note} onChange={e => setEditState(p => {
                          const incidents = [...p.incidents]
                          incidents[idx] = { ...incidents[idx], note: e.target.value }
                          return { ...p, incidents }
                        })} />
                        <button className="btn btn-danger btn-sm" onClick={() => setEditState(p => {
                          const incidents = p.incidents.filter((_, i) => i !== idx)
                          return { ...p, incidents }
                        })}>Quitar</button>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditState(p => ({
                    ...p,
                    incidents: [...p.incidents, { zone: '', item: '', note: '' }]
                  }))}>
                    + Añadir incidencia
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Observaciones</label>
                <textarea className="form-input" style={{ minHeight: 100, resize: 'vertical', fontFamily: 'Barlow' }} value={editState.general_notes} onChange={e => setEditState(p => ({ ...p, general_notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditState(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
