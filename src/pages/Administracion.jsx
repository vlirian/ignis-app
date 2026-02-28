import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/AppContext'
import { supabase } from '../lib/supabase'

export default function Administracion() {
  const { isAdmin, session, revisionIncidents, clearAllIncidents, showToast } = useApp()
  const [working, setWorking] = useState(false)
  const [requests, setRequests] = useState([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [requestsError, setRequestsError] = useState('')
  const [processingId, setProcessingId] = useState(null)

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

  useEffect(() => {
    if (!isAdmin) return
    loadRequests()
  }, [isAdmin])

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

  async function updateRequestStatus(requestId, status) {
    setProcessingId(requestId)
    const { error } = await supabase
      .from('access_requests')
      .update({
        status,
        reviewed_by: session?.user?.email || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
    setProcessingId(null)
    if (error) {
      showToast('No se pudo actualizar la solicitud', 'error')
      return
    }
    showToast(status === 'approved' ? 'Solicitud aprobada' : 'Solicitud rechazada', 'ok')
    await loadRequests()
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
                          onClick={() => updateRequestStatus(r.id, 'approved')}
                        >
                          Aprobar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={processingId === r.id || r.status === 'rejected'}
                          onClick={() => updateRequestStatus(r.id, 'rejected')}
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
    </div>
  )
}
