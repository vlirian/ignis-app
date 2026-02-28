import { useState, useEffect } from 'react'
import { useApp } from '../lib/AppContext'
import { buildZones } from '../data/units'
import { supabase } from '../lib/supabase'

// ── Asignación BV → Unidades ──────────────────────────────
const BV_UNITS = {
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

// ── VISTA PRINCIPAL ───────────────────────────────────────
export default function Revision() {
  const { configs, items, session, revisionIncidents, refreshRevisionIncidents, showToast } = useApp()
  const now = new Date()

  const [view, setView] = useState('calendar') // 'calendar' | 'review'
  const [reviewState, setReviewState] = useState(null)
  // reviewState: { date, bomberoId, activeUnitIdx, units: [{ unitId, itemChecks: {itemId: bool}, incidents: [], notes, done }] }

  const [viewYear,  setViewYear]  = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [reports,   setReports]   = useState([])
  const [loadingReports, setLoadingReports] = useState(true)
  const [historyModal, setHistoryModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [issueNoteModal, setIssueNoteModal] = useState(null) // { itemId, itemName, zoneName, currentNote }
  const [issueNoteDraft, setIssueNoteDraft] = useState('')

  useEffect(() => { loadReports() }, [viewYear, viewMonth])

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
  function startReview(date, bomberoId) {
    const unitIds = BV_UNITS[bomberoId]
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
      return { unitId, itemChecks, itemNotes, incidents, notes: '', done: false }
    })

    setReviewState({ date, bomberoId, activeUnitIdx: 0, units })
    setView('review')
  }

  // Guardar toda la revisión en Supabase
  async function saveReview() {
    setSaving(true)
    const { date, bomberoId, units } = reviewState
    const email = session?.user?.email || 'desconocido'

    for (const unit of units) {
      const cfg   = configs[unit.unitId]
      const zones = cfg ? buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera) : []
      const resolveItemMeta = (id) => {
        for (const z of zones) {
          const found = (items[unit.unitId]?.[z.id] || []).find(i => String(i.id) === String(id))
          if (found) return { itemId: id, name: found.name, zone: z.label, isMissing: found.qty === 0 }
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

      await supabase.from('revision_reports').upsert({
        report_date:   date,
        bombero_id:    bomberoId,
        unit_id:       unit.unitId,
        is_ok:         isOk,
        incidents,
        general_notes: unit.notes,
        reviewed_by:   email,
      }, { onConflict: 'report_date,bombero_id,unit_id' })
    }

    setSaving(false)
    setView('calendar')
    setReviewState(null)
    loadReports()
    refreshRevisionIncidents()
  }

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  // ── VISTA REVISIÓN ────────────────────────────────────────
  if (view === 'review' && reviewState) {
    const { date, bomberoId, activeUnitIdx, units } = reviewState
    const c = BV_COLORS[bomberoId]
    const activeUnit = units[activeUnitIdx]
    const cfg   = configs[activeUnit.unitId]
    const zones = cfg ? buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera) : []
    const unitItems = items[activeUnit.unitId] || {}

    const totalItems   = Object.keys(activeUnit.itemChecks).length
    const checkedCount = Object.values(activeUnit.itemChecks).filter(v => v === 'ok' || v === 'issue').length
    const issueCount   = Object.values(activeUnit.itemChecks).filter(v => v === 'issue').length
    const allDone      = checkedCount === totalItems
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
            return {
              ...u,
              itemChecks: { ...u.itemChecks, [itemId]: null },
              incidents: u.incidents.filter(inc => inc._itemId !== itemId),
              itemNotes: cleanedNotes,
            }
          }

          const defaultNote = isMissing
            ? 'Marcado por bombero: FALTA de material'
            : 'Marcado por bombero: INCIDENCIA de material'
          const note = u.itemNotes?.[itemId]?.trim() ? u.itemNotes[itemId] : defaultNote
          const incidents = u.incidents.filter(inc => inc._itemId !== itemId)
          incidents.push({ _itemId: itemId, zone: zoneName, item: itemName, note })

          return {
            ...u,
            itemChecks: { ...u.itemChecks, [itemId]: 'issue' },
            itemNotes: { ...u.itemNotes, [itemId]: note },
            incidents,
          }
        })
        return { ...prev, units }
      })
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

    function saveIssueNote(itemId, zoneName, itemName, note) {
      const key = incidentKey(activeUnit.unitId, zoneName, itemName)
      if (activeUnit.itemChecks[itemId] !== 'issue' && existingIncidentKeys.has(key)) {
        showToast('Esa incidencia ya existe en Alertas', 'warn')
        setIssueNoteModal(null)
        return
      }

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
          return {
            ...u,
            itemChecks: { ...u.itemChecks, [itemId]: 'issue' },
            itemNotes: { ...u.itemNotes, [itemId]: note },
            incidents: newIncidents,
          }
        })
        return { ...prev, units }
      })
      setIssueNoteModal(null)
      setIssueNoteDraft('')
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

    function goToUnit(idx) {
      setReviewState(prev => ({ ...prev, activeUnitIdx: idx }))
    }

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
              onClick={() => { setView('calendar'); setReviewState(null) }}
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
              return (
                <button
                  key={u.unitId}
                  onClick={() => goToUnit(i)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                    fontFamily: 'Barlow Condensed', fontSize: 14, fontWeight: 700,
                    border: `2px solid ${i === activeUnitIdx ? c.border : done ? 'var(--green)' : partial ? 'var(--yellow)' : 'var(--border2)'}`,
                    background: i === activeUnitIdx ? c.bg : done ? 'rgba(39,174,96,0.1)' : 'transparent',
                    color: i === activeUnitIdx ? c.text : done ? 'var(--green-l)' : partial ? 'var(--yellow-l)' : 'var(--mid)',
                    transition: 'all 0.15s',
                  }}
                >
                  {done ? '✔' : partial ? '◑' : '○'} U{String(u.unitId).padStart(2,'0')}
                </button>
              )
            })}
          </div>

          <button
            className="btn btn-primary btn-sm revision-save-btn"
            onClick={saveReview}
            disabled={saving}
            style={{
              background: 'var(--green)', borderColor: 'var(--green)',
              fontSize: 13, padding: '8px 20px', fontWeight: 700,
            }}
          >
            {saving ? 'Guardando...' : '✔ Guardar revisión completa'}
          </button>
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
                    const isMissing = item.qty === 0
                    const isLow = item.qty > 0 && item.qty < item.min
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
                                onClick={() => { setIssueNoteDraft(activeUnit.itemNotes?.[item.id] || ''); setIssueNoteModal({ itemId: item.id, itemName: item.name, zoneName: zone.label, editOnly: true }) }}
                                style={{ fontSize: 9, fontWeight: 700, color: 'var(--red-l)', background: 'rgba(192,57,43,0.15)', border: '1px solid rgba(192,57,43,0.3)', padding: '1px 6px', borderRadius: 8, letterSpacing: 0.5, cursor: 'pointer' }}
                              >⚠ FALTA/INC.</span>
                            )}
                            <span style={{
                              fontFamily: 'Roboto Mono', fontSize: 13, fontWeight: 600,
                              color: isMissing ? 'var(--red-l)' : isLow ? 'var(--yellow-l)' : 'var(--green-l)',
                            }}>
                              {item.qty}<span style={{ fontSize: 10, color: 'var(--mid)', fontWeight: 400 }}>/{item.min}</span>
                            </span>
                            {isMissing && <div style={{ fontSize: 9, color: 'var(--red-l)', fontWeight: 700, letterSpacing: 0.5 }}>FALTA</div>}
                            {isLow && !isMissing && <div style={{ fontSize: 9, color: 'var(--yellow-l)', fontWeight: 700, letterSpacing: 0.5 }}>BAJO</div>}
                          </div>
                        </div>

                        {/* Nota de incidencia inline */}
                        {status === 'issue' && activeUnit.itemNotes?.[item.id] && (
                          <div
                            onClick={() => { setIssueNoteDraft(activeUnit.itemNotes[item.id]); setIssueNoteModal({ itemId: item.id, itemName: item.name, zoneName: zone.label, editOnly: true }) }}
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
            </div>

            {/* Resumen todas las unidades */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
                Progreso global
              </div>
              {units.map((u, i) => {
                const total   = Object.keys(u.itemChecks).length
                const checked = Object.values(u.itemChecks).filter(Boolean).length
                const done    = checked === total
                const pct     = total ? Math.round((checked / total) * 100) : 0
                return (
                  <div
                    key={u.unitId}
                    onClick={() => goToUnit(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                      background: i === activeUnitIdx ? c.bg : 'transparent',
                      border: `1px solid ${i === activeUnitIdx ? c.border : 'transparent'}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 16 }}>{done ? '✅' : u.incidents.length > 0 ? '⚠️' : '🔄'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: i === activeUnitIdx ? c.text : 'var(--light)' }}>
                        Unidad {u.unitId}
                      </div>
                      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct + '%', background: done ? 'var(--green)' : 'var(--fire)', borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--mid)', fontFamily: 'Roboto Mono' }}>{pct}%</span>
                  </div>
                )
              })}
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
                Este artículo quedará marcado con ✕ y aparecerá automáticamente en el panel de incidencias.
              </div>
              <label style={{ fontSize: 11, color: 'var(--mid)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>¿Qué le sucede?</label>
              <textarea
                autoFocus
                className="form-input"
                style={{ height: 90, resize: 'vertical', fontFamily: 'Barlow', fontSize: 13 }}
                placeholder="Ej: Manguera rota, extintor caducado, falta la lanza..."
                value={issueNoteDraft}
                onChange={e => setIssueNoteDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveIssueNote(issueNoteModal.itemId, issueNoteModal.zoneName, issueNoteModal.itemName, issueNoteDraft) }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setIssueNoteModal(null)}>Cancelar</button>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
                  onClick={() => saveIssueNote(issueNoteModal.itemId, issueNoteModal.zoneName, issueNoteModal.itemName, issueNoteDraft)}
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
            Pulsa un BV del día de hoy para iniciar tu revisión
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
        </div>
      </div>

      {/* Leyenda BV */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {Object.entries(BV_UNITS).map(([bvId, units]) => {
          const c = BV_COLORS[parseInt(bvId)]
          return (
            <div key={bvId} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: c.bg, border: `1px solid ${c.border}`,
              borderRadius: 8, padding: '5px 12px', fontSize: 12,
            }}>
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 13, color: c.text }}>BV{bvId}</span>
              <span style={{ color: 'var(--mid)' }}>→</span>
              <span style={{ color: 'var(--light)' }}>U{units.map(u => String(u).padStart(2,'0')).join(', U')}</span>
            </div>
          )
        })}
      </div>

      {/* Calendario */}
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
            const isToday = date === todayStr()
            const isFuture= date > todayStr()
            const col     = (startOffset + i) % 7
            return (
              <DayCell key={date} day={day} date={date} isToday={isToday} isFuture={isFuture}
                isWeekend={col >= 5} reportIndex={reportIndex}
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
function DayCell({ day, date, isToday, isFuture, isWeekend, reportIndex, onStart, onHistory }) {
  return (
    <div style={{
      minHeight: 110, padding: '6px 4px',
      borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
      background: isToday ? 'rgba(255,69,0,0.04)' : isWeekend ? 'rgba(0,0,0,0.07)' : 'transparent',
      outline: isToday ? '2px solid rgba(255,69,0,0.25)' : 'none', outlineOffset: -2,
    }}>
      <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 400, color: isToday ? 'var(--fire)' : isFuture ? 'var(--border2)' : 'var(--mid)', textAlign: 'right', paddingRight: 4, marginBottom: 4 }}>
        {isToday
          ? <span style={{ background: 'var(--fire)', color: 'white', borderRadius: 4, padding: '0 5px' }}>{day}</span>
          : day}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Object.entries(BV_UNITS).map(([bvId, units]) => {
          const bv   = parseInt(bvId)
          const key  = `${date}-${bv}`
          const reps = reportIndex[key] || []
          const done = reps.length >= units.length
          const hasIncident = reps.some(r => !r.is_ok)
          const partial = reps.length > 0 && !done
          const c = BV_COLORS[bv]
          return (
            <button key={bv} disabled={isFuture}
              onClick={() => done ? onHistory(date, bv) : onStart(date, bv)}
              style={{
                width: '100%', textAlign: 'left', padding: '2px 5px', borderRadius: 4,
                fontSize: 10, fontFamily: 'Barlow Condensed', fontWeight: 700,
                cursor: isFuture ? 'default' : 'pointer',
                border: `1px solid ${done ? (hasIncident ? 'var(--red)' : c.border) : partial ? c.border : 'var(--border)'}`,
                background: done ? (hasIncident ? 'rgba(192,57,43,0.2)' : c.bg) : partial ? c.bg : 'transparent',
                color: done ? (hasIncident ? 'var(--red-l)' : c.text) : partial ? c.text : isFuture ? 'var(--border2)' : 'var(--mid)',
                opacity: isFuture ? 0.35 : 1, transition: 'all 0.1s',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <span>{done ? (hasIncident ? '⚠' : '✔') : partial ? '◑' : '○'}</span>
              <span>BV{bv}</span>
              {partial && <span style={{ opacity: 0.6 }}>({reps.length}/{units.length})</span>}
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
  const totalIncidents = reports.reduce((acc, r) => acc + (r.incidents?.length || 0), 0)
  const allOk = reports.length > 0 && reports.every(r => r.is_ok)
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const [editState, setEditState] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  function buildEditState(report) {
    return {
      id: report.id,
      unit_id: report.unit_id,
      reviewed_by: report.reviewed_by || '',
      is_ok: !!report.is_ok,
      general_notes: report.general_notes || '',
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
        general_notes: editState.general_notes || '',
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
    const ok = window.confirm('¿Seguro que quieres borrar este informe de unidad?')
    if (!ok) return
    const { error } = await supabase.from('revision_reports').delete().eq('id', reportId)
    if (error) {
      onNotify('No se pudo borrar el informe', 'error')
      return
    }
    onNotify('Informe borrado', 'warn')
    await onRefresh()
  }

  return (
    <>
      <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: 'var(--ash)', border: '1px solid var(--border2)', borderRadius: 14, width: '100%', maxWidth: 780, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'Barlow Condensed', fontSize: 16, color: c.text, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: '2px 10px', fontWeight: 800 }}>BV{bomberoId}</span>
              <div>
                <div style={{ fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 700 }}>Informe de revisión</div>
                <div style={{ fontSize: 11, color: 'var(--mid)', textTransform: 'capitalize' }}>{dateLabel}</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--mid)', cursor: 'pointer', fontSize: 20 }}>✕</button>
          </div>

          <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {[
                { val: allOk ? '✔ OK' : '⚠', label: 'Estado', color: allOk ? 'var(--green-l)' : 'var(--red-l)', bg: allOk ? 'rgba(39,174,96,0.1)' : 'rgba(192,57,43,0.1)', border: allOk ? 'var(--green)' : 'var(--red)' },
                { val: reports.length, label: 'Unidades', color: 'var(--light)', bg: 'var(--panel)', border: 'var(--border)' },
                { val: totalIncidents, label: 'Incidencias', color: totalIncidents > 0 ? 'var(--red-l)' : 'var(--green-l)', bg: totalIncidents > 0 ? 'rgba(192,57,43,0.08)' : 'var(--panel)', border: totalIncidents > 0 ? 'rgba(192,57,43,0.3)' : 'var(--border)' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, padding: '10px', borderRadius: 8, background: s.bg, border: `1px solid ${s.border}`, textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Barlow Condensed', fontSize: 24, fontWeight: 900, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {reports.map(r => (
              <div key={r.id} style={{ marginBottom: 10, borderRadius: 8, overflow: 'hidden', border: `1px solid ${r.is_ok ? 'var(--border)' : 'rgba(192,57,43,0.3)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: r.is_ok ? 'var(--panel)' : 'rgba(192,57,43,0.07)' }}>
                  <div style={{ fontFamily: 'Barlow Condensed', fontSize: 15, fontWeight: 800 }}>🚒 Unidad {r.unit_id}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--mid)' }}>por {r.reviewed_by}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: r.is_ok ? 'rgba(39,174,96,0.15)' : 'rgba(192,57,43,0.2)', color: r.is_ok ? 'var(--green-l)' : 'var(--red-l)', border: `1px solid ${r.is_ok ? 'rgba(39,174,96,0.3)' : 'rgba(192,57,43,0.3)'}` }}>
                      {r.is_ok ? '✔ CORRECTO' : '⚠ INCIDENCIAS'}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditState(buildEditState(r))}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteReport(r.id)}>Borrar</button>
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
                {r.general_notes && (
                  <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--mid)', fontStyle: 'italic', borderTop: '1px solid var(--border)' }}>📝 {r.general_notes}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {editState && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditState(null) }} className="modal-overlay" style={{ zIndex: 210 }}>
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
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditState(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
