import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

function statusChip(status) {
  const s = String(status || 'pendiente').toLowerCase()
  if (s === 'aceptado') return <span className="chip chip-green">ACEPTADO</span>
  if (s === 'rechazado') return <span className="chip chip-red">RECHAZADO</span>
  if (s === 'cancelado') return <span className="chip chip-gray">CANCELADO</span>
  return <span className="chip chip-yellow">PENDIENTE</span>
}

export default function CambiosTurno() {
  const { session, isAdmin, hasPermission, showToast } = useApp()
  const canEdit = hasPermission('edit')
  const email = String(session?.user?.email || '').trim().toLowerCase()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({
    partner_email: '',
    current_shift_date: '',
    requested_shift_date: '',
    notes: '',
  })

  const pendingCount = useMemo(
    () => (rows || []).filter(r => String(r.status || 'pendiente') === 'pendiente').length,
    [rows]
  )

  useEffect(() => {
    loadRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, isAdmin])

  async function loadRows() {
    if (!email && !isAdmin) return
    setLoading(true)
    let query = supabase
      .from('shift_change_requests')
      .select('id, created_at, requester_email, partner_email, current_shift_date, requested_shift_date, notes, status, resolved_at, resolved_by')
      .order('created_at', { ascending: false })
      .limit(300)
    if (!isAdmin) {
      query = query.or(`requester_email.eq.${email},partner_email.eq.${email}`)
    }
    const { data, error } = await query
    setLoading(false)
    if (error) {
      showToast(`No se pudieron cargar cambios de turno: ${error.message || 'error'} (ejecuta cambios-turno.sql)`, 'error')
      return
    }
    setRows(data || [])
  }

  async function submitRequest(e) {
    e.preventDefault()
    if (!canEdit) {
      showToast('Solo lectura: no puedes solicitar cambios de turno', 'warn')
      return
    }
    const partner = String(form.partner_email || '').trim().toLowerCase()
    if (!partner || !partner.includes('@')) {
      showToast('Introduce un email válido del compañero', 'warn')
      return
    }
    if (partner === email) {
      showToast('No puedes solicitar cambio contigo mismo', 'warn')
      return
    }
    if (!form.current_shift_date || !form.requested_shift_date) {
      showToast('Selecciona las dos fechas del cambio', 'warn')
      return
    }

    setSaving(true)
    const payload = {
      requester_email: email,
      partner_email: partner,
      current_shift_date: form.current_shift_date,
      requested_shift_date: form.requested_shift_date,
      notes: String(form.notes || '').trim() || null,
      status: 'pendiente',
    }
    const { error } = await supabase.from('shift_change_requests').insert(payload)
    setSaving(false)
    if (error) {
      showToast(`No se pudo guardar solicitud: ${error.message || 'error'} (ejecuta cambios-turno.sql)`, 'error')
      return
    }
    showToast('Solicitud de cambio enviada', 'ok')
    setForm({ partner_email: '', current_shift_date: '', requested_shift_date: '', notes: '' })
    await loadRows()
  }

  async function updateStatus(row, nextStatus) {
    if (!canEdit) {
      showToast('Solo lectura', 'warn')
      return
    }
    const { error } = await supabase
      .from('shift_change_requests')
      .update({
        status: nextStatus,
        resolved_at: new Date().toISOString(),
        resolved_by: email || null,
      })
      .eq('id', row.id)
    if (error) {
      showToast(`No se pudo actualizar: ${error.message || 'error'}`, 'error')
      return
    }
    showToast(`Solicitud ${nextStatus}`, 'ok')
    await loadRows()
  }

  return (
    <div className="animate-in page-container">
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>
          🔄 Cambios de turno
        </div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginTop: 4 }}>
          Solicita intercambio de turno entre compañeros y registra su estado.
        </div>
      </div>

      <form className="card" style={{ padding: 16, marginBottom: 16 }} onSubmit={submitRequest}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px 170px', gap: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Email compañero</label>
            <input
              className="form-input"
              type="email"
              value={form.partner_email}
              onChange={e => setForm(p => ({ ...p, partner_email: e.target.value }))}
              placeholder="compañero@dominio.com"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Tu fecha</label>
            <input
              className="form-input"
              type="date"
              value={form.current_shift_date}
              onChange={e => setForm(p => ({ ...p, current_shift_date: e.target.value }))}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Fecha a cambiar</label>
            <input
              className="form-input"
              type="date"
              value={form.requested_shift_date}
              onChange={e => setForm(p => ({ ...p, requested_shift_date: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
          <label className="form-label">Notas (opcional)</label>
          <textarea
            className="form-input"
            rows={3}
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Detalle del motivo o acuerdo"
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadRows}>↻ Recargar</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!canEdit || saving}>
            {saving ? 'Enviando...' : 'Solicitar cambio'}
          </button>
        </div>
      </form>

      <div className="card" style={{ padding: 0 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">📋 Solicitudes ({rows.length})</div>
          <div>{statusChip('pendiente')} <span style={{ marginLeft: 6 }}>{pendingCount}</span></div>
        </div>
        {loading ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>Cargando...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>Sin solicitudes de cambio de turno.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Solicita</th>
                  <th>Compañero</th>
                  <th>Tu turno</th>
                  <th>Cambio por</th>
                  <th>Estado</th>
                  <th>Notas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const requester = String(r.requester_email || '').toLowerCase()
                  const partner = String(r.partner_email || '').toLowerCase()
                  const mine = email && (requester === email || partner === email)
                  const canRespond = canEdit && mine && String(r.status || '') === 'pendiente'
                  const isRequester = requester === email
                  const isPartner = partner === email
                  return (
                    <tr key={r.id}>
                      <td style={{ fontSize: 12, color: 'var(--mid)' }}>{new Date(r.created_at).toLocaleString('es-ES')}</td>
                      <td>{r.requester_email}</td>
                      <td>{r.partner_email}</td>
                      <td>{r.current_shift_date || '—'}</td>
                      <td>{r.requested_shift_date || '—'}</td>
                      <td>{statusChip(r.status)}</td>
                      <td style={{ maxWidth: 280, color: 'var(--mid)' }}>{r.notes || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {canRespond && isPartner && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => updateStatus(r, 'rechazado')}>Rechazar</button>{' '}
                            <button className="btn btn-primary btn-sm" onClick={() => updateStatus(r, 'aceptado')}>Aceptar</button>
                          </>
                        )}
                        {canRespond && isRequester && (
                          <button className="btn btn-ghost btn-sm" onClick={() => updateStatus(r, 'cancelado')}>Cancelar</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

