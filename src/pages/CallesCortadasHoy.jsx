import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

function streetLabel(street) {
  if (!street) return ''
  return `${street.via_type || ''} ${street.name || ''}`.trim()
}

export default function CallesCortadasHoy() {
  const { hasPermission, isAdmin, session, showToast } = useApp()
  const canEdit = hasPermission('edit')

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [selectedStreet, setSelectedStreet] = useState(null)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [closureDate, setClosureDate] = useState(today)
  const [reason, setReason] = useState('')

  useEffect(() => {
    loadClosures()
  }, [])

  useEffect(() => {
    let canceled = false
    const text = query.trim()

    async function runSearch() {
      if (text.length < 2) {
        setSuggestions([])
        return
      }
      setSearching(true)
      const { data, error } = await supabase
        .from('jaen_streets')
        .select('id, source_code, via_type, name')
        .ilike('name', `%${text}%`)
        .order('name', { ascending: true })
        .limit(20)
      setSearching(false)

      if (canceled) return
      if (error) {
        const msg = String(error.message || '')
        if (msg.includes('jaen_streets')) {
          showToast('Falta tabla de calles: ejecuta calles-jaen.sql en Supabase', 'error')
        } else {
          showToast(`No se pudo buscar calle: ${msg || 'error'}`, 'error')
        }
        setSuggestions([])
        return
      }
      setSuggestions(data || [])
    }

    const t = setTimeout(runSearch, 180)
    return () => {
      canceled = true
      clearTimeout(t)
    }
  }, [query, showToast])

  async function loadClosures() {
    setLoading(true)
    const { data, error } = await supabase
      .from('street_closures')
      .select('id, created_at, closure_date, status, reason, reported_by, resolved_at, resolved_by, street_id, jaen_streets(id, source_code, via_type, name)')
      .order('closure_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
    setLoading(false)

    if (error) {
      const msg = String(error.message || '')
      if (msg.includes('street_closures')) {
        showToast('Falta tabla de cortes: ejecuta calles-jaen.sql en Supabase', 'error')
      } else {
        showToast(`No se pudieron cargar calles cortadas: ${msg || 'error'}`, 'error')
      }
      return
    }
    setRows(data || [])
  }

  async function createClosure(e) {
    e.preventDefault()
    if (!canEdit) {
      showToast('Solo lectura: no puedes registrar cortes', 'warn')
      return
    }
    if (!selectedStreet?.id) {
      showToast('Selecciona una calle del listado', 'warn')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('street_closures')
      .insert({
        street_id: selectedStreet.id,
        closure_date: closureDate,
        status: 'activa',
        reason: reason.trim() || null,
        reported_by: session?.user?.email || null,
      })
    setSaving(false)

    if (error) {
      showToast(`No se pudo registrar corte: ${error.message || 'error'}`, 'error')
      return
    }

    setReason('')
    setQuery('')
    setSuggestions([])
    setSelectedStreet(null)
    showToast('Calle añadida como cortada', 'ok')
    await loadClosures()
  }

  async function resolveClosure(id) {
    if (!canEdit) {
      showToast('Solo lectura: no puedes resolver cortes', 'warn')
      return
    }

    const { error } = await supabase
      .from('street_closures')
      .update({
        status: 'resuelta',
        resolved_at: new Date().toISOString(),
        resolved_by: session?.user?.email || null,
      })
      .eq('id', id)

    if (error) {
      showToast(`No se pudo marcar como resuelta: ${error.message || 'error'}`, 'error')
      return
    }

    showToast('Calle marcada como reabierta', 'ok')
    await loadClosures()
  }

  async function deleteClosure(id) {
    if (!isAdmin) {
      showToast('Solo administrador puede borrar registros', 'warn')
      return
    }
    if (!window.confirm('¿Borrar este registro de calle cortada?')) return

    const { error } = await supabase.from('street_closures').delete().eq('id', id)
    if (error) {
      showToast(`No se pudo borrar: ${error.message || 'error'}`, 'error')
      return
    }
    showToast('Registro borrado', 'warn')
    await loadClosures()
  }

  const todayActive = rows.filter(r => r.status === 'activa' && r.closure_date === today)
  const latest = rows.slice(0, 200)

  return (
    <div className="animate-in page-container">
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>
          🚫 Calles cortadas hoy
        </div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginTop: 4 }}>
          Busca una calle del callejero oficial de Jaén y regístrala como cortada para hoy.
        </div>
      </div>

      <form className="card" style={{ padding: 16, marginBottom: 16 }} onSubmit={createClosure}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 170px', gap: 10 }}>
          <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
            <label className="form-label">Buscador de calles (callejero Jaén)</label>
            <input
              className="form-input"
              value={query}
              onChange={e => {
                setQuery(e.target.value)
                setSelectedStreet(null)
              }}
              placeholder="Escribe al menos 2 letras: ej. Bernabé Soriano"
            />
            {searching && (
              <div style={{ position: 'absolute', right: 10, top: 34, fontSize: 12, color: 'var(--mid)' }}>
                buscando...
              </div>
            )}
            {suggestions.length > 0 && !selectedStreet && (
              <div className="card" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', maxHeight: 260, overflowY: 'auto', zIndex: 12, padding: 6 }}>
                {suggestions.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6 }}
                    onClick={() => {
                      setSelectedStreet(s)
                      setQuery(streetLabel(s))
                      setSuggestions([])
                    }}
                  >
                    {streetLabel(s)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Fecha corte</label>
            <input type="date" className="form-input" value={closureDate} onChange={e => setClosureDate(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 10, marginBottom: 10, color: selectedStreet ? 'var(--green)' : 'var(--mid)', fontSize: 13 }}>
          {selectedStreet
            ? `Seleccionada: ${streetLabel(selectedStreet)} (código ${selectedStreet.source_code})`
            : 'Sin calle seleccionada'}
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Motivo / detalle</label>
          <textarea
            className="form-input"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Obra, evento, accidente, corte policial..."
          />
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div className="chip chip-alert">Activas hoy: {todayActive.length}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={loadClosures}>↻ Recargar</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!canEdit || saving || !selectedStreet}>
              {saving ? 'Guardando...' : '+ Añadir calle cortada'}
            </button>
          </div>
        </div>
      </form>

      <div className="card" style={{ padding: 0 }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div className="card-title">📑 Registro de calles cortadas ({latest.length})</div>
          <div className="chip chip-blue">Hoy activas: {todayActive.length}</div>
        </div>

        {loading ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>Cargando...</div>
        ) : latest.length === 0 ? (
          <div style={{ padding: 14, color: 'var(--mid)' }}>Sin calles cortadas registradas.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Calle</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                  <th>Por</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {latest.map(r => {
                  const s = r.jaen_streets || null
                  return (
                    <tr key={r.id}>
                      <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.closure_date}</td>
                      <td style={{ fontWeight: 700 }}>{streetLabel(s) || `ID ${r.street_id}`}</td>
                      <td>
                        <span className={`chip ${r.status === 'activa' ? 'chip-alert' : 'chip-ok'}`}>
                          {r.status === 'activa' ? 'ACTIVA' : 'RESUELTA'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.reason || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--mid)' }}>{r.reported_by || '—'}</td>
                      <td style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        {r.status === 'activa' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => resolveClosure(r.id)} disabled={!canEdit}>
                            Reabrir
                          </button>
                        )}
                        {isAdmin && (
                          <button className="btn btn-danger btn-sm" onClick={() => deleteClosure(r.id)}>
                            Borrar
                          </button>
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
