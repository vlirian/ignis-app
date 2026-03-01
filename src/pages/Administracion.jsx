import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/AppContext'
import { supabase } from '../lib/supabase'

export default function Administracion() {
  const { isAdmin, session, revisionIncidents, clearAllIncidents, showToast, role, refreshRevisionIncidents, configs, bvUnits: assignedBvUnits, assignUnitToBombero } = useApp()
  const [working, setWorking] = useState(false)
  const [requests, setRequests] = useState([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [requestsError, setRequestsError] = useState('')
  const [processingId, setProcessingId] = useState(null)
  const [roles, setRoles] = useState([])
  const [loadingRoles, setLoadingRoles] = useState(false)
  const [rolesError, setRolesError] = useState('')
  const [roleDrafts, setRoleDrafts] = useState({})
  const [roleActionLoading, setRoleActionLoading] = useState(false)
  const [newRoleForm, setNewRoleForm] = useState({ email: '', role: 'lector' })
  const [reviewGroups, setReviewGroups] = useState([])
  const [archivedReviewGroups, setArchivedReviewGroups] = useState([])
  const [loadingReviewGroups, setLoadingReviewGroups] = useState(false)
  const [reviewGroupsError, setReviewGroupsError] = useState('')
  const [reviewActionLoading, setReviewActionLoading] = useState(false)
  const [accessLogs, setAccessLogs] = useState([])
  const [loadingAccessLogs, setLoadingAccessLogs] = useState(false)
  const [accessLogsError, setAccessLogsError] = useState('')
  const [incidentRecipients, setIncidentRecipients] = useState([])
  const [loadingIncidentRecipients, setLoadingIncidentRecipients] = useState(false)
  const [incidentRecipientsError, setIncidentRecipientsError] = useState('')
  const [incidentRecipientDraft, setIncidentRecipientDraft] = useState('estudiovic@gmail.com')
  const [incidentRecipientSaving, setIncidentRecipientSaving] = useState(false)
  const [incidentEmailToggleSaving, setIncidentEmailToggleSaving] = useState(false)
  const [assignmentSavingUnit, setAssignmentSavingUnit] = useState(null)

  const ROLE_OPTIONS = ['admin', 'operador', 'lector']

  const uniqueCount = useMemo(() => {
    const map = new Map()
    ;(revisionIncidents || []).forEach(inc => {
      const key = `${inc.unitId}|${String(inc.zone || '').trim().toLowerCase()}|${String(inc.item || '').trim().toLowerCase()}`
      if (!map.has(key)) map.set(key, true)
    })
    return map.size
  }, [revisionIncidents])

  const pendingCount = useMemo(
    () => (requests || []).filter(r => r.status === 'pending').length,
    [requests]
  )
  const incidentEmailEnabled = useMemo(
    () => (incidentRecipients || []).some(r => r.enabled),
    [incidentRecipients]
  )

  const activeUnits = useMemo(
    () => Object.keys(configs || {})
      .map(Number)
      .filter(Number.isFinite)
      .filter(id => configs[id]?.isActive !== false)
      .sort((a, b) => a - b),
    [configs]
  )

  const unitToBombero = useMemo(() => {
    const map = {}
    Object.entries(assignedBvUnits || {}).forEach(([rawBv, units]) => {
      const bv = Number(rawBv)
      ;(units || []).forEach((u) => {
        map[Number(u)] = bv
      })
    })
    return map
  }, [assignedBvUnits])

  useEffect(() => {
    if (!isAdmin) return
    loadRequests()
    loadRoles()
    loadReviewGroups()
    loadAccessLogs()
    loadIncidentRecipients()
  }, [isAdmin])

  function groupByDateAndBombero(rows = []) {
    const map = {}
    rows.forEach(r => {
      const key = `${r.report_date}__${r.bombero_id}`
      if (!map[key]) {
        map[key] = {
          key,
          date: r.report_date,
          bomberoId: r.bombero_id,
          reports: [],
        }
      }
      map[key].reports.push(r)
    })
    return Object.values(map).sort((a, b) => {
      if (a.date === b.date) return a.bomberoId - b.bomberoId
      return a.date < b.date ? 1 : -1
    })
  }

  async function loadRequests() {
    setLoadingRequests(true)
    setRequestsError('')
    const { data, error } = await supabase
      .from('access_requests')
      .select('*')
      .order('created_at', { ascending: false })
    setLoadingRequests(false)
    if (error) {
      setRequestsError(error.message || 'No se pudo cargar')
      return
    }
    setRequests(data || [])
  }

  async function updateRequestStatus(request, status) {
    setProcessingId(request.id)
    const { error } = await supabase
      .from('access_requests')
      .update({
        status,
        reviewed_by: session?.user?.email || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', request.id)
    if (!error && status === 'approved') {
      const email = String(request.email || '').trim().toLowerCase()
      if (email) {
        const { data: existing } = await supabase
          .from('user_roles')
          .select('email')
          .eq('email', email)
          .maybeSingle()
        if (!existing) {
          await supabase
            .from('user_roles')
            .upsert({
              email,
              role: 'lector',
              updated_by: session?.user?.email || null,
            }, { onConflict: 'email' })
        }
      }
    }
    setProcessingId(null)
    if (error) {
      showToast('No se pudo actualizar la solicitud', 'error')
      return
    }
    showToast(status === 'approved' ? 'Solicitud aprobada' : 'Solicitud rechazada', 'ok')
    await loadRequests()
    await loadRoles()
  }

  async function loadRoles() {
    setLoadingRoles(true)
    setRolesError('')
    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .order('email', { ascending: true })
    setLoadingRoles(false)
    if (error) {
      setRolesError(error.message || 'No se pudo cargar roles')
      return
    }
    setRoles(data || [])
    setRoleDrafts(
      Object.fromEntries((data || []).map(r => [r.email, r.role]))
    )
  }

  async function loadAccessLogs() {
    setLoadingAccessLogs(true)
    setAccessLogsError('')
    const { data, error } = await supabase
      .from('access_logs')
      .select('id, created_at, event_type, email, user_id, user_agent, metadata')
      .order('created_at', { ascending: false })
      .limit(300)
    setLoadingAccessLogs(false)
    if (error) {
      setAccessLogsError(error.message || 'No se pudo cargar el registro de accesos')
      return
    }
    setAccessLogs(data || [])
  }

  async function loadIncidentRecipients() {
    setLoadingIncidentRecipients(true)
    setIncidentRecipientsError('')
    const { data, error } = await supabase
      .from('incident_email_recipients')
      .select('email, enabled, updated_at')
      .order('email', { ascending: true })
    setLoadingIncidentRecipients(false)
    if (error) {
      setIncidentRecipientsError(error.message || 'No se pudo cargar destinatarios')
      return
    }
    const rows = data || []
    setIncidentRecipients(rows)
    const firstEnabled = rows.find(r => r.enabled)
    setIncidentRecipientDraft(firstEnabled?.email || rows[0]?.email || 'estudiovic@gmail.com')
  }

  async function saveIncidentRecipient() {
    const email = String(incidentRecipientDraft || '').trim().toLowerCase()
    if (!email) {
      showToast('Indica un email de destinatario', 'warn')
      return
    }
    setIncidentRecipientSaving(true)
    // Desactivar todos y activar solo el seleccionado
    const { error: disableErr } = await supabase
      .from('incident_email_recipients')
      .update({ enabled: false })
      .neq('email', '')
    if (disableErr) {
      setIncidentRecipientSaving(false)
      showToast(`No se pudo actualizar destinatario: ${disableErr.message || 'error'}`, 'error')
      return
    }
    const { error: upsertErr } = await supabase
      .from('incident_email_recipients')
      .upsert({
        email,
        enabled: true,
        updated_by: session?.user?.email || null,
      }, { onConflict: 'email' })
    setIncidentRecipientSaving(false)
    if (upsertErr) {
      showToast(`No se pudo guardar destinatario: ${upsertErr.message || 'error'}`, 'error')
      return
    }
    showToast('Destinatario de incidencias guardado', 'ok')
    await loadIncidentRecipients()
  }

  async function setIncidentEmailSending(enabled) {
    setIncidentEmailToggleSaving(true)
    if (!enabled) {
      const { error } = await supabase
        .from('incident_email_recipients')
        .update({ enabled: false })
        .neq('email', '')
      setIncidentEmailToggleSaving(false)
      if (error) {
        showToast(`No se pudo desactivar el envío: ${error.message || 'error'}`, 'error')
        return
      }
      showToast('Envío de emails desactivado', 'warn')
      await loadIncidentRecipients()
      return
    }

    const email = String(incidentRecipientDraft || '').trim().toLowerCase()
    if (!email) {
      setIncidentEmailToggleSaving(false)
      showToast('Indica un email para activar el envío', 'warn')
      return
    }

    const { error: disableErr } = await supabase
      .from('incident_email_recipients')
      .update({ enabled: false })
      .neq('email', '')
    if (disableErr) {
      setIncidentEmailToggleSaving(false)
      showToast(`No se pudo activar el envío: ${disableErr.message || 'error'}`, 'error')
      return
    }

    const { error: upsertErr } = await supabase
      .from('incident_email_recipients')
      .upsert({
        email,
        enabled: true,
        updated_by: session?.user?.email || null,
      }, { onConflict: 'email' })
    setIncidentEmailToggleSaving(false)
    if (upsertErr) {
      showToast(`No se pudo activar el envío: ${upsertErr.message || 'error'}`, 'error')
      return
    }
    showToast('Envío de emails activado', 'ok')
    await loadIncidentRecipients()
  }

  async function onAssignUnit(unitId, nextBomberoId) {
    setAssignmentSavingUnit(unitId)
    const res = await assignUnitToBombero(unitId, nextBomberoId)
    setAssignmentSavingUnit(null)
    if (!res?.ok) {
      showToast(`No se pudo reasignar unidad: ${res?.error || 'error'}`, 'error')
      return
    }
    showToast(`U${String(unitId).padStart(2, '0')} asignada a BV${nextBomberoId}`, 'ok')
  }

  async function loadReviewGroups() {
    setLoadingReviewGroups(true)
    setReviewGroupsError('')

    const { data: activeData, error: activeErr } = await supabase
      .from('revision_reports')
      .select('id, report_date, bombero_id, unit_id, is_ok, incidents, general_notes, reviewed_by, created_at')
      .order('report_date', { ascending: false })

    if (activeErr) {
      setLoadingReviewGroups(false)
      setReviewGroupsError(activeErr.message || 'No se pudo cargar revisiones')
      return
    }

    const { data: archivedData, error: archivedErr } = await supabase
      .from('revision_reports_archive')
      .select('id, original_id, report_date, bombero_id, unit_id, is_ok, incidents, general_notes, reviewed_by, created_at, deleted_at, deleted_by')
      .order('deleted_at', { ascending: false })

    setLoadingReviewGroups(false)
    if (archivedErr) {
      setReviewGroupsError(`Activas cargadas, pero falta archivo de restauración: ${archivedErr.message}`)
      setReviewGroups(groupByDateAndBombero(activeData || []))
      setArchivedReviewGroups([])
      return
    }

    setReviewGroups(groupByDateAndBombero(activeData || []))
    setArchivedReviewGroups(groupByDateAndBombero(archivedData || []))
  }

  async function archiveAndDeleteGroup(group) {
    const ok = window.confirm(`Se borrarán las revisiones de BV${group.bomberoId} del ${group.date} y se moverán a archivo para poder restaurarlas. ¿Continuar?`)
    if (!ok) return
    const rows = group.reports || []
    if (rows.length === 0) return

    setReviewActionLoading(true)
    const archivePayload = rows.map(r => ({
      original_id: r.id,
      report_date: r.report_date,
      bombero_id: r.bombero_id,
      unit_id: r.unit_id,
      is_ok: r.is_ok,
      incidents: r.incidents || [],
      general_notes: r.general_notes || '',
      reviewed_by: r.reviewed_by || null,
      created_at: r.created_at || null,
      deleted_by: session?.user?.email || null,
    }))

    const { error: archiveErr } = await supabase
      .from('revision_reports_archive')
      .insert(archivePayload)

    if (archiveErr) {
      const forceDelete = window.confirm(
        `No se pudo archivar (${archiveErr.message || 'error'}).\n\n¿Quieres borrar igualmente sin posibilidad de restaurar?`
      )
      if (!forceDelete) {
        setReviewActionLoading(false)
        showToast('Borrado cancelado. No se eliminó ninguna revisión.', 'warn')
        return
      }
    }

    const ids = rows.map(r => r.id)
    const { error: deleteErr } = await supabase
      .from('revision_reports')
      .delete()
      .in('id', ids)

    setReviewActionLoading(false)
    if (deleteErr) {
      showToast(`No se pudo borrar: ${deleteErr.message || 'error'}`, 'error')
      return
    }

    showToast('Revisiones archivadas y borradas. Se deberán revisar de nuevo.', 'warn')
    await refreshRevisionIncidents()
    await loadReviewGroups()
  }

  async function restoreArchivedGroup(group) {
    const ok = window.confirm(`Se restaurarán revisiones archivadas de BV${group.bomberoId} del ${group.date}. ¿Continuar?`)
    if (!ok) return
    const rows = group.reports || []
    if (rows.length === 0) return

    setReviewActionLoading(true)
    for (const row of rows) {
      const { error: upsertErr } = await supabase
        .from('revision_reports')
        .upsert({
          report_date: row.report_date,
          bombero_id: row.bombero_id,
          unit_id: row.unit_id,
          is_ok: row.is_ok,
          incidents: row.incidents || [],
          general_notes: row.general_notes || '',
          reviewed_by: row.reviewed_by || null,
        }, { onConflict: 'report_date,bombero_id,unit_id' })
      if (upsertErr) {
        setReviewActionLoading(false)
        showToast(`No se pudo restaurar: ${upsertErr.message || 'error'}`, 'error')
        return
      }
    }

    const archiveIds = rows.map(r => r.id)
    const { error: cleanErr } = await supabase
      .from('revision_reports_archive')
      .delete()
      .in('id', archiveIds)

    setReviewActionLoading(false)
    if (cleanErr) {
      showToast(`Restaurado, pero no se pudo limpiar archivo: ${cleanErr.message || 'error'}`, 'warn')
    } else {
      showToast('Revisiones restauradas correctamente', 'ok')
    }

    await refreshRevisionIncidents()
    await loadReviewGroups()
  }

  async function saveRoleForEmail(email) {
    const normalized = String(email || '').trim().toLowerCase()
    const nextRole = roleDrafts[normalized]
    if (!normalized || !nextRole) return
    setRoleActionLoading(true)
    const { error } = await supabase
      .from('user_roles')
      .upsert({
        email: normalized,
        role: nextRole,
        updated_by: session?.user?.email || null,
      }, { onConflict: 'email' })
    setRoleActionLoading(false)
    if (error) {
      showToast('No se pudo guardar el rol', 'error')
      return
    }
    showToast('Rol actualizado', 'ok')
    await loadRoles()
  }

  async function addOrUpdateRole() {
    const email = newRoleForm.email.trim().toLowerCase()
    if (!email) {
      showToast('Introduce un email', 'warn')
      return
    }
    setRoleActionLoading(true)
    const { error } = await supabase
      .from('user_roles')
      .upsert({
        email,
        role: newRoleForm.role,
        updated_by: session?.user?.email || null,
      }, { onConflict: 'email' })
    setRoleActionLoading(false)
    if (error) {
      showToast('No se pudo asignar el rol', 'error')
      return
    }
    showToast('Rol asignado', 'ok')
    setNewRoleForm({ email: '', role: 'lector' })
    await loadRoles()
  }

  async function handleClearAll() {
    const ok = window.confirm('¿Seguro que quieres borrar TODAS las incidencias activas? Esta acción afecta a todos los informes.')
    if (!ok) return
    setWorking(true)
    const result = await clearAllIncidents()
    setWorking(false)
    if (!result?.ok) {
      showToast('No se pudieron borrar todas las incidencias', 'error')
      return
    }
    showToast('Todas las incidencias han sido borradas', 'ok')
  }

  if (!isAdmin) {
    return (
      <div className="animate-in page-container">
        <div className="card" style={{ padding: 24, border: '1px solid rgba(192,57,43,0.35)' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 22, fontWeight: 800, color: 'var(--red-l)', marginBottom: 8 }}>
            Acceso restringido
          </div>
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>
            Tu usuario (<strong style={{ color: 'var(--light)' }}>{session?.user?.email || 'sin email'}</strong>) no tiene permisos de administración.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in page-container">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>🛡️ Administración</div>
        <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 3 }}>
          Herramientas de mantenimiento global de incidencias.
        </div>
        <div style={{ fontSize: 12, color: 'var(--light)', marginTop: 6 }}>
          Tu rol actual: <strong style={{ textTransform: 'uppercase' }}>{role}</strong>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
          Estado actual
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--panel)' }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 26, fontWeight: 900, color: 'var(--red-l)' }}>{uniqueCount}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)' }}>Incidencias activas</div>
          </div>
          <div style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--panel)' }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 26, fontWeight: 900, color: pendingCount > 0 ? 'var(--yellow-l)' : 'var(--green-l)' }}>{pendingCount}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)' }}>Solicitudes pendientes</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, border: '1px solid rgba(192,57,43,0.35)' }}>
        <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
          Acción global
        </div>
        <div style={{ fontSize: 13, color: 'var(--light)', marginBottom: 14 }}>
          Borra todas las incidencias de los informes de revisión y limpia Alertas/Banner.
        </div>
        <button className="btn btn-danger" onClick={handleClearAll} disabled={working}>
          {working ? 'Borrando...' : 'Borrar todas las incidencias'}
        </button>
      </div>

      <div className="card" style={{ padding: 20, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
              Asignación de unidades en revisión diaria
            </div>
            <div style={{ fontSize: 13, color: 'var(--light)', marginTop: 6 }}>
              Un administrador puede cambiar qué bombero (BV) revisa cada unidad.
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Unidad</th>
                <th>Asignada a</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeUnits.map((unitId) => {
                const currentBv = unitToBombero[unitId] || 1
                const busy = assignmentSavingUnit === unitId
                return (
                  <tr key={`assign-${unitId}`}>
                    <td style={{ fontFamily: 'Barlow Condensed', fontSize: 20, fontWeight: 800 }}>
                      U{String(unitId).padStart(2, '0')}
                    </td>
                    <td style={{ width: 220 }}>
                      <select
                        className="form-select"
                        disabled={busy}
                        value={currentBv}
                        onChange={(e) => onAssignUnit(unitId, Number(e.target.value))}
                      >
                        {[1, 2, 3, 4, 5, 6, 7].map((bv) => (
                          <option key={`bv-${unitId}-${bv}`} value={bv}>BV{bv}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                      {busy ? 'Guardando...' : 'Activo'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
              Accesos
            </div>
            <div style={{ fontSize: 13, color: 'var(--light)', marginTop: 6 }}>
              Solicitudes enviadas desde el login. Solo administradores pueden aprobar o rechazar.
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadRequests}>↻ Recargar</button>
        </div>

        {loadingRequests ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>Cargando solicitudes...</div>
        ) : requestsError ? (
          <div style={{ color: 'var(--red-l)', fontSize: 13 }}>
            Error: {requestsError}. Crea la tabla `access_requests` en Supabase.
          </div>
        ) : requests.length === 0 ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>No hay solicitudes.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Notas</th>
                  <th>Estado</th>
                  <th>Revisión</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('es-ES') : '—'}
                    </td>
                    <td>{r.full_name || '—'}</td>
                    <td>{r.email}</td>
                    <td style={{ maxWidth: 260, fontSize: 12, color: 'var(--mid)' }}>{r.notes || '—'}</td>
                    <td>
                      <span className={`chip ${
                        r.status === 'approved' ? 'chip-ok'
                          : r.status === 'rejected' ? 'chip-alert'
                            : 'chip-warn'
                      }`}>
                        {r.status === 'approved' ? 'Aprobada' : r.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--mid)' }}>
                      {r.reviewed_by ? `${r.reviewed_by}` : 'Sin revisar'}
                    </td>
                    <td style={{ minWidth: 170 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-sm"
                          style={{ background: 'var(--green)', color: 'white' }}
                          disabled={processingId === r.id || r.status === 'approved'}
                          onClick={() => updateRequestStatus(r, 'approved')}
                        >
                          Aprobar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={processingId === r.id || r.status === 'rejected'}
                          onClick={() => updateRequestStatus(r, 'rejected')}
                        >
                          Rechazar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
              Notificación de incidencias por email
            </div>
            <div style={{ fontSize: 13, color: 'var(--light)', marginTop: 6 }}>
              Cuando un bombero finaliza la revisión y hay incidencias, se envía un aviso al correo activo.
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadIncidentRecipients}>↻ Recargar</button>
        </div>

        {loadingIncidentRecipients ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>Cargando destinatarios...</div>
        ) : incidentRecipientsError ? (
          <div style={{ color: 'var(--red-l)', fontSize: 13 }}>
            Error: {incidentRecipientsError}. Ejecuta `incident-email-notifications.sql` y despliega la función `send-review-incidents-email`.
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <span className={`chip ${incidentEmailEnabled ? 'chip-ok' : 'chip-warn'}`}>
                {incidentEmailEnabled ? 'Envío ACTIVO' : 'Envío DESACTIVADO'}
              </span>
              <button
                className={`btn btn-sm ${incidentEmailEnabled ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => setIncidentEmailSending(!incidentEmailEnabled)}
                disabled={incidentEmailToggleSaving}
              >
                {incidentEmailToggleSaving
                  ? 'Guardando...'
                  : incidentEmailEnabled
                    ? 'Desactivar envío de email'
                    : 'Activar envío de email'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end', marginBottom: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Email administrador destinatario</label>
                <input
                  className="form-input"
                  type="email"
                  value={incidentRecipientDraft}
                  onChange={e => setIncidentRecipientDraft(e.target.value)}
                  placeholder="admin@dominio.com"
                />
              </div>
              <button className="btn btn-primary btn-sm" onClick={saveIncidentRecipient} disabled={incidentRecipientSaving}>
                {incidentRecipientSaving ? 'Guardando...' : 'Guardar destinatario'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--mid)' }}>
              Destinatario activo:{' '}
              <strong style={{ color: 'var(--light)' }}>
                {(incidentRecipients.find(r => r.enabled)?.email) || 'Sin destinatario activo'}
              </strong>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
              Registro de accesos
            </div>
            <div style={{ fontSize: 13, color: 'var(--light)', marginTop: 6 }}>
              Auditoría de entradas/salidas de sesión. Solo visible para administradores.
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadAccessLogs}>↻ Recargar</button>
        </div>

        {loadingAccessLogs ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>Cargando accesos...</div>
        ) : accessLogsError ? (
          <div style={{ color: 'var(--red-l)', fontSize: 13 }}>
            Error: {accessLogsError}. Ejecuta `access-logs.sql` en Supabase.
          </div>
        ) : accessLogs.length === 0 ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>No hay eventos de acceso aún.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Evento</th>
                  <th>Email</th>
                  <th>Ruta</th>
                  <th>Navegador</th>
                </tr>
              </thead>
              <tbody>
                {accessLogs.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                      {row.created_at ? new Date(row.created_at).toLocaleString('es-ES') : '—'}
                    </td>
                    <td>
                      <span className={`chip ${
                        row.event_type === 'login' ? 'chip-ok'
                          : row.event_type === 'logout' ? 'chip-warn'
                            : 'chip-gray'
                      }`}>
                        {row.event_type || 'evento'}
                      </span>
                    </td>
                    <td>{row.email || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                      {row?.metadata?.path || '—'}
                    </td>
                    <td style={{ maxWidth: 340, fontSize: 11, color: 'var(--mid)', whiteSpace: 'normal' }}>
                      {row.user_agent || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
              Revisiones diarias
            </div>
            <div style={{ fontSize: 13, color: 'var(--light)', marginTop: 6 }}>
              Puedes borrar bloques de revisión para forzar nueva revisión. Se guardan en archivo para poder restaurarlas.
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadReviewGroups}>↻ Recargar</button>
        </div>

        {loadingReviewGroups ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>Cargando revisiones...</div>
        ) : reviewGroupsError ? (
          <div style={{ color: 'var(--red-l)', fontSize: 13 }}>
            {reviewGroupsError}. Ejecuta `roles-permissions.sql` y crea también `revision_reports_archive`.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>
                Revisiones activas
              </div>
              {reviewGroups.length === 0 ? (
                <div style={{ color: 'var(--mid)', fontSize: 13 }}>No hay revisiones activas.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reviewGroups.map(g => (
                    <div key={`active-${g.key}`} className="card" style={{ padding: 10, background: 'var(--panel)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 800 }}>
                            BV{g.bomberoId} · {new Date(g.date + 'T12:00:00').toLocaleDateString('es-ES')}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--mid)' }}>
                            {g.reports.length} unidad(es) · {g.reports.reduce((acc, r) => acc + (r.incidents?.length || 0), 0)} incidencia(s)
                          </div>
                        </div>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={reviewActionLoading}
                          onClick={() => archiveAndDeleteGroup(g)}
                        >
                          Borrar (archivar)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>
                Archivo (restaurables)
              </div>
              {archivedReviewGroups.length === 0 ? (
                <div style={{ color: 'var(--mid)', fontSize: 13 }}>No hay revisiones archivadas.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {archivedReviewGroups.map(g => (
                    <div key={`arch-${g.key}`} className="card" style={{ padding: 10, background: 'var(--panel)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 800 }}>
                            BV{g.bomberoId} · {new Date(g.date + 'T12:00:00').toLocaleDateString('es-ES')}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--mid)' }}>
                            {g.reports.length} unidad(es) archivadas
                          </div>
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={reviewActionLoading}
                          onClick={() => restoreArchivedGroup(g)}
                        >
                          Restaurar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 20, marginTop: 14 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
            Roles y permisos
          </div>
          <div style={{ fontSize: 13, color: 'var(--light)', marginTop: 6 }}>
            Jerarquía: <strong>admin</strong> (gestiona todo), <strong>operador</strong> (opera material), <strong>lector</strong> (solo lectura).
          </div>
        </div>

        <div className="card" style={{ padding: 12, marginBottom: 12, background: 'var(--panel)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px auto', gap: 10, alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                value={newRoleForm.email}
                onChange={e => setNewRoleForm(p => ({ ...p, email: e.target.value }))}
                placeholder="usuario@dominio.com"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Rol</label>
              <select
                className="form-select"
                value={newRoleForm.role}
                onChange={e => setNewRoleForm(p => ({ ...p, role: e.target.value }))}
              >
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={addOrUpdateRole} disabled={roleActionLoading}>
              Asignar rol
            </button>
          </div>
        </div>

        {loadingRoles ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>Cargando roles...</div>
        ) : rolesError ? (
          <div style={{ color: 'var(--red-l)', fontSize: 13 }}>
            Error: {rolesError}. Crea la tabla `user_roles` en Supabase.
          </div>
        ) : roles.length === 0 ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>No hay roles asignados.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Actualizado por</th>
                  <th>Fecha</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {roles.map(r => (
                  <tr key={r.email}>
                    <td>{r.email}</td>
                    <td style={{ minWidth: 180 }}>
                      <select
                        className="form-select"
                        value={roleDrafts[r.email] || r.role}
                        onChange={e => setRoleDrafts(prev => ({ ...prev, [r.email]: e.target.value }))}
                      >
                        {ROLE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.updated_by || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                      {r.updated_at ? new Date(r.updated_at).toLocaleString('es-ES') : '—'}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={roleActionLoading}
                        onClick={() => saveRoleForEmail(r.email)}
                      >
                        Guardar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
