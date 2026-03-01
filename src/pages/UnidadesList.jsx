import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/AppContext'
import { buildZones, unitAlertLevel, unitSummary } from '../data/units'
import Modal from '../components/Modal'

export default function UnidadesList() {
  const { configs, items, revisionIncidents, isAdmin, createUnit, setUnitActive, showToast } = useApp()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ unitId: '', numCofres: 4, hasTecho: true, hasTrasera: true })

  const levelColor = { ok: 'var(--green)', warn: 'var(--yellow)', alert: 'var(--red)' }
  const levelLabel = { ok: '✓ Completa', warn: 'Stock bajo', alert: 'Faltante' }
  const chipClass  = { ok: 'chip-ok', warn: 'chip-warn', alert: 'chip-alert' }

  const allUnitIds = useMemo(() => (
    Object.keys(configs || {})
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
  ), [configs])
  const unitIds = useMemo(() => allUnitIds, [allUnitIds])

  const unitsWithRevisionIncidents = new Set(
    (revisionIncidents || []).map(inc => Number(inc.unitId)).filter(Number.isFinite)
  )

  const onCreateUnit = async () => {
    const id = Number(form.unitId)
    if (!Number.isFinite(id) || id < 0) {
      showToast('ID de unidad no válido', 'warn')
      return
    }
    setCreating(true)
    const res = await createUnit(id, {
      numCofres: Number(form.numCofres) || 4,
      hasTecho: !!form.hasTecho,
      hasTrasera: !!form.hasTrasera,
    })
    setCreating(false)
    if (!res?.ok) {
      if (res?.error === 'already_exists') showToast(`La unidad U${String(id).padStart(2, '0')} ya existe`, 'warn')
      else if (res?.error === 'not_admin') showToast('Solo administrador puede crear unidades', 'error')
      else showToast(`No se pudo crear la unidad: ${res?.error || 'error'}`, 'error')
      return
    }
    showToast(`Unidad U${String(id).padStart(2, '0')} creada`, 'ok')
    setCreateOpen(false)
    setForm({ unitId: '', numCofres: 4, hasTecho: true, hasTrasera: true })
    navigate(`/unidades/${id}`)
  }

  return (
    <div className="animate-in page-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>
          🚒 Unidades
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

          {isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
              + Añadir unidad
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
        {unitIds.map(id => {
          const cfg = configs[id]
          const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
          const s = unitSummary(items[id] || {}, zones)
          const level = unitAlertLevel(items[id] || {}, zones)
          const hasIncident = level !== 'ok' || unitsWithRevisionIncidents.has(id)
          const active = cfg?.isActive !== false
          return (
            <div
              key={id}
              className="card"
              title={active ? `Abrir unidad U${String(id).padStart(2, '0')}` : 'Unidad no disponible'}
              style={{ cursor: active ? 'pointer' : 'not-allowed', padding: '18px 16px', transition: 'transform 0.15s, border-color 0.15s', borderTop: `3px solid ${active ? levelColor[level] : 'var(--mid)'}`, position: 'relative', opacity: active ? 1 : 0.65, filter: active ? 'none' : 'grayscale(0.65)' }}
              onClick={() => {
                if (!active) {
                  showToast('Unidad no disponible', 'warn')
                  return
                }
                navigate(`/unidades/${id}`)
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.borderColor = 'var(--mid)'
                  return
                }
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.borderColor = 'var(--fire)'
              }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = '' }}
            >
              {hasIncident && <span className="incident-beacon incident-beacon-card" />}
              <div style={{ fontSize: 28, marginBottom: 8 }}>🚒</div>
              <div style={{ fontFamily: 'Barlow Condensed', fontSize: 24, fontWeight: 900, letterSpacing: 1, marginBottom: 2 }}>
                U{String(id).padStart(2,'0')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 10 }}>
                {cfg.numCofres} cofres · {s.total} artíc.
              </div>
              <span className={`chip ${active ? chipClass[level] : 'chip-gray'}`}>{active ? levelLabel[level] : 'Desactivada'}</span>
              {(s.missing > 0 || s.low > 0) && (
                <div style={{ fontSize: 11, marginTop: 6, color: s.missing > 0 ? 'var(--red-l)' : 'var(--yellow-l)' }}>
                  {s.missing > 0 ? `⚠ ${s.missing} faltante${s.missing>1?'s':''}` : `⚠ ${s.low} bajo stock`}
                </div>
              )}
              {isAdmin && (
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className={`btn btn-sm ${active ? 'btn-danger' : 'btn-primary'}`}
                    onClick={async (e) => {
                      e.stopPropagation()
                      const ok = window.confirm(active
                        ? `¿Desactivar U${String(id).padStart(2, '0')}?`
                        : `¿Reactivar U${String(id).padStart(2, '0')}?`)
                      if (!ok) return
                      const res = await setUnitActive(id, !active)
                      if (!res?.ok) {
                        showToast(`No se pudo actualizar unidad: ${res?.error || 'error'}`, 'error')
                        return
                      }
                      showToast(active ? 'Unidad desactivada' : 'Unidad reactivada', 'ok')
                    }}
                  >
                    {active ? 'Desactivar' : 'Reactivar'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {createOpen && (
        <Modal
          title="Añadir nueva unidad"
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setCreateOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary btn-sm" onClick={onCreateUnit} disabled={creating}>
                {creating ? 'Creando...' : 'Crear unidad'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">ID de unidad</label>
            <input
              className="form-input"
              type="number"
              min="0"
              placeholder="Ej: 23"
              value={form.unitId}
              onChange={e => setForm(prev => ({ ...prev, unitId: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Número de cofres</label>
            <select
              className="form-select"
              value={form.numCofres}
              onChange={e => setForm(prev => ({ ...prev, numCofres: Number(e.target.value) }))}
            >
              {[4, 5, 6].map(n => <option key={n} value={n}>{n} cofres</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Techo</label>
              <select
                className="form-select"
                value={form.hasTecho ? '1' : '0'}
                onChange={e => setForm(prev => ({ ...prev, hasTecho: e.target.value === '1' }))}
              >
                <option value="1">Sí</option>
                <option value="0">No</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Trasera</label>
              <select
                className="form-select"
                value={form.hasTrasera ? '1' : '0'}
                onChange={e => setForm(prev => ({ ...prev, hasTrasera: e.target.value === '1' }))}
              >
                <option value="1">Sí</option>
                <option value="0">No</option>
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
