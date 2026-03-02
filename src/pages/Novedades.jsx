import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

const PRIORITY_OPTIONS = [
  { value: 4, label: 'Crítica' },
  { value: 3, label: 'Alta' },
  { value: 2, label: 'Media' },
  { value: 1, label: 'Baja' },
]

function priorityLabel(priority) {
  return PRIORITY_OPTIONS.find(p => p.value === Number(priority))?.label || 'Media'
}

function priorityChipClass(priority) {
  const p = Number(priority)
  if (p >= 4) return 'chip-alert'
  if (p === 3) return 'chip-warn'
  if (p === 2) return 'chip-gray'
  return 'chip-ok'
}

export default function Novedades() {
  const { hasPermission, isAdmin, session, showToast } = useApp()
  const canEdit = hasPermission('edit')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({
    title: '',
    message: '',
    priority: 2,
  })

  useEffect(() => {
    loadNews()
  }, [])

  async function loadNews() {
    setLoading(true)
    const { data, error } = await supabase
      .from('news_messages')
      .select('id, created_at, title, message, priority, created_by')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)
    setLoading(false)
    if (error) {
      showToast(`No se pudieron cargar novedades: ${error.message || 'error'}`, 'error')
      return
    }
    setRows(data || [])
  }

  async function addNews(e) {
    e.preventDefault()
    if (!canEdit) {
      showToast('Solo lectura: no puedes añadir novedades', 'warn')
      return
    }
    if (!form.title.trim() || !form.message.trim()) {
      showToast('Rellena título y mensaje', 'warn')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('news_messages')
      .insert({
        title: form.title.trim(),
        message: form.message.trim(),
        priority: Number(form.priority) || 2,
        created_by: session?.user?.email || null,
      })
    setSaving(false)
    if (error) {
      showToast(`No se pudo guardar novedad: ${error.message || 'error'}`, 'error')
      return
    }
    setForm({ title: '', message: '', priority: 2 })
    showToast('Novedad añadida', 'ok')
    await loadNews()
  }

  async function deleteNews(id) {
    if (!isAdmin) {
      showToast('Solo administrador puede borrar novedades', 'warn')
      return
    }
    const ok = window.confirm('¿Borrar esta novedad?')
    if (!ok) return
    const { error } = await supabase.from('news_messages').delete().eq('id', id)
    if (error) {
      showToast(`No se pudo borrar novedad: ${error.message || 'error'}`, 'error')
      return
    }
    showToast('Novedad borrada', 'warn')
    await loadNews()
  }

  const groupedCount = useMemo(() => {
    const byP = { 4: 0, 3: 0, 2: 0, 1: 0 }
    rows.forEach(r => {
      const p = Number(r.priority)
      byP[p] = (byP[p] || 0) + 1
    })
    return byP
  }, [rows])

  return (
    <div className="animate-in page-container">
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>
          🆕 Novedades
        </div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginTop: 4 }}>
          Publica mensajes internos y ordénalos por prioridad.
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {PRIORITY_OPTIONS.map(p => (
            <div key={p.value} className={`chip ${priorityChipClass(p.value)}`}>
              {p.label}: {groupedCount[p.value] || 0}
            </div>
          ))}
        </div>
      </div>

      <form className="card" style={{ padding: 16, marginBottom: 16 }} onSubmit={addNews}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Título</label>
            <input
              className="form-input"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Ej: Cambio de guardia / Aviso importante"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Prioridad</label>
            <select
              className="form-select"
              value={form.priority}
              onChange={e => setForm(p => ({ ...p, priority: Number(e.target.value) }))}
            >
              {PRIORITY_OPTIONS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
          <label className="form-label">Mensaje</label>
          <textarea
            className="form-input"
            rows={4}
            value={form.message}
            onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
            placeholder="Escribe aquí la novedad..."
          />
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadNews}>↻ Recargar</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!canEdit || saving}>
            {saving ? 'Guardando...' : '+ Añadir novedad'}
          </button>
        </div>
      </form>

      <div className="card" style={{ padding: 0 }}>
        <div className="card-header">
          <div className="card-title">📢 Mensajes ({rows.length})</div>
        </div>
        {loading ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>Cargando novedades...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>No hay novedades todavía.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Prioridad</th>
                  <th>Título</th>
                  <th>Mensaje</th>
                  <th>Por</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleString('es-ES') : '—'}
                    </td>
                    <td><span className={`chip ${priorityChipClass(r.priority)}`}>{priorityLabel(r.priority)}</span></td>
                    <td style={{ fontWeight: 700 }}>{r.title}</td>
                    <td style={{ fontSize: 12, color: 'var(--light)', maxWidth: 640 }}>{r.message}</td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.created_by || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {isAdmin && (
                        <button className="btn btn-danger btn-sm" onClick={() => deleteNews(r.id)}>Borrar</button>
                      )}
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
