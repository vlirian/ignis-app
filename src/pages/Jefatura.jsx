import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

function severityChipClass(severity) {
  const s = String(severity || '').toLowerCase()
  if (s === 'critica') return 'chip-alert'
  if (s === 'alta') return 'chip-warn'
  if (s === 'media') return 'chip-blue'
  return 'chip-ok'
}

export default function Jefatura() {
  const { hasPermission, isAdmin, session, showToast } = useApp()
  const canEdit = hasPermission('edit')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({
    title: '',
    location: '',
    description: '',
    severity: 'media',
  })

  useEffect(() => {
    loadRows()
  }, [])

  async function loadRows() {
    setLoading(true)
    const { data, error } = await supabase
      .from('jefatura_incidents')
      .select('id, created_at, title, location, description, severity, status, reported_by, resolved_at, resolved_by')
      .order('created_at', { ascending: false })
      .limit(200)
    setLoading(false)
    if (error) {
      showToast(`No se pudo cargar incidencias de jefatura: ${error.message || 'error'}`, 'error')
      return
    }
    setRows(data || [])
  }

  async function createIncident(e) {
    e.preventDefault()
    if (!canEdit) {
      showToast('Solo lectura: no puedes crear incidencias', 'warn')
      return
    }
    if (!form.title.trim()) {
      showToast('Indica al menos un título', 'warn')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('jefatura_incidents')
      .insert({
        title: form.title.trim(),
        location: form.location.trim() || null,
        description: form.description.trim() || null,
        severity: form.severity,
        status: 'activa',
        reported_by: session?.user?.email || null,
      })
    setSaving(false)
    if (error) {
      showToast(`No se pudo crear incidencia: ${error.message || 'error'}`, 'error')
      return
    }
    setForm({ title: '', location: '', description: '', severity: 'media' })
    showToast('Incidencia de jefatura creada', 'ok')
    await loadRows()
  }

  async function resolveIncident(id) {
    if (!canEdit) {
      showToast('Solo lectura: no puedes resolver incidencias', 'warn')
      return
    }
    const { error } = await supabase
      .from('jefatura_incidents')
      .update({
        status: 'resuelta',
        resolved_at: new Date().toISOString(),
        resolved_by: session?.user?.email || null,
      })
      .eq('id', id)
    if (error) {
      showToast(`No se pudo resolver incidencia: ${error.message || 'error'}`, 'error')
      return
    }
    showToast('Incidencia marcada como resuelta', 'ok')
    await loadRows()
  }

  async function deleteIncident(id) {
    if (!isAdmin) {
      showToast('Solo administrador puede borrar incidencias', 'warn')
      return
    }
    const ok = window.confirm('¿Borrar esta incidencia de jefatura?')
    if (!ok) return
    const { error } = await supabase.from('jefatura_incidents').delete().eq('id', id)
    if (error) {
      showToast(`No se pudo borrar incidencia: ${error.message || 'error'}`, 'error')
      return
    }
    showToast('Incidencia borrada', 'warn')
    await loadRows()
  }

  const active = rows.filter(r => r.status === 'activa')
  const resolved = rows.filter(r => r.status === 'resuelta')

  return (
    <div className="animate-in page-container">
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>
          👨‍💼 Incidencias de jefatura
        </div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginTop: 4 }}>
          Registro interno de incidencias y comunicaciones de jefatura.
        </div>
      </div>

      <form className="card" style={{ padding: 16, marginBottom: 16 }} onSubmit={createIncident}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 180px', gap: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Título</label>
            <input className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Ej: Incidencia de coordinación" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Ubicación/Área</label>
            <input className="form-input" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Ej: Oficina jefatura" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Prioridad</label>
            <select className="form-select" value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
          <label className="form-label">Descripción</label>
          <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Detalle de la incidencia..." />
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadRows}>↻ Recargar</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!canEdit || saving}>
            {saving ? 'Guardando...' : '+ Añadir incidencia'}
          </button>
        </div>
      </form>

      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">🚨 Activas ({active.length})</div>
        </div>
        {loading ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>Cargando...</div>
        ) : active.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>Sin incidencias activas en jefatura.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Título</th>
                  <th>Ubicación/Área</th>
                  <th>Prioridad</th>
                  <th>Descripción</th>
                  <th>Por</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {active.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{new Date(r.created_at).toLocaleString('es-ES')}</td>
                    <td style={{ fontWeight: 700 }}>{r.title}</td>
                    <td>{r.location || '—'}</td>
                    <td><span className={`chip ${severityChipClass(r.severity)}`}>{String(r.severity || 'media').toUpperCase()}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.description || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.reported_by || '—'}</td>
                    <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => resolveIncident(r.id)} disabled={!canEdit}>
                        Resolver
                      </button>
                      {isAdmin && (
                        <button className="btn btn-danger btn-sm" onClick={() => deleteIncident(r.id)}>
                          Borrar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="card-header">
          <div className="card-title">✅ Resueltas ({resolved.length})</div>
        </div>
        {resolved.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>Sin incidencias resueltas todavía.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Ubicación/Área</th>
                  <th>Resuelta</th>
                  <th>Por</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map(r => (
                  <tr key={r.id}>
                    <td>{r.title}</td>
                    <td>{r.location || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.resolved_at ? new Date(r.resolved_at).toLocaleString('es-ES') : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.resolved_by || '—'}</td>
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
