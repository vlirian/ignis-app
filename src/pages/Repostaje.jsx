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

function SignaturePad({ value, onChange }) {
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
    return {
      x: point.clientX - rect.left,
      y: point.clientY - rect.top,
    }
  }

  const begin = (e) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    drawingRef.current = true
    const p = pointerPos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const move = (e) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
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
      <div
        style={{
          border: '1px solid var(--border2)',
          borderRadius: 10,
          overflow: 'hidden',
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: 160, touchAction: 'none', cursor: 'crosshair' }}
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
        <div style={{ fontSize: 12, color: 'var(--mid)' }}>Firma aquí con ratón o dedo</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>Limpiar firma</button>
      </div>
    </div>
  )
}

export default function Repostaje() {
  const { configs, hasPermission, showToast, session } = useApp()
  const canEdit = hasPermission('edit')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([])
  const [ticketFile, setTicketFile] = useState(null)
  const [signatureDataUrl, setSignatureDataUrl] = useState('')
  const [form, setForm] = useState({
    unit_id: '',
    funcionario_number: '',
  })

  const activeUnits = useMemo(() => (
    Object.keys(configs || {})
      .map(Number)
      .filter(Number.isFinite)
      .filter(id => configs[id]?.isActive !== false)
      .sort((a, b) => a - b)
  ), [configs])

  useEffect(() => {
    loadRows()
  }, [])

  async function loadRows() {
    setLoading(true)
    let data = null
    let error = null
    const res = await supabase
      .from('refuel_logs')
      .select('id, created_at, unit_id, funcionario_number, ticket_url, signature_url, created_by')
      .order('created_at', { ascending: false })
      .limit(200)
    data = res.data
    error = res.error
    setLoading(false)
    if (error) {
      showToast(`No se pudo cargar repostajes: ${error.message || 'error'} (ejecuta repostaje.sql)`, 'error')
      return
    }
    setRows(data || [])
  }

  async function uploadFileToStorage(fileOrBlob, path, contentType) {
    const { error: uploadErr } = await supabase.storage
      .from('revision-observaciones')
      .upload(path, fileOrBlob, { upsert: false, contentType })
    if (uploadErr) return { ok: false, error: uploadErr.message || 'upload_error' }
    const { data } = supabase.storage.from('revision-observaciones').getPublicUrl(path)
    return { ok: true, url: data?.publicUrl || '' }
  }

  async function saveRefuel(e) {
    e.preventDefault()
    if (!canEdit) {
      showToast('Solo lectura: no puedes registrar repostajes', 'warn')
      return
    }
    const unitId = Number(form.unit_id)
    if (!Number.isFinite(unitId)) {
      showToast('Selecciona un vehículo', 'warn')
      return
    }
    if (!String(form.funcionario_number || '').trim()) {
      showToast('Introduce el número de funcionario', 'warn')
      return
    }
    if (!ticketFile) {
      showToast('Adjunta foto del ticket', 'warn')
      return
    }
    if (!signatureDataUrl) {
      showToast('Firma antes de guardar', 'warn')
      return
    }

    setSaving(true)
    const stamp = Date.now()
    const ticketExt = String(ticketFile.name || '').includes('.') ? String(ticketFile.name).split('.').pop() : 'jpg'
    const ticketPath = `repostaje/tickets/U${String(unitId).padStart(2, '0')}-${stamp}.${ticketExt}`
    const signatureBlob = dataUrlToBlob(signatureDataUrl)
    const signPath = `repostaje/firmas/U${String(unitId).padStart(2, '0')}-${stamp}.png`

    const upTicket = await uploadFileToStorage(ticketFile, ticketPath, ticketFile.type || 'image/jpeg')
    if (!upTicket.ok) {
      setSaving(false)
      showToast(`No se pudo subir ticket: ${upTicket.error}`, 'error')
      return
    }
    const upSign = await uploadFileToStorage(signatureBlob, signPath, 'image/png')
    if (!upSign.ok) {
      setSaving(false)
      showToast(`No se pudo subir firma: ${upSign.error}`, 'error')
      return
    }

    const { error } = await supabase
      .from('refuel_logs')
      .insert({
        unit_id: unitId,
        funcionario_number: String(form.funcionario_number || '').trim(),
        ticket_url: upTicket.url,
        signature_url: upSign.url,
        created_by: session?.user?.email || null,
      })
    setSaving(false)
    if (error) {
      showToast(`No se pudo guardar repostaje: ${error.message || 'error'} (ejecuta repostaje.sql)`, 'error')
      return
    }

    setForm({ unit_id: '', funcionario_number: '' })
    setTicketFile(null)
    setSignatureDataUrl('')
    showToast('Repostaje guardado', 'ok')
    await loadRows()
  }

  return (
    <div className="animate-in page-container">
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>
          ⛽ Repostaje
        </div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginTop: 4 }}>
          Registra ticket de gasolina, número de funcionario y firma.
        </div>
      </div>

      <form className="card" style={{ padding: 16, marginBottom: 16 }} onSubmit={saveRefuel}>
        <div className="repostaje-form-grid" style={{ display: 'grid', gridTemplateColumns: '200px 260px 1fr', gap: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Vehículo</label>
            <select className="form-select" value={form.unit_id} onChange={e => setForm(p => ({ ...p, unit_id: e.target.value }))}>
              <option value="">Seleccionar</option>
              {activeUnits.map(id => (
                <option key={id} value={id}>U{String(id).padStart(2, '0')}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Nº Funcionario</label>
            <input
              className="form-input"
              value={form.funcionario_number}
              onChange={e => setForm(p => ({ ...p, funcionario_number: e.target.value }))}
              placeholder="Ej: 12345"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Ticket gasolina (foto)</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                📷 Cámara
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setTicketFile((e.target.files || [])[0] || null)}
                  style={{ display: 'none' }}
                />
              </label>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                🖼 Adjuntar
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setTicketFile((e.target.files || [])[0] || null)}
                  style={{ display: 'none' }}
                />
              </label>
              {ticketFile && (
                <span className="chip chip-blue" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ticketFile.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
          <label className="form-label">Firma</label>
          <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadRows}>↻ Recargar</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!canEdit || saving}>
            {saving ? 'Guardando...' : 'Guardar repostaje'}
          </button>
        </div>
      </form>

      <div className="card" style={{ padding: 0 }}>
        <div className="card-header">
          <div className="card-title">📑 Registro de repostajes ({rows.length})</div>
        </div>
        {loading ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>Cargando...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>Sin repostajes registrados.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Vehículo</th>
                  <th>Nº Funcionario</th>
                  <th>Ticket</th>
                  <th>Firma</th>
                  <th>Por</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.created_at ? new Date(r.created_at).toLocaleString('es-ES') : '—'}</td>
                    <td style={{ fontFamily: 'Barlow Condensed', fontSize: 15, fontWeight: 800 }}>U{String(r.unit_id).padStart(2, '0')}</td>
                    <td>{r.funcionario_number || '—'}</td>
                    <td>{r.ticket_url ? <a href={r.ticket_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Ver ticket</a> : '—'}</td>
                    <td>{r.signature_url ? <a href={r.signature_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Ver firma</a> : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.created_by || '—'}</td>
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
