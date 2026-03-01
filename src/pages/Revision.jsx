import { useState, useEffect, useRef } from 'react'
import { useLocation, unstable_useBlocker as useBlocker } from 'react-router-dom'
import { useApp } from '../lib/AppContext'
import { buildZones } from '../data/units'
import { supabase } from '../lib/supabase'
import { buildAndStoreDailyIncidentReport } from '../lib/dailyIncidentReport'

// ── Asignación BV → Unidades ──────────────────────────────
const DEFAULT_BV_UNITS = {
  1: [3, 7, 19],
  2: [0, 6, 14],
  3: [1, 16, 22],
  4: [10, 11, 15],
  5: [4, 9, 18, 21],
  6: [2, 12, 17],
  7: [5, 8, 20],
}

const BV_COLORS = {
  1: { bg: 'rgba(52,152,219,0.12)',  border: '#2980B9', text: '#3498DB' },
  2: { bg: 'rgba(46,204,113,0.12)', border: '#27AE60', text: '#2ECC71' },
  3: { bg: 'rgba(155,89,182,0.12)', border: '#8E44AD', text: '#9B59B6' },
  4: { bg: 'rgba(230,126,34,0.12)', border: '#E67E22', text: '#F39C12' },
  5: { bg: 'rgba(231,76,60,0.12)',  border: '#C0392B', text: '#E74C3C' },
  6: { bg: 'rgba(26,188,156,0.12)', border: '#16A085', text: '#1ABC9C' },
  7: { bg: 'rgba(241,196,15,0.12)', border: '#F39C12', text: '#F1C40F' },
}
const PHOTO_NOTES_MARKER = '[[FOTOS_REVISION]]'
const MISSING_NOTE = 'Marcado por bombero: NO está'
const INCIDENT_NOTE = 'Marcado por bombero: PRESENTA incidencia'
const REVISION_DRAFT_PREFIX = 'ignis:revision-draft:'

function getDraftStorageKey(date, bomberoId, email) {
  return `${REVISION_DRAFT_PREFIX}${date}:${bomberoId}:${String(email || 'anon').toLowerCase()}`
}

function serializeReviewDraft(state) {
  return {
    date: state.date,
    bomberoId: state.bomberoId,
    activeUnitIdx: state.activeUnitIdx,
    units: (state.units || []).map(u => ({
      unitId: u.unitId,
      itemChecks: u.itemChecks || {},
      itemNotes: u.itemNotes || {},
      incidents: u.incidents || [],
      qtyOverrides: u.qtyOverrides || {},
      notes: u.notes || '',
      done: Boolean(u.done),
      attachments: (u.attachments || [])
        .map(a => a?.url)
        .filter(url => url && !String(url).startsWith('blob:')),
    })),
  }
}

function hydrateReviewDraftUnits(baseUnits, draftUnits) {
  const byUnit = new Map((draftUnits || []).map(u => [String(u.unitId), u]))
  return (baseUnits || []).map(base => {
    const d = byUnit.get(String(base.unitId))
    if (!d) return base

    const mergedChecks = { ...base.itemChecks }
    for (const [k, v] of Object.entries(d.itemChecks || {})) {
      if (!Object.prototype.hasOwnProperty.call(base.itemChecks || {}, k)) continue
      if (v === 'ok' || v === 'issue' || v === null) mergedChecks[k] = v
    }

    const mergedNotes = { ...base.itemNotes }
    for (const [k, v] of Object.entries(d.itemNotes || {})) {
      if (!Object.prototype.hasOwnProperty.call(base.itemChecks || {}, k)) continue
      mergedNotes[k] = String(v || '')
    }

    const mergedQty = { ...(base.qtyOverrides || {}) }
    for (const [k, v] of Object.entries(d.qtyOverrides || {})) {
      if (!Object.prototype.hasOwnProperty.call(base.itemChecks || {}, k)) continue
      const n = Number(v)
      if (Number.isFinite(n)) mergedQty[k] = n
    }

    const draftAttachments = (d.attachments || []).map((url, idx) => makeLocalAttachmentFromUrl(url, idx))
    const baseUrls = new Set((base.attachments || []).map(a => a?.url).filter(Boolean))
    const attachments = [
      ...(base.attachments || []),
      ...draftAttachments.filter(a => !baseUrls.has(a.url)),
    ]

    return {
      ...base,
      itemChecks: mergedChecks,
      itemNotes: mergedNotes,
      incidents: Array.isArray(d.incidents) ? d.incidents : base.incidents,
      qtyOverrides: mergedQty,
      notes: typeof d.notes === 'string' ? d.notes : base.notes,
      attachments,
      done: Boolean(d.done),
    }
  })
}
function getActiveUnitsForBv(bvId, configs, bvUnits = DEFAULT_BV_UNITS) {
  return (bvUnits[bvId] || []).filter(unitId => configs?.[unitId]?.isActive !== false)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function dateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function monthDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = (firstDay + 6) % 7
  return { daysInMonth, startOffset }
}

function makeLocalAttachmentFromUrl(url, idx = 0) {
  return {
    id: `url-${idx}-${Math.random().toString(36).slice(2, 9)}`,
    url,
    name: `Foto ${idx + 1}`,
  }
}

function parseNotesAndPhotoUrls(raw = '') {
  const txt = String(raw || '')
  const markerPos = txt.indexOf(PHOTO_NOTES_MARKER)
  if (markerPos === -1) return { notes: txt, photoUrls: [] }

  const notes = txt.slice(0, markerPos).trimEnd()
  const after = txt.slice(markerPos + PHOTO_NOTES_MARKER.length)
  const photoUrls = after
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => /^https?:\/\//i.test(s) || /^data:image\//i.test(s))

  return { notes, photoUrls }
}

function composeNotesWithPhotoUrls(notes = '', photoUrls = []) {
  const cleanNotes = String(notes || '').trim()
  const cleanUrls = (photoUrls || []).map(s => String(s || '').trim()).filter(Boolean)
  if (cleanUrls.length === 0) return cleanNotes
  return `${cleanNotes}${cleanNotes ? '\n\n' : ''}${PHOTO_NOTES_MARKER}\n${cleanUrls.join('\n')}`
}

// ── VISTA PRINCIPAL ───────────────────────────────────────
export default function Revision() {
  const location = useLocation()
  const { configs, items, session, revisionIncidents, refreshRevisionIncidents, showToast, hasPermission, bvUnits: assignedBvUnits } = useApp()
  const effectiveBvUnits = assignedBvUnits || DEFAULT_BV_UNITS
  const now = new Date()
  const lastAutoOpenNonce = useRef(null)

  const [view, setView] = useState('calendar') // 'calendar' | 'review'
  const [reviewState, setReviewState] = useState(null)
  // reviewState: { date, bomberoId, activeUnitIdx, units: [{ unitId, itemChecks: {itemId: bool}, incidents: [], notes, done }] }

  const [viewYear,  setViewYear]  = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [calendarView, setCalendarView] = useState('today') // 'today' | 'month'
  const [reports,   setReports]   = useState([])
  const [loadingReports, setLoadingReports] = useState(true)
  const [historyModal, setHistoryModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [issueNoteModal, setIssueNoteModal] = useState(null) // { itemId, itemName, zoneName, editOnly }
  const [issueNoteDraft, setIssueNoteDraft] = useState('')
  const [issueNoteType, setIssueNoteType] = useState('incident') // incident | missing
  const [issueNoteFiles, setIssueNoteFiles] = useState([])
  const [savedDraftSignature, setSavedDraftSignature] = useState('')

  useEffect(() => { loadReports() }, [viewYear, viewMonth])

  function buildDraftSignature(state) {
    try {
      if (!state) return ''
      return JSON.stringify(serializeReviewDraft(state))
    } catch {
      return ''
    }
  }

  function saveDraftSnapshot(state, silent = true, markAsSaved = false) {
    try {
      if (!state || typeof window === 'undefined') return
      const email = session?.user?.email || 'anon'
      const key = getDraftStorageKey(state.date, state.bomberoId, email)
      const payload = { ...serializeReviewDraft(state), savedAt: new Date().toISOString() }
      window.localStorage.setItem(key, JSON.stringify(payload))
      if (markAsSaved) setSavedDraftSignature(buildDraftSignature(state))
      if (!silent) showToast('Progreso guardado', 'ok')
      return true
    } catch (e) {
      console.warn('No se pudo guardar borrador de revisión:', e)
      if (!silent) showToast('No se pudo guardar el progreso', 'error')
      return false
    }
  }

  function loadDraftSnapshot(date, bomberoId) {
    try {
      if (typeof window === 'undefined') return null
      const email = session?.user?.email || 'anon'
      const key = getDraftStorageKey(date, bomberoId, email)
      const raw = window.localStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || !Array.isArray(parsed.units)) return null
      return parsed
    } catch (e) {
      console.warn('No se pudo cargar borrador de revisión:', e)
      return null
    }
  }

  function clearDraftSnapshot(date, bomberoId) {
    try {
      if (typeof window === 'undefined') return
      const email = session?.user?.email || 'anon'
      const key = getDraftStorageKey(date, bomberoId, email)
      window.localStorage.removeItem(key)
    } catch (e) {
      console.warn('No se pudo limpiar borrador de revisión:', e)
    }
  }

  const currentDraftSignature = (view === 'review' && reviewState) ? buildDraftSignature(reviewState) : ''
  const hasUnsavedChanges = view === 'review' && !!reviewState && currentDraftSignature !== savedDraftSignature

  const blocker = useBlocker(hasUnsavedChanges)

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    const leave = window.confirm('Tienes cambios sin guardar progreso. ¿Quieres salir sin guardar?')
    if (leave) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  async function loadReports() {
    setLoadingReports(true)
    const from = dateStr(viewYear, viewMonth, 1)
    const to   = dateStr(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate())
    const { data } = await supabase
      .from('revision_reports').select('*')
      .gte('report_date', from).lte('report_date', to)
      .order('created_at', { ascending: false })
    if (data) setReports(data)
    setLoadingReports(false)
  }

  const reportIndex = {}
  reports.forEach(r => {
    const key = `${r.report_date}-${r.bombero_id}`
    if (!reportIndex[key]) reportIndex[key] = []
    reportIndex[key].push(r)
  })

  // Iniciar revisión — crea estructura con todos los artículos de todas las unidades
  function startReview(date, bomberoId, preferredUnitId = null) {
    const unitIds = getActiveUnitsForBv(bomberoId, configs, effectiveBvUnits)
    if (unitIds.length === 0) {
      showToast('Este bombero no tiene unidades activas asignadas', 'warn')
      return
    }
    const alreadyDone = (reportIndex[`${date}-${bomberoId}`] || [])
      .filter(r => r.reviewed_by !== 'unidades')
      .map(r => r.unit_id)
    const pendingIds = unitIds.filter(u => !alreadyDone.includes(u))

    if (pendingIds.length === 0) {
      setHistoryModal({ date, bomberoId })
      return
    }

    const units = pendingIds.map(unitId => {
      const cfg   = configs[unitId]
      const zones = cfg ? buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera) : []
      const itemChecks = {}
      const itemNotes = {}
      const incidents = []
      const qtyOverrides = {}
      const reportRowsForUnit = (reportIndex[`${date}-${bomberoId}`] || []).filter(r => r.unit_id === unitId)
      const latestGeneralNotes = reportRowsForUnit[0]?.general_notes || ''
      const { notes: parsedNotes, photoUrls } = parseNotesAndPhotoUrls(latestGeneralNotes)

      const existingIncidents = (reportIndex[`${date}-${bomberoId}`] || [])
        .filter(r => r.unit_id === unitId)
        .flatMap(r => r.incidents || [])

      const persistentIncidents = (revisionIncidents || [])
        .filter(inc => inc.unitId === unitId)
        .map(inc => ({
          itemId: inc.itemId || null,
          zone: inc.zone,
          item: inc.item,
          note: inc.note || '',
          source: inc.source || 'revision',
          bombero_id: inc.bomberoId,
        }))

      const allExisting = [...existingIncidents, ...persistentIncidents]

      zones.forEach(z => {
        const zItems = items[unitId]?.[z.id] || []
        zItems.forEach(item => {
          itemChecks[item.id] = null // null | 'ok' | 'issue'
          const match = allExisting.find(inc =>
            (inc?.itemId && String(inc.itemId) === String(item.id)) ||
            (String(inc?.zone || '').trim().toLowerCase() === String(z.label).trim().toLowerCase()
              && String(inc?.item || '').trim().toLowerCase() === String(item.name).trim().toLowerCase())
          )
          if (match) {
            itemChecks[item.id] = 'issue'
            itemNotes[item.id] = match.note || ''
            if (String(match.note || '').toLowerCase().includes('no está') || String(match.note || '').toLowerCase().includes('falta')) {
              qtyOverrides[item.id] = 0
            }
            incidents.push({
              _itemId: item.id,
              itemId: item.id,
              zone: z.label,
              item: item.name,
              note: match.note || '',
              source: match.source || (match.bombero_id === 0 ? 'unidad' : 'revision'),
            })
          }
        })
      })
      return {
        unitId,
        itemChecks,
        itemNotes,
        incidents,
        qtyOverrides,
        notes: parsedNotes || '',
        attachments: photoUrls.map((u, idx) => makeLocalAttachmentFromUrl(u, idx)),
        done: false,
      }
    })

    const draft = loadDraftSnapshot(date, bomberoId)
    const hydratedUnits = draft?.units ? hydrateReviewDraftUnits(units, draft.units) : units
    const preferredIdx = Number.isFinite(Number(preferredUnitId))
      ? hydratedUnits.findIndex(u => Number(u.unitId) === Number(preferredUnitId))
      : -1
    const draftActiveIdx = Number.isInteger(draft?.activeUnitIdx) ? Number(draft.activeUnitIdx) : -1
    const activeUnitIdx = (draftActiveIdx >= 0 && draftActiveIdx < hydratedUnits.length)
      ? draftActiveIdx
      : (preferredIdx >= 0 ? preferredIdx : null)
    const nextState = { date, bomberoId, activeUnitIdx, units: hydratedUnits }
    setReviewState(nextState)
    setSavedDraftSignature(buildDraftSignature(nextState))
    if (draft) showToast('Progreso recuperado', 'ok')
    setView('review')
  }

  useEffect(() => {
    const st = location.state || {}
    const nonce = st?.reviewNonce || null
    if (!st?.openUnitReview || !nonce) return
    if (lastAutoOpenNonce.current === nonce) return
    const targetUnitId = Number(st?.fromUnitId)
    if (!Number.isFinite(targetUnitId)) return

    let targetBv = null
    for (const [bvId] of Object.entries(effectiveBvUnits)) {
      const activeUnits = getActiveUnitsForBv(Number(bvId), configs, effectiveBvUnits)
      if ((activeUnits || []).includes(targetUnitId)) {
        targetBv = Number(bvId)
        break
      }
    }
    if (!Number.isFinite(targetBv)) return

    lastAutoOpenNonce.current = nonce
    startReview(todayStr(), targetBv, targetUnitId)
  }, [location.state, reports, configs, items])

  // Guardar toda la revisión en Supabase
  async function saveReview() {
    if (!hasPermission('edit')) {
      showToast('Modo solo lectura: no puedes guardar revisiones', 'warn')
      return
    }
    const pendingByUnit = (reviewState?.units || [])
      .map(u => ({
        unitId: u.unitId,
        pending: Object.values(u.itemChecks || {}).filter(v => v !== 'ok' && v !== 'issue').length,
      }))
      .filter(x => x.pending > 0)

    if (pendingByUnit.length > 0) {
      const totalPending = pendingByUnit.reduce((acc, x) => acc + x.pending, 0)
      const unitsLabel = pendingByUnit.map(x => `U${String(x.unitId).padStart(2, '0')}`).join(', ')
      showToast(`Falta material por revisar (${totalPending}) en ${unitsLabel}`, 'warn')
      return
    }

    setSaving(true)
    const { date, bomberoId, units } = reviewState
    const email = session?.user?.email || 'desconocido'
    const notificationUnits = []

    for (const unit of units) {
      const cfg   = configs[unit.unitId]
      const zones = cfg ? buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera) : []
      const qtyOverrides = unit.qtyOverrides || {}
      const resolveItemMeta = (id) => {
        for (const z of zones) {
          const found = (items[unit.unitId]?.[z.id] || []).find(i => String(i.id) === String(id))
          if (found) {
            const effQty = Object.prototype.hasOwnProperty.call(qtyOverrides, id) ? Number(qtyOverrides[id]) : Number(found.qty)
            return { itemId: id, name: found.name, zone: z.label, isMissing: effQty === 0, qty: effQty }
          }
        }
        return { itemId: id, name: id, zone: '', isMissing: false }
      }

      const unchecked = Object.entries(unit.itemChecks)
        .filter(([, v]) => v !== 'ok' && v !== 'issue')
        .map(([id]) => resolveItemMeta(id))

      const issueChecked = Object.entries(unit.itemChecks)
        .filter(([, v]) => v === 'issue')
        .map(([id]) => resolveItemMeta(id))

      const allChecked = Object.values(unit.itemChecks).every(v => v === 'ok' || v === 'issue')
      const hasIncidents = unit.incidents.length > 0 || Object.values(unit.itemChecks).some(v => v === 'issue')
      const isOk = allChecked && !hasIncidents

      const existingIssueIds = new Set(
        unit.incidents
          .map(inc => inc?._itemId)
          .filter(Boolean)
          .map(String)
      )

      const checkedIssueIncidents = issueChecked
        .filter(u => !existingIssueIds.has(String(u.itemId)))
        .map(u => ({
          itemId: u.itemId,
          zone: u.zone,
          item: u.name,
          note: u.isMissing
            ? 'Marcado por bombero: FALTA de material'
            : 'Marcado por bombero: INCIDENCIA de material',
          source: 'revision',
        }))

      const incidents = [
        ...unit.incidents.map(({ _itemId, ...rest }) => rest), // strip internal _itemId
        ...checkedIssueIncidents,
        ...unchecked.map(u => ({
          itemId: u.itemId,
          zone: u.zone,
          item: u.name,
          note: 'No verificado en revisión',
          source: 'revision',
        }))
      ]
      if (incidents.length > 0) {
        notificationUnits.push({
          unitId: unit.unitId,
          incidents: incidents.map(i => ({ item: i.item, zone: i.zone, note: i.note || '' })),
        })
      }

      const existingUrls = (unit.attachments || []).map(a => a?.url).filter(Boolean)
      const pendingFiles = (unit.attachments || []).filter(a => a?.file)
      const uploadedUrls = []
      for (const att of pendingFiles) {
        const safeName = String(att.name || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')
        const ext = safeName.includes('.') ? safeName.split('.').pop() : 'jpg'
        const path = `${date}/bv${bomberoId}/u${unit.unitId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`
        const { error: uploadErr } = await supabase
          .storage
          .from('revision-observaciones')
          .upload(path, att.file, { upsert: false })
        if (uploadErr) {
          setSaving(false)
          showToast(`No se pudo subir foto: ${uploadErr.message || 'error'}`, 'error')
          return
        }
        const { data: pub } = supabase.storage.from('revision-observaciones').getPublicUrl(path)
        if (pub?.publicUrl) uploadedUrls.push(pub.publicUrl)
      }

      const generalNotes = composeNotesWithPhotoUrls(unit.notes, [...existingUrls, ...uploadedUrls])

      for (const [itemId, nextQty] of Object.entries(qtyOverrides || {})) {
        await supabase.from('unit_items').update({ qty: Number(nextQty) || 0 }).eq('id', itemId)
      }

      await supabase.from('revision_reports').upsert({
        report_date:   date,
        bombero_id:    bomberoId,
        unit_id:       unit.unitId,
        is_ok:         isOk,
        incidents,
        general_notes: generalNotes,
        reviewed_by:   email,
      }, { onConflict: 'report_date,bombero_id,unit_id' })
    }

    // Notificación por correo a admins (solo si hay incidencias).
    if (notificationUnits.length > 0) {
      const { error: notifyErr } = await supabase.functions.invoke('send-review-incidents-email', {
        body: {
          reportDate: date,
          bomberoId,
          reviewedBy: email,
          units: notificationUnits,
        },
      })
      if (notifyErr) {
        // No bloquear guardado por fallo de notificación.
        console.warn('No se pudo enviar email de incidencias:', notifyErr.message || notifyErr)
        showToast('Revisión guardada. El aviso por email no se pudo enviar.', 'warn')
      }
    }

    const dailyRes = await buildAndStoreDailyIncidentReport({
      supabase,
      reportDate: date,
      configs,
      actorEmail: email,
      bvUnits: effectiveBvUnits,
      force: false,
    })
    if (!dailyRes?.ok) {
      const msg = String(dailyRes?.error || '')
      if (msg.includes('daily_incident_reports')) {
        showToast('No se generó informe diario: ejecuta daily-incident-reports.sql en Supabase', 'error')
      } else {
        showToast(`No se generó informe diario: ${msg || 'error'}`, 'error')
      }
      console.warn('No se pudo generar informe diario de incidencias:', dailyRes?.error || dailyRes)
    } else if (dailyRes.generated) {
      showToast('Informe diario de incidencias generado', 'ok')
    }

    clearDraftSnapshot(date, bomberoId)
    setSavedDraftSignature('')
    setSaving(false)
    setView('calendar')
    setReviewState(null)
    loadReports()
    refreshRevisionIncidents()
  }

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const today = todayStr()

  // ── VISTA REVISIÓN ────────────────────────────────────────
  if (view === 'review' && reviewState) {
    const { date, bomberoId, activeUnitIdx, units } = reviewState
    const c = BV_COLORS[bomberoId]
    const dateLabel    = new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    const allUnitsDone = units.every(u => Object.values(u.itemChecks).every(v => v === 'ok' || v === 'issue') || u.done)
    const incidentKey = (unitId, zone, item) => `${unitId}|${String(zone || '').trim().toLowerCase()}|${String(item || '').trim().toLowerCase()}`

    const existingIncidentKeys = new Set()
    ;(revisionIncidents || []).forEach(inc => {
      existingIncidentKeys.add(incidentKey(inc.unitId, inc.zone, inc.item))
    })

    function setItemStatus(itemId, status) {
      setReviewState(prev => {
        const units = prev.units.map((u, i) => {
          if (i !== prev.activeUnitIdx) return u
          const newStatus = u.itemChecks[itemId] === status ? null : status
          // If removing issue status, also remove its incident entry
          const newIncidents = newStatus !== 'issue'
            ? u.incidents.filter(inc => inc._itemId !== itemId)
            : u.incidents
          const newNotes = { ...u.itemNotes }
          if (newStatus !== 'issue') delete newNotes[itemId]
          return { ...u, itemChecks: { ...u.itemChecks, [itemId]: newStatus }, incidents: newIncidents, itemNotes: newNotes }
        })
        return { ...prev, units }
      })
    }

    function toggleItemIssue(itemId, zoneName, itemName, isMissing) {
      const key = incidentKey(activeUnit.unitId, zoneName, itemName)
      if (activeUnit.itemChecks[itemId] !== 'issue' && existingIncidentKeys.has(key)) {
        showToast('Esa incidencia ya existe en Alertas', 'warn')
        return
      }

      setReviewState(prev => {
        const units = prev.units.map((u, i) => {
          if (i !== prev.activeUnitIdx) return u

          const currentStatus = u.itemChecks[itemId]
          if (currentStatus === 'issue') {
            const cleanedNotes = { ...u.itemNotes }
            delete cleanedNotes[itemId]
            const cleanedQty = { ...(u.qtyOverrides || {}) }
            delete cleanedQty[itemId]
            return {
              ...u,
              itemChecks: { ...u.itemChecks, [itemId]: null },
              incidents: u.incidents.filter(inc => inc._itemId !== itemId),
              itemNotes: cleanedNotes,
              qtyOverrides: cleanedQty,
            }
          }
          return u
        })
        return { ...prev, units }
      })

      if (activeUnit.itemChecks[itemId] !== 'issue') {
        setIssueNoteType(isMissing ? 'missing' : 'incident')
        setIssueNoteFiles([])
        setIssueNoteDraft(activeUnit.itemNotes?.[itemId] || '')
        setIssueNoteModal({ itemId, itemName, zoneName, editOnly: false })
      }
    }

    function checkAll() {
      setReviewState(prev => {
        const units = prev.units.map((u, i) => i !== prev.activeUnitIdx ? u : {
          ...u,
          itemChecks: Object.fromEntries(Object.keys(u.itemChecks).map(k => [k, 'ok']))
        })
        return { ...prev, units }
      })
    }

    function uncheckAll() {
      setReviewState(prev => {
        const units = prev.units.map((u, i) => i !== prev.activeUnitIdx ? u : {
          ...u,
          itemChecks: Object.fromEntries(Object.keys(u.itemChecks).map(k => [k, null]))
        })
        return { ...prev, units }
      })
    }

    function saveIssueNote(itemId, zoneName, itemName) {
      const key = incidentKey(activeUnit.unitId, zoneName, itemName)
      if (activeUnit.itemChecks[itemId] !== 'issue' && existingIncidentKeys.has(key)) {
        showToast('Esa incidencia ya existe en Alertas', 'warn')
        setIssueNoteModal(null)
        return
      }
      const note = issueNoteType === 'missing'
        ? MISSING_NOTE
        : (issueNoteDraft.trim() || INCIDENT_NOTE)

      // Set status to 'issue' and store the note
      setReviewState(prev => {
        const units = prev.units.map((u, i) => {
          if (i !== prev.activeUnitIdx) return u
          const newIncidents = u.incidents.filter(inc => inc._itemId !== itemId)
          if (note.trim()) {
            newIncidents.push({ _itemId: itemId, itemId, zone: zoneName, item: itemName, note, source: 'revision' })
          } else {
            newIncidents.push({ _itemId: itemId, itemId, zone: zoneName, item: itemName, note: '', source: 'revision' })
          }
          const nextQtyOverrides = { ...(u.qtyOverrides || {}) }
          if (issueNoteType === 'missing') nextQtyOverrides[itemId] = 0
          else delete nextQtyOverrides[itemId]
          return {
            ...u,
            itemChecks: { ...u.itemChecks, [itemId]: 'issue' },
            itemNotes: { ...u.itemNotes, [itemId]: note },
            incidents: newIncidents,
            qtyOverrides: nextQtyOverrides,
          }
        })
        return { ...prev, units }
      })
      if (issueNoteType === 'incident' && issueNoteFiles.length > 0) addAttachmentFiles(issueNoteFiles)
      setIssueNoteModal(null)
      setIssueNoteDraft('')
      setIssueNoteFiles([])
      setIssueNoteType('incident')
    }

    function addIncident(incident) {
      const key = incidentKey(activeUnit.unitId, incident.zone, incident.item)
      const existsInCurrent = activeUnit.incidents.some(inc => incidentKey(activeUnit.unitId, inc.zone, inc.item) === key)
      if (existsInCurrent || existingIncidentKeys.has(key)) {
        showToast('Esa incidencia ya existe en Alertas', 'warn')
        return
      }

      setReviewState(prev => {
        const units = prev.units.map((u, i) => i !== prev.activeUnitIdx ? u : {
          ...u, incidents: [...u.incidents, { ...incident, source: 'revision' }]
        })
        return { ...prev, units }
      })
    }

    function removeIncident(idx) {
      setReviewState(prev => {
        const units = prev.units.map((u, i) => i !== prev.activeUnitIdx ? u : {
          ...u, incidents: u.incidents.filter((_, j) => j !== idx)
        })
        return { ...prev, units }
      })
    }

    function setNotes(notes) {
      setReviewState(prev => {
        const units = prev.units.map((u, i) => i !== prev.activeUnitIdx ? u : { ...u, notes })
        return { ...prev, units }
      })
    }

    function addAttachmentFiles(filesLike) {
      const files = Array.from(filesLike || []).filter(f => f?.type?.startsWith('image/'))
      if (files.length === 0) return
      setReviewState(prev => {
        const units = prev.units.map((u, i) => {
          if (i !== prev.activeUnitIdx) return u
          const current = Array.isArray(u.attachments) ? u.attachments : []
          const appended = files.map((f, idx) => ({
            id: `new-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
            file: f,
            name: f.name || `foto-${idx + 1}.jpg`,
            url: URL.createObjectURL(f),
            local: true,
          }))
          return { ...u, attachments: [...current, ...appended] }
        })
        return { ...prev, units }
      })
    }

    function removeAttachment(id) {
      setReviewState(prev => {
        const units = prev.units.map((u, i) => {
          if (i !== prev.activeUnitIdx) return u
          const current = Array.isArray(u.attachments) ? u.attachments : []
          const target = current.find(a => a.id === id)
          if (target?.local && target?.url?.startsWith('blob:')) URL.revokeObjectURL(target.url)
          return { ...u, attachments: current.filter(a => a.id !== id) }
        })
        return { ...prev, units }
      })
    }

    function goToUnit(idx) {
      setReviewState(prev => ({ ...prev, activeUnitIdx: idx }))
    }

    function exitReviewToCalendar() {
      if (hasUnsavedChanges) {
        const leave = window.confirm('Tienes cambios sin guardar progreso. ¿Quieres salir sin guardar?')
        if (!leave) return
      }
      setView('calendar')
      setReviewState(null)
      setSavedDraftSignature('')
    }

    if (!Number.isInteger(activeUnitIdx)) {
      return (
        <div className="animate-in page-container">
          <div className="card" style={{ padding: 18, borderTop: `3px solid ${c.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={exitReviewToCalendar}>‹ Volver</button>
                <div style={{ fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 800, color: c.text, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: '4px 12px', letterSpacing: 1 }}>BV{bomberoId}</div>
                <div>
                  <div style={{ fontFamily: 'Barlow Condensed', fontSize: 24, fontWeight: 800, letterSpacing: 0.8 }}>
                    Selecciona unidad para revisar
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--mid)' }}>Revisión del {dateLabel} · {units.length} unidad(es)</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => saveDraftSnapshot(reviewState, false, true)}
                  disabled={!hasPermission('edit')}
                >
                  💾 Guardar progreso
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={saveReview}
                  disabled={saving || !hasPermission('edit')}
                  style={{ background: 'var(--green)', borderColor: 'var(--green)' }}
                >
                  {saving ? 'Guardando...' : '✔ Guardar revisión completa'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 14 }}>
            {units.map((u, i) => {
              const total = Object.keys(u.itemChecks).length
              const checked = Object.values(u.itemChecks).filter(v => v === 'ok' || v === 'issue').length
              const issues = Object.values(u.itemChecks).filter(v => v === 'issue').length
              const pct = total ? Math.round((checked / total) * 100) : 0
              const done = checked === total
              return (
                <button
                  key={u.unitId}
                  className="card review-unit-card"
                  onClick={() => goToUnit(i)}
                  style={{
                    cursor: 'pointer',
                    padding: '16px 14px',
                    border: `1px solid ${done ? 'rgba(39,174,96,0.4)' : 'var(--border2)'}`,
                    background: done ? 'rgba(39,174,96,0.08)' : 'var(--ash)',
                    textAlign: 'left',
                    position: 'relative',
                  }}
                >
                  <span className={`review-unit-card-halo ${done ? 'done' : 'pending'}`} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 24 }}>🚒</span>
                      <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1, color: 'var(--white)', textShadow: '0 1px 0 rgba(0,0,0,0.35)' }}>
                        U{String(u.unitId).padStart(2, '0')}
                      </div>
                    </div>
                    <span className={`chip ${done ? 'chip-ok' : issues > 0 ? 'chip-alert' : 'chip-warn'}`}>
                      {done ? 'Completa' : issues > 0 ? 'Con incidencias' : 'Pendiente'}
                    </span>
                  </div>
                  <div style={{ marginTop: 10, height: 7, background: 'rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: done ? 'var(--green)' : issues > 0 ? 'var(--red)' : 'var(--yellow)' }} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: done ? 'rgba(46,204,113,0.92)' : 'rgba(236,237,240,0.92)' }}>
                    {checked}/{total} artículos · {issues} incidencias
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    const activeUnit = units[activeUnitIdx]
    const cfg   = configs[activeUnit.unitId]
    const zones = cfg ? buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera) : []
    const unitItems = items[activeUnit.unitId] || {}

    const totalItems   = Object.keys(activeUnit.itemChecks).length
    const checkedCount = Object.values(activeUnit.itemChecks).filter(v => v === 'ok' || v === 'issue').length
    const issueCount   = Object.values(activeUnit.itemChecks).filter(v => v === 'issue').length
    const allDone      = checkedCount === totalItems

    return (
      <>
      <div className="animate-in" style={{ padding: '0', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

        {/* Topbar de revisión */}
        <div className="revision-topbar" style={{
          background: 'var(--ash)', borderBottom: '2px solid ' + c.border,
          padding: '12px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, flexShrink: 0,
          position: 'sticky', top: 0, zIndex: 50,
        }}>
          <div className="revision-topbar-main" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={exitReviewToCalendar}
            >‹ Volver</button>
            <div style={{
              fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 800,
              color: c.text, background: c.bg, border: `1px solid ${c.border}`,
              borderRadius: 8, padding: '4px 14px', letterSpacing: 1,
            }}>BV{bomberoId}</div>
            <div>
              <div style={{ fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>
                Revisión del {dateLabel}
              </div>
              <div style={{ fontSize: 11, color: 'var(--mid)' }}>
                {session?.user?.email} · {units.length} vehículo{units.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Navegación entre unidades */}
          <div className="revision-unit-tabs">
            {units.map((u, i) => {
              const done = Object.values(u.itemChecks).every(v => v === 'ok' || v === 'issue')
              const partial = Object.values(u.itemChecks).some(v => v !== null)
              const checked = Object.values(u.itemChecks).filter(v => v === 'ok' || v === 'issue').length
              const total = Object.keys(u.itemChecks).length
              const pct = total ? Math.round((checked / total) * 100) : 0
              return (
                <button
                  key={u.unitId}
                  onClick={() => goToUnit(i)}
                  style={{
                    padding: '7px 10px', borderRadius: 10, cursor: 'pointer',
                    minWidth: 106,
                    fontFamily: 'Barlow Condensed', fontSize: 13, fontWeight: 700,
                    border: `2px solid ${i === activeUnitIdx ? c.border : done ? 'var(--green)' : partial ? 'var(--yellow)' : 'var(--border2)'}`,
                    background: i === activeUnitIdx ? c.bg : done ? 'rgba(39,174,96,0.1)' : 'transparent',
                    color: i === activeUnitIdx ? c.text : done ? 'var(--green-l)' : partial ? 'var(--yellow-l)' : 'var(--mid)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>🚒</span>
                    <span>{done ? '✔' : partial ? '◑' : '○'} U{String(u.unitId).padStart(2,'0')}</span>
                  </div>
                  <div style={{ marginTop: 4, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: done ? 'var(--green)' : partial ? 'var(--yellow)' : 'var(--border2)' }} />
                  </div>
                  <div style={{ marginTop: 3, fontSize: 10, opacity: 0.8 }}>{checked}/{total}</div>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => saveDraftSnapshot(reviewState, false, true)}
              disabled={!hasPermission('edit')}
            >
              💾 Guardar progreso
            </button>
            <button
              className="btn btn-primary btn-sm revision-save-btn"
              onClick={saveReview}
              disabled={saving || !hasPermission('edit')}
              style={{
                background: 'var(--green)', borderColor: 'var(--green)',
                fontSize: 13, padding: '8px 20px', fontWeight: 700,
              }}
            >
              {saving ? 'Guardando...' : '✔ Guardar revisión completa'}
            </button>
          </div>
        </div>

        {/* Contenido principal */}
        <div className="revision-layout">

          {/* Panel izquierdo — artículos */}
          <div className="revision-main">

            {/* Header unidad */}
            <div className="revision-unit-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontFamily: 'Barlow Condensed', fontSize: 26, fontWeight: 900, letterSpacing: 1 }}>
                  🚒 Unidad {activeUnit.unitId}
                </div>
                <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 2 }}>
                  {checkedCount} de {totalItems} artículos verificados
                </div>
              </div>
              <div className="revision-progress-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Barra progreso */}
                <div style={{ width: 120, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${totalItems ? (checkedCount / totalItems) * 100 : 0}%`, background: allDone ? 'var(--green)' : 'var(--fire)', borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: 12, color: allDone ? 'var(--green-l)' : 'var(--mid)', fontWeight: allDone ? 700 : 400 }}>
                  {totalItems ? Math.round((checkedCount / totalItems) * 100) : 0}%
                </span>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={allDone ? uncheckAll : checkAll}>
                  {allDone ? '○ Desmarcar todo' : '✔ Marcar todo OK'}
                </button>
              </div>
            </div>

            {/* Zonas con artículos */}
            {zones.map(zone => {
              const zItems = unitItems[zone.id] || []
              if (zItems.length === 0) return null
              const zChecked = zItems.filter(i => activeUnit.itemChecks[i.id] === 'ok' || activeUnit.itemChecks[i.id] === 'issue').length
              const zDone = zChecked === zItems.length
              const zHasIssues = zItems.some(i => activeUnit.itemChecks[i.id] === 'issue')

              return (
                <div key={zone.id} className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
                  {/* Cabecera zona */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px',
                    background: zDone && !zHasIssues ? 'rgba(39,174,96,0.06)' : zHasIssues ? 'rgba(192,57,43,0.06)' : 'var(--panel)',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{ fontFamily: 'Barlow Condensed', fontSize: 15, fontWeight: 800, letterSpacing: 0.5 }}>
                      {zone.icon} {zone.label}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: zDone ? 'var(--green-l)' : 'var(--mid)' }}>
                        {zChecked}/{zItems.length}
                      </span>
                      <button
                        onClick={() => {
                          const allZoneDone = zItems.every(i => activeUnit.itemChecks[i.id])
                          setReviewState(prev => {
                            const units = prev.units.map((u, idx) => idx !== prev.activeUnitIdx ? u : {
                              ...u,
                              itemChecks: {
                                ...u.itemChecks,
                                ...Object.fromEntries(zItems.map(i => [i.id, !allZoneDone ? 'ok' : null]))
                              }
                            })
                            return { ...prev, units }
                          })
                        }}
                        style={{
                          background: 'transparent', border: '1px solid var(--border2)',
                          borderRadius: 5, color: 'var(--mid)', fontSize: 10,
                          padding: '2px 8px', cursor: 'pointer', fontFamily: 'Barlow',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.target.style.color = 'var(--green-l)'; e.target.style.borderColor = 'var(--green)' }}
                        onMouseLeave={e => { e.target.style.color = ''; e.target.style.borderColor = '' }}
                      >
                        {zItems.every(i => activeUnit.itemChecks[i.id] === 'ok') ? '○ Desmarcar' : '✔ Todo OK'}
                      </button>
                    </div>
                  </div>

                  {/* Artículos */}
                  {zItems.map(item => {
                    const status = activeUnit.itemChecks[item.id] // null | 'ok' | 'issue'
                    const displayQty = Object.prototype.hasOwnProperty.call(activeUnit.qtyOverrides || {}, item.id)
                      ? Number(activeUnit.qtyOverrides[item.id])
                      : Number(item.qty)
                    const isMissing = displayQty === 0
                    const isLow = displayQty > 0 && displayQty < item.min
                    const rowBg = status === 'ok' ? 'rgba(39,174,96,0.04)' : status === 'issue' ? 'rgba(192,57,43,0.06)' : 'transparent'
                    return (
                      <div key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 16px',
                            background: rowBg,
                            transition: 'background 0.12s',
                            opacity: status === 'ok' ? 0.7 : 1,
                          }}
                        >
                          {/* ✔ OK checkbox */}
                          <div
                            onClick={() => setItemStatus(item.id, 'ok')}
                            title="Marcar OK"
                            style={{
                              width: 26, height: 26, borderRadius: 7, flexShrink: 0, cursor: 'pointer',
                              border: status === 'ok' ? '2px solid var(--green)' : '2px solid var(--border2)',
                              background: status === 'ok' ? 'var(--green)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.15s',
                              boxShadow: status === 'ok' ? '0 0 10px rgba(39,174,96,0.3)' : 'none',
                            }}
                          >
                            {status === 'ok' && (
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M2.5 7l3.5 3.5 5.5-6.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>

                          {/* ✕ Incidencia checkbox */}
                          <div
                            onClick={() => {
                              toggleItemIssue(item.id, zone.label, item.name, isMissing)
                            }}
                            title="Marcar falta/incidencia"
                            style={{
                              width: 26, height: 26, borderRadius: 7, flexShrink: 0, cursor: 'pointer',
                              border: status === 'issue' ? '2px solid var(--red)' : '2px solid var(--border2)',
                              background: status === 'issue' ? 'var(--red)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.15s',
                              boxShadow: status === 'issue' ? '0 0 10px rgba(192,57,43,0.35)' : 'none',
                            }}
                          >
                            {status === 'issue' && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M2 2l6 6M8 2l-6 6" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                              </svg>
                            )}
                          </div>

                          {/* Nombre */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 14, fontWeight: 500,
                              textDecoration: status === 'ok' ? 'line-through' : 'none',
                              color: status === 'ok' ? 'var(--mid)' : status === 'issue' ? 'var(--red-l)' : 'var(--white)',
                            }}>
                              {item.name}
                            </div>
                            {item.desc && <div style={{ fontSize: 11, color: 'var(--mid)' }}>{item.desc}</div>}
                          </div>

                          {/* Badge estado + Stock */}
                          <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            {status === 'issue' && (
                              <span
                                onClick={() => {
                                  const current = activeUnit.itemNotes?.[item.id] || ''
                                  setIssueNoteType(String(current).trim() === MISSING_NOTE ? 'missing' : 'incident')
                                  setIssueNoteFiles([])
                                  setIssueNoteDraft(current)
                                  setIssueNoteModal({ itemId: item.id, itemName: item.name, zoneName: zone.label, editOnly: true })
                                }}
                                style={{ fontSize: 9, fontWeight: 700, color: 'var(--red-l)', background: 'rgba(192,57,43,0.15)', border: '1px solid rgba(192,57,43,0.3)', padding: '1px 6px', borderRadius: 8, letterSpacing: 0.5, cursor: 'pointer' }}
                              >⚠ FALTA/INC.</span>
                            )}
                            <span style={{
                              fontFamily: 'Roboto Mono', fontSize: 13, fontWeight: 600,
                              color: isMissing ? 'var(--red-l)' : isLow ? 'var(--yellow-l)' : 'var(--green-l)',
                            }}>
                              {displayQty}<span style={{ fontSize: 10, color: 'var(--mid)', fontWeight: 400 }}>/{item.min}</span>
                            </span>
                            {isMissing && <div style={{ fontSize: 9, color: 'var(--red-l)', fontWeight: 700, letterSpacing: 0.5 }}>FALTA</div>}
                            {isLow && !isMissing && <div style={{ fontSize: 9, color: 'var(--yellow-l)', fontWeight: 700, letterSpacing: 0.5 }}>BAJO</div>}
                          </div>
                        </div>

                        {/* Nota de incidencia inline */}
                        {status === 'issue' && activeUnit.itemNotes?.[item.id] && (
                          <div
                            onClick={() => {
                              const current = activeUnit.itemNotes[item.id]
                              setIssueNoteType(String(current).trim() === MISSING_NOTE ? 'missing' : 'incident')
                              setIssueNoteFiles([])
                              setIssueNoteDraft(current)
                              setIssueNoteModal({ itemId: item.id, itemName: item.name, zoneName: zone.label, editOnly: true })
                            }}
                            style={{ margin: '0 16px 6px 78px', padding: '4px 10px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 5, fontSize: 11, color: 'var(--red-l)', cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}
                          >
                            <span style={{ opacity: 0.6 }}>📝</span>
                            <span style={{ flex: 1 }}>{activeUnit.itemNotes[item.id]}</span>
                            <span style={{ opacity: 0.4, fontSize: 10 }}>editar</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* Panel derecho — incidencias y notas */}
          <div className="revision-side">

            {/* Estado de la unidad */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
                Estado de la unidad
              </div>
              <div style={{
                padding: '12px', borderRadius: 8, textAlign: 'center',
                background: allDone && activeUnit.incidents.length === 0 ? 'rgba(39,174,96,0.1)' : activeUnit.incidents.length > 0 ? 'rgba(192,57,43,0.1)' : 'rgba(230,126,34,0.08)',
                border: `1px solid ${allDone && activeUnit.incidents.length === 0 ? 'var(--green)' : activeUnit.incidents.length > 0 ? 'var(--red)' : 'var(--yellow)'}`,
              }}>
                <div style={{ fontSize: 28 }}>
                  {allDone && activeUnit.incidents.length === 0 ? '✅' : activeUnit.incidents.length > 0 ? '⚠️' : '🔄'}
                </div>
                <div style={{ fontFamily: 'Barlow Condensed', fontSize: 14, fontWeight: 700, marginTop: 4,
                  color: allDone && activeUnit.incidents.length === 0 ? 'var(--green-l)' : activeUnit.incidents.length > 0 ? 'var(--red-l)' : 'var(--yellow-l)'
                }}>
                  {allDone && activeUnit.incidents.length === 0 ? 'TODO CORRECTO' : activeUnit.incidents.length > 0 ? `${activeUnit.incidents.length} INCIDENCIA${activeUnit.incidents.length > 1 ? 'S' : ''}` : 'EN REVISIÓN'}
                </div>
              </div>
            </div>

            {/* Incidencias */}
            <IncidentPanel
              incidents={activeUnit.incidents}
              zones={zones}
              onAdd={addIncident}
              onRemove={removeIncident}
            />

            {/* Notas */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
                Observaciones
              </div>
              <textarea
                className="form-input"
                style={{ height: 80, resize: 'vertical', fontFamily: 'Barlow', fontSize: 13 }}
                placeholder="Notas adicionales sobre esta unidad..."
                value={activeUnit.notes}
                onChange={e => setNotes(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  📷 Cámara
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={e => { addAttachmentFiles(e.target.files); e.target.value = '' }}
                  />
                </label>
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  🖼 Dispositivo
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => { addAttachmentFiles(e.target.files); e.target.value = '' }}
                  />
                </label>
              </div>
              {(activeUnit.attachments || []).length > 0 && (
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(74px,1fr))', gap: 8 }}>
                  {(activeUnit.attachments || []).map(att => (
                    <div key={att.id} style={{ position: 'relative', border: '1px solid var(--border2)', borderRadius: 8, overflow: 'hidden', background: 'var(--panel)' }}>
                      <img src={att.url} alt={att.name || 'Adjunto'} style={{ width: '100%', height: 64, objectFit: 'cover', display: 'block' }} />
                      <button
                        onClick={() => removeAttachment(att.id)}
                        className="btn-icon"
                        style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, fontSize: 12, background: 'rgba(0,0,0,0.6)' }}
                        title="Quitar foto"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Resumen todas las unidades */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
                Progreso global
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(86px,1fr))', gap: 8 }}>
                {units.map((u, i) => {
                  const total   = Object.keys(u.itemChecks).length
                  const checked = Object.values(u.itemChecks).filter(Boolean).length
                  const done    = checked === total
                  const pct     = total ? Math.round((checked / total) * 100) : 0
                  return (
                    <button
                      key={u.unitId}
                      onClick={() => goToUnit(i)}
                      style={{
                        borderRadius: 8,
                        cursor: 'pointer',
                        padding: '8px 6px',
                        border: `1px solid ${i === activeUnitIdx ? c.border : done ? 'rgba(39,174,96,0.45)' : 'var(--border2)'}`,
                        background: i === activeUnitIdx ? c.bg : done ? 'rgba(39,174,96,0.08)' : 'var(--panel)',
                        color: i === activeUnitIdx ? c.text : done ? 'var(--green-l)' : 'var(--light)',
                        transition: 'all 0.15s',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 16, lineHeight: 1 }}>🚒</div>
                      <div style={{ fontFamily: 'Barlow Condensed', fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                        U{String(u.unitId).padStart(2, '0')}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--mid)', marginTop: 2 }}>{pct}%</div>
                    </button>
                  )
                })}
              </div>
            </div>

          </div>
        </div>
      </div>
      {/* Modal: nota de incidencia por artículo */}
      {issueNoteModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setIssueNoteModal(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div style={{ background: 'var(--ash)', border: '1px solid rgba(192,57,43,0.4)', borderRadius: 14, width: '100%', maxWidth: 460, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'rgba(192,57,43,0.08)', borderBottom: '1px solid rgba(192,57,43,0.2)' }}>
              <div>
                <div style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 800, color: 'var(--red-l)', letterSpacing: 0.5 }}>⚠ Incidencia detectada</div>
                <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>{issueNoteModal.zoneName} · {issueNoteModal.itemName}</div>
              </div>
              <button onClick={() => setIssueNoteModal(null)} style={{ background: 'none', border: 'none', color: 'var(--mid)', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>
            <div style={{ padding: '18px' }}>
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.15)', borderRadius: 8, fontSize: 12, color: 'var(--light)' }}>
                Elige el tipo: <strong>No está</strong> o <strong>Presenta incidencia</strong>.
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{
                    borderColor: issueNoteType === 'missing' ? 'var(--yellow)' : 'var(--border2)',
                    color: issueNoteType === 'missing' ? 'var(--yellow-l)' : 'var(--mid)',
                    background: issueNoteType === 'missing' ? 'rgba(241,196,15,0.12)' : 'transparent',
                  }}
                  onClick={() => setIssueNoteType('missing')}
                >
                  ✕ No está
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{
                    borderColor: issueNoteType === 'incident' ? 'var(--red)' : 'var(--border2)',
                    color: issueNoteType === 'incident' ? 'var(--red-l)' : 'var(--mid)',
                    background: issueNoteType === 'incident' ? 'rgba(192,57,43,0.12)' : 'transparent',
                  }}
                  onClick={() => setIssueNoteType('incident')}
                >
                  ⚠ Presenta incidencia
                </button>
              </div>
              <label style={{ fontSize: 11, color: 'var(--mid)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>¿Qué le sucede?</label>
              <textarea
                autoFocus
                className="form-input"
                style={{ height: 90, resize: 'vertical', fontFamily: 'Barlow', fontSize: 13 }}
                placeholder={issueNoteType === 'missing' ? 'Opcional: detalle de faltante...' : 'Ej: manguera rota, extintor caducado, pieza suelta...'}
                value={issueNoteDraft}
                onChange={e => setIssueNoteDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveIssueNote(issueNoteModal.itemId, issueNoteModal.zoneName, issueNoteModal.itemName) }}
              />
              {issueNoteType === 'incident' && (
                <div style={{ marginTop: 10 }}>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                    📷 Adjuntar foto
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      style={{ display: 'none' }}
                      onChange={e => setIssueNoteFiles(Array.from(e.target.files || []))}
                    />
                  </label>
                  {issueNoteFiles.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--mid)' }}>
                      {issueNoteFiles.length} foto(s) añadida(s) a esta incidencia
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setIssueNoteModal(null)}>Cancelar</button>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
                  onClick={() => saveIssueNote(issueNoteModal.itemId, issueNoteModal.zoneName, issueNoteModal.itemName)}
                >
                  ⚠ Confirmar incidencia
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>
    )
  }

  // ── VISTA CALENDARIO ──────────────────────────────────────
  const { daysInMonth, startOffset } = monthDays(viewYear, viewMonth)

  return (
    <div className="animate-in page-container">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>
            📅 Revisiones Diarias
          </div>
          <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 3 }}>
            Solo puedes revisar el día actual. Días pasados/futuros aparecen bloqueados.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            className="form-select"
            style={{ minWidth: 170 }}
            value={calendarView}
            onChange={e => setCalendarView(e.target.value)}
          >
            <option value="today">Vista del día</option>
            <option value="month">Vista mensual</option>
          </select>
          {calendarView === 'month' && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
                else setViewMonth(m => m - 1)
              }}>‹</button>
              <span style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 700, textTransform: 'capitalize', minWidth: 160, textAlign: 'center' }}>
                {monthName}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
                else setViewMonth(m => m + 1)
              }}>›</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setViewMonth(now.getMonth()); setViewYear(now.getFullYear()) }}>
                Hoy
              </button>
            </>
          )}
        </div>
      </div>

      {/* Leyenda BV */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {Object.entries(effectiveBvUnits).map(([bvId]) => {
          const c = BV_COLORS[parseInt(bvId)]
          const activeUnits = getActiveUnitsForBv(Number(bvId), configs, effectiveBvUnits)
          return (
            <div key={bvId} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: c.bg, border: `1px solid ${c.border}`,
              borderRadius: 8, padding: '5px 12px', fontSize: 12,
            }}>
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 13, color: c.text }}>BV{bvId}</span>
              <span style={{ color: 'var(--mid)' }}>→</span>
              <span style={{ color: 'var(--light)' }}>
                {activeUnits.length
                  ? 'U' + activeUnits.map(u => String(u).padStart(2, '0')).join(', U')
                  : 'Sin unidades activas'}
              </span>
            </div>
          )
        })}
      </div>

      {calendarView === 'today' ? (
        <TodayPanel
          date={today}
          reportIndex={reportIndex}
          configs={configs}
          bvUnits={effectiveBvUnits}
          onStart={startReview}
          onHistory={(date, bvId) => setHistoryModal({ date, bomberoId: bvId })}
        />
      ) : (
        <div className="card calendar-scroll">
          <div className="calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}>
            {['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'].map(d => (
              <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'var(--mid)' }}>{d}</div>
            ))}
          </div>

          <div className="calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {Array.from({ length: startOffset }, (_, i) => (
              <div key={`e-${i}`} style={{ minHeight: 110, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }} />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => {
              const day     = i + 1
              const date    = dateStr(viewYear, viewMonth, day)
              const isToday = date === today
              const isFuture= date > today
              const isPast = date < today
              const col     = (startOffset + i) % 7
              return (
                <DayCell key={date} day={day} date={date} isToday={isToday} isFuture={isFuture}
                  isPast={isPast}
                  isWeekend={col >= 5} reportIndex={reportIndex}
                  configs={configs}
                  bvUnits={effectiveBvUnits}
                  onStart={startReview}
                  onHistory={(date, bvId) => setHistoryModal({ date, bomberoId: bvId })}
                />
              )
            })}

            {(() => {
              const rem = (startOffset + daysInMonth) % 7
              if (rem === 0) return null
              return Array.from({ length: 7 - rem }, (_, i) => (
                <div key={`f-${i}`} style={{ minHeight: 110, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }} />
              ))
            })()}
          </div>
        </div>
      )}

      {/* Modal historial */}
      {historyModal && (
        <HistoryModal
          date={historyModal.date}
          bomberoId={historyModal.bomberoId}
          reports={reportIndex[`${historyModal.date}-${historyModal.bomberoId}`] || []}
          onRefresh={async () => {
            await loadReports()
            await refreshRevisionIncidents()
          }}
          onNotify={showToast}
          onClose={() => setHistoryModal(null)}
        />
      )}
    </div>
  )
}

function TodayPanel({ date, reportIndex, configs, bvUnits = DEFAULT_BV_UNITS, onStart, onHistory }) {
  const todayLabel = new Date(date + 'T12:00:00').toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontFamily: 'Barlow Condensed', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
        📍 Revisión de hoy
      </div>
      <div style={{ fontSize: 12, color: 'var(--mid)', textTransform: 'capitalize', marginBottom: 14 }}>
        {todayLabel}
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        {Object.entries(bvUnits).map(([bvId]) => {
          const bv = parseInt(bvId)
          const activeUnits = getActiveUnitsForBv(bv, configs, bvUnits)
          const key  = `${date}-${bv}`
          const reps = reportIndex[key] || []
          const effectiveReps = reps
            .filter(r => r.reviewed_by !== 'unidades')
            .filter(r => activeUnits.includes(Number(r.unit_id)))
          const done = activeUnits.length > 0 && effectiveReps.length >= activeUnits.length
          const hasIncident = effectiveReps.some(r => !r.is_ok)
          const partial = effectiveReps.length > 0 && !done
          const c = BV_COLORS[bv]
          return (
            <button key={bv}
              className="calendar-bv-btn"
              onClick={() => done ? onHistory(date, bv) : onStart(date, bv)}
              style={{
                textAlign: 'left', padding: '8px 10px', borderRadius: 8, fontSize: 13,
                fontFamily: 'Barlow Condensed', fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${done ? (hasIncident ? 'var(--red)' : c.border) : partial ? c.border : 'var(--border)'}`,
                background: done ? (hasIncident ? 'rgba(192,57,43,0.2)' : c.bg) : partial ? c.bg : 'transparent',
                color: done ? (hasIncident ? 'var(--red-l)' : c.text) : partial ? c.text : 'var(--light)',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
              }}
            >
              <span>{activeUnits.length === 0 ? '⏸' : done ? (hasIncident ? '⚠' : '✔') : partial ? '◑' : '○'}</span>
              <span style={{ flex: 1 }}>BV{bv}</span>
              {activeUnits.length === 0
                ? <span style={{ opacity: 0.6 }}>(sin unidades)</span>
                : partial && <span style={{ opacity: 0.65 }}>({effectiveReps.length}/{activeUnits.length})</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Panel de incidencias ──────────────────────────────────
function IncidentPanel({ incidents, zones, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ zone: zones[0]?.label || '', item: '', note: '' })

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
          Incidencias {incidents.length > 0 && <span style={{ color: 'var(--red-l)' }}>({incidents.length})</span>}
        </div>
        <button
          onClick={() => setAdding(true)}
          style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 5, color: 'var(--mid)', fontSize: 11, padding: '2px 8px', cursor: 'pointer', fontFamily: 'Barlow' }}
          onMouseEnter={e => { e.target.style.color = 'var(--red-l)'; e.target.style.borderColor = 'var(--red)' }}
          onMouseLeave={e => { e.target.style.color = ''; e.target.style.borderColor = '' }}
        >+ Añadir</button>
      </div>

      {incidents.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: 'var(--mid)', textAlign: 'center', padding: '8px 0' }}>Sin incidencias</div>
      )}

      {incidents.map((inc, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 10px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 6, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red-l)' }}>⚠ {inc.item}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)' }}>{inc.zone}{inc.note ? ` — ${inc.note}` : ''}</div>
          </div>
          <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: 'var(--mid)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>
      ))}

      {adding && (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px' }}>
          <div className="form-group" style={{ marginBottom: 6 }}>
            <label className="form-label" style={{ fontSize: 10 }}>Zona</label>
            <select className="form-select" style={{ fontSize: 12 }} value={form.zone} onChange={e => setForm(p => ({ ...p, zone: e.target.value }))}>
              {zones.map(z => <option key={z.id} value={z.label}>{z.icon} {z.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 6 }}>
            <label className="form-label" style={{ fontSize: 10 }}>Artículo</label>
            <input className="form-input" style={{ fontSize: 12 }} autoFocus placeholder="Ej: Manguera 45mm..." value={form.item} onChange={e => setForm(p => ({ ...p, item: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label" style={{ fontSize: 10 }}>Problema</label>
            <input className="form-input" style={{ fontSize: 12 }} placeholder="Rota, caducada, falta..." value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setAdding(false)}>Cancelar</button>
            <button className="btn btn-primary btn-sm" style={{ fontSize: 11, background: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => {
              if (!form.item.trim()) return
              onAdd({ ...form })
              setForm({ zone: zones[0]?.label || '', item: '', note: '' })
              setAdding(false)
            }}>Añadir</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Celda del calendario ──────────────────────────────────
function DayCell({ day, date, isToday, isFuture, isPast, isWeekend, reportIndex, configs, bvUnits = DEFAULT_BV_UNITS, onStart, onHistory }) {
  const locked = !isToday
  return (
    <div className="calendar-day-cell" style={{
      minHeight: 110, padding: '6px 4px',
      borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
      background: isToday ? 'rgba(255,69,0,0.04)' : isWeekend ? 'rgba(0,0,0,0.07)' : 'transparent',
      outline: isToday ? '2px solid rgba(255,69,0,0.25)' : 'none', outlineOffset: -2,
    }}>
      <div className="calendar-day-number" style={{ fontSize: 11, fontWeight: isToday ? 800 : 400, color: isToday ? 'var(--fire)' : (isFuture || isPast) ? 'var(--border2)' : 'var(--mid)', textAlign: 'right', paddingRight: 4, marginBottom: 4 }}>
        {isToday
          ? <span style={{ background: 'var(--fire)', color: 'white', borderRadius: 4, padding: '0 5px' }}>{day}</span>
          : day}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Object.entries(bvUnits).map(([bvId]) => {
          const bv = parseInt(bvId)
          const activeUnits = getActiveUnitsForBv(bv, configs, bvUnits)
          const key  = `${date}-${bv}`
          const reps = reportIndex[key] || []
          const effectiveReps = reps
            .filter(r => r.reviewed_by !== 'unidades')
            .filter(r => activeUnits.includes(Number(r.unit_id)))
          const done = activeUnits.length > 0 && effectiveReps.length >= activeUnits.length
          const hasIncident = effectiveReps.some(r => !r.is_ok)
          const partial = effectiveReps.length > 0 && !done
          const c = BV_COLORS[bv]
          return (
            <button key={bv}
              className={`calendar-bv-btn ${locked ? 'locked' : ''}`}
              disabled={locked}
              title={locked ? 'Solo se puede revisar el día actual' : done ? 'Ver informe del día' : 'Iniciar revisión del día'}
              onClick={() => done ? onHistory(date, bv) : onStart(date, bv)}
              style={{
                width: '100%', textAlign: 'left', padding: '2px 5px', borderRadius: 4,
                fontSize: 10, fontFamily: 'Barlow Condensed', fontWeight: 700,
                cursor: locked ? 'not-allowed' : 'pointer',
                border: `1px solid ${
                  locked
                    ? 'var(--border)'
                    : done
                      ? (hasIncident ? 'var(--red)' : c.border)
                      : partial ? c.border : 'var(--border)'
                }`,
                background: locked
                  ? 'rgba(0,0,0,0.14)'
                  : done
                    ? (hasIncident ? 'rgba(192,57,43,0.2)' : c.bg)
                    : partial ? c.bg : 'transparent',
                color: locked
                  ? 'var(--border2)'
                  : done
                    ? (hasIncident ? 'var(--red-l)' : c.text)
                    : partial ? c.text : 'var(--mid)',
                opacity: locked ? 0.75 : 1, transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <span>{locked ? '🚫' : activeUnits.length === 0 ? '⏸' : done ? (hasIncident ? '⚠' : '✔') : partial ? '◑' : '○'}</span>
              <span>BV{bv}</span>
              {activeUnits.length === 0
                ? <span style={{ opacity: 0.6 }}>(0)</span>
                : partial && <span style={{ opacity: 0.6 }}>({effectiveReps.length}/{activeUnits.length})</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Modal historial ───────────────────────────────────────
function HistoryModal({ date, bomberoId, reports, onClose, onRefresh, onNotify }) {
  const c = BV_COLORS[bomberoId]
  const visibleReports = (reports || []).filter(r => r.reviewed_by !== 'unidades')
  const totalIncidents = visibleReports.reduce((acc, r) => acc + (r.incidents?.length || 0), 0)
  const allOk = visibleReports.length > 0 && visibleReports.every(r => r.is_ok)
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const [editState, setEditState] = useState(null)
  const [saving, setSaving] = useState(false)
  const [photoViewer, setPhotoViewer] = useState(null) // { urls: string[], index: number, title?: string }

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  function buildEditState(report) {
    const parsed = parseNotesAndPhotoUrls(report.general_notes || '')
    return {
      id: report.id,
      unit_id: report.unit_id,
      reviewed_by: report.reviewed_by || '',
      is_ok: !!report.is_ok,
      general_notes: parsed.notes || '',
      photoUrls: parsed.photoUrls || [],
      incidents: Array.isArray(report.incidents) ? report.incidents.map(i => ({
        zone: i?.zone || '',
        item: i?.item || '',
        note: i?.note || '',
      })) : [],
    }
  }

  async function saveEdit() {
    if (!editState) return
    setSaving(true)
    const { error } = await supabase
      .from('revision_reports')
      .update({
        is_ok: editState.is_ok,
        incidents: editState.incidents
          .filter(i => i.item.trim())
          .map(i => ({ zone: i.zone || '', item: i.item.trim(), note: i.note || '' })),
        general_notes: composeNotesWithPhotoUrls(editState.general_notes || '', editState.photoUrls || []),
      })
      .eq('id', editState.id)
    setSaving(false)
    if (error) {
      onNotify('Error al guardar cambios', 'error')
      return
    }
    onNotify('Informe actualizado', 'ok')
    setEditState(null)
    await onRefresh()
  }

  async function deleteReport(reportId) {
    const ok = window.confirm('¿Resetear esta unidad para volver a revisarla como pendiente?')
    if (!ok) return
    const { error } = await supabase
      .from('revision_reports')
      .update({
        is_ok: false,
        incidents: [],
        general_notes: '',
        reviewed_by: 'unidades',
      })
      .eq('id', reportId)
    if (error) {
      onNotify('No se pudo resetear el informe', 'error')
      return
    }
    onNotify('Unidad reseteada: vuelve a Revisión y podrás revisarla de nuevo', 'warn')
    await onRefresh()
  }

  async function resetAllReports() {
    const ok = window.confirm('¿Resetear TODAS las unidades de este informe para volver a revisarlas?')
    if (!ok) return
    const ids = visibleReports.map(r => r.id)
    if (ids.length === 0) return
    const { error } = await supabase
      .from('revision_reports')
      .update({
        is_ok: false,
        incidents: [],
        general_notes: '',
        reviewed_by: 'unidades',
      })
      .in('id', ids)
    if (error) {
      onNotify('No se pudieron resetear las unidades', 'error')
      return
    }
    onNotify('Informe reseteado: vuelve a Revisión para repetirla', 'warn')
    await onRefresh()
  }

  function openPhotoViewer(urls = [], title = 'Foto') {
    const clean = (urls || []).filter(Boolean)
    if (!clean.length) return
    setPhotoViewer({ urls: clean, index: 0, title })
  }

  return (
    <>
      <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 72 }}>
        <div style={{ background: 'var(--ash)', border: '1px solid var(--border2)', borderRadius: 14, width: '100%', maxWidth: 780, maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 2, background: 'var(--ash)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'Barlow Condensed', fontSize: 16, color: c.text, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: '2px 10px', fontWeight: 800 }}>BV{bomberoId}</span>
              <div>
                <div style={{ fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 700 }}>Informe de revisión</div>
                  <div style={{ fontSize: 11, color: 'var(--mid)', textTransform: 'capitalize' }}>{dateLabel}</div>
                </div>
              </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-danger btn-sm" onClick={resetAllReports}>Resetear todo</button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--mid)', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>
          </div>

          <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {[
                { val: allOk ? '✔ OK' : '⚠', label: 'Estado', color: allOk ? 'var(--green-l)' : 'var(--red-l)', bg: allOk ? 'rgba(39,174,96,0.1)' : 'rgba(192,57,43,0.1)', border: allOk ? 'var(--green)' : 'var(--red)' },
                { val: visibleReports.length, label: 'Unidades', color: 'var(--light)', bg: 'var(--panel)', border: 'var(--border)' },
                { val: totalIncidents, label: 'Incidencias', color: totalIncidents > 0 ? 'var(--red-l)' : 'var(--green-l)', bg: totalIncidents > 0 ? 'rgba(192,57,43,0.08)' : 'var(--panel)', border: totalIncidents > 0 ? 'rgba(192,57,43,0.3)' : 'var(--border)' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, padding: '10px', borderRadius: 8, background: s.bg, border: `1px solid ${s.border}`, textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Barlow Condensed', fontSize: 24, fontWeight: 900, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {visibleReports.length === 0 ? (
              <div className="card" style={{ padding: 20, color: 'var(--mid)' }}>
                No hay informes guardados para este día/BV.
              </div>
            ) : (
              visibleReports.map(r => (
                <div key={r.id} style={{ marginBottom: 10, borderRadius: 8, overflow: 'hidden', border: `1px solid ${r.is_ok ? 'var(--border)' : 'rgba(192,57,43,0.3)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: r.is_ok ? 'var(--panel)' : 'rgba(192,57,43,0.07)' }}>
                    <div style={{ fontFamily: 'Barlow Condensed', fontSize: 15, fontWeight: 800 }}>🚒 Unidad {r.unit_id}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--mid)' }}>por {r.reviewed_by}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: r.is_ok ? 'rgba(39,174,96,0.15)' : 'rgba(192,57,43,0.2)', color: r.is_ok ? 'var(--green-l)' : 'var(--red-l)', border: `1px solid ${r.is_ok ? 'rgba(39,174,96,0.3)' : 'rgba(192,57,43,0.3)'}` }}>
                        {r.is_ok ? '✔ CORRECTO' : '⚠ INCIDENCIAS'}
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditState(buildEditState(r))}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteReport(r.id)}>Resetear</button>
                    </div>
                  </div>
                  {r.incidents?.length > 0 && (
                    <div style={{ padding: '8px 14px' }}>
                      {r.incidents.map((inc, i) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--red-l)', padding: '3px 0', borderBottom: '1px solid rgba(192,57,43,0.1)', display: 'flex', gap: 8 }}>
                          <span>⚠</span><span><strong>{inc.item}</strong> — {inc.zone}{inc.note ? ` — ${inc.note}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(() => {
                    const parsed = parseNotesAndPhotoUrls(r.general_notes || '')
                    const note = parsed.notes
                    const photos = parsed.photoUrls || []
                    if (!note && photos.length === 0) return null
                    return (
                      <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
                        {note && (
                          <div style={{ fontSize: 11, color: 'var(--mid)', fontStyle: 'italic' }}>📝 {note}</div>
                        )}
                        {photos.length > 0 && (
                          <div style={{ marginTop: note ? 8 : 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))', gap: 8 }}>
                            {photos.map((url, idx) => (
                              <button
                                key={`${r.id}-ph-${idx}`}
                                onClick={() => openPhotoViewer(photos, `BV${bomberoId} · U${String(r.unit_id).padStart(2, '0')}`)}
                                title="Ver foto"
                                style={{ all: 'unset', cursor: 'zoom-in', display: 'block', border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}
                              >
                                <img src={url} alt={`Foto ${idx + 1}`} style={{ width: '100%', height: 66, objectFit: 'cover', display: 'block' }} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {editState && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditState(null) }} className="modal-overlay" style={{ zIndex: 210, alignItems: 'center', paddingTop: 20 }}>
          <div className="modal" style={{ maxWidth: 760 }}>
            <div className="modal-header">
              <div className="modal-title">Editar informe · U{String(editState.unit_id).padStart(2, '0')}</div>
              <button className="btn-icon" onClick={() => setEditState(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-select" value={editState.is_ok ? 'ok' : 'inc'} onChange={e => setEditState(p => ({ ...p, is_ok: e.target.value === 'ok' }))}>
                  <option value="ok">Correcto</option>
                  <option value="inc">Con incidencias</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Incidencias</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {editState.incidents.map((inc, idx) => (
                    <div key={idx} style={{ border: '1px solid var(--border2)', borderRadius: 8, padding: 10 }}>
                      <div className="form-row">
                        <input className="form-input" placeholder="Artículo" value={inc.item} onChange={e => setEditState(p => {
                          const incidents = [...p.incidents]
                          incidents[idx] = { ...incidents[idx], item: e.target.value }
                          return { ...p, incidents }
                        })} />
                        <input className="form-input" placeholder="Zona" value={inc.zone} onChange={e => setEditState(p => {
                          const incidents = [...p.incidents]
                          incidents[idx] = { ...incidents[idx], zone: e.target.value }
                          return { ...p, incidents }
                        })} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <input className="form-input" placeholder="Nota" value={inc.note} onChange={e => setEditState(p => {
                          const incidents = [...p.incidents]
                          incidents[idx] = { ...incidents[idx], note: e.target.value }
                          return { ...p, incidents }
                        })} />
                        <button className="btn btn-danger btn-sm" onClick={() => setEditState(p => {
                          const incidents = p.incidents.filter((_, i) => i !== idx)
                          return { ...p, incidents }
                        })}>Quitar</button>
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditState(p => ({
                    ...p,
                    incidents: [...p.incidents, { zone: '', item: '', note: '' }]
                  }))}>
                    + Añadir incidencia
                  </button>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Observaciones</label>
                <textarea className="form-input" style={{ minHeight: 90, resize: 'vertical', fontFamily: 'Barlow' }} value={editState.general_notes} onChange={e => setEditState(p => ({ ...p, general_notes: e.target.value }))} />
              </div>
              {(editState.photoUrls || []).length > 0 && (
                <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
                  <label className="form-label">Fotos adjuntas</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))', gap: 8 }}>
                    {(editState.photoUrls || []).map((url, idx) => (
                      <div key={`edit-ph-${idx}`} style={{ position: 'relative', border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}>
                        <button
                          title="Ver foto"
                          onClick={() => openPhotoViewer(editState.photoUrls || [], `BV${bomberoId} · U${String(editState.unit_id).padStart(2, '0')}`)}
                          style={{ all: 'unset', cursor: 'zoom-in', display: 'block', width: '100%' }}
                        >
                          <img src={url} alt={`Foto ${idx + 1}`} style={{ width: '100%', height: 66, objectFit: 'cover', display: 'block' }} />
                        </button>
                        <button
                          className="btn-icon"
                          style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, fontSize: 11, background: 'rgba(0,0,0,0.65)' }}
                          onClick={() => setEditState(p => ({ ...p, photoUrls: (p.photoUrls || []).filter((_, i) => i !== idx) }))}
                          title="Quitar foto"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditState(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}

      {photoViewer && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setPhotoViewer(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 260, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 20 }}
        >
          <div style={{ width: '100%', maxWidth: 1100 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ color: 'var(--light)', fontFamily: 'Barlow Condensed', fontSize: 20 }}>{photoViewer.title || 'Foto de incidencia'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPhotoViewer(null)}>Cerrar</button>
            </div>
            <div style={{ position: 'relative', border: '1px solid var(--border2)', borderRadius: 12, overflow: 'hidden', background: '#111' }}>
              <img
                src={photoViewer.urls[photoViewer.index]}
                alt={`Foto ${photoViewer.index + 1}`}
                style={{ width: '100%', maxHeight: '76vh', objectFit: 'contain', display: 'block', margin: '0 auto' }}
              />
              {photoViewer.urls.length > 1 && (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)' }}
                    onClick={() => setPhotoViewer(v => ({ ...v, index: (v.index - 1 + v.urls.length) % v.urls.length }))}
                  >
                    ‹
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)' }}
                    onClick={() => setPhotoViewer(v => ({ ...v, index: (v.index + 1) % v.urls.length }))}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
