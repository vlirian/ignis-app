import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { UNIT_IDS, defaultUnitConfig, buildZones } from '../data/units'

const AppContext = createContext(null)
const ADMIN_EMAILS = ['estudiovic@gmail.com']
const ROLE_PERMISSIONS = {
  admin: ['view', 'edit', 'approve_requests', 'manage_roles', 'manage_system'],
  operador: ['view', 'edit'],
  lector: ['view'],
}
const PHOTO_NOTES_MARKER = '[[FOTOS_REVISION]]'
const BV_UNITS = {
  1: [3, 7, 19],
  2: [0, 6, 14],
  3: [1, 16, 22],
  4: [10, 11, 15],
  5: [4, 9, 18, 21],
  6: [2, 12, 17],
  7: [5, 8, 20],
}

function normalizeUnitId(raw) {
  const n = Number(raw)
  if (Number.isFinite(n)) return n
  const match = String(raw || '').match(/\d+/)
  return match ? Number(match[0]) : NaN
}

function normalizeZoneId(raw) {
  const base = String(raw || '').trim().toLowerCase()
  if (!base) return ''
  if (base === 'cabina') return 'cabina'
  if (base === 'techo') return 'techo'
  if (base === 'trasera' || base === 'trasero') return 'trasera'
  const cofreMatch = base.match(/^cofre[\s_-]*(\d+)$/)
  if (cofreMatch) return `cofre${cofreMatch[1]}`
  return base
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

function unitToBv(unitId) {
  const uid = Number(unitId)
  for (const [bv, units] of Object.entries(BV_UNITS)) {
    if (units.includes(uid)) return Number(bv)
  }
  return 1
}

function unitLabel(unitId) {
  return `U${String(unitId).padStart(2, '0')}`
}

function emptyState() {
  const configs = {}
  const items = {}
  UNIT_IDS.forEach(id => {
    configs[id] = { ...defaultUnitConfig(id), isActive: true }
    items[id] = {}
    buildZones(configs[id].numCofres, configs[id].hasTecho, configs[id].hasTrasera)
      .forEach(z => { items[id][z.id] = [] })
  })
  return { configs, items }
}

async function fetchAllRows(table, buildQuery, pageSize = 1000) {
  let from = 0
  const rows = []

  while (true) {
    const to = from + pageSize - 1
    const query = buildQuery(supabase.from(table)).range(from, to)
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return rows
}

function uniqueSortedUnitIds(...sources) {
  const set = new Set()
  sources.forEach((src) => {
    ;(src || []).forEach((raw) => {
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 0) set.add(n)
    })
  })
  return Array.from(set).sort((a, b) => a - b)
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
  const [userRole, setUserRole] = useState('lector')
  const loggedSessionIds = useRef(new Set())
  const currentEmail = (session?.user?.email || '').trim().toLowerCase()
  const effectiveRole = userRole || (ADMIN_EMAILS.includes(currentEmail) ? 'admin' : 'lector')
  const isAdmin = effectiveRole === 'admin' || ADMIN_EMAILS.includes(currentEmail)
  const todayDate = new Date().toISOString().slice(0, 10)

  const logAccessEvent = useCallback(async (type, sessionData = null, extra = {}) => {
    try {
      const s = sessionData || session
      const user = s?.user || null
      const email = (user?.email || '').trim().toLowerCase() || null
      const userId = user?.id || null
      if (!userId && !email) return

      const payload = {
        event_type: type,
        email,
        user_id: userId,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        metadata: {
          path: typeof window !== 'undefined' ? window.location.pathname : null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
          ...extra,
        },
      }

      await supabase.from('access_logs').insert(payload)
    } catch (e) {
      // No romper flujo de auth por fallo en auditoría
      console.warn('No se pudo registrar access_log:', e?.message || e)
    }
  }, [session])

  // ── Auth ──────────────────────────────────────────────
  useEffect(() => {
    const hash = window.location.hash || ''
    const search = window.location.search || ''
    if (hash.includes('type=recovery') || search.includes('type=recovery')) setRecovering(true)

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthReady(true)
      // Si hay sesión existente al cargar, registrar una única vez por session_id
      const sid = session?.access_token || ''
      if (sid && !loggedSessionIds.current.has(sid)) {
        loggedSessionIds.current.add(sid)
        logAccessEvent('session_resume', session)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_IN') {
        const sid = session?.access_token || ''
        if (sid && !loggedSessionIds.current.has(sid)) {
          loggedSessionIds.current.add(sid)
          logAccessEvent('login', session)
        }
      }
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [logAccessEvent])

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
  async function loadAll(silent = false) {
    if (!silent) setLoading(true)
    try {
      // Rol del usuario actual (fallback seguro para admin hardcoded)
      if (currentEmail) {
        const fallbackRole = ADMIN_EMAILS.includes(currentEmail) ? 'admin' : 'lector'
        let resolvedRole = fallbackRole
        const { data: roleData, error: roleErr } = await supabase
          .from('user_roles')
          .select('role')
          .eq('email', currentEmail)
          .maybeSingle()
        if (!roleErr && roleData?.role) {
          resolvedRole = roleData.role
        }
        setUserRole(resolvedRole)
      }

      const { data: cfgData, error: cfgErr } = await supabase.from('unit_configs').select('*')
      if (cfgErr) throw cfgErr

      const itemData = await fetchAllRows('unit_items', (q) =>
        q.select('*').order('created_at', { ascending: true })
      )

      const allUnitIds = uniqueSortedUnitIds(
        UNIT_IDS,
        (cfgData || []).map(r => r.unit_id),
        (itemData || []).map(r => r.unit_id),
      )
      const configs = {}
      allUnitIds.forEach(id => { configs[id] = { ...defaultUnitConfig(id), isActive: true } })
      cfgData.forEach(row => {
        configs[row.unit_id] = {
          numCofres: row.num_cofres,
          hasTecho: row.has_techo,
          hasTrasera: row.has_trasera,
          isActive: row.is_active !== false,
        }
      })

      const items = {}
      allUnitIds.forEach(id => {
        items[id] = {}
        buildZones(configs[id].numCofres, configs[id].hasTecho, configs[id].hasTrasera)
          .forEach(z => { items[id][z.id] = [] })
      })
      itemData.forEach(row => {
        const unitId = normalizeUnitId(row.unit_id)
        const zoneId = normalizeZoneId(row.zone_id)
        if (!Number.isFinite(unitId) || !zoneId) return
        if (!items[unitId]) return
        if (!items[unitId][zoneId]) items[unitId][zoneId] = []
        items[unitId][zoneId].push({
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
      const reportsWithIncidents = await fetchAllRows('revision_reports', (q) =>
        q.select('*').not('incidents', 'is', null).order('created_at', { ascending: true })
      )
      const revInc = []
      if (reportsWithIncidents) {
        reportsWithIncidents.forEach(r => {
          const photos = parseNotesAndPhotoUrls(r.general_notes || '').photoUrls || []
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
              photoUrls: photos,
            })
          })
        })
      }
      setRevisionIncidents(revInc)

    } catch (err) {
      console.error('Error cargando datos:', err)
      showToast('Error de conexión', 'error')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Refresco automático cuando vuelves a la app o cada minuto
  useEffect(() => {
    if (!session) return

    const refreshSilently = () => { loadAll(true) }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshSilently()
    }

    window.addEventListener('focus', refreshSilently)
    document.addEventListener('visibilitychange', onVisibility)
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshSilently()
    }, 60000)

    return () => {
      window.removeEventListener('focus', refreshSilently)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(intervalId)
    }
  }, [session?.user?.id])

  // ── Toast ─────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type, id: Date.now() })
    setTimeout(() => setToast(null), 2500)
  }, [])

  // ── Logout ────────────────────────────────────────────
  const logout = useCallback(async () => {
    await logAccessEvent('logout')
    await supabase.auth.signOut()
    setState(emptyState())
    setReviews({})
    setItemStates({})
    setUserRole('lector')
  }, [logAccessEvent])

  const hasPermission = useCallback((permission) => {
    if (isAdmin) return true
    const perms = ROLE_PERMISSIONS[effectiveRole] || []
    return perms.includes(permission)
  }, [isAdmin, effectiveRole])

  const logInventoryChange = useCallback(async ({
    unitId,
    zoneId = null,
    itemId = null,
    itemName = '',
    changeType,
    detail = '',
    previousValue = null,
    newValue = null,
    metadata = null,
  }) => {
    try {
      const actor = session?.user?.email || null
      await supabase.from('inventory_change_log').insert({
        unit_id: unitId,
        unit_label: unitLabel(unitId),
        zone_id: zoneId,
        item_id: itemId ? String(itemId) : null,
        item_name: itemName || null,
        change_type: changeType,
        detail: detail || null,
        previous_value: previousValue,
        new_value: newValue,
        changed_by: actor,
        metadata: metadata || null,
      })
    } catch (e) {
      console.warn('No se pudo registrar inventory_change_log:', e?.message || e)
    }
  }, [session?.user?.email])

  // ── Revisión de unidad ────────────────────────────────
  const refreshRevisionIncidents = useCallback(async () => {
    const data = await fetchAllRows('revision_reports', (q) =>
      q.select('*').not('incidents', 'is', null).order('created_at', { ascending: true })
    )
    const revInc = []
    if (data) {
      data.forEach(r => {
        const photos = parseNotesAndPhotoUrls(r.general_notes || '').photoUrls || []
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
            photoUrls: photos,
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
          reviewed_by: session?.user?.email || 'unidades',
        })
      if (insErr) return { ok: false, error: insErr.message || 'insert_error' }
    }

    await refreshRevisionIncidents()
    return { ok: true }
  }, [todayDate, refreshRevisionIncidents, session?.user?.email])

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
    if (!hasPermission('edit')) {
      showToast('Solo lectura: no puedes modificar inventario', 'warn')
      return
    }
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
      await logInventoryChange({
        unitId,
        zoneId: meta.zoneId,
        itemId,
        itemName: meta.itemName,
        changeType: 'item_state_issue',
        detail: state?.note ? `Incidencia: ${state.note}` : 'Incidencia marcada',
        previousValue: { status: prevStatus || null },
        newValue: { status: 'issue' },
      })
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
      await logInventoryChange({
        unitId,
        zoneId: meta.zoneId,
        itemId,
        itemName: meta.itemName,
        changeType: 'item_state_resolved',
        detail: 'Incidencia resuelta',
        previousValue: { status: prevStatus || null },
        newValue: { status: state?.status || null },
      })
      return
    }

    if (prevStatus !== (state?.status || null)) {
      await logInventoryChange({
        unitId,
        zoneId: meta.zoneId,
        itemId,
        itemName: meta.itemName,
        changeType: 'item_state',
        detail: `Estado artículo: ${state?.status || 'sin marcar'}`,
        previousValue: { status: prevStatus || null },
        newValue: { status: state?.status || null },
      })
    }
  }, [itemStates, revisionIncidents, resolveItemMeta, syncIncidentToReports, clearIncidentFromReports, showToast, logInventoryChange, hasPermission])

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
    if (!hasPermission('edit')) {
      showToast('Solo lectura: no puedes registrar revisiones', 'warn')
      return null
    }
    const userEmail = session?.user?.email || 'desconocido'
    const { data, error } = await supabase
      .from('unit_reviews')
      .insert({ unit_id: unitId, reviewed_by: userEmail, notes, is_ok: isOk })
      .select().single()
    if (error) { showToast('Error al guardar revisión', 'error'); return null }
    setReviews(prev => ({ ...prev, [unitId]: data }))
    showToast('✔ Revisión registrada', 'ok')
    return data
  }, [session, showToast, hasPermission])

  // ── CRUD artículos ────────────────────────────────────
  const updateQty = useCallback(async (unitId, zoneId, itemId, delta) => {
    if (!hasPermission('edit')) {
      showToast('Solo lectura: no puedes modificar cantidades', 'warn')
      return
    }
    let newQty
    let itemName = ''
    let oldQty = null
    setState(prev => {
      const zoneItems = (prev.items[unitId][zoneId] || []).map(it => {
        if (it.id === itemId) {
          oldQty = it.qty
          itemName = it.name
          newQty = Math.max(0, it.qty + delta)
          return { ...it, qty: newQty }
        }
        return it
      })
      return { ...prev, items: { ...prev.items, [unitId]: { ...prev.items[unitId], [zoneId]: zoneItems } } }
    })
    const { error } = await supabase.from('unit_items').update({ qty: newQty }).eq('id', itemId)
    if (error) showToast('Error al guardar', 'error')
    if (!error) {
      await logInventoryChange({
        unitId,
        zoneId,
        itemId,
        itemName,
        changeType: 'qty_update',
        detail: `Cantidad ${delta > 0 ? 'aumentada' : 'reducida'} (${oldQty} -> ${newQty})`,
        previousValue: { qty: oldQty },
        newValue: { qty: newQty },
      })
    }
  }, [showToast, logInventoryChange, hasPermission])

  const addItem = useCallback(async (unitId, zoneId, item) => {
    if (!hasPermission('edit')) {
      showToast('Solo lectura: no puedes añadir artículos', 'warn')
      return null
    }
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
    await logInventoryChange({
      unitId,
      zoneId,
      itemId: newItem.id,
      itemName: newItem.name,
      changeType: 'item_add',
      detail: `Artículo añadido en ${zoneId}`,
      previousValue: null,
      newValue: { name: newItem.name, desc: newItem.desc, qty: newItem.qty, min: newItem.min },
    })
    return newItem
  }, [showToast, logInventoryChange, hasPermission])

  const deleteItem = useCallback(async (unitId, zoneId, itemId) => {
    if (!hasPermission('edit')) {
      showToast('Solo lectura: no puedes eliminar artículos', 'warn')
      return
    }
    const prevItem = (state.items?.[unitId]?.[zoneId] || []).find(it => it.id === itemId) || null
    const { error } = await supabase.from('unit_items').delete().eq('id', itemId)
    if (error) { showToast('Error al eliminar', 'error'); return }
    setState(prev => ({
      ...prev,
      items: { ...prev.items, [unitId]: { ...prev.items[unitId], [zoneId]: prev.items[unitId][zoneId].filter(it => it.id !== itemId) } }
    }))
    await logInventoryChange({
      unitId,
      zoneId,
      itemId,
      itemName: prevItem?.name || '',
      changeType: 'item_delete',
      detail: `Artículo eliminado de ${zoneId}`,
      previousValue: prevItem ? { name: prevItem.name, desc: prevItem.desc, qty: prevItem.qty, min: prevItem.min } : null,
      newValue: null,
    })
  }, [showToast, state.items, logInventoryChange, hasPermission])

  const editItem = useCallback(async (unitId, zoneId, itemId, changes) => {
    if (!hasPermission('edit')) {
      showToast('Solo lectura: no puedes editar artículos', 'warn')
      return
    }
    const prevItem = (state.items?.[unitId]?.[zoneId] || []).find(it => it.id === itemId) || null
    const { error } = await supabase
      .from('unit_items')
      .update({ name: changes.name, description: changes.desc, qty: changes.qty, min_qty: changes.min })
      .eq('id', itemId)
    if (error) { showToast('Error al guardar', 'error'); return }
    setState(prev => ({
      ...prev,
      items: { ...prev.items, [unitId]: { ...prev.items[unitId], [zoneId]: prev.items[unitId][zoneId].map(it => it.id === itemId ? { ...it, ...changes } : it) } }
    }))
    await logInventoryChange({
      unitId,
      zoneId,
      itemId,
      itemName: changes?.name || prevItem?.name || '',
      changeType: 'item_edit',
      detail: `Artículo editado en ${zoneId}`,
      previousValue: prevItem ? { name: prevItem.name, desc: prevItem.desc, qty: prevItem.qty, min: prevItem.min } : null,
      newValue: { name: changes.name, desc: changes.desc, qty: changes.qty, min: changes.min },
    })
  }, [showToast, state.items, logInventoryChange, hasPermission])

  const updateUnitConfig = useCallback(async (unitId, newConfig) => {
    if (!hasPermission('edit')) {
      showToast('Solo lectura: no puedes cambiar configuración de unidad', 'warn')
      return
    }
    const oldConfig = state.configs?.[unitId] || null
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
    await logInventoryChange({
      unitId,
      zoneId: null,
      itemId: null,
      itemName: '',
      changeType: 'unit_config_update',
      detail: 'Configuración de unidad actualizada',
      previousValue: oldConfig,
      newValue: { ...newConfig, isActive: oldConfig?.isActive !== false },
    })
  }, [showToast, state.configs, logInventoryChange, hasPermission])

  const createUnit = useCallback(async (unitId, cfgOverride = null) => {
    if (!isAdmin) return { ok: false, error: 'not_admin' }
    const id = Number(unitId)
    if (!Number.isFinite(id) || id < 0) return { ok: false, error: 'invalid_unit_id' }
    if (state.configs?.[id]) return { ok: false, error: 'already_exists' }

    const cfg = cfgOverride || defaultUnitConfig(id)
    const payload = {
      unit_id: id,
      num_cofres: Number(cfg.numCofres) || 4,
      has_techo: !!cfg.hasTecho,
      has_trasera: !!cfg.hasTrasera,
      is_active: true,
    }
    const { error } = await supabase.from('unit_configs').upsert(payload)
    if (error) return { ok: false, error: error.message || 'db_error' }

    setState(prev => {
      const zones = buildZones(payload.num_cofres, payload.has_techo, payload.has_trasera)
      const nextItems = {}
      zones.forEach(z => { nextItems[z.id] = [] })
      return {
        ...prev,
        configs: { ...prev.configs, [id]: { numCofres: payload.num_cofres, hasTecho: payload.has_techo, hasTrasera: payload.has_trasera, isActive: true } },
        items: { ...prev.items, [id]: nextItems },
      }
    })

    await logInventoryChange({
      unitId: id,
      changeType: 'unit_create',
      detail: 'Unidad creada por administrador',
      previousValue: null,
      newValue: { numCofres: payload.num_cofres, hasTecho: payload.has_techo, hasTrasera: payload.has_trasera, isActive: true },
    })

    return { ok: true, unitId: id }
  }, [isAdmin, state.configs, logInventoryChange])

  const setUnitActive = useCallback(async (unitId, active) => {
    if (!isAdmin) return { ok: false, error: 'not_admin' }
    const id = Number(unitId)
    if (!Number.isFinite(id) || id < 0) return { ok: false, error: 'invalid_unit_id' }

    const prevCfg = state.configs?.[id] || null
    const payload = {
      unit_id: id,
      num_cofres: Number(prevCfg?.numCofres) || Number(defaultUnitConfig(id).numCofres) || 4,
      has_techo: prevCfg?.hasTecho ?? true,
      has_trasera: prevCfg?.hasTrasera ?? true,
      is_active: !!active,
    }
    const { error } = await supabase.from('unit_configs').upsert(payload)
    if (error) return { ok: false, error: error.message || 'db_error' }

    setState(prev => ({
      ...prev,
      configs: {
        ...prev.configs,
        [id]: {
          ...(prev.configs?.[id] || defaultUnitConfig(id)),
          isActive: !!active,
        },
      },
    }))

    await logInventoryChange({
      unitId: id,
      changeType: 'unit_activation',
      detail: active ? 'Unidad reactivada' : 'Unidad desactivada',
      previousValue: { isActive: prevCfg?.isActive !== false },
      newValue: { isActive: !!active },
    })

    return { ok: true }
  }, [isAdmin, state.configs, logInventoryChange])

  const refreshInventory = useCallback(async () => {
    await loadAll(true)
  }, [])

  return (
    <AppContext.Provider value={{
      session, authReady, recovering, finishRecovery, isAdmin, logout,
      role: effectiveRole, rolePermissions: ROLE_PERMISSIONS, hasPermission,
      configs: state.configs, items: state.items, reviews,
      loading, toast, showToast,
      itemStates, setUnitItemState, setUnitAllItemStates,
      revisionIncidents, refreshRevisionIncidents, clearAllIncidents,
      reviewUnit, updateQty, addItem, deleteItem, editItem, updateUnitConfig, createUnit, setUnitActive, refreshInventory,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() { return useContext(AppContext) }
