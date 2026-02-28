import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/AppContext'
import { buildZones, zoneStatus, unitSummary, unitAlertLevel } from '../data/units'
import Modal from '../components/Modal'

export default function UnidadDetail() {
  const { id } = useParams()
  const unitId = parseInt(id)
  const navigate = useNavigate()
  const {
    configs, items, reviews, reviewUnit, updateQty, addItem, deleteItem, updateUnitConfig,
    showToast, session, itemStates: globalItemStates, revisionIncidents,
    setUnitItemState
  } = useApp()

  const [selectedZone, setSelectedZone] = useState(null)
  const [addModal, setAddModal] = useState(null)
  const [cfgModal, setCfgModal] = useState(false)
  const [reviewModal, setReviewModal]     = useState(false)
  const [reviewNotes, setReviewNotes]     = useState('')
  const [reviewIsOk, setReviewIsOk]       = useState(true)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [issueModal, setIssueModal] = useState(null)  // { itemId, itemName, note }
  const [issueDraft, setIssueDraft] = useState('')
  const [newItem, setNewItem] = useState({ name: '', desc: '', qty: 1, min: 1 })
  const [cfgForm, setCfgForm] = useState(null)

  if (!configs[unitId]) {
    return <div style={{ padding: 40, color: 'var(--mid)' }}>Unidad no encontrada.</div>
  }

  const cfg = configs[unitId]
  const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
  const summary = unitSummary(items[unitId], zones)
  const level = unitAlertLevel(items[unitId], zones)
  // itemStates for this unit from global context + incidencias creadas en revisión diaria
  const itemStates = useMemo(() => {
    const local = globalItemStates[unitId] || {}
    const localWithoutIssues = Object.fromEntries(
      Object.entries(local).map(([k, v]) => [k, v?.status === 'issue' ? { ...v, status: null, note: '' } : v])
    )
    const fromRevision = {}
    const incidents = (revisionIncidents || []).filter(inc => inc.unitId === unitId)
    incidents.forEach(inc => {
      if (inc.itemId) {
        fromRevision[inc.itemId] = { status: 'issue', note: inc.note || '' }
        return
      }
      const zoneByLabel = zones.find(z => String(z.label).trim().toLowerCase() === String(inc.zone || '').trim().toLowerCase())
      if (!zoneByLabel) return
      const matched = (items[unitId]?.[zoneByLabel.id] || []).find(it => String(it.name).trim().toLowerCase() === String(inc.item || '').trim().toLowerCase())
      if (!matched) return
      fromRevision[matched.id] = { status: 'issue', note: inc.note || '' }
    })
    return { ...localWithoutIssues, ...fromRevision }
  }, [globalItemStates, revisionIncidents, unitId, zones, items])

  const statusLabel = { ok: 'Completa', warn: 'Stock bajo', alert: 'Faltante' }
  const pillClass   = { ok: 'pill-ok', warn: 'pill-warn', alert: 'pill-alert' }
  const dotClass    = { ok: 'dot-ok', warn: 'dot-warn', alert: 'dot-alert' }
  const zoneStatusColor = { ok: 'var(--green)', warn: 'var(--yellow)', alert: 'var(--red)' }

  const handleAddItem = () => {
    if (!newItem.name.trim()) { showToast('Escribe un nombre', 'warn'); return }
    addItem(unitId, addModal, { ...newItem })
    showToast(`Añadido: ${newItem.name}`, 'ok')
    setNewItem({ name: '', desc: '', qty: 1, min: 1 })
    setAddModal(null)
  }

  const handleCfgSave = () => {
    updateUnitConfig(unitId, cfgForm)
    showToast('Configuración actualizada', 'ok')
    setCfgModal(false)
    setSelectedZone(null)
  }

  const handleReviewSubmit = async () => {
    setReviewLoading(true)
    await reviewUnit(unitId, reviewNotes, reviewIsOk)
    setReviewLoading(false)
    setReviewModal(false)
    setReviewNotes('')
    setReviewIsOk(true)
  }

  const handleIssueSave = async () => {
    if (!issueModal) return
    await setUnitItemState(unitId, issueModal.itemId, { status: 'issue', note: issueDraft })
    setIssueModal(null)
    setIssueDraft('')
  }

  const openCfg = () => {
    setCfgForm({ ...cfg })
    setCfgModal(true)
  }

  const zonesToShow = selectedZone ? zones.filter(z => z.id === selectedZone) : zones

  return (
    <div className="animate-in page-container">

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ cursor: 'pointer', color: 'var(--light)' }} onClick={() => navigate('/unidades')}>Unidades</span>
        <span>›</span>
        <span>U{String(unitId).padStart(2,'0')}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 36, fontWeight: 900, letterSpacing: 2 }}>
            UNIDAD {unitId}
          </div>
          <div className={`status-pill ${pillClass[level]}`}>
            <div className={`status-dot ${dotClass[level]}`} />
            {statusLabel[level]}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={openCfg}>⚙ Configurar</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setReviewModal(true)}>✔ Revisar unidad</button>
          <button className="btn btn-primary btn-sm" onClick={() => setAddModal(zones[0]?.id)}>＋ Añadir artículo</button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="card" style={{ display: 'flex', marginBottom: 20, overflow: 'auto' }}>
        {[
          { label: 'Artículos',  val: summary.total,   color: 'var(--blue-l)' },
          { label: 'Completos',  val: summary.ok,      color: 'var(--green-l)' },
          { label: 'Faltantes',  val: summary.missing, color: 'var(--red-l)' },
          { label: 'Stock bajo', val: summary.low,     color: 'var(--yellow-l)' },
          { label: 'Zonas',      val: summary.zones,   color: 'var(--white)' },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, padding: '12px 16px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Review panel */}
      <ReviewPanel
        review={reviews[unitId]}
        onOpenModal={() => setReviewModal(true)}
      />

      {/* Truck diagram */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mid)', fontWeight: 700, marginBottom: 12 }}>
          Esquema de la unidad — pulsa para filtrar
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', overflowX: 'auto', minWidth: 0 }}>

          {/* Cabina */}
          {(() => {
            const z = zones.find(z => z.id === 'cabina')
            const st = zoneStatus(items[unitId]['cabina'])
            return <ZoneBlock key="cabina" zone={z} status={st} items={items[unitId]['cabina']} selected={selectedZone === 'cabina'} onClick={() => setSelectedZone(selectedZone === 'cabina' ? null : 'cabina')} flex={1.3} />
          })()}

          {/* Body: techo + cofres */}
          <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cfg.hasTecho && (() => {
              const z = zones.find(z => z.id === 'techo')
              const st = zoneStatus(items[unitId]['techo'])
              return <ZoneBlock key="techo" zone={z} status={st} items={items[unitId]['techo']} selected={selectedZone === 'techo'} onClick={() => setSelectedZone(selectedZone === 'techo' ? null : 'techo')} flex={1} minH={44} />
            })()}
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: cfg.numCofres }, (_, i) => {
                const zid = `cofre${i+1}`
                const z = zones.find(z => z.id === zid)
                const st = zoneStatus(items[unitId][zid] || [])
                return <ZoneBlock key={zid} zone={z} status={st} items={items[unitId][zid] || []} selected={selectedZone === zid} onClick={() => setSelectedZone(selectedZone === zid ? null : zid)} flex={1} />
              })}
            </div>
          </div>

          {/* Trasera */}
          {cfg.hasTrasera && (() => {
            const z = zones.find(z => z.id === 'trasera')
            const st = zoneStatus(items[unitId]['trasera'])
            return <ZoneBlock key="trasera" zone={z} status={st} items={items[unitId]['trasera']} selected={selectedZone === 'trasera'} onClick={() => setSelectedZone(selectedZone === 'trasera' ? null : 'trasera')} flex={0.9} />
          })()}
        </div>

        {selectedZone && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setSelectedZone(null)}>
            ✕ Quitar filtro
          </button>
        )}
      </div>

      {/* Zone cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
        {zonesToShow.map(zone => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            zoneItems={items[unitId][zone.id] || []}
            itemStates={itemStates}
            onSetOk={(itemId) => setUnitItemState(unitId, itemId, itemStates[itemId]?.status === 'ok' ? { status: null, note: '' } : { status: 'ok', note: '' })}
            onSetIssue={(itemId, itemName) => { setIssueDraft(itemStates[itemId]?.note || ''); setIssueModal({ itemId, itemName, zoneId: zone.id, zoneLabel: zone.label }) }}
            onMarkAll={(zoneItems) => {
              const allOk = zoneItems.every(i => itemStates[i.id]?.status === 'ok')
              zoneItems.forEach(i => {
                setUnitItemState(unitId, i.id, { status: allOk ? null : 'ok', note: '' })
              })
            }}
            onAdd={() => setAddModal(zone.id)}
            onAdjust={(itemId, delta) => { updateQty(unitId, zone.id, itemId, delta) }}
            onDelete={(itemId, name) => { deleteItem(unitId, zone.id, itemId); showToast(`Eliminado: ${name}`, 'warn') }}
          />
        ))}
      </div>

      {/* Modal: añadir artículo */}
      {addModal && (
        <Modal
          title={`＋ Artículo en ${zones.find(z => z.id === addModal)?.label || addModal}`}
          onClose={() => setAddModal(null)}
          footer={
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddModal(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={handleAddItem}>Guardar</button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Zona</label>
            <select className="form-select" value={addModal} onChange={e => setAddModal(e.target.value)}>
              {zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Nombre del artículo</label>
            <input className="form-input" placeholder="Ej: Manguera 45mm" value={newItem.name} onChange={e => setNewItem(p => ({...p, name: e.target.value}))} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input className="form-input" placeholder="Opcional" value={newItem.desc} onChange={e => setNewItem(p => ({...p, desc: e.target.value}))} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Cantidad actual</label>
              <input className="form-input" type="number" min="0" value={newItem.qty} onChange={e => setNewItem(p => ({...p, qty: parseInt(e.target.value)||0}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Cantidad mínima</label>
              <input className="form-input" type="number" min="0" value={newItem.min} onChange={e => setNewItem(p => ({...p, min: parseInt(e.target.value)||1}))} />
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: incidencia de artículo */}
      {issueModal && (
        <Modal
          title={`⚠ Incidencia — ${issueModal.itemName}`}
          onClose={() => setIssueModal(null)}
          footer={
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setIssueModal(null)}>Cancelar</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleIssueSave}
                style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
              >
                ⚠ Guardar incidencia
              </button>
            </>
          }
        >
          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--red-l)' }}>
            Este artículo quedará marcado con incidencia y aparecerá en el panel de Alertas.
          </div>
          <div className="form-group">
            <label className="form-label">¿Qué le sucede a este material?</label>
            <textarea
              className="form-input"
              style={{ height: 100, resize: 'vertical', fontFamily: 'Barlow' }}
              placeholder="Ej: Manguera rota, extintor caducado, falta la lanza..."
              value={issueDraft}
              onChange={e => setIssueDraft(e.target.value)}
              autoFocus
            />
          </div>
        </Modal>
      )}

      {/* Modal: revisar unidad */}
      {reviewModal && (
        <Modal
          title={`✔ Revisar Unidad ${unitId}`}
          onClose={() => setReviewModal(false)}
          footer={
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setReviewModal(false)}>Cancelar</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleReviewSubmit}
                disabled={reviewLoading}
                style={{ background: reviewIsOk ? 'var(--green)' : 'var(--red)', borderColor: reviewIsOk ? 'var(--green)' : 'var(--red)' }}
              >
                {reviewLoading ? 'Guardando...' : reviewIsOk ? '✔ Marcar como CORRECTA' : '⚠ Marcar con INCIDENCIA'}
              </button>
            </>
          }
        >
          <div style={{ marginBottom: 18 }}>
            <label className="form-label" style={{ marginBottom: 10, display: 'block' }}>Estado de la revisión</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setReviewIsOk(true)}
                style={{
                  flex: 1, padding: '14px', borderRadius: 8, cursor: 'pointer', border: '2px solid',
                  borderColor: reviewIsOk ? 'var(--green)' : 'var(--border2)',
                  background: reviewIsOk ? 'rgba(39,174,96,0.12)' : 'var(--card)',
                  color: reviewIsOk ? 'var(--green-l)' : 'var(--mid)',
                  fontFamily: 'Barlow Condensed', fontSize: 15, fontWeight: 700, letterSpacing: 1,
                  transition: 'all 0.15s'
                }}
              >
                ✔ TODO CORRECTO
              </button>
              <button
                onClick={() => setReviewIsOk(false)}
                style={{
                  flex: 1, padding: '14px', borderRadius: 8, cursor: 'pointer', border: '2px solid',
                  borderColor: !reviewIsOk ? 'var(--red)' : 'var(--border2)',
                  background: !reviewIsOk ? 'rgba(192,57,43,0.12)' : 'var(--card)',
                  color: !reviewIsOk ? 'var(--red-l)' : 'var(--mid)',
                  fontFamily: 'Barlow Condensed', fontSize: 15, fontWeight: 700, letterSpacing: 1,
                  transition: 'all 0.15s'
                }}
              >
                ⚠ HAY INCIDENCIAS
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Observaciones (opcional)</label>
            <textarea
              className="form-input"
              style={{ height: 90, resize: 'vertical', fontFamily: 'Barlow' }}
              placeholder="Ej: Falta extintor en cofre 2, manguera 45mm en mal estado..."
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 4 }}>
            Se registrará con tu usuario: <strong style={{ color: 'var(--light)' }}>{session?.user?.email}</strong>
          </div>
        </Modal>
      )}

      {/* Modal: configurar unidad */}
      {cfgModal && cfgForm && (
        <Modal title="⚙ Configurar unidad" onClose={() => setCfgModal(false)}
          footer={
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setCfgModal(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={handleCfgSave}>Aplicar</button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Número de cofres</label>
            <select className="form-select" value={cfgForm.numCofres} onChange={e => setCfgForm(p => ({...p, numCofres: parseInt(e.target.value)}))}>
              {[4,5,6].map(n => <option key={n} value={n}>{n} cofres</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Techo</label>
              <select className="form-select" value={cfgForm.hasTecho ? '1' : '0'} onChange={e => setCfgForm(p => ({...p, hasTecho: e.target.value === '1'}))}>
                <option value="1">Sí</option>
                <option value="0">No</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Parte trasera</label>
              <select className="form-select" value={cfgForm.hasTrasera ? '1' : '0'} onChange={e => setCfgForm(p => ({...p, hasTrasera: e.target.value === '1'}))}>
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

// ── ReviewPanel ──────────────────────────────────
function ReviewPanel({ review, onOpenModal }) {
  if (!review) {
    return (
      <div
        onClick={onOpenModal}
        className="card"
        style={{
          marginBottom: 20, padding: '14px 20px', cursor: 'pointer',
          border: '2px dashed var(--border2)', background: 'rgba(255,255,255,0.02)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--fire)'; e.currentTarget.style.background = 'rgba(255,69,0,0.04)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.background = '' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 26 }}>📋</div>
          <div>
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>Sin revisión registrada</div>
            <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 2 }}>Pulsa para registrar la primera revisión de esta unidad</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--fire)', fontWeight: 600 }}>Registrar →</div>
      </div>
    )
  }

  const date = new Date(review.reviewed_at)
  const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const daysSince = Math.floor((Date.now() - date.getTime()) / 86400000)
  const isOld = daysSince > 30
  const borderColor = review.is_ok ? (isOld ? 'var(--yellow)' : 'var(--green)') : 'var(--red)'
  const bgColor = review.is_ok ? (isOld ? 'rgba(230,126,34,0.06)' : 'rgba(39,174,96,0.06)') : 'rgba(192,57,43,0.06)'
  const icon = review.is_ok ? (isOld ? '⚠' : '✔') : '✕'
  const iconColor = review.is_ok ? (isOld ? 'var(--yellow-l)' : 'var(--green-l)') : 'var(--red-l)'
  const statusText = review.is_ok ? (isOld ? 'Revisada (hace ' + daysSince + ' días)' : 'Revisada y correcta') : 'Revisada — con incidencias'

  return (
    <div className="card" style={{ marginBottom: 20, padding: '14px 20px', border: '1px solid ' + borderColor, background: bgColor }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 32, lineHeight: 1, color: iconColor }}>{icon}</div>
          <div>
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 700, color: iconColor, letterSpacing: 0.5 }}>
              Última revisión — {statusText}
            </div>
            <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 3 }}>
              {dateStr} a las {timeStr} · por <strong style={{ color: 'var(--light)' }}>{review.reviewed_by}</strong>
              {daysSince === 0 ? ' · Hoy' : daysSince === 1 ? ' · Ayer' : ' · Hace ' + daysSince + ' días'}
            </div>
            {review.notes && (
              <div style={{ fontSize: 12, color: 'var(--light)', marginTop: 5, background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: 6, borderLeft: '2px solid ' + borderColor }}>
                📝 {review.notes}
              </div>
            )}
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onOpenModal}
          style={{ fontSize: 12, flexShrink: 0 }}
        >
          ↻ Nueva revisión
        </button>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────

function ZoneBlock({ zone, status, items, selected, onClick, flex = 1, minH = 80 }) {
  const colors = { ok: 'var(--green)', warn: 'var(--yellow)', alert: 'var(--red)' }
  const bg     = { ok: 'rgba(39,174,96,0.07)', warn: 'rgba(230,126,34,0.07)', alert: 'rgba(192,57,43,0.07)' }
  const missing = items.filter(i => i.qty < i.min)

  return (
    <div
      onClick={onClick}
      style={{
        flex, minHeight: minH,
        border: `2px solid ${colors[status]}`,
        background: selected ? `rgba(255,69,0,0.12)` : bg[status],
        outline: selected ? '2px solid var(--fire)' : 'none',
        outlineOffset: 2,
        borderRadius: 8,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '8px 6px', textAlign: 'center',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: 18 }}>{zone?.icon}</div>
      <div style={{ fontFamily: 'Barlow Condensed', fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 1.2, marginTop: 3 }}>{zone?.label}</div>
      <div style={{ fontSize: 10, color: 'var(--mid)', marginTop: 2 }}>{items.length} artíc.</div>
      {missing.length > 0 && (
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--red-l)', marginTop: 2 }}>⚠ {missing.length} falta{missing.length>1?'n':''}</div>
      )}
    </div>
  )
}

function ZoneCard({ zone, zoneItems, itemStates, onSetOk, onSetIssue, onMarkAll, onAdd, onAdjust, onDelete }) {
  const status = zoneStatus(zoneItems)
  const chipMap = { ok: 'chip-ok', warn: 'chip-warn', alert: 'chip-alert' }
  const label   = { ok: 'OK', warn: 'Stock bajo', alert: 'Faltante' }
  const missing = zoneItems.filter(i => i.qty < i.min).length

  return (
    <div className="card">
      <div className="card-header">
        <div style={{ flex: 1 }}>
          <div className="card-title">
            {zone.icon} {zone.label}
            <span className={`chip ${chipMap[status]}`}>{label[status]}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>
            {(() => {
              const okCount    = zoneItems.filter(i => itemStates[i.id]?.status === 'ok').length
              const issueCount = zoneItems.filter(i => itemStates[i.id]?.status === 'issue').length
              return <>{zoneItems.length} artículos{missing > 0 ? ` · ${missing} por reponer` : ''}{okCount > 0 && <span style={{ color: 'var(--green-l)' }}> · ✔ {okCount} ok</span>}{issueCount > 0 && <span style={{ color: 'var(--red-l)' }}> · ⚠ {issueCount} incidencia{issueCount > 1 ? 's' : ''}</span>}</>
            })()}
          </div>
        </div>
        {zoneItems.length > 0 && (
          <button
            onClick={() => {
              onMarkAll(zoneItems)
            }}
            style={{
              background: 'transparent', border: '1px solid var(--border2)', borderRadius: 6,
              color: 'var(--mid)', fontSize: 11, padding: '4px 10px', cursor: 'pointer',
              fontFamily: 'Barlow', transition: 'all 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.target.style.borderColor = 'var(--green)'; e.target.style.color = 'var(--green-l)' }}
            onMouseLeave={e => { e.target.style.borderColor = ''; e.target.style.color = '' }}
          >
            {zoneItems.every(i => itemStates[i.id]?.status === 'ok') ? '✕ Desmarcar todo' : '✔ Marcar todo OK'}
          </button>
        )}
      </div>

      {zoneItems.length === 0 ? (
        <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--mid)' }}>Sin artículos.</div>
      ) : (
        zoneItems.map(item => (
          <ItemRow key={item.id} item={item} itemState={itemStates[item.id] || { status: null, note: '' }} onSetOk={() => onSetOk(item.id)} onSetIssue={() => onSetIssue(item.id, item.name)} onAdjust={d => onAdjust(item.id, d)} onDelete={() => onDelete(item.id, item.name)} />
        ))
      )}

      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={onAdd}
          style={{ width: '100%', background: 'transparent', border: '1px dashed var(--border2)', borderRadius: 6, color: 'var(--mid)', fontFamily: 'Barlow', fontSize: 12, padding: '7px', cursor: 'pointer', transition: 'all 0.2s' }}
          onMouseEnter={e => { e.target.style.borderColor = 'var(--fire)'; e.target.style.color = 'var(--fire)' }}
          onMouseLeave={e => { e.target.style.borderColor = ''; e.target.style.color = '' }}
        >
          ＋ Añadir artículo
        </button>
      </div>
    </div>
  )
}

function ItemRow({ item, itemState, onSetOk, onSetIssue, onAdjust, onDelete }) {
  const [hover, setHover] = useState(false)
  const status    = itemState?.status || null   // null | 'ok' | 'issue'
  const note      = itemState?.note || ''
  const isMissing = item.qty === 0
  const isLow     = item.qty > 0 && item.qty < item.min
  const barColor  = status === 'ok' ? 'var(--green)' : status === 'issue' ? 'var(--red)' : isMissing ? 'var(--red-l)' : isLow ? 'var(--yellow-l)' : 'var(--green)'
  const qtyColor  = isMissing ? 'var(--red-l)' : isLow ? 'var(--yellow-l)' : 'var(--green-l)'

  const rowBg = status === 'ok'
    ? 'rgba(39,174,96,0.05)'
    : status === 'issue'
      ? 'rgba(192,57,43,0.07)'
      : hover ? 'rgba(255,255,255,0.025)' : 'transparent'

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: rowBg, transition: 'background 0.15s', opacity: status === 'ok' ? 0.75 : 1 }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {/* ✔ OK checkbox */}
        <div
          onClick={onSetOk}
          title={status === 'ok' ? 'Quitar revisión OK' : 'Marcar como OK'}
          style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: 'pointer',
            border: status === 'ok' ? '2px solid var(--green)' : '2px solid var(--border2)',
            background: status === 'ok' ? 'var(--green)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            boxShadow: status === 'ok' ? '0 0 8px rgba(39,174,96,0.3)' : 'none',
          }}
        >
          {status === 'ok' && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>

        {/* ✕ Incidencia checkbox */}
        <div
          onClick={onSetIssue}
          title={status === 'issue' ? 'Editar incidencia' : 'Marcar incidencia'}
          style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: 'pointer',
            border: status === 'issue' ? '2px solid var(--red)' : '2px solid var(--border2)',
            background: status === 'issue' ? 'var(--red)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            boxShadow: status === 'issue' ? '0 0 8px rgba(192,57,43,0.35)' : 'none',
          }}
        >
          {status === 'issue' && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2l-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
        </div>

        <div style={{ width: 3, height: 32, borderRadius: 2, background: barColor, flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, textDecoration: status === 'ok' ? 'line-through' : 'none', color: status === 'ok' ? 'var(--mid)' : status === 'issue' ? 'var(--red-l)' : 'inherit' }}>
            {item.name}
          </div>
          {item.desc && <div style={{ fontSize: 11, color: 'var(--mid)' }}>{item.desc}</div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {(isMissing || isLow) && status !== 'ok' && status !== 'issue' && (
            <span style={{ fontSize: 9, fontWeight: 700, color: isMissing ? 'var(--red-l)' : 'var(--yellow-l)', background: isMissing ? 'rgba(192,57,43,0.15)' : 'rgba(230,126,34,0.15)', border: `1px solid ${isMissing ? 'rgba(192,57,43,0.3)' : 'rgba(230,126,34,0.3)'}`, padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase' }}>
              {isMissing ? 'FALTA' : 'BAJO'}
            </span>
          )}
          {status === 'ok' && (
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green-l)', background: 'rgba(39,174,96,0.12)', border: '1px solid rgba(39,174,96,0.25)', padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase' }}>✔ OK</span>
          )}
          {status === 'issue' && (
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--red-l)', background: 'rgba(192,57,43,0.15)', border: '1px solid rgba(192,57,43,0.3)', padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase' }}>⚠ INCIDENCIA</span>
          )}
          <button className="btn-icon" style={{ fontSize: 16 }} onClick={() => onAdjust(-1)}>−</button>
          <span style={{ fontFamily: 'Roboto Mono', fontSize: 14, fontWeight: 500, color: qtyColor, minWidth: 24, textAlign: 'center' }}>{item.qty}</span>
          <button className="btn-icon" style={{ fontSize: 16 }} onClick={() => onAdjust(1)}>＋</button>
          <span style={{ fontSize: 11, color: 'var(--mid)', marginLeft: 2 }}>/ {item.min}</span>
        </div>
        {hover && status !== 'issue' && (
          <button className="btn-icon" style={{ color: 'var(--red-l)', marginLeft: 4 }} onClick={onDelete}>✕</button>
        )}
      </div>

      {/* Nota de incidencia inline */}
      {status === 'issue' && note && (
        <div
          onClick={onSetIssue}
          style={{ margin: '0 18px 8px 56px', padding: '6px 10px', background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.25)', borderRadius: 6, fontSize: 12, color: 'var(--red-l)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          title="Pulsa para editar"
        >
          <span style={{ opacity: 0.6 }}>📝</span> {note}
          <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.5 }}>editar</span>
        </div>
      )}
    </div>
  )
}
