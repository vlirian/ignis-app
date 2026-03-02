import { buildZones } from '../data/units'

export function findInventoryMatches(query, configs = {}, items = {}) {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return []

  const found = []

  const activeUnitIds = Object.keys(configs || {})
    .map(Number)
    .filter(Number.isFinite)
    .filter(unitId => configs[unitId]?.isActive !== false)

  activeUnitIds.forEach(unitId => {
    const cfg = configs[unitId]
    if (!cfg) return
    const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
    zones.forEach(zone => {
      const zItems = items[unitId]?.[zone.id] || []
      zItems.forEach(item => {
        const nameMatch = String(item.name || '').toLowerCase().includes(q)
        const descMatch = String(item.desc || '').toLowerCase().includes(q)
        if (!nameMatch && !descMatch) return
        found.push({
          unitId,
          unitLabel: `U${String(unitId).padStart(2, '0')}`,
          zone: zone.label,
          zoneId: zone.id,
          zoneIcon: zone.icon,
          item: item.name,
          desc: item.desc,
          qty: item.qty,
          min: item.min,
          matchDesc: !nameMatch && descMatch,
        })
      })
    })
  })

  found.sort((a, b) => {
    const aExact = String(a.item || '').toLowerCase().startsWith(q) ? 0 : 1
    const bExact = String(b.item || '').toLowerCase().startsWith(q) ? 0 : 1
    if (aExact !== bExact) return aExact - bExact
    return a.unitId - b.unitId
  })

  return found
}
