import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

const PHOTO_NOTES_MARKER = '[[FOTOS_REVISION]]'

function parseNotesAndPhotoUrls(raw = '') {
  const txt = String(raw || '')
  const markerPos = txt.indexOf(PHOTO_NOTES_MARKER)
  if (markerPos === -1) return { notes: txt, photoUrls: [] }
  const notes = txt.slice(0, markerPos).trimEnd()
  const after = txt.slice(markerPos + PHOTO_NOTES_MARKER.length)
  const photoUrls = after
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => /^https?:\/\//i.test(s) || /^data:image\//i.test(s))
  return { notes, photoUrls }
}

function composeNotesWithPhotoUrls(notes = '', photoUrls = []) {
  const cleanNotes = String(notes || '').trim()
  const cleanUrls = (photoUrls || []).map(s => String(s || '').trim()).filter(Boolean)
  if (cleanUrls.length === 0) return cleanNotes
  return `${cleanNotes}${cleanNotes ? '\n\n' : ''}${PHOTO_NOTES_MARKER}\n${cleanUrls.join('\n')}`
}

function emptyEditState(report) {
  const parsed = parseNotesAndPhotoUrls(report.general_notes || '')
  return {
    id: report.id,
    unit_id: report.unit_id,
    bombero_id: report.bombero_id,
    report_date: report.report_date,
    reviewed_by: report.reviewed_by || '',
    is_ok: !!report.is_ok,
    general_notes: parsed.notes || '',
    photoUrls: parsed.photoUrls || [],
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

function isDraftReviewedBy(reviewedBy = '') {
  return String(reviewedBy || '').toLowerCase().startsWith('borrador:')
}

export default function RegistrosDiarios() {
  const { showToast, refreshRevisionIncidents, isAdmin, hasPermission } = useApp()
  const canEdit = hasPermission('edit')
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [bvFilter, setBvFilter] = useState('')
  const [dateOrder, setDateOrder] = useState('desc')
  const [unitOrder, setUnitOrder] = useState('asc')
  const [editState, setEditState] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [photoViewer, setPhotoViewer] = useState(null) // { urls: string[], index: number, title?: string }
  const [resolvedHistory, setResolvedHistory] = useState([])
  const [loadingResolvedHistory, setLoadingResolvedHistory] = useState(false)
  const [resolvedHistoryError, setResolvedHistoryError] = useState('')
  const [resolvedDateFilter, setResolvedDateFilter] = useState('')
  const [resolvedUnitFilter, setResolvedUnitFilter] = useState('')
  const [inventoryLog, setInventoryLog] = useState([])
  const [loadingInventoryLog, setLoadingInventoryLog] = useState(false)
  const [inventoryLogError, setInventoryLogError] = useState('')

  useEffect(() => {
    loadReports()
    loadResolvedHistory()
    loadInventoryLog()
  }, [])

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
    const visibleReports = (data || []).filter(r => r.reviewed_by !== 'unidades' && !isDraftReviewedBy(r.reviewed_by))
    setReports(visibleReports)
    setLoading(false)
  }

  async function loadResolvedHistory() {
    setLoadingResolvedHistory(true)
    setResolvedHistoryError('')
    const { data, error } = await supabase
      .from('incident_history')
      .select('id, created_at, event_type, report_date, bombero_id, unit_id, zone, item, note, source, changed_by')
      .eq('event_type', 'resolved')
      .order('created_at', { ascending: false })
      .limit(120)
    setLoadingResolvedHistory(false)
    if (error) {
      setResolvedHistoryError(error.message || 'No se pudo cargar historial de incidencias resueltas')
      return
    }
    setResolvedHistory(data || [])
  }

  async function loadInventoryLog() {
    setLoadingInventoryLog(true)
    setInventoryLogError('')
    const { data, error } = await supabase
      .from('inventory_change_log')
      .select('id, created_at, unit_id, unit_label, zone_id, item_name, change_type, detail, changed_by')
      .order('created_at', { ascending: false })
      .limit(120)
    setLoadingInventoryLog(false)
    if (error) {
      setInventoryLogError(error.message || 'No se pudo cargar el registro de inventario')
      return
    }
    setInventoryLog(data || [])
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

  const filteredResolvedHistory = useMemo(() => {
    return (resolvedHistory || []).filter(row => {
      if (resolvedDateFilter) {
        const d = row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : ''
        if (d !== resolvedDateFilter) return false
      }
      if (resolvedUnitFilter) {
        if (String(row.unit_id) !== String(resolvedUnitFilter)) return false
      }
      return true
    })
  }, [resolvedHistory, resolvedDateFilter, resolvedUnitFilter])

  async function saveEdit() {
    if (!canEdit) {
      showToast('Solo lectura: no puedes editar informes', 'warn')
      return
    }
    if (!editState) return
    setSaving(true)
    const payload = {
      is_ok: editState.is_ok,
      general_notes: composeNotesWithPhotoUrls(editState.general_notes || '', editState.photoUrls || []),
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
    if (!canEdit) {
      showToast('Solo lectura: no puedes borrar informes', 'warn')
      return
    }
    const ok = window.confirm('¿Seguro que quieres borrar este informe?')
    if (!ok) return
    const { error } = await supabase.from('revision_reports').delete().eq('id', reportId)
    if (error) {
      showToast('No se pudo borrar', 'error')
      return
    }
    showToast('Informe borrado', 'warn')
    await loadReports()
    await loadResolvedHistory()
    await loadInventoryLog()
    await refreshRevisionIncidents()
  }

  async function deleteGroup(group) {
    if (!canEdit) {
      showToast('Solo lectura: no puedes borrar bloques', 'warn')
      return
    }
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
    await loadResolvedHistory()
    await loadInventoryLog()
    await refreshRevisionIncidents()
  }

  async function deleteAllReports() {
    if (!isAdmin) return
    const ok = window.confirm('¿Borrar TODOS los informes de revisión? Esta acción no se puede deshacer.')
    if (!ok) return
    setDeletingAll(true)
    try {
      // Ruta principal: RPC server-side (evita límites del cliente y problemas de lotes).
      const { data: rpcDeleted, error: rpcErr } = await supabase.rpc('admin_clear_revision_reports')
      let usedFallback = false

      // Fallback por si no existe la función aún en Supabase.
      if (rpcErr) {
        usedFallback = true
        const batchSize = 500
        for (let i = 0; i < 40; i++) {
          const { data: batch, error: fetchErr } = await supabase
            .from('revision_reports')
            .select('id')
            .or('reviewed_by.is.null,reviewed_by.neq.unidades')
            .limit(batchSize)
          if (fetchErr) throw fetchErr
          const ids = (batch || []).map(r => r.id).filter(Boolean)
          if (ids.length === 0) break
          const { error: delErr } = await supabase
            .from('revision_reports')
            .delete()
            .in('id', ids)
          if (delErr) throw delErr
        }
      }

      // Verificación final: no debe quedar nada visible.
      const { count: stillVisible, error: verifyErr } = await supabase
        .from('revision_reports')
        .select('id', { count: 'exact', head: true })
        .or('reviewed_by.is.null,reviewed_by.neq.unidades')
      if (verifyErr) throw verifyErr
      if (stillVisible > 0) {
        showToast(`No se limpiaron todos los informes (${stillVisible} restantes)`, 'error')
      } else {
        const msg = usedFallback
          ? 'Todos los informes borrados (modo compatible)'
          : `Todos los informes han sido borrados (${Number(rpcDeleted || 0)})`
        showToast(msg, 'warn')
      }

      setDateFilter('')
      setBvFilter('')
      setReports([])
    } catch (err) {
      const msg = err?.message || 'desconocido'
      showToast(`No se pudo borrar todo: ${msg}`, 'error')
    } finally {
      setDeletingAll(false)
      await loadReports()
      await loadResolvedHistory()
      await loadInventoryLog()
      await refreshRevisionIncidents()
    }
  }

  function openPhotoViewer(urls = [], title = 'Foto') {
    const clean = (urls || []).filter(Boolean)
    if (!clean.length) return
    setPhotoViewer({ urls: clean, index: 0, title })
  }

  return (
    <div className="animate-in page-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>🗂️ Registros diarios</div>
          <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 3 }}>Informes guardados por fecha y bombero. Puedes editar o borrar.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={loadReports}>↻ Recargar</button>
          {isAdmin && canEdit && (
            <button className="btn btn-danger btn-sm" onClick={deleteAllReports} disabled={deletingAll}>
              {deletingAll ? 'Borrando...' : 'Borrar todo'}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="registros-filters">
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

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
              Registro de cambios de inventario
            </div>
            <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 4 }}>
              Cualquier alta, baja, edición o cambio de cantidad queda guardado aquí.
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadInventoryLog}>↻ Recargar inventario</button>
        </div>

        {loadingInventoryLog ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>Cargando cambios de inventario...</div>
        ) : inventoryLogError ? (
          <div style={{ color: 'var(--red-l)', fontSize: 13 }}>
            Error: {inventoryLogError}. Ejecuta `inventory-change-log.sql` en Supabase.
          </div>
        ) : inventoryLog.length === 0 ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>Aún no hay cambios de inventario registrados.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Unidad</th>
                  <th>Zona</th>
                  <th>Artículo</th>
                  <th>Cambio</th>
                  <th>Detalle</th>
                  <th>Por</th>
                </tr>
              </thead>
              <tbody>
                {inventoryLog.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                      {row.created_at ? new Date(row.created_at).toLocaleString('es-ES') : '—'}
                    </td>
                    <td style={{ fontFamily: 'Barlow Condensed', fontSize: 15, fontWeight: 800 }}>
                      {row.unit_label || `U${String(row.unit_id || '').padStart(2, '0')}`}
                    </td>
                    <td>{row.zone_id || '—'}</td>
                    <td>{row.item_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{row.change_type || '—'}</td>
                    <td style={{ fontSize: 12 }}>{row.detail || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{row.changed_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
              Historial de incidencias resueltas
            </div>
            <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 4 }}>
              Aunque una incidencia ya no esté activa, queda registrada como resuelta.
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadResolvedHistory}>↻ Recargar historial</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px auto', gap: 10, marginBottom: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Filtrar por fecha resuelta</label>
            <input
              className="form-input"
              type="date"
              value={resolvedDateFilter}
              onChange={e => setResolvedDateFilter(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Unidad</label>
            <input
              className="form-input"
              type="number"
              min="0"
              placeholder="Ej: 19"
              value={resolvedUnitFilter}
              onChange={e => setResolvedUnitFilter(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setResolvedDateFilter(''); setResolvedUnitFilter('') }}
            >
              Limpiar
            </button>
          </div>
        </div>

        {loadingResolvedHistory ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>Cargando historial...</div>
        ) : resolvedHistoryError ? (
          <div style={{ color: 'var(--red-l)', fontSize: 13 }}>
            Error: {resolvedHistoryError}. Ejecuta `incident-history.sql` en Supabase.
          </div>
        ) : filteredResolvedHistory.length === 0 ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>Todavía no hay incidencias resueltas registradas.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Resuelta</th>
                  <th>Estado</th>
                  <th>Unidad</th>
                  <th>Zona</th>
                  <th>Artículo</th>
                  <th>Origen</th>
                  <th>Por</th>
                </tr>
              </thead>
              <tbody>
                {filteredResolvedHistory.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                      {row.created_at ? new Date(row.created_at).toLocaleString('es-ES') : '—'}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: 0.7,
                          textTransform: 'uppercase',
                          color: '#ffb55e',
                          background: 'rgba(230,126,34,0.16)',
                          border: '1px solid rgba(230,126,34,0.45)',
                        }}
                      >
                        Incidencia resuelta
                      </span>
                    </td>
                    <td style={{ fontFamily: 'Barlow Condensed', fontSize: 15, fontWeight: 800 }}>
                      U{String(row.unit_id).padStart(2, '0')}
                    </td>
                    <td>{row.zone || '—'}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.item || '—'}</div>
                      {row.note ? <div style={{ fontSize: 11, color: 'var(--mid)' }}>{row.note}</div> : null}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{row.source || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{row.changed_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                  {canEdit ? (
                    <button className="btn btn-danger btn-sm" onClick={() => deleteGroup(group)}>Borrar bloque</button>
                  ) : (
                    <span className="chip chip-gray">Solo lectura</span>
                  )}
                </div>
                <div className="table-wrap"><table className="table">
                  <thead>
                    <tr>
                      <th>Unidad</th>
                      <th>Estado</th>
                      <th>Incidencias</th>
                      <th>Fotos</th>
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
                        <td>
                          {(() => {
                            const urls = parseNotesAndPhotoUrls(r.general_notes || '').photoUrls
                            if (!urls.length) return 0
                            return (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => openPhotoViewer(urls, `BV${r.bombero_id} · U${String(r.unit_id).padStart(2, '0')}`)}
                              >
                                Ver ({urls.length})
                              </button>
                            )
                          })()}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.reviewed_by || '—'}</td>
                        <td className="reg-row-actions" style={{ display: 'flex', gap: 6 }}>
                          {canEdit ? (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditState(emptyEditState(r))}>Editar</button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteReport(r.id)}>Borrar</button>
                            </>
                          ) : (
                            <span className="chip chip-gray">Solo lectura</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )
          })}
        </div>
      )}

      {editState && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditState(null) }} className="modal-overlay" style={{ alignItems: 'center', paddingTop: 20 }}>
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
              {(editState.photoUrls || []).length > 0 && (
                <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
                  <label className="form-label">Fotos adjuntas</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))', gap: 8 }}>
                    {(editState.photoUrls || []).map((url, idx) => (
                      <div key={`photo-${idx}`} style={{ position: 'relative', border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}>
                        <button
                          onClick={() => openPhotoViewer(editState.photoUrls || [], `BV${editState.bombero_id} · U${String(editState.unit_id).padStart(2, '0')}`)}
                          title="Ver foto"
                          style={{ all: 'unset', cursor: 'zoom-in', display: 'block', width: '100%' }}
                        >
                          <img src={url} alt={`Foto ${idx + 1}`} style={{ width: '100%', height: 66, objectFit: 'cover', display: 'block' }} />
                        </button>
                        <button
                          className="btn-icon"
                          style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, fontSize: 11, background: 'rgba(0,0,0,0.65)' }}
                          onClick={() => setEditState(p => ({ ...p, photoUrls: (p.photoUrls || []).filter((_, i) => i !== idx) }))}
                          title="Quitar foto"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditState(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}

      {photoViewer && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setPhotoViewer(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 260, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 20 }}
        >
          <div style={{ width: '100%', maxWidth: 1100 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ color: 'var(--light)', fontFamily: 'Barlow Condensed', fontSize: 20 }}>{photoViewer.title || 'Foto de revisión'}</div>
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
