import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { supabase } from './supabase'
import { UNIT_IDS, defaultUnitConfig, buildZones } from '../data/units'

const AppContext = createContext(null)
const ADMIN_EMAILS = ['estudiovic@gmail.com']
const BV_UNITS = {
  1: [3, 7, 19],
  2: [0, 6, 14],
  3: [1, 16, 22],
  4: [10, 11, 15],
  5: [4, 9, 18, 21],
  6: [2, 12, 17],
  7: [5, 8, 20],
}

function unitToBv(unitId) {
  const uid = Number(unitId)
  for (const [bv, units] of Object.entries(BV_UNITS)) {
    if (units.includes(uid)) return Number(bv)
  }
  return 1
}

function emptyState() {
  const configs = {}
  const items = {}
  UNIT_IDS.forEach(id => {
    configs[id] = defaultUnitConfig(id)
    items[id] = {}
    buildZones(configs[id].numCofres, configs[id].hasTecho, configs[id].hasTrasera)
      .forEach(z => { items[id][z.id] = [] })
  })
  return { configs, items }
}

export function AppProvider({ children }) {
  const [state, setState]         = useState(emptyState)
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [session, setSession]     = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [reviews, setReviews]     = useState({})
  const [itemStates, setItemStates] = useState({})
  const [revisionIncidents, setRevisionIncidents] = useState([])  // incidencias de informes BV de hoy
  const isAdmin = ADMIN_EMAILS.includes((session?.user?.email || '').toLowerCase())
  const todayDate = new Date().toISOString().slice(0, 10)

  // ── Auth ──────────────────────────────────────────────
  useEffect(() => {
    const hash = window.location.hash || ''
    if (hash.includes('type=recovery')) setRecovering(true)

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const finishRecovery = useCallback(() => {
    setRecovering(false)
    if (window.location.hash.includes('type=recovery')) {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
    }
  }, [])

  useEffect(() => {
    if (!authReady) return
    if (!session) { setLoading(false); return }
    loadAll()
  }, [authReady, session?.user?.id])

  // ── Carga de datos ────────────────────────────────────
  async function loadAll() {
    setLoading(true)
    try {
      const { data: cfgData, error: cfgErr } = await supabase.from('unit_configs').select('*')
      if (cfgErr) throw cfgErr

      const configs = {}
      UNIT_IDS.forEach(id => { configs[id] = defaultUnitConfig(id) })
      cfgData.forEach(row => {
        configs[row.unit_id] = { numCofres: row.num_cofres, hasTecho: row.has_techo, hasTrasera: row.has_trasera }
      })

      const { data: itemData, error: itemErr } = await supabase
        .from('unit_items').select('*').order('created_at', { ascending: true })
      if (itemErr) throw itemErr

      const items = {}
      UNIT_IDS.forEach(id => {
        items[id] = {}
        buildZones(configs[id].numCofres, configs[id].hasTecho, configs[id].hasTrasera)
          .forEach(z => { items[id][z.id] = [] })
      })
      itemData.forEach(row => {
        if (!items[row.unit_id]) return
        if (!items[row.unit_id][row.zone_id]) items[row.unit_id][row.zone_id] = []
        items[row.unit_id][row.zone_id].push({
          id: row.id, name: row.name, desc: row.description, qty: row.qty, min: row.min_qty
        })
      })
      setState({ configs, items })

      const { data: revData } = await supabase
        .from('unit_reviews').select('*').order('reviewed_at', { ascending: false })
      const latestReviews = {}
      if (revData) revData.forEach(r => { if (!latestReviews[r.unit_id]) latestReviews[r.unit_id] = r })
      setReviews(latestReviews)

      // Incidencias activas registradas en revisiones diarias (todas las fechas)
      const { data: reportsWithIncidents } = await supabase
        .from('revision_reports')
        .select('*')
        .not('incidents', 'is', null)
      const revInc = []
      if (reportsWithIncidents) {
        reportsWithIncidents.forEach(r => {
          ;(r.incidents || []).forEach(inc => {
            if (!inc?.item) return
            revInc.push({
              source: inc.source || (r.bombero_id === 0 ? 'unidad' : 'revision'),
              unitId: r.unit_id,
              zone: inc.zone,
              item: inc.item,
              note: inc.note || '',
              itemId: inc.itemId || null,
              bomberoId: r.bombero_id,
              reportDate: r.report_date || null,
            })
          })
        })
      }
      setRevisionIncidents(revInc)

    } catch (err) {
      console.error('Error cargando datos:', err)
      showToast('Error de conexión', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ── Toast ─────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type, id: Date.now() })
    setTimeout(() => setToast(null), 2500)
  }, [])

  // ── Logout ────────────────────────────────────────────
  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setState(emptyState())
    setReviews({})
    setItemStates({})
  }, [])

  // ── Revisión de unidad ────────────────────────────────
  const refreshRevisionIncidents = useCallback(async () => {
    const { data } = await supabase
      .from('revision_reports')
      .select('*')
      .not('incidents', 'is', null)
    const revInc = []
    if (data) {
      data.forEach(r => {
        ;(r.incidents || []).forEach(inc => {
          if (!inc?.item) return
          revInc.push({
            source: inc.source || (r.bombero_id === 0 ? 'unidad' : 'revision'),
            unitId: r.unit_id,
            zone: inc.zone,
            item: inc.item,
            note: inc.note || '',
            itemId: inc.itemId || null,
            bomberoId: r.bombero_id,
            reportDate: r.report_date || null,
          })
        })
      })
    }
    setRevisionIncidents(revInc)
  }, [])

  const resolveItemMeta = useCallback((unitId, itemId) => {
    const unitItems = state.items?.[unitId] || {}
    const cfg = state.configs?.[unitId]
    const zones = cfg ? buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera) : []

    for (const [zoneId, zItems] of Object.entries(unitItems)) {
      const found = (zItems || []).find(i => String(i.id) === String(itemId))
      if (!found) continue
      const zoneDef = zones.find(z => z.id === zoneId)
      return {
        zoneId,
        zoneLabel: zoneDef?.label || zoneId,
        itemName: found.name,
      }
    }
    return null
  }, [state.items, state.configs])

  const syncIncidentToReports = useCallback(async ({ unitId, itemId, zoneLabel, itemName, note = '', source = 'unidad' }) => {
    const targetBomberoId = unitToBv(unitId)
    const keyMatch = (inc) => {
      const idMatch = inc?.itemId && String(inc.itemId) === String(itemId)
      const fallback = String(inc?.zone || '').trim().toLowerCase() === String(zoneLabel || '').trim().toLowerCase()
        && String(inc?.item || '').trim().toLowerCase() === String(itemName || '').trim().toLowerCase()
      return idMatch || fallback
    }

    // Crea/actualiza registro puente de "Unidades" para hoy
    const { data: existingRows, error: findErr } = await supabase
      .from('revision_reports')
      .select('*')
      .eq('report_date', todayDate)
      .eq('bombero_id', targetBomberoId)
      .eq('unit_id', unitId)
      .limit(1)
    if (findErr) return { ok: false, error: findErr.message || 'find_error' }

    const todayRow = Array.isArray(existingRows) ? existingRows[0] : null

    const baseIncidents = Array.isArray(todayRow?.incidents) ? todayRow.incidents : []
    const merged = baseIncidents.filter(inc => !keyMatch(inc))
    merged.push({
      itemId,
      zone: zoneLabel || '',
      item: itemName || '',
      note: note || '',
      source,
    })

    if (todayRow?.id) {
      const { error: updErr } = await supabase
        .from('revision_reports')
        .update({
          incidents: merged,
          is_ok: false,
          reviewed_by: session?.user?.email || 'unidades',
        })
        .eq('id', todayRow.id)
      if (updErr) return { ok: false, error: updErr.message || 'update_error' }
    } else {
      const { error: insErr } = await supabase
        .from('revision_reports')
        .insert({
          report_date: todayDate,
          bombero_id: targetBomberoId,
          unit_id: unitId,
          is_ok: false,
          incidents: merged,
          general_notes: '',
          reviewed_by: 'unidades',
        })
      if (insErr) return { ok: false, error: insErr.message || 'insert_error' }
    }

    await refreshRevisionIncidents()
    return { ok: true }
  }, [todayDate, refreshRevisionIncidents])

  const clearIncidentFromReports = useCallback(async ({ unitId, itemId, zoneLabel, itemName }) => {
    const keyMatch = (inc) => {
      const idMatch = inc?.itemId && String(inc.itemId) === String(itemId)
      const fallback = String(inc?.zone || '').trim().toLowerCase() === String(zoneLabel || '').trim().toLowerCase()
        && String(inc?.item || '').trim().toLowerCase() === String(itemName || '').trim().toLowerCase()
      return idMatch || fallback
    }

    const { data: rows, error: rowsErr } = await supabase
      .from('revision_reports')
      .select('*')
      .eq('unit_id', unitId)
      .not('incidents', 'is', null)
    if (rowsErr) return { ok: false, error: rowsErr.message || 'find_error' }

    for (const row of rows || []) {
      const oldIncidents = Array.isArray(row.incidents) ? row.incidents : []
      const incidents = oldIncidents.filter(inc => !keyMatch(inc))
      if (incidents.length === oldIncidents.length) continue
      const { error: updErr } = await supabase
        .from('revision_reports')
        .update({ incidents, is_ok: incidents.length === 0 ? true : row.is_ok })
        .eq('id', row.id)
      if (updErr) return { ok: false, error: updErr.message || 'update_error' }
    }

    await refreshRevisionIncidents()
    return { ok: true }
  }, [refreshRevisionIncidents])

  // ── Item states (revisión por artículo) ───────────────
  const setUnitItemState = useCallback(async (unitId, itemId, state) => {
    const localPrevStatus = itemStates?.[unitId]?.[itemId]?.status || null
    const meta = resolveItemMeta(unitId, itemId)
    const inRevisionIncidents = (() => {
      if (!meta) return false
      const byId = (revisionIncidents || []).some(inc => inc.unitId === unitId && inc.itemId && String(inc.itemId) === String(itemId))
      const byLabel = (revisionIncidents || []).some(inc =>
        inc.unitId === unitId &&
        String(inc.zone || '').trim().toLowerCase() === String(meta.zoneLabel || '').trim().toLowerCase() &&
        String(inc.item || '').trim().toLowerCase() === String(meta.itemName || '').trim().toLowerCase()
      )
      return byId || byLabel
    })()
    const prevStatus = localPrevStatus === 'issue' || inRevisionIncidents ? 'issue' : localPrevStatus

    setItemStates(prev => ({
      ...prev,
      [unitId]: { ...(prev[unitId] || {}), [itemId]: state }
    }))

    if (!meta) return

    if (state?.status === 'issue') {
      const sync = await syncIncidentToReports({
        unitId,
        itemId,
        zoneLabel: meta.zoneLabel,
        itemName: meta.itemName,
        note: state?.note || '',
        source: 'unidad',
      })
      if (!sync?.ok) showToast(`No se pudo sincronizar: ${sync.error || 'error'}`, 'error')
      return
    }

    if (prevStatus === 'issue' && state?.status !== 'issue') {
      const clear = await clearIncidentFromReports({
        unitId,
        itemId,
        zoneLabel: meta.zoneLabel,
        itemName: meta.itemName,
      })
      if (!clear?.ok) showToast(`No se pudo quitar sincronizada: ${clear.error || 'error'}`, 'error')
    }
  }, [itemStates, revisionIncidents, resolveItemMeta, syncIncidentToReports, clearIncidentFromReports, showToast])

  const setUnitAllItemStates = useCallback((unitId, states) => {
    setItemStates(prev => ({
      ...prev,
      [unitId]: { ...(prev[unitId] || {}), ...states }
    }))
  }, [])

  const clearAllIncidents = useCallback(async () => {
    if (!isAdmin) return { ok: false, error: 'not_admin' }
    const { error } = await supabase
      .from('revision_reports')
      .update({ incidents: [], is_ok: true })
      .not('id', 'is', null)
    if (error) return { ok: false, error: error.message || 'error' }
    await refreshRevisionIncidents()
    return { ok: true }
  }, [isAdmin, refreshRevisionIncidents])

  const reviewUnit = useCallback(async (unitId, notes = '', isOk = true) => {
    const userEmail = session?.user?.email || 'desconocido'
    const { data, error } = await supabase
      .from('unit_reviews')
      .insert({ unit_id: unitId, reviewed_by: userEmail, notes, is_ok: isOk })
      .select().single()
    if (error) { showToast('Error al guardar revisión', 'error'); return null }
    setReviews(prev => ({ ...prev, [unitId]: data }))
    showToast('✔ Revisión registrada', 'ok')
    return data
  }, [session, showToast])

  // ── CRUD artículos ────────────────────────────────────
  const updateQty = useCallback(async (unitId, zoneId, itemId, delta) => {
    let newQty
    setState(prev => {
      const zoneItems = (prev.items[unitId][zoneId] || []).map(it => {
        if (it.id === itemId) { newQty = Math.max(0, it.qty + delta); return { ...it, qty: newQty } }
        return it
      })
      return { ...prev, items: { ...prev.items, [unitId]: { ...prev.items[unitId], [zoneId]: zoneItems } } }
    })
    const { error } = await supabase.from('unit_items').update({ qty: newQty }).eq('id', itemId)
    if (error) showToast('Error al guardar', 'error')
  }, [showToast])

  const addItem = useCallback(async (unitId, zoneId, item) => {
    const { data, error } = await supabase
      .from('unit_items')
      .insert({ unit_id: unitId, zone_id: zoneId, name: item.name, description: item.desc || '', qty: item.qty, min_qty: item.min })
      .select().single()
    if (error) { showToast('Error al guardar', 'error'); return null }
    const newItem = { id: data.id, name: data.name, desc: data.description, qty: data.qty, min: data.min_qty }
    setState(prev => ({
      ...prev,
      items: { ...prev.items, [unitId]: { ...prev.items[unitId], [zoneId]: [...(prev.items[unitId][zoneId] || []), newItem] } }
    }))
    return newItem
  }, [showToast])

  const deleteItem = useCallback(async (unitId, zoneId, itemId) => {
    const { error } = await supabase.from('unit_items').delete().eq('id', itemId)
    if (error) { showToast('Error al eliminar', 'error'); return }
    setState(prev => ({
      ...prev,
      items: { ...prev.items, [unitId]: { ...prev.items[unitId], [zoneId]: prev.items[unitId][zoneId].filter(it => it.id !== itemId) } }
    }))
  }, [showToast])

  const editItem = useCallback(async (unitId, zoneId, itemId, changes) => {
    const { error } = await supabase
      .from('unit_items')
      .update({ name: changes.name, description: changes.desc, qty: changes.qty, min_qty: changes.min })
      .eq('id', itemId)
    if (error) { showToast('Error al guardar', 'error'); return }
    setState(prev => ({
      ...prev,
      items: { ...prev.items, [unitId]: { ...prev.items[unitId], [zoneId]: prev.items[unitId][zoneId].map(it => it.id === itemId ? { ...it, ...changes } : it) } }
    }))
  }, [showToast])

  const updateUnitConfig = useCallback(async (unitId, newConfig) => {
    const { error } = await supabase.from('unit_configs').upsert({
      unit_id: unitId, num_cofres: newConfig.numCofres, has_techo: newConfig.hasTecho, has_trasera: newConfig.hasTrasera,
    })
    if (error) { showToast('Error al guardar configuración', 'error'); return }
    setState(prev => {
      const zones = buildZones(newConfig.numCofres, newConfig.hasTecho, newConfig.hasTrasera)
      const updatedItems = { ...prev.items[unitId] }
      zones.forEach(z => { if (!updatedItems[z.id]) updatedItems[z.id] = [] })
      return { ...prev, configs: { ...prev.configs, [unitId]: newConfig }, items: { ...prev.items, [unitId]: updatedItems } }
    })
  }, [showToast])

  return (
    <AppContext.Provider value={{
      session, authReady, recovering, finishRecovery, isAdmin, logout,
      configs: state.configs, items: state.items, reviews,
      loading, toast, showToast,
      itemStates, setUnitItemState, setUnitAllItemStates,
      revisionIncidents, refreshRevisionIncidents, clearAllIncidents,
      reviewUnit, updateQty, addItem, deleteItem, editItem, updateUnitConfig,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() { return useContext(AppContext) }
