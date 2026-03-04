import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

function dataUrlToBlob(dataUrl) {
  const [meta, content] = String(dataUrl || '').split(',')
  const mime = (meta.match(/data:(.*?);base64/) || [])[1] || 'image/png'
  const binary = atob(content || '')
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function statusChip(status) {
  const s = String(status || 'pendiente').toLowerCase()
  if (s === 'aceptado') return <span className="chip chip-green">ACEPTADO</span>
  if (s === 'rechazado') return <span className="chip chip-red">RECHAZADO</span>
  if (s === 'cancelado') return <span className="chip chip-gray">CANCELADO</span>
  return <span className="chip chip-yellow">PENDIENTE</span>
}

function SignaturePad({ value, onChange, hint }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.fillStyle = 'rgba(0,0,0,0.14)'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, width, height)
      img.src = value
    }
  }, [])

  const pointerPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const point = e.touches?.[0] || e
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  const begin = (e) => {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawingRef.current = true
    const p = pointerPos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const move = (e) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = pointerPos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  const end = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(canvas.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    ctx.fillStyle = 'rgba(0,0,0,0.14)'
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    onChange('')
  }

  return (
    <div>
      <div style={{ border: '1px solid var(--border2)', borderRadius: 10, overflow: 'hidden', background: 'rgba(0,0,0,0.2)' }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: 120, touchAction: 'none', cursor: 'crosshair' }}
          onMouseDown={begin}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={begin}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--mid)' }}>{hint || 'Firma aquí'}</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>Limpiar</button>
      </div>
    </div>
  )
}

export default function CambiosTurno() {
  const { session, isAdmin, hasPermission, showToast } = useApp()
  const canEdit = hasPermission('edit')
  const email = String(session?.user?.email || '').trim().toLowerCase()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([])
  const currentDateRef = useRef(null)
  const requestedDateRef = useRef(null)
  const [requesterSignature, setRequesterSignature] = useState('')
  const [partnerSignature, setPartnerSignature] = useState('')
  const [form, setForm] = useState({
    requester_name: '',
    requester_shift: 'A',
    current_shift_date: '',
    partner_name: '',
    partner_shift: 'A',
    requested_shift_date: '',
    is_extra_guard: false,
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

  async function uploadSignature(dataUrl, path) {
    const blob = dataUrlToBlob(dataUrl)
    const { error: uploadErr } = await supabase.storage
      .from('revision-observaciones')
      .upload(path, blob, { upsert: false, contentType: 'image/png' })
    if (uploadErr) return { ok: false, error: uploadErr.message || 'upload_error' }
    const { data } = supabase.storage.from('revision-observaciones').getPublicUrl(path)
    return { ok: true, url: data?.publicUrl || '' }
  }

  async function loadRows() {
    if (!email && !isAdmin) return
    setLoading(true)
    let query = supabase
      .from('shift_change_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)
    if (!isAdmin) query = query.eq('requester_email', email)
    const { data, error } = await query
    setLoading(false)
    if (error) {
      showToast(`No se pudieron cargar cambios de turno: ${error.message || 'error'} (ejecuta cambios-turno.sql + cambios-turno-v2.sql)`, 'error')
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

    const requesterName = String(form.requester_name || '').trim()
    const partnerName = String(form.partner_name || '').trim()
    const partnerShift = String(form.partner_shift || '').toUpperCase()
    const turno = String(form.requester_shift || '').toUpperCase()
    if (!requesterName) return showToast('Introduce tu nombre', 'warn')
    if (!['A', 'B', 'C', 'D'].includes(turno)) return showToast('Selecciona un turno válido (A-D)', 'warn')
    if (!form.current_shift_date) return showToast('Indica el día que solicitas cambiar', 'warn')
    if (!partnerName) return showToast('Indica el nombre del compañero', 'warn')
    if (!['A', 'B', 'C', 'D'].includes(partnerShift)) return showToast('Selecciona el turno del compañero (A-D)', 'warn')
    if (!form.requested_shift_date) return showToast('Indica el día por el que se cambia', 'warn')
    if (!requesterSignature || !partnerSignature) return showToast('Deben firmar ambos', 'warn')

    setSaving(true)
    const stamp = Date.now()
    const requesterPath = `cambios-turno/firmas/${stamp}-solicitante.png`
    const partnerPath = `cambios-turno/firmas/${stamp}-companero.png`

    const upRequester = await uploadSignature(requesterSignature, requesterPath)
    if (!upRequester.ok) {
      setSaving(false)
      return showToast(`No se pudo subir firma del solicitante: ${upRequester.error}`, 'error')
    }
    const upPartner = await uploadSignature(partnerSignature, partnerPath)
    if (!upPartner.ok) {
      setSaving(false)
      return showToast(`No se pudo subir firma del compañero: ${upPartner.error}`, 'error')
    }

    const payload = {
      requester_email: email,
      partner_email: email,
      requester_name: requesterName,
      requester_shift: turno,
      partner_name: partnerName,
      partner_shift: partnerShift,
      current_shift_date: form.current_shift_date,
      requested_shift_date: form.requested_shift_date,
      is_extra_guard: Boolean(form.is_extra_guard),
      requester_signature_url: upRequester.url,
      partner_signature_url: upPartner.url,
      notes: String(form.notes || '').trim() || null,
      status: 'pendiente',
    }

    const { error } = await supabase.from('shift_change_requests').insert(payload)
    setSaving(false)
    if (error) {
      showToast(`No se pudo guardar solicitud: ${error.message || 'error'} (ejecuta cambios-turno-v2.sql)`, 'error')
      return
    }

    showToast('Solicitud de cambio enviada', 'ok')
    setForm({
      requester_name: '',
      requester_shift: 'A',
      current_shift_date: '',
      partner_name: '',
      partner_shift: 'A',
      requested_shift_date: '',
      is_extra_guard: false,
      notes: '',
    })
    setRequesterSignature('')
    setPartnerSignature('')
    await loadRows()
  }

  return (
    <div className="animate-in page-container">
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>
          🔄 Cambios de turno
        </div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginTop: 4 }}>
          Solicitud formal de intercambio de turno entre compañeros.
        </div>
      </div>

      <form className="card" style={{ padding: 16, marginBottom: 16 }} onSubmit={submitRequest}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Nombre</label>
            <input
              className="form-input"
              value={form.requester_name}
              onChange={e => setForm(p => ({ ...p, requester_name: e.target.value }))}
              placeholder="Tu nombre y apellidos"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Turno</label>
            <select
              className="form-select"
              value={form.requester_shift}
              onChange={e => setForm(p => ({ ...p, requester_shift: e.target.value }))}
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Solicitar cambiar el día</label>
            <input
              ref={currentDateRef}
              className="form-input"
              type="date"
              value={form.current_shift_date}
              onChange={e => setForm(p => ({ ...p, current_shift_date: e.target.value }))}
              onClick={(e) => e.currentTarget.showPicker?.()}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Con</label>
            <input
              className="form-input"
              value={form.partner_name}
              onChange={e => setForm(p => ({ ...p, partner_name: e.target.value }))}
              placeholder="Nombre del compañero"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Turno del compañero</label>
            <select
              className="form-select"
              value={form.partner_shift}
              onChange={e => setForm(p => ({ ...p, partner_shift: e.target.value }))}
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Por el día</label>
            <input
              ref={requestedDateRef}
              className="form-input"
              type="date"
              value={form.requested_shift_date}
              onChange={e => setForm(p => ({ ...p, requested_shift_date: e.target.value }))}
              onClick={(e) => e.currentTarget.showPicker?.()}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Firma solicitante</label>
            <SignaturePad value={requesterSignature} onChange={setRequesterSignature} hint="Firma del solicitante" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Firma compañero</label>
            <SignaturePad value={partnerSignature} onChange={setPartnerSignature} hint="Firma del compañero" />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
          <label className="form-label">Observaciones (opcional)</label>
          <textarea
            className="form-input"
            rows={2}
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Observaciones de la solicitud"
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            background: form.is_extra_guard ? 'rgba(155,89,182,0.2)' : 'rgba(155,89,182,0.08)',
            border: form.is_extra_guard ? '1px solid rgba(155,89,182,0.8)' : '1px solid rgba(155,89,182,0.35)',
            color: '#c084fc',
            borderRadius: 999,
            padding: '8px 14px',
            fontFamily: 'Barlow Condensed',
            fontWeight: 800,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}>
            <input
              type="checkbox"
              checked={Boolean(form.is_extra_guard)}
              onChange={(e) => setForm(p => ({ ...p, is_extra_guard: e.target.checked }))}
              style={{ accentColor: '#a855f7' }}
            />
            Guardia extra
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadRows}>↻ Recargar</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!canEdit || saving}>
            {saving ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </div>
      </form>

      <div className="card" style={{ padding: 0 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">📋 Registro de cambios solicitados ({rows.length})</div>
          <div>{statusChip('pendiente')} <span style={{ marginLeft: 6 }}>{pendingCount}</span></div>
        </div>
        {loading ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>Cargando...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>Sin solicitudes registradas.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha alta</th>
                  <th>Nombre</th>
                  <th>Turno</th>
                  <th>Cambiar día</th>
                  <th>Con</th>
                  <th>Turno comp.</th>
                  <th>Por el día</th>
                  <th>Tipo</th>
                  <th>Firmas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{new Date(r.created_at).toLocaleString('es-ES')}</td>
                    <td>{r.requester_name || r.requester_email || '—'}</td>
                    <td>{r.requester_shift || '—'}</td>
                    <td>{r.current_shift_date || '—'}</td>
                    <td>{r.partner_name || '—'}</td>
                    <td>{r.partner_shift || '—'}</td>
                    <td>{r.requested_shift_date || '—'}</td>
                    <td>{r.is_extra_guard ? <span className="chip" style={{ background: 'rgba(155,89,182,0.22)', color: '#c084fc', border: '1px solid rgba(155,89,182,0.5)' }}>GUARDIA EXTRA</span> : 'Normal'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {r.requester_signature_url ? <a href={r.requester_signature_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Solicitante</a> : '—'}{' '}
                      {r.partner_signature_url ? <a href={r.partner_signature_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Compañero</a> : ''}
                    </td>
                    <td>{statusChip(r.status)}</td>
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
