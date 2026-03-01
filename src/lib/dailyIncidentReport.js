const DEFAULT_BV_UNITS = {
  1: [3, 7, 19],
  2: [0, 6, 14],
  3: [1, 16, 22],
  4: [10, 11, 15],
  5: [4, 9, 18, 21],
  6: [2, 12, 17],
  7: [5, 8, 20],
}

function toDateRange(reportDate) {
  const start = `${reportDate}T00:00:00.000Z`
  const d = new Date(`${reportDate}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  const end = d.toISOString()
  return { start, end }
}

function getActiveUnitsForBv(bvId, configs, bvUnits) {
  return (bvUnits[bvId] || []).filter(unitId => configs?.[unitId]?.isActive !== false)
}

export async function buildAndStoreDailyIncidentReport({
  supabase,
  reportDate,
  configs = {},
  actorEmail = null,
  bvUnits = DEFAULT_BV_UNITS,
  force = false,
}) {
  try {
    const { data: reportRows, error: reportsErr } = await supabase
      .from('revision_reports')
      .select('id,report_date,bombero_id,unit_id,is_ok,incidents,general_notes,reviewed_by,created_at')
      .eq('report_date', reportDate)

    if (reportsErr) return { ok: false, error: reportsErr.message || 'reports_error' }

    const effectiveRows = (reportRows || []).filter(r => r.reviewed_by !== 'unidades')

    const pendingBvs = []
    const completion = {}
    for (const [rawBvId] of Object.entries(bvUnits)) {
      const bvId = Number(rawBvId)
      const activeUnits = getActiveUnitsForBv(bvId, configs, bvUnits)
      const doneUnits = new Set(
        effectiveRows
          .filter(r => Number(r.bombero_id) === bvId)
          .map(r => Number(r.unit_id))
      )
      const done = activeUnits.every(u => doneUnits.has(Number(u)))
      completion[bvId] = {
        totalUnits: activeUnits.length,
        doneUnits: activeUnits.filter(u => doneUnits.has(Number(u))).length,
        pendingUnits: activeUnits.filter(u => !doneUnits.has(Number(u))),
        done,
      }
      if (!done) pendingBvs.push(bvId)
    }

    if (pendingBvs.length > 0 && !force) {
      return { ok: true, generated: false, pendingBvs, completion }
    }

    const incidentRows = []
    effectiveRows.forEach((row) => {
      const incidents = Array.isArray(row.incidents) ? row.incidents : []
      incidents.forEach((inc) => {
        if (!inc?.item) return
        incidentRows.push({
          reportId: row.id,
          unitId: Number(row.unit_id),
          bomberoId: Number(row.bombero_id),
          zone: inc.zone || '',
          item: inc.item || '',
          note: inc.note || '',
          source: inc.source || 'revision',
          itemId: inc.itemId || null,
          reviewedBy: row.reviewed_by || null,
          createdAt: row.created_at || null,
        })
      })
    })

    const dedupe = new Set()
    const incidents = incidentRows.filter((inc) => {
      const key = `${inc.unitId}|${String(inc.zone).trim().toLowerCase()}|${String(inc.item).trim().toLowerCase()}|${String(inc.note).trim().toLowerCase()}`
      if (dedupe.has(key)) return false
      dedupe.add(key)
      return true
    })

    const { start, end } = toDateRange(reportDate)
    const { data: changesRows, error: changesErr } = await supabase
      .from('inventory_change_log')
      .select('id,created_at,unit_id,unit_label,zone_id,item_id,item_name,change_type,detail,previous_value,new_value,changed_by,metadata')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false })

    if (changesErr) return { ok: false, error: changesErr.message || 'changes_error' }

    const inventoryChanges = (changesRows || []).map((c) => ({
      id: c.id,
      createdAt: c.created_at,
      unitId: Number(c.unit_id),
      unitLabel: c.unit_label || null,
      zoneId: c.zone_id || null,
      itemId: c.item_id || null,
      itemName: c.item_name || null,
      changeType: c.change_type || null,
      detail: c.detail || null,
      previousValue: c.previous_value || null,
      newValue: c.new_value || null,
      changedBy: c.changed_by || null,
      metadata: c.metadata || null,
    }))

    const payload = {
      completion,
      incidents,
      inventoryChanges,
      generatedAt: new Date().toISOString(),
    }

    const upsertPayload = {
      report_date: reportDate,
      generated_by: actorEmail,
      total_incidents: incidents.length,
      total_inventory_changes: inventoryChanges.length,
      payload,
    }

    const { error: upsertErr } = await supabase
      .from('daily_incident_reports')
      .upsert(upsertPayload, { onConflict: 'report_date' })

    if (upsertErr) return { ok: false, error: upsertErr.message || 'upsert_error' }

    return {
      ok: true,
      generated: true,
      pendingBvs: [],
      completion,
      summary: {
        totalIncidents: incidents.length,
        totalInventoryChanges: inventoryChanges.length,
      },
    }
  } catch (e) {
    return { ok: false, error: e?.message || 'unknown_error' }
  }
}
