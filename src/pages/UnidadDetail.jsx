import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useApp } from '../lib/AppContext'
import { supabase } from '../lib/supabase'
import { buildZones, zoneStatus, unitSummary, unitAlertLevel } from '../data/units'
import Modal from '../components/Modal'

function cloneUnitItems(unitItems = {}) {
  const next = {}
  Object.entries(unitItems || {}).forEach(([zoneId, arr]) => {
    next[zoneId] = (arr || []).map(it => ({ ...it }))
  })
  return next
}

function makeTempItemId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isPersistedItemId(rawId) {
  const txt = String(rawId || '')
  return txt !== '' && !txt.startsWith('tmp-') && /^[0-9]+$/.test(txt)
}
const MISSING_NOTE = 'Marcado por bombero: NO está'

function normalizeItemsForCompare(unitItems = {}) {
  const zones = Object.keys(unitItems || {}).sort()
  const out = {}
  zones.forEach((zoneId) => {
    out[zoneId] = (unitItems[zoneId] || [])
      .map((it) => ({
        id: String(it.id),
        name: String(it.name || ''),
        desc: String(it.desc || ''),
        qty: Number(it.qty) || 0,
        min: Number(it.min) || 0,
      }))
      .sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0))
  })
  return out
}

export default function UnidadDetail() {
  const { id } = useParams()
  const unitId = parseInt(id)
  const navigate = useNavigate()
  const location = useLocation()
  const {
    configs, items, reviews, reviewUnit, updateQty, addItem, deleteItem, editItem, updateUnitConfig,
    showToast, session, itemStates: globalItemStates, revisionIncidents,
    setUnitItemState, refreshInventory
  } = useApp()

  const [selectedZone, setSelectedZone] = useState(null)
  const [addModal, setAddModal] = useState(null)
  const [cfgModal, setCfgModal] = useState(false)
  const [reviewModal, setReviewModal]     = useState(false)
  const [reviewNotes, setReviewNotes]     = useState('')
  const [reviewIsOk, setReviewIsOk]       = useState(true)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [issueModal, setIssueModal] = useState(null)  // { itemId, itemName, note }
  const [issueType, setIssueType] = useState('missing') // missing | incident
  const [issueDraft, setIssueDraft] = useState('')
  const [issueFiles, setIssueFiles] = useState([])
  const [issueSaving, setIssueSaving] = useState(false)
  const [draftItemStates, setDraftItemStates] = useState({})
  const [hasLocalIncidenceEdits, setHasLocalIncidenceEdits] = useState(false)
  const [savingIncidences, setSavingIncidences] = useState(false)
  const [focusedItemId, setFocusedItemId] = useState(null)
  const [newItem, setNewItem] = useState({ name: '', desc: '', qty: 1, min: 1 })
  const [cfgForm, setCfgForm] = useState(null)
  const [draftItems, setDraftItems] = useState({})
  const [draftConfig, setDraftConfig] = useState(null)
  const [hasPendingInventoryChanges, setHasPendingInventoryChanges] = useState(false)
  const [savingInventory, setSavingInventory] = useState(false)
  const [deletedItemIds, setDeletedItemIds] = useState([])
  const [unitSearch, setUnitSearch] = useState('')

  const goToDailyRevision = () => {
    guardedNavigate('/revision', {
      state: {
        fromUnitId: unitId,
        openUnitReview: true,
        reviewNonce: Date.now(),
      },
    })
  }

  if (!configs[unitId]) {
    return <div style={{ padding: 40, color: 'var(--mid)' }}>Unidad no encontrada.</div>
  }

  const persistedCfg = configs[unitId]
  const cfg = draftConfig || persistedCfg
  const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
  const workingItems =
    hasPendingInventoryChanges || Object.keys(draftItems || {}).length > 0
      ? draftItems
      : (items[unitId] || {})
  const extraZones = Object.keys(workingItems || {})
    .filter(zoneId => !zones.some(z => z.id === zoneId))
    .map(zoneId => ({ id: zoneId, label: `Zona SQL: ${zoneId}`, icon: '🧩', extra: true }))
  const allZones = [...zones, ...extraZones]
  const summary = unitSummary(workingItems, zones)
  const level = unitAlertLevel(workingItems, zones)
  const inventoryDirty = useMemo(() => {
    const cfgBase = persistedCfg || {}
    const cfgDraft = draftConfig || persistedCfg || {}
    const cfgChanged =
      Number(cfgBase.numCofres) !== Number(cfgDraft.numCofres) ||
      Boolean(cfgBase.hasTecho) !== Boolean(cfgDraft.hasTecho) ||
      Boolean(cfgBase.hasTrasera) !== Boolean(cfgDraft.hasTrasera)

    const deletedChanged = (deletedItemIds || []).length > 0
    const baseNorm = normalizeItemsForCompare(items[unitId] || {})
    const draftNorm = normalizeItemsForCompare(draftItems || {})
    const itemsChanged = JSON.stringify(baseNorm) !== JSON.stringify(draftNorm)

    return cfgChanged || deletedChanged || itemsChanged || hasPendingInventoryChanges
  }, [persistedCfg, draftConfig, deletedItemIds, items, unitId, draftItems, hasPendingInventoryChanges])
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
      const matched = (workingItems?.[zoneByLabel.id] || []).find(it => String(it.name).trim().toLowerCase() === String(inc.item || '').trim().toLowerCase())
      if (!matched) return
      fromRevision[matched.id] = { status: 'issue', note: inc.note || '' }
    })
    return { ...localWithoutIssues, ...fromRevision }
  }, [globalItemStates, revisionIncidents, unitId, zones, workingItems])

  useEffect(() => {
    if (hasPendingInventoryChanges) return
    setDraftConfig({ ...persistedCfg })
    setDraftItems(cloneUnitItems(items[unitId] || {}))
    setDeletedItemIds([])
  }, [persistedCfg, items, unitId, hasPendingInventoryChanges])

  useEffect(() => {
    if (!hasLocalIncidenceEdits) {
      setDraftItemStates(itemStates)
    }
  }, [itemStates, hasLocalIncidenceEdits])

  const statusLabel = { ok: 'Completa', warn: 'Stock bajo', alert: 'Faltante' }
  const pillClass   = { ok: 'pill-ok', warn: 'pill-warn', alert: 'pill-alert' }
  const dotClass    = { ok: 'dot-ok', warn: 'dot-warn', alert: 'dot-alert' }
  const zoneStatusColor = { ok: 'var(--green)', warn: 'var(--yellow)', alert: 'var(--red)' }

  const handleAddItem = () => {
    if (!newItem.name.trim()) { showToast('Escribe un nombre', 'warn'); return }
    if (!addModal) return
    const toAdd = {
      id: makeTempItemId(),
      name: newItem.name.trim(),
      desc: newItem.desc || '',
      qty: Math.max(0, Number(newItem.qty) || 0),
      min: Math.max(0, Number(newItem.min) || 0),
    }
    setDraftItems(prev => ({
      ...prev,
      [addModal]: [...(prev?.[addModal] || []), toAdd],
    }))
    setHasPendingInventoryChanges(true)
    showToast(`Añadido: ${newItem.name}`, 'ok')
    setNewItem({ name: '', desc: '', qty: 1, min: 1 })
    setAddModal(null)
  }

  const handleCfgSave = () => {
    setDraftConfig({ ...cfgForm })
    setHasPendingInventoryChanges(true)
    showToast('Configuración actualizada', 'ok')
    setCfgModal(false)
    setSelectedZone(null)
  }

  const saveInventoryDraft = async () => {
    if (savingInventory) return
    const baseItems = items[unitId] || {}
    const draft = draftItems || {}
    const currentCfg = persistedCfg
    const nextCfg = draftConfig || persistedCfg
    const deletedIds = new Set((deletedItemIds || []).map(String))
    const nextDraft = cloneUnitItems(draft)
    setSavingInventory(true)
    try {
      if (
        currentCfg.numCofres !== nextCfg.numCofres ||
        currentCfg.hasTecho !== nextCfg.hasTecho ||
        currentCfg.hasTrasera !== nextCfg.hasTrasera
      ) {
        await updateUnitConfig(unitId, nextCfg)
      }

      const zoneIds = Array.from(new Set([
        ...Object.keys(baseItems || {}),
        ...Object.keys(draft || {}),
      ]))

      for (const zoneId of zoneIds) {
        const baseZone = baseItems[zoneId] || []
        const draftZone = draft[zoneId] || []
        const baseMap = new Map(baseZone.map(it => [String(it.id), it]))
        const nextZone = nextDraft[zoneId] || []

        for (const baseItem of baseZone) {
          if (!deletedIds.has(String(baseItem.id))) continue
          await deleteItem(unitId, zoneId, baseItem.id)
        }

        for (const draftItem of draftZone) {
          const idTxt = String(draftItem.id)
          const isTemp = idTxt.startsWith('tmp-')
          if (isTemp) {
            const created = await addItem(unitId, zoneId, {
              name: draftItem.name,
              desc: draftItem.desc || '',
              qty: Number(draftItem.qty) || 0,
              min: Number(draftItem.min) || 0,
            })
            if (created?.id) {
              const idx = nextZone.findIndex(it => String(it.id) === idTxt)
              if (idx >= 0) {
                nextZone[idx] = { ...created }
                nextDraft[zoneId] = [...nextZone]
              }
            }
            continue
          }

          if (deletedIds.has(idTxt)) continue
          const baseItem = baseMap.get(idTxt)
          if (!baseItem) continue
          if (
            String(baseItem.name) !== String(draftItem.name) ||
            String(baseItem.desc || '') !== String(draftItem.desc || '') ||
            Number(baseItem.min) !== Number(draftItem.min)
          ) {
            await editItem(unitId, zoneId, baseItem.id, {
              name: draftItem.name,
              desc: draftItem.desc || '',
              qty: Number(draftItem.qty) || 0,
              min: Number(draftItem.min) || 0,
            })
          } else if (Number(baseItem.qty) !== Number(draftItem.qty)) {
            const qtyRes = await updateQty(unitId, zoneId, baseItem.id, Number(draftItem.qty) - Number(baseItem.qty))
            if (!qtyRes?.ok) {
              throw new Error(qtyRes?.error || 'qty_save_error')
            }
          }

          if (Number(draftItem.qty) === 0) {
            const missingState = { status: 'issue', note: MISSING_NOTE }
            const missingRes = await setUnitItemState(unitId, baseItem.id, missingState)
            if (!missingRes?.ok) throw new Error(missingRes?.error || 'missing_sync_error')
            setDraftItemStates(prev => ({ ...prev, [baseItem.id]: missingState }))
          } else {
            const curr = draftItemStates?.[baseItem.id] || {}
            if (curr?.status === 'issue' && String(curr?.note || '').trim() === MISSING_NOTE) {
              const resolveRes = await setUnitItemState(unitId, baseItem.id, { status: null, note: '' })
              if (!resolveRes?.ok) throw new Error(resolveRes?.error || 'resolve_sync_error')
              setDraftItemStates(prev => ({ ...prev, [baseItem.id]: { status: null, note: '' } }))
            }
          }
        }
      }

      await refreshInventory()
      setDraftItems(nextDraft)
      setDeletedItemIds([])
      setHasPendingInventoryChanges(false)
      showToast('Inventario actualizado', 'ok')
    } catch (e) {
      showToast(`No se pudo guardar inventario: ${e?.message || 'error'}`, 'error')
    } finally {
      setSavingInventory(false)
    }
  }

  const resetInventoryDraft = () => {
    setDraftConfig({ ...persistedCfg })
    setDraftItems(cloneUnitItems(items[unitId] || {}))
    setDeletedItemIds([])
    setHasPendingInventoryChanges(false)
    showToast('Cambios de inventario descartados', 'warn')
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
    setIssueSaving(true)
    const note = issueType === 'missing'
      ? MISSING_NOTE
      : (issueDraft?.trim() || 'Marcado por bombero: PRESENTA incidencia')
    const uploadedUrls = []
    if (issueType === 'incident' && issueFiles.length > 0) {
      const today = new Date().toISOString().slice(0, 10)
      for (const file of issueFiles) {
        const safeName = String(file.name || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')
        const ext = safeName.includes('.') ? safeName.split('.').pop() : 'jpg'
        const path = `${today}/unidades/u${unitId}/item-${issueModal.itemId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('revision-observaciones').upload(path, file, { upsert: false })
        if (uploadErr) {
          setIssueSaving(false)
          showToast(`No se pudo subir foto: ${uploadErr.message || 'error'}`, 'error')
          return
        }
        const { data: pub } = supabase.storage.from('revision-observaciones').getPublicUrl(path)
        if (pub?.publicUrl) uploadedUrls.push(pub.publicUrl)
      }
    }
    const next = { status: 'issue', note }

    // Si se marca como "No está", forzamos cantidad a 0 en el borrador de inventario.
    if (issueType === 'missing' && issueModal?.zoneId) {
      setDraftItems(prev => {
        const zoneItems = (prev?.[issueModal.zoneId] || []).map(it => {
          if (String(it.id) !== String(issueModal.itemId)) return it
          return { ...it, qty: 0 }
        })
        return { ...prev, [issueModal.zoneId]: zoneItems }
      })
      setHasPendingInventoryChanges(true)
    }

    setDraftItemStates(prev => ({ ...prev, [issueModal.itemId]: next }))
    const saveRes = await setUnitItemState(unitId, issueModal.itemId, next, { photoUrls: uploadedUrls })
    if (!saveRes?.ok) {
      setIssueSaving(false)
      showToast(`No se pudo guardar incidencia: ${saveRes?.error || 'error'}`, 'error')
      return
    }
    setIssueSaving(false)
    showToast('Incidencia guardada', 'ok')
    setIssueModal(null)
    setIssueType('missing')
    setIssueFiles([])
    setIssueDraft('')
  }

  const guardedNavigate = (to, options = undefined) => {
    if (hasLocalIncidenceEdits || inventoryDirty) {
      const ok = window.confirm('Tienes cambios sin guardar. Pulsa "Actualizar inventario" y/o guarda incidencias antes de salir. ¿Seguro que quieres continuar?')
      if (!ok) return
    }
    navigate(to, options)
  }

  const saveIncidenceDraft = async () => {
    const keySet = new Set([
      ...Object.keys(itemStates || {}),
      ...Object.keys(draftItemStates || {}),
    ])
    const changedIds = Array.from(keySet).filter(k => {
      const base = itemStates?.[k] || { status: null, note: '' }
      const draft = draftItemStates?.[k] || { status: null, note: '' }
      return (base.status || null) !== (draft.status || null) || String(base.note || '') !== String(draft.note || '')
    })
    if (changedIds.length === 0) {
      showToast('No hay cambios pendientes', 'warn')
      setHasLocalIncidenceEdits(false)
      return
    }
    setSavingIncidences(true)
    for (const itemId of changedIds) {
      const draft = draftItemStates?.[itemId] || { status: null, note: '' }
      const res = await setUnitItemState(unitId, itemId, { status: draft.status || null, note: draft.note || '' })
      if (!res?.ok) {
        setSavingIncidences(false)
        showToast(`No se pudo guardar incidencia (${itemId}): ${res?.error || 'error'}`, 'error')
        return
      }
    }
    setSavingIncidences(false)
    setHasLocalIncidenceEdits(false)
    showToast('Incidencias guardadas', 'ok')
  }

  const resetIncidenceDraft = () => {
    setDraftItemStates(itemStates)
    setHasLocalIncidenceEdits(false)
    showToast('Cambios descartados', 'warn')
  }

  const openCfg = () => {
    setCfgForm({ ...cfg })
    setCfgModal(true)
  }

  useEffect(() => {
    setSelectedZone(null)
    setFocusedItemId(null)
    setHasLocalIncidenceEdits(false)
    setHasPendingInventoryChanges(false)
  }, [unitId])

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!hasLocalIncidenceEdits && !inventoryDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasLocalIncidenceEdits, inventoryDirty])

  useEffect(() => {
    if (!inventoryDirty && !hasLocalIncidenceEdits) return
    const onDocClickCapture = (e) => {
      const anchor = e.target?.closest?.('a[href]')
      if (!anchor) return
      const href = anchor.getAttribute('href') || ''
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      const currentPath = window.location.pathname + window.location.search
      if (href === currentPath) return
      const ok = window.confirm('Tienes cambios sin guardar. Pulsa "Actualizar inventario" y/o guarda incidencias antes de salir. ¿Quieres salir sin guardar?')
      if (!ok) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('click', onDocClickCapture, true)
    return () => document.removeEventListener('click', onDocClickCapture, true)
  }, [inventoryDirty, hasLocalIncidenceEdits])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const zoneParam = String(params.get('zone') || '').trim()
    const zoneIdParam = String(params.get('zoneId') || '').trim()
    const itemParam = String(params.get('item') || '').trim().toLowerCase()
    if (!zoneParam && !zoneIdParam && !itemParam) return

    const zoneMatch = allZones.find(z =>
      String(z.id).trim().toLowerCase() === zoneIdParam.toLowerCase() ||
      String(z.id).trim().toLowerCase() === zoneParam.toLowerCase() ||
      String(z.label).trim().toLowerCase() === zoneParam.toLowerCase()
    )

    const fallbackZone = allZones.find(z => {
      if (!itemParam) return false
      return (workingItems?.[z.id] || []).some(it => String(it.name).trim().toLowerCase() === itemParam)
    })

    const finalZone = zoneMatch || fallbackZone
    if (finalZone?.id) setSelectedZone(finalZone.id)

    if (itemParam) {
      const searchZones = finalZone ? [finalZone] : allZones
      let found = null
      searchZones.forEach(z => {
        if (found) return
        found = (workingItems?.[z.id] || []).find(it => String(it.name).trim().toLowerCase() === itemParam) || null
      })
      setFocusedItemId(found?.id || null)
    }
  }, [location.search, allZones, workingItems])

  const zonesToShow = selectedZone ? allZones.filter(z => z.id === selectedZone) : allZones
  const normalizedUnitSearch = String(unitSearch || '').trim().toLowerCase()
  const filteredItemsByZone = useMemo(() => {
    if (!normalizedUnitSearch) return null
    const out = {}
    allZones.forEach((z) => {
      const base = workingItems?.[z.id] || []
      out[z.id] = base.filter((it) => {
        const name = String(it.name || '').toLowerCase()
        const desc = String(it.desc || '').toLowerCase()
        return name.includes(normalizedUnitSearch) || desc.includes(normalizedUnitSearch)
      })
    })
    return out
  }, [normalizedUnitSearch, allZones, workingItems])

  const visibleZones = useMemo(() => {
    if (!normalizedUnitSearch) return zonesToShow
    return zonesToShow.filter(z => (filteredItemsByZone?.[z.id] || []).length > 0)
  }, [normalizedUnitSearch, zonesToShow, filteredItemsByZone])

  const canPortal = typeof window !== 'undefined' && typeof document !== 'undefined'

  return (
    <>
    <div className="animate-in page-container">

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ cursor: 'pointer', color: 'var(--light)' }} onClick={() => guardedNavigate('/unidades')}>Unidades</span>
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {hasLocalIncidenceEdits && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={resetIncidenceDraft} disabled={savingIncidences}>
                  Descartar cambios
                </button>
                <button className="btn btn-primary btn-sm" onClick={saveIncidenceDraft} disabled={savingIncidences}>
                  {savingIncidences ? 'Guardando...' : 'Guardar cambios de incidencias'}
                </button>
              </>
            )}
            {inventoryDirty && (
              <button className="btn btn-ghost btn-sm" onClick={resetInventoryDraft} disabled={savingInventory}>
                Descartar inventario
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={openCfg}>⚙ Configurar</button>
            <button
              className={`btn btn-sm btn-inventory-update ${inventoryDirty ? 'btn-pending-save' : ''}`}
              onClick={saveInventoryDraft}
              disabled={savingInventory || !inventoryDirty}
            >
              {savingInventory ? 'Guardando inventario...' : '↻ Actualizar inventario'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={goToDailyRevision}>✔ Revisar unidad</button>
            <button className="btn btn-primary btn-sm" onClick={() => setAddModal(zones[0]?.id || allZones[0]?.id)}>＋ Añadir artículo</button>
          </div>
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

      <div className="card" style={{ padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--mid)', letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700 }}>
            Buscar en esta unidad
          </span>
          <input
            className="form-input"
            value={unitSearch}
            onChange={e => setUnitSearch(e.target.value)}
            placeholder={`Ej: manguera, extintor, ${selectedZone ? 'solo zona seleccionada' : 'cualquier zona'}...`}
            style={{ maxWidth: 460 }}
          />
          {unitSearch && (
            <button className="btn btn-ghost btn-sm" onClick={() => setUnitSearch('')}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Review panel */}
      <ReviewPanel
        review={reviews[unitId]}
        onOpenModal={goToDailyRevision}
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
            const st = zoneStatus(workingItems?.['cabina'] || [])
            return <ZoneBlock key="cabina" zone={z} status={st} items={workingItems?.['cabina'] || []} selected={selectedZone === 'cabina'} onClick={() => setSelectedZone(selectedZone === 'cabina' ? null : 'cabina')} flex={1.3} />
          })()}

          {/* Body: techo + cofres */}
          <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cfg.hasTecho && (() => {
              const z = zones.find(z => z.id === 'techo')
              const st = zoneStatus(workingItems?.['techo'] || [])
              return <ZoneBlock key="techo" zone={z} status={st} items={workingItems?.['techo'] || []} selected={selectedZone === 'techo'} onClick={() => setSelectedZone(selectedZone === 'techo' ? null : 'techo')} flex={1} minH={44} />
            })()}
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: cfg.numCofres }, (_, i) => {
                const zid = `cofre${i+1}`
                const z = zones.find(z => z.id === zid)
                const st = zoneStatus(workingItems?.[zid] || [])
                return <ZoneBlock key={zid} zone={z} status={st} items={workingItems?.[zid] || []} selected={selectedZone === zid} onClick={() => setSelectedZone(selectedZone === zid ? null : zid)} flex={1} />
              })}
            </div>
          </div>

          {/* Trasera */}
          {cfg.hasTrasera && (() => {
            const z = zones.find(z => z.id === 'trasera')
            const st = zoneStatus(workingItems?.['trasera'] || [])
            return <ZoneBlock key="trasera" zone={z} status={st} items={workingItems?.['trasera'] || []} selected={selectedZone === 'trasera'} onClick={() => setSelectedZone(selectedZone === 'trasera' ? null : 'trasera')} flex={0.9} />
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
        {visibleZones.map(zone => {
          const zoneItemsAll = workingItems?.[zone.id] || []
          const zoneItemsVisible = normalizedUnitSearch ? (filteredItemsByZone?.[zone.id] || []) : zoneItemsAll
          return (
          <ZoneCard
            key={zone.id}
            zone={zone}
            zoneItems={zoneItemsVisible}
            zoneItemsAll={zoneItemsAll}
            itemStates={draftItemStates}
            focusedItemId={focusedItemId}
            onSetOk={(itemId) => {
              const current = draftItemStates[itemId]?.status || null
              setDraftItemStates(prev => ({ ...prev, [itemId]: { status: current === 'ok' ? null : 'ok', note: '' } }))
              setHasLocalIncidenceEdits(true)
            }}
            onSetIssue={async (itemId, itemName, currentStatus) => {
              if (currentStatus === 'issue') {
                const ok = window.confirm('¿Marcar esta incidencia como resuelta?')
                if (!ok) return
                const res = await setUnitItemState(unitId, itemId, { status: null, note: '' })
                if (!res?.ok) {
                  showToast(`No se pudo resolver incidencia: ${res?.error || 'error'}`, 'error')
                  return
                }
                setDraftItemStates(prev => ({ ...prev, [itemId]: { status: null, note: '' } }))
                setHasLocalIncidenceEdits(false)
                showToast('Incidencia resuelta', 'ok')
                return
              }
              setIssueType('missing')
              setIssueFiles([])
              setIssueDraft(draftItemStates[itemId]?.note || '')
              setIssueModal({ itemId, itemName, zoneId: zone.id, zoneLabel: zone.label })
            }}
            onMarkAll={(zoneItems) => {
              const allOk = zoneItems.every(i => draftItemStates[i.id]?.status === 'ok')
              const next = { ...draftItemStates }
              zoneItems.forEach(i => {
                next[i.id] = { status: allOk ? null : 'ok', note: '' }
              })
              setDraftItemStates(next)
              setHasLocalIncidenceEdits(true)
            }}
            onAdd={() => setAddModal(zone.id)}
            onAdjust={(itemId, delta) => {
              let nextQty = null
              setDraftItems(prev => {
                const zoneItems = (prev?.[zone.id] || []).map(it => {
                  if (String(it.id) !== String(itemId)) return it
                  nextQty = Math.max(0, (Number(it.qty) || 0) + delta)
                  return { ...it, qty: nextQty }
                })
                return { ...prev, [zone.id]: zoneItems }
              })
              if (nextQty === 0) {
                setDraftItemStates(prev => ({ ...prev, [itemId]: { status: 'issue', note: MISSING_NOTE } }))
              } else {
                setDraftItemStates(prev => {
                  const curr = prev?.[itemId] || {}
                  if (curr.status === 'issue' && String(curr.note || '').trim() === MISSING_NOTE) {
                    return { ...prev, [itemId]: { status: null, note: '' } }
                  }
                  return prev
                })
              }
              setHasPendingInventoryChanges(true)
            }}
            onDelete={(itemId, name) => {
              if (isPersistedItemId(itemId)) {
                setDeletedItemIds(prev => Array.from(new Set([...prev, String(itemId)])))
              }
              setDraftItems(prev => ({
                ...prev,
                [zone.id]: (prev?.[zone.id] || []).filter(it => String(it.id) !== String(itemId)),
              }))
              setHasPendingInventoryChanges(true)
              showToast(`Eliminado: ${name}`, 'warn')
            }}
          />
          )
        })}
      </div>

      {normalizedUnitSearch && visibleZones.length === 0 && (
        <div className="card" style={{ padding: 16, marginTop: 12, color: 'var(--mid)' }}>
          No hay coincidencias en esta unidad para <strong style={{ color: 'var(--light)' }}>"{unitSearch}"</strong>.
        </div>
      )}

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
              {allZones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
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
                disabled={issueSaving}
                style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
              >
                {issueSaving ? 'Guardando...' : '⚠ Guardar incidencia'}
              </button>
            </>
          }
        >
          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--red-l)' }}>
            Elige el tipo de marca para este artículo.
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{
                borderColor: issueType === 'missing' ? 'var(--yellow)' : 'var(--border2)',
                color: issueType === 'missing' ? 'var(--yellow-l)' : 'var(--mid)',
                background: issueType === 'missing' ? 'rgba(241,196,15,0.12)' : 'transparent',
              }}
              onClick={() => setIssueType('missing')}
            >
              ✕ No está
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{
                borderColor: issueType === 'incident' ? 'var(--red)' : 'var(--border2)',
                color: issueType === 'incident' ? 'var(--red-l)' : 'var(--mid)',
                background: issueType === 'incident' ? 'rgba(192,57,43,0.12)' : 'transparent',
              }}
              onClick={() => setIssueType('incident')}
            >
              ⚠ Presenta incidencia
            </button>
          </div>
          <div className="form-group">
            <label className="form-label">
              {issueType === 'missing' ? 'Detalle (opcional)' : 'Descripción de la incidencia'}
            </label>
            <textarea
              className="form-input"
              style={{ height: 100, resize: 'vertical', fontFamily: 'Barlow' }}
              placeholder={issueType === 'missing' ? 'Opcional: dónde falta o desde cuándo...' : 'Ej: Manguera rota, extintor caducado, fuga, pieza suelta...'}
              value={issueDraft}
              onChange={e => setIssueDraft(e.target.value)}
              autoFocus
            />
          </div>
          {issueType === 'incident' && (
            <div className="form-group">
              <label className="form-label">Foto (opcional)</label>
              <input
                className="form-input"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(e) => setIssueFiles(Array.from(e.target.files || []))}
              />
              {issueFiles.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--mid)' }}>
                  {issueFiles.length} foto(s) seleccionada(s)
                </div>
              )}
            </div>
          )}
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
    {inventoryDirty && canPortal && createPortal(
      <button
        className="btn btn-sm btn-inventory-update btn-pending-save floating-inventory-save"
        onClick={saveInventoryDraft}
        disabled={savingInventory}
      >
        {savingInventory ? 'Guardando inventario...' : 'Guardar cambios'}
      </button>,
      document.body
    )}
    </>
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

function ZoneCard({ zone, zoneItems, zoneItemsAll, itemStates, focusedItemId, onSetOk, onSetIssue, onMarkAll, onAdd, onAdjust, onDelete }) {
  const allItems = zoneItemsAll || zoneItems || []
  const status = zoneStatus(allItems)
  const chipMap = { ok: 'chip-ok', warn: 'chip-warn', alert: 'chip-alert' }
  const label   = { ok: 'OK', warn: 'Stock bajo', alert: 'Faltante' }
  const missing = allItems.filter(i => i.qty < i.min).length

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
              const okCount    = allItems.filter(i => itemStates[i.id]?.status === 'ok').length
              const issueCount = allItems.filter(i => itemStates[i.id]?.status === 'issue').length
              return <>{allItems.length} artículos{missing > 0 ? ` · ${missing} por reponer` : ''}{okCount > 0 && <span style={{ color: 'var(--green-l)' }}> · ✔ {okCount} ok</span>}{issueCount > 0 && <span style={{ color: 'var(--red-l)' }}> · ⚠ {issueCount}</span>}</>
            })()}
          </div>
        </div>
        {allItems.length > 0 && (
          <button
            onClick={() => {
              onMarkAll(allItems)
            }}
            style={{
              background: 'transparent', border: '1px solid var(--border2)', borderRadius: 6,
              color: 'var(--mid)', fontSize: 11, padding: '4px 10px', cursor: 'pointer',
              fontFamily: 'Barlow', transition: 'all 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.target.style.borderColor = 'var(--green)'; e.target.style.color = 'var(--green-l)' }}
            onMouseLeave={e => { e.target.style.borderColor = ''; e.target.style.color = '' }}
          >
            {allItems.every(i => itemStates[i.id]?.status === 'ok') ? '✕ Desmarcar todo' : '✔ Marcar todo OK'}
          </button>
        )}
      </div>

      {zoneItems.length === 0 ? (
        <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--mid)' }}>Sin artículos.</div>
      ) : (
        zoneItems.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            highlighted={String(item.id) === String(focusedItemId)}
            itemState={itemStates[item.id] || { status: null, note: '' }}
            onSetOk={() => onSetOk(item.id)}
            onSetIssue={() => onSetIssue(item.id, item.name, (itemStates[item.id]?.status || null))}
            onAdjust={d => onAdjust(item.id, d)}
            onDelete={() => onDelete(item.id, item.name)}
          />
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

function ItemRow({ item, itemState, highlighted = false, onSetOk, onSetIssue, onAdjust, onDelete }) {
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
      : highlighted ? 'rgba(52,152,219,0.12)' : hover ? 'rgba(255,255,255,0.025)' : 'transparent'

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '86px minmax(0,1fr) 118px',
          alignItems: 'center',
          columnGap: 10,
          padding: '9px 18px',
          background: rowBg,
          transition: 'background 0.15s',
          opacity: status === 'ok' ? 0.75 : 1,
          outline: highlighted ? '1px solid rgba(52,152,219,0.5)' : 'none',
          outlineOffset: -1,
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1.25,
              textDecoration: status === 'ok' ? 'line-through' : 'none',
              color: status === 'ok' ? 'var(--mid)' : status === 'issue' ? 'var(--red-l)' : 'inherit',
              whiteSpace: 'normal',
              wordBreak: 'normal',
              overflowWrap: 'break-word',
            }}
          >
            {item.name}
          </div>
          {item.desc && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--mid)',
                lineHeight: 1.2,
                wordBreak: 'normal',
                overflowWrap: 'break-word',
              }}
            >
              {item.desc}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 4,
              opacity: (hover || status === 'issue') ? 1 : 0,
              transition: 'opacity 0.15s',
              pointerEvents: (hover || status === 'issue') ? 'auto' : 'none',
              minHeight: 20,
            }}
          >
            {(isMissing || isLow) && status !== 'ok' && status !== 'issue' && (
              <span style={{ fontSize: 9, fontWeight: 700, color: isMissing ? 'var(--red-l)' : 'var(--yellow-l)', background: isMissing ? 'rgba(192,57,43,0.15)' : 'rgba(230,126,34,0.15)', border: `1px solid ${isMissing ? 'rgba(192,57,43,0.3)' : 'rgba(230,126,34,0.3)'}`, padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase' }}>
                {isMissing ? '!' : '↓'}
              </span>
            )}
            {status === 'ok' && (
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green-l)', background: 'rgba(39,174,96,0.12)', border: '1px solid rgba(39,174,96,0.25)', padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase' }}>✔</span>
            )}
            {status === 'issue' && (
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--red-l)', background: 'rgba(192,57,43,0.15)', border: '1px solid rgba(192,57,43,0.3)', padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase' }}>⚠</span>
            )}
            {status !== 'issue' && (
              <button className="btn-icon" style={{ color: 'var(--red-l)', width: 28, height: 28, fontSize: 12 }} onClick={onDelete}>✕</button>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 4,
            whiteSpace: 'nowrap'
          }}
        >
          <button className="btn-icon" style={{ fontSize: 13, width: 30, height: 30 }} onClick={() => onAdjust(-1)}>−</button>
          <span style={{ fontFamily: 'Roboto Mono', fontSize: 13, fontWeight: 700, color: qtyColor, minWidth: 20, textAlign: 'center', lineHeight: 1 }}>
            {item.qty}
          </span>
          <button className="btn-icon" style={{ fontSize: 13, width: 30, height: 30 }} onClick={() => onAdjust(1)}>＋</button>
          <span style={{ fontSize: 10, color: 'var(--mid)', lineHeight: 1, minWidth: 20, textAlign: 'left' }}>/ {item.min}</span>
        </div>
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
