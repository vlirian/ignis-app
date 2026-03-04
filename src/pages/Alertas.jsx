import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/AppContext'
import { buildZones } from '../data/units'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Alertas() {
  const { configs, items, revisionIncidents, hasPermission, showToast, session, setUnitItemState } = useApp()
  const canEdit = hasPermission('edit')
  const activeUnitIds = Object.keys(configs || {})
    .map(Number)
    .filter(Number.isFinite)
    .filter(id => configs[id]?.isActive !== false)
    .sort((a, b) => a - b)
  const navigate = useNavigate()
  const [sortMode, setSortMode] = useState('fecha_desc')
  const [incidentCategory, setIncidentCategory] = useState('all') // all | material | vehiculos | instalaciones
  const [photoViewer, setPhotoViewer] = useState(null) // { urls: string[], index: number, title?: string }
  const [installationIncidents, setInstallationIncidents] = useState([])
  const [vehicleIncidents, setVehicleIncidents] = useState([])
  const [createType, setCreateType] = useState('material')
  const [creating, setCreating] = useState(false)
  const [materialForm, setMaterialForm] = useState({ unitId: '', zoneId: '', itemId: '', note: '' })
  const [vehicleForm, setVehicleForm] = useState({ unitId: '', title: '', description: '', severity: 'media' })
  const [installationForm, setInstallationForm] = useState({ title: '', location: '', description: '', severity: 'media' })

  useEffect(() => {
    loadInstallationIncidents()
    loadVehicleIncidents()
  }, [])

  async function loadInstallationIncidents() {
    const { data, error } = await supabase
      .from('installation_incidents')
      .select('id, created_at, title, location, description, severity, status, reported_by')
      .eq('status', 'activa')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return
    setInstallationIncidents(data || [])
  }

  async function loadVehicleIncidents() {
    const { data, error } = await supabase
      .from('vehicle_incidents')
      .select('id, created_at, unit_id, title, description, severity, status, reported_by')
      .eq('status', 'activa')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return
    setVehicleIncidents(data || [])
  }

  const resolveMaterialItemMeta = (alert) => {
    const unitId = Number(alert?.unitId)
    if (!Number.isFinite(unitId)) return null
    let zoneId = String(alert?.zoneId || '').trim()
    if (!zoneId) {
      const cfg = configs?.[unitId]
      if (cfg) {
        const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
        const z = zones.find(z0 => String(z0.label).trim().toLowerCase() === String(alert?.zone || '').trim().toLowerCase())
        if (z) zoneId = z.id
      }
    }
    if (!zoneId) return null
    const zoneItems = items?.[unitId]?.[zoneId] || []
    let item = null
    if (alert?.itemId) item = zoneItems.find(it => String(it.id) === String(alert.itemId)) || null
    if (!item) item = zoneItems.find(it => String(it.name).trim().toLowerCase() === String(alert?.item || '').trim().toLowerCase()) || null
    if (!item) return null
    return { unitId, zoneId, itemId: item.id, itemName: item.name }
  }

  async function createMaterialIncident() {
    if (!canEdit) {
      showToast('Solo lectura: no puedes crear incidencias', 'warn')
      return
    }
    const unitId = Number(materialForm.unitId)
    const zoneId = String(materialForm.zoneId || '')
    const itemId = String(materialForm.itemId || '')
    if (!Number.isFinite(unitId) || !zoneId || !itemId) {
      showToast('Selecciona unidad, zona y artículo', 'warn')
      return
    }
    const zone = materialZones.find(z => z.id === zoneId)
    const item = materialItems.find(it => String(it.id) === itemId)
    if (!zone || !item) {
      showToast('No se encontró el artículo seleccionado', 'error')
      return
    }
    const duplicateKey = `${unitId}|${String(zone.label).trim().toLowerCase()}|${String(item.name).trim().toLowerCase()}`
    if (issueMap.has(duplicateKey)) {
      showToast('Esa incidencia de material ya existe', 'warn')
      return
    }

    setCreating(true)
    const res = await setUnitItemState(unitId, item.id, { status: 'issue', note: materialForm.note.trim() || 'Marcado desde Incidencias' })
    setCreating(false)
    if (!res?.ok) {
      showToast(`No se pudo crear incidencia: ${res?.error || 'error'}`, 'error')
      return
    }
    setMaterialForm({ unitId: '', zoneId: '', itemId: '', note: '' })
    showToast('Incidencia de material creada', 'ok')
  }

  async function createVehicleIncident() {
    if (!canEdit) {
      showToast('Solo lectura: no puedes crear incidencias', 'warn')
      return
    }
    const unitId = Number(vehicleForm.unitId)
    const title = vehicleForm.title.trim()
    if (!Number.isFinite(unitId) || !title) {
      showToast('Selecciona unidad y título', 'warn')
      return
    }
    const exists = (vehicleIncidents || []).some(r =>
      String(r.status) === 'activa' &&
      Number(r.unit_id) === unitId &&
      String(r.title || '').trim().toLowerCase() === title.toLowerCase()
    )
    if (exists) {
      showToast('Esa incidencia de vehículo ya existe', 'warn')
      return
    }

    setCreating(true)
    const { error } = await supabase
      .from('vehicle_incidents')
      .insert({
        unit_id: unitId,
        title,
        description: vehicleForm.description.trim() || null,
        severity: vehicleForm.severity,
        status: 'activa',
        reported_by: session?.user?.email || null,
      })
    setCreating(false)
    if (error) {
      showToast(`No se pudo crear incidencia: ${error.message || 'error'}`, 'error')
      return
    }
    setVehicleForm({ unitId: '', title: '', description: '', severity: 'media' })
    await loadVehicleIncidents()
    showToast('Incidencia de vehículo creada', 'ok')
  }

  async function createInstallationIncident() {
    if (!canEdit) {
      showToast('Solo lectura: no puedes crear incidencias', 'warn')
      return
    }
    const title = installationForm.title.trim()
    const location = installationForm.location.trim()
    if (!title) {
      showToast('Indica al menos un título', 'warn')
      return
    }
    const exists = (installationIncidents || []).some(r =>
      String(r.status) === 'activa' &&
      String(r.title || '').trim().toLowerCase() === title.toLowerCase() &&
      String(r.location || '').trim().toLowerCase() === location.toLowerCase()
    )
    if (exists) {
      showToast('Esa incidencia de instalaciones ya existe', 'warn')
      return
    }

    setCreating(true)
    const { error } = await supabase
      .from('installation_incidents')
      .insert({
        title,
        location: location || null,
        description: installationForm.description.trim() || null,
        severity: installationForm.severity,
        status: 'activa',
        reported_by: session?.user?.email || null,
      })
    setCreating(false)
    if (error) {
      showToast(`No se pudo crear incidencia: ${error.message || 'error'}`, 'error')
      return
    }
    setInstallationForm({ title: '', location: '', description: '', severity: 'media' })
    await loadInstallationIncidents()
    showToast('Incidencia de instalaciones creada', 'ok')
  }

  async function handleCreateIncident(e) {
    e.preventDefault()
    if (createType === 'material') return createMaterialIncident()
    if (createType === 'vehiculos') return createVehicleIncident()
    return createInstallationIncident()
  }

  async function removeMaterialIncident(alert) {
    const meta = resolveMaterialItemMeta(alert)
    if (!meta) {
      showToast('No se pudo resolver/borrar: artículo no encontrado', 'error')
      return
    }
    const ok = window.confirm('¿Eliminar esta incidencia de material?')
    if (!ok) return
    const res = await setUnitItemState(meta.unitId, meta.itemId, { status: null, note: '' })
    if (!res?.ok) {
      showToast(`No se pudo eliminar incidencia: ${res?.error || 'error'}`, 'error')
      return
    }
    showToast('Incidencia de material eliminada', 'ok')
  }

  async function removeVehicleIncident(id) {
    if (!canEdit) {
      showToast('Solo lectura: no puedes eliminar incidencias', 'warn')
      return
    }
    const ok = window.confirm('¿Eliminar esta incidencia de vehículo?')
    if (!ok) return
    const { error } = await supabase.from('vehicle_incidents').delete().eq('id', id)
    if (error) {
      showToast(`No se pudo eliminar incidencia: ${error.message || 'error'}`, 'error')
      return
    }
    await loadVehicleIncidents()
    showToast('Incidencia de vehículo eliminada', 'ok')
  }

  async function removeInstallationIncident(id) {
    if (!canEdit) {
      showToast('Solo lectura: no puedes eliminar incidencias', 'warn')
      return
    }
    const ok = window.confirm('¿Eliminar esta incidencia de instalaciones?')
    if (!ok) return
    const { error } = await supabase.from('installation_incidents').delete().eq('id', id)
    if (error) {
      showToast(`No se pudo eliminar incidencia: ${error.message || 'error'}`, 'error')
      return
    }
    await loadInstallationIncidents()
    showToast('Incidencia de instalaciones eliminada', 'ok')
  }

  const goToUnitFromAlert = (alert) => {
    const params = new URLSearchParams()
    if (alert.zone) params.set('zone', alert.zone)
    if (alert.zoneId) params.set('zoneId', alert.zoneId)
    if (alert.item) params.set('item', alert.item)
    params.set('src', 'alertas')
    navigate(`/unidades/${alert.unitId}?${params.toString()}`)
  }

  // ── Alertas de stock ─────────────────────────────────
  const stockAlerts = []
  activeUnitIds.forEach(unitId => {
    const cfg   = configs[unitId]
    if (!cfg) return
    const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
    zones.forEach(zone => {
      const zItems = items[unitId]?.[zone.id] || []
      zItems.forEach(item => {
        if (item.qty < item.min) {
          stockAlerts.push({
            unitId, zone: zone.label, zoneId: zone.id,
            item: item.name, qty: item.qty, min: item.min,
            level: item.qty === 0 ? 'alert' : 'warn'
          })
        }
      })
    })
  })

  // ── Incidencias de material (fuente: revisión diaria + unidades) ──────
  const reviewIssueAlerts = (revisionIncidents || [])
    .filter(inc => configs[Number(inc.unitId)]?.isActive !== false)
    .map(inc => ({
    itemId: inc.itemId || null,
    unitId: inc.unitId,
    zone: inc.zone,
    zoneId: inc.zoneId || '',
    item: inc.item,
    note: inc.note || '',
    bomberoId: inc.bomberoId,
    source: 'revision',
    reportDate: inc.reportDate || null,
    photoUrls: Array.isArray(inc.photoUrls) ? inc.photoUrls : [],
  }))

  const issueMap = new Map()
  ;[...reviewIssueAlerts].forEach(inc => {
    const key = `${inc.unitId}|${String(inc.zone).trim().toLowerCase()}|${String(inc.item).trim().toLowerCase()}`
    if (!issueMap.has(key)) issueMap.set(key, inc)
  })

  const materialZones = useMemo(() => {
    const uid = Number(materialForm.unitId)
    if (!Number.isFinite(uid) || !configs?.[uid]) return []
    const cfg = configs[uid]
    return buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
  }, [configs, materialForm.unitId])

  const materialItems = useMemo(() => {
    const uid = Number(materialForm.unitId)
    const zid = String(materialForm.zoneId || '')
    if (!Number.isFinite(uid) || !zid) return []
    return (items?.[uid]?.[zid] || [])
  }, [items, materialForm.unitId, materialForm.zoneId])

  const openIssuePhoto = (alert) => {
    const urls = (alert.photoUrls || []).filter(Boolean)
    if (!urls.length) return
    setPhotoViewer({ urls, index: 0, title: `U${String(alert.unitId).padStart(2, '0')} · ${alert.item}` })
  }

  const onIssueRowClick = (alert) => {
    const hasPhoto = (alert.photoUrls || []).length > 0
    if (hasPhoto) {
      openIssuePhoto(alert)
      return
    }
    if (!Number.isFinite(alert.unitId)) return
    goToUnitFromAlert(alert)
  }

  const materialIssueAlerts = useMemo(() => {
    const list = Array.from(issueMap.values()).map(a => ({ ...a, incidentType: 'material' }))
    return list.sort((a, b) => {
      const ta = a.reportDate ? new Date(a.reportDate + 'T00:00:00').getTime() : null
      const tb = b.reportDate ? new Date(b.reportDate + 'T00:00:00').getTime() : null
      if (sortMode === 'unidad_asc') return a.unitId - b.unitId
      if (sortMode === 'unidad_desc') return b.unitId - a.unitId
      if (ta === null && tb === null) return a.unitId - b.unitId
      if (ta === null) return 1
      if (tb === null) return -1
      return sortMode === 'fecha_desc' ? tb - ta : ta - tb
    })
  }, [sortMode, issueMap])

  const vehicleIssueAlerts = useMemo(() => {
    const list = (vehicleIncidents || []).map(r => ({
      id: r.id,
      unitId: Number(r.unit_id),
      zone: 'Vehículo',
      zoneId: 'vehiculo',
      item: r.title || 'Incidencia de vehículo',
      note: r.description || '',
      bomberoId: null,
      source: 'vehiculos',
      reportDate: r.created_at ? String(r.created_at).slice(0, 10) : null,
      createdAt: r.created_at || null,
      photoUrls: [],
      incidentType: 'vehiculos',
    }))
    return list.sort((a, b) => {
      const ta = a.reportDate ? new Date(a.reportDate + 'T00:00:00').getTime() : null
      const tb = b.reportDate ? new Date(b.reportDate + 'T00:00:00').getTime() : null
      if (sortMode === 'unidad_asc') return a.unitId - b.unitId
      if (sortMode === 'unidad_desc') return b.unitId - a.unitId
      if (ta === null && tb === null) return a.unitId - b.unitId
      if (ta === null) return 1
      if (tb === null) return -1
      return sortMode === 'fecha_desc' ? tb - ta : ta - tb
    })
  }, [sortMode, vehicleIncidents])

  const installationIssueAlerts = useMemo(() => {
    const list = (installationIncidents || []).map(r => ({
      id: r.id,
      unitId: null,
      zone: r.location || 'Instalaciones',
      zoneId: 'instalaciones',
      item: r.title || 'Incidencia de instalaciones',
      note: r.description || '',
      bomberoId: null,
      source: 'instalaciones',
      reportDate: r.created_at ? String(r.created_at).slice(0, 10) : null,
      createdAt: r.created_at || null,
      photoUrls: [],
      incidentType: 'instalaciones',
    }))
    return list.sort((a, b) => {
      const ta = a.reportDate ? new Date(a.reportDate + 'T00:00:00').getTime() : null
      const tb = b.reportDate ? new Date(b.reportDate + 'T00:00:00').getTime() : null
      if (ta === null && tb === null) return a.unitId - b.unitId
      if (ta === null) return 1
      if (tb === null) return -1
      return sortMode === 'fecha_desc' ? tb - ta : ta - tb
    })
  }, [sortMode, installationIncidents])

  const sortedStockAlerts = useMemo(() => {
    const priority = { alert: 0, warn: 1 }
    return [...stockAlerts].map(a => ({ ...a, incidentType: 'material' })).sort((a, b) => {
      if (sortMode === 'unidad_asc') return a.unitId - b.unitId || priority[a.level] - priority[b.level]
      if (sortMode === 'unidad_desc') return b.unitId - a.unitId || priority[a.level] - priority[b.level]
      return priority[a.level] - priority[b.level] || a.unitId - b.unitId
    })
  }, [stockAlerts, sortMode])

  const showMaterial = incidentCategory === 'all' || incidentCategory === 'material'
  const showVehiculos = incidentCategory === 'all' || incidentCategory === 'vehiculos'
  const showInstalaciones = incidentCategory === 'all' || incidentCategory === 'instalaciones'

  const categoryCounts = useMemo(() => {
    const material = sortedStockAlerts.length + materialIssueAlerts.length
    const vehiculos = vehicleIssueAlerts.length
    const instalaciones = installationIssueAlerts.length
    return { material, vehiculos, instalaciones }
  }, [sortedStockAlerts, materialIssueAlerts, vehicleIssueAlerts, installationIssueAlerts])

  const critical = stockAlerts.filter(a => a.level === 'alert')
  const low      = stockAlerts.filter(a => a.level === 'warn')
  const totalAlerts = sortedStockAlerts.length + materialIssueAlerts.length + vehicleIssueAlerts.length + installationIssueAlerts.length
  const totalIssueAlerts = materialIssueAlerts.length + vehicleIssueAlerts.length + installationIssueAlerts.length

  return (
    <div className="animate-in page-container">

      {/* Selector principal por tipo de incidencia */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { key: 'material', icon: '🧰', label: 'Incidencias de material', count: categoryCounts.material, tone: 'var(--fire)' },
          { key: 'vehiculos', icon: '🚒', label: 'Incidencias de vehículos', count: categoryCounts.vehiculos, tone: '#38bdf8' },
          { key: 'instalaciones', icon: '🏢', label: 'Incidencias instalaciones', count: categoryCounts.instalaciones, tone: '#a78bfa' },
        ].map(card => {
          const active = incidentCategory === card.key
          return (
            <button
              key={card.key}
              onClick={() => { setIncidentCategory(card.key); setCreateType(card.key) }}
              className="card"
              style={{
                textAlign: 'left',
                padding: 16,
                border: active ? `1px solid ${card.tone}` : '1px solid var(--border2)',
                boxShadow: active ? `0 0 0 1px ${card.tone} inset, 0 0 18px color-mix(in srgb, ${card.tone} 28%, transparent)` : 'none',
                background: active ? 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.06))' : undefined,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 28, lineHeight: 1 }}>{card.icon}</span>
                <span style={{ fontFamily: 'Barlow Condensed', fontSize: 34, fontWeight: 900, color: card.tone }}>{card.count}</span>
              </div>
              <div style={{ fontFamily: 'Barlow Condensed', fontSize: 22, fontWeight: 800, lineHeight: 1.1, color: active ? 'var(--white)' : 'var(--light)' }}>
                {card.label}
              </div>
            </button>
          )
        })}
      </div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setIncidentCategory('all')}>
          Ver todas
        </button>
      </div>

      <form className="card" style={{ padding: 16, marginBottom: 16 }} onSubmit={handleCreateIncident}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div className="card-title">➕ Crear incidencia desde esta pestaña</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={`btn btn-sm ${createType === 'material' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCreateType('material')}>🧰 Material</button>
            <button type="button" className={`btn btn-sm ${createType === 'vehiculos' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCreateType('vehiculos')}>🚒 Vehículos</button>
            <button type="button" className={`btn btn-sm ${createType === 'instalaciones' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCreateType('instalaciones')}>🏢 Instalaciones</button>
          </div>
        </div>

        {createType === 'material' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Unidad</label>
                <select className="form-select" value={materialForm.unitId} onChange={e => setMaterialForm(p => ({ ...p, unitId: e.target.value, zoneId: '', itemId: '' }))}>
                  <option value="">Seleccionar</option>
                  {activeUnitIds.map(id => <option key={id} value={id}>U{String(id).padStart(2, '0')}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Zona</label>
                <select className="form-select" value={materialForm.zoneId} onChange={e => setMaterialForm(p => ({ ...p, zoneId: e.target.value, itemId: '' }))} disabled={!materialForm.unitId}>
                  <option value="">Seleccionar</option>
                  {materialZones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Artículo</label>
                <select className="form-select" value={materialForm.itemId} onChange={e => setMaterialForm(p => ({ ...p, itemId: e.target.value }))} disabled={!materialForm.zoneId}>
                  <option value="">Seleccionar</option>
                  {materialItems.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0, marginTop: 10 }}>
              <label className="form-label">Detalle</label>
              <input className="form-input" value={materialForm.note} onChange={e => setMaterialForm(p => ({ ...p, note: e.target.value }))} placeholder='Ej: No está / Presenta incidencia en carcasa' />
            </div>
          </>
        )}

        {createType === 'vehiculos' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '180px 2fr 180px', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Unidad</label>
                <select className="form-select" value={vehicleForm.unitId} onChange={e => setVehicleForm(p => ({ ...p, unitId: e.target.value }))}>
                  <option value="">Seleccionar</option>
                  {activeUnitIds.map(id => <option key={id} value={id}>U{String(id).padStart(2, '0')}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Título</label>
                <input className="form-input" value={vehicleForm.title} onChange={e => setVehicleForm(p => ({ ...p, title: e.target.value }))} placeholder="Ej: Faro delantero fundido" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Prioridad</label>
                <select className="form-select" value={vehicleForm.severity} onChange={e => setVehicleForm(p => ({ ...p, severity: e.target.value }))}>
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0, marginTop: 10 }}>
              <label className="form-label">Descripción</label>
              <textarea className="form-input" rows={3} value={vehicleForm.description} onChange={e => setVehicleForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe la incidencia del vehículo..." />
            </div>
          </>
        )}

        {createType === 'instalaciones' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 180px', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Título</label>
                <input className="form-input" value={installationForm.title} onChange={e => setInstallationForm(p => ({ ...p, title: e.target.value }))} placeholder="Ej: Puerta principal averiada" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Ubicación</label>
                <input className="form-input" value={installationForm.location} onChange={e => setInstallationForm(p => ({ ...p, location: e.target.value }))} placeholder="Ej: Nave 1" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Prioridad</label>
                <select className="form-select" value={installationForm.severity} onChange={e => setInstallationForm(p => ({ ...p, severity: e.target.value }))}>
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0, marginTop: 10 }}>
              <label className="form-label">Descripción</label>
              <textarea className="form-input" rows={3} value={installationForm.description} onChange={e => setInstallationForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe la incidencia del parque/instalaciones..." />
            </div>
          </>
        )}

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!canEdit || creating}>
            {creating ? 'Guardando...' : '+ Crear incidencia'}
          </button>
        </div>
      </form>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '14px 22px', borderTop: '3px solid var(--red)' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 36, fontWeight: 900, color: 'var(--red-l)' }}>{critical.length}</div>
          <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Artículos a cero</div>
        </div>
        <div className="card" style={{ padding: '14px 22px', borderTop: '3px solid var(--yellow)' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 36, fontWeight: 900, color: 'var(--yellow-l)' }}>{low.length}</div>
          <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Stock bajo mínimo</div>
        </div>
        <div className="card" style={{ padding: '14px 22px', borderTop: '3px solid #e67e22' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 36, fontWeight: 900, color: '#e67e22' }}>{totalIssueAlerts}</div>
          <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Incidencias activas</div>
        </div>
        <div className="card" style={{ padding: '14px 22px', borderTop: '3px solid var(--green)' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 36, fontWeight: 900, color: 'var(--green-l)' }}>
            {activeUnitIds.length - new Set([...stockAlerts, ...materialIssueAlerts, ...vehicleIssueAlerts].map(a => a.unitId).filter(v => Number.isFinite(v))).size}
          </div>
          <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Unidades sin alertas</div>
        </div>
      </div>

      <div className="card" style={{ padding: '10px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>Ordenar alertas</span>
          <select className="form-select" style={{ maxWidth: 300 }} value={sortMode} onChange={e => setSortMode(e.target.value)}>
            <option value="fecha_desc">Fecha: más recientes</option>
            <option value="fecha_asc">Fecha: más antiguas</option>
            <option value="unidad_asc">Unidad: menor a mayor</option>
            <option value="unidad_desc">Unidad: mayor a menor</option>
          </select>
        </div>
      </div>

      {totalAlerts === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--mid)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 20, fontWeight: 700 }}>Sin alertas activas</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Todo el material está completo y sin incidencias.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Incidencias de material */}
          {showMaterial && (sortedStockAlerts.length > 0 || materialIssueAlerts.length > 0) && (
            <div className="card" style={{ border: '1px solid rgba(255,92,39,0.28)' }}>
              <div className="card-header" style={{ borderBottom: '1px solid rgba(255,92,39,0.2)', background: 'rgba(255,92,39,0.05)' }}>
                <div className="card-title" style={{ color: 'var(--fire)' }}>
                  🧰 Incidencias de material ({sortedStockAlerts.length + materialIssueAlerts.length})
                </div>
              </div>
              <div className="table-wrap"><table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Unidad</th>
                    <th>Zona</th>
                    <th>Artículo</th>
                    <th>Detalle</th>
                    <th>Fecha</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStockAlerts.map((a, i) => (
                    <tr key={`stock-${i}`} style={{ cursor: 'pointer' }} onClick={() => goToUnitFromAlert(a)}>
                      <td>
                        <span className={`chip ${a.level === 'alert' ? 'chip-alert' : 'chip-warn'}`}>
                          {a.level === 'alert' ? 'Faltante crítico' : 'Faltante'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 800 }}>
                          U{String(a.unitId).padStart(2,'0')}
                        </span>
                      </td>
                      <td><span className="chip chip-gray">{a.zone}</span></td>
                      <td><span style={{ fontWeight: 600 }}>{a.item}</span></td>
                      <td style={{ fontFamily: 'Roboto Mono', color: 'var(--mid)' }}>
                        {a.qty}/{a.min}
                      </td>
                      <td style={{ color: 'var(--mid)' }}>-</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); goToUnitFromAlert(a) }}>
                          Ver unidad
                        </button>
                      </td>
                    </tr>
                  ))}
                  {materialIssueAlerts.map((a, i) => (
                    <tr
                      key={`material-issue-${i}`}
                      style={{ background: i % 2 === 0 ? 'rgba(230,126,34,0.03)' : 'transparent', cursor: 'pointer' }}
                      onClick={() => onIssueRowClick(a)}
                    >
                      <td><span className="chip chip-alert">Incidencia</span></td>
                      <td>
                        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 800, color: '#e67e22' }}>
                          U{String(a.unitId).padStart(2,'0')}
                        </span>
                      </td>
                      <td><span className="chip chip-gray">{a.zone}</span></td>
                      <td><span style={{ fontWeight: 600, color: 'var(--light)' }}>{a.item}</span></td>
                      <td>
                        {a.note ? (
                          <span style={{ fontSize: 12, color: 'var(--mid)', fontStyle: 'italic' }}>"{a.note}"</span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--mid)', opacity: 0.5 }}>Sin descripción</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                        {a.reportDate ? new Date(a.reportDate + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin fecha'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {(a.photoUrls || []).length > 0 ? (
                            <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openIssuePhoto(a) }}>Ver foto</button>
                          ) : (
                            <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); goToUnitFromAlert(a) }}>Ver unidad</button>
                          )}
                          <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); removeMaterialIncident(a) }}>
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

          {/* Incidencias de vehículos */}
          {showVehiculos && vehicleIssueAlerts.length > 0 && (
            <div className="card" style={{ border: '1px solid rgba(56,189,248,0.28)' }}>
              <div className="card-header" style={{ borderBottom: '1px solid rgba(56,189,248,0.22)', background: 'rgba(56,189,248,0.05)' }}>
                <div className="card-title" style={{ color: '#38bdf8' }}>
                  🚒 Incidencias de vehículos ({vehicleIssueAlerts.length})
                </div>
              </div>
              <div className="table-wrap"><table className="table">
                <thead>
                  <tr>
                    <th>Unidad</th>
                    <th>Incidencia</th>
                    <th>Descripción</th>
                    <th>Fecha</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleIssueAlerts.map((a, i) => (
                    <tr key={`veh-${i}`} style={{ cursor: 'pointer' }} onClick={() => onIssueRowClick(a)}>
                      <td>
                        <span style={{ fontFamily: 'Barlow Condensed', fontSize: 16, fontWeight: 800, color: '#38bdf8' }}>
                          U{String(a.unitId).padStart(2,'0')}
                        </span>
                      </td>
                      <td><span style={{ fontWeight: 600, color: 'var(--light)' }}>{a.item}</span></td>
                      <td>
                        {a.note ? <span style={{ fontSize: 12, color: 'var(--mid)', fontStyle: 'italic' }}>"{a.note}"</span> : <span style={{ fontSize: 11, color: 'var(--mid)', opacity: 0.5 }}>Sin descripción</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                        {a.reportDate ? new Date(a.reportDate + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin fecha'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); if (Number.isFinite(a.unitId)) goToUnitFromAlert(a) }}>
                            Ver unidad
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); removeVehicleIncident(a.id) }}>
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

          {/* Incidencias de instalaciones */}
          {showInstalaciones && installationIssueAlerts.length > 0 && (
            <div className="card" style={{ border: '1px solid rgba(167,139,250,0.28)' }}>
              <div className="card-header" style={{ borderBottom: '1px solid rgba(167,139,250,0.22)', background: 'rgba(167,139,250,0.05)' }}>
                <div className="card-title" style={{ color: '#a78bfa' }}>
                  🏢 Incidencias de instalaciones ({installationIssueAlerts.length})
                </div>
              </div>
              <div className="table-wrap"><table className="table">
                <thead>
                  <tr>
                    <th>Ubicación</th>
                    <th>Incidencia</th>
                    <th>Descripción</th>
                    <th>Fecha</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {installationIssueAlerts.map((a, i) => (
                    <tr key={`inst-${i}`} style={{ cursor: 'pointer' }} onClick={() => onIssueRowClick(a)}>
                      <td><span className="chip chip-gray">{a.zone || 'Instalaciones'}</span></td>
                      <td><span style={{ fontWeight: 600, color: 'var(--light)' }}>{a.item}</span></td>
                      <td>
                        {a.note ? <span style={{ fontSize: 12, color: 'var(--mid)', fontStyle: 'italic' }}>"{a.note}"</span> : <span style={{ fontSize: 11, color: 'var(--mid)', opacity: 0.5 }}>Sin descripción</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--mid)' }}>
                        {a.reportDate ? new Date(a.reportDate + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin fecha'}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); removeInstallationIncident(a.id) }}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

        </div>
      )}

      {photoViewer && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setPhotoViewer(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 260, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 20 }}
        >
          <div style={{ width: '100%', maxWidth: 1100 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ color: 'var(--light)', fontFamily: 'Barlow Condensed', fontSize: 20, letterSpacing: 0.5 }}>
                {photoViewer.title || 'Foto de incidencia'}
              </div>
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
    </div>
  )
}
