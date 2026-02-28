// IDs de unidades: 0-22 excepto 13
export const UNIT_IDS = Array.from({ length: 23 }, (_, i) => i).filter(i => i !== 13)

// Genera las zonas de una unidad según su configuración
export function buildZones(numCofres, hasTecho = true, hasTrasera = true) {
  const zones = []
  zones.push({ id: 'cabina',  label: 'Cabina',    icon: '🚒', type: 'cabina'  })
  if (hasTecho)   zones.push({ id: 'techo',   label: 'Techo',    icon: '🔝', type: 'techo'   })
  for (let i = 1; i <= numCofres; i++) {
    zones.push({ id: `cofre${i}`, label: `Cofre ${i}`, icon: '📦', type: 'cofre' })
  }
  if (hasTrasera) zones.push({ id: 'trasera', label: 'Trasera',  icon: '🔙', type: 'trasera' })
  return zones
}

// Configuración por defecto de cada unidad
export function defaultUnitConfig(unitId) {
  // Variamos ligeramente para simular diferencias reales entre camiones
  const numCofres = unitId % 5 === 0 ? 4 : unitId % 3 === 0 ? 5 : 6
  return { numCofres, hasTecho: true, hasTrasera: true }
}

// Artículos semilla por zona (usados mientras no hay Supabase)
export function seedItems(unitId) {
  const u = unitId
  return {
    cabina: [
      { id: `${u}-cab-1`, name: 'Botiquín de cabina',     desc: 'Primeros auxilios básico',  qty: 1, min: 1 },
      { id: `${u}-cab-2`, name: 'Extintor 2kg CO₂',       desc: 'Cabina delantera',           qty: 1, min: 1 },
      { id: `${u}-cab-3`, name: 'Linterna de casco',       desc: '×2 bomberos',                qty: 2, min: 2 },
      { id: `${u}-cab-4`, name: 'Plano de zona',           desc: 'Actualizado 2025',           qty: 1, min: 1 },
    ],
    techo: [
      { id: `${u}-tec-1`, name: 'Escalera de mano 3m',    desc: 'Aluminio',                   qty: 1, min: 1 },
      { id: `${u}-tec-2`, name: 'Autoprotector Drager PA90', desc: '6L · presión positiva',  qty: u % 3 === 0 ? 0 : 2, min: 2 },
      { id: `${u}-tec-3`, name: 'Manguera 45mm 20m',      desc: 'Semirígida',                 qty: 3, min: 4 },
    ],
    cofre1: [
      { id: `${u}-c1-1`, name: 'Lanza branchpipe',        desc: '2½" · caudal variable',      qty: 2, min: 2 },
      { id: `${u}-c1-2`, name: 'Reductor 70-45mm',        desc: 'Latón',                       qty: 2, min: 2 },
      { id: `${u}-c1-3`, name: 'Llave de hidrante',       desc: 'T45 y T70',                  qty: 1, min: 1 },
    ],
    cofre2: [
      { id: `${u}-c2-1`, name: 'Manguera 70mm 20m',       desc: 'Semirígida',                 qty: u === 1 ? 2 : 4, min: 4 },
      { id: `${u}-c2-2`, name: 'Bifurcación 70mm',        desc: 'Con llaves de paso',         qty: 1, min: 1 },
      { id: `${u}-c2-3`, name: 'Colector 4 salidas',      desc: 'Aluminio anodizado',         qty: 1, min: 1 },
    ],
    cofre3: [
      { id: `${u}-c3-1`, name: 'Grupo hidráulico Holmatro', desc: 'Rescate encarcelados',     qty: 1, min: 1 },
      { id: `${u}-c3-2`, name: 'Cizalla de rescate',       desc: 'Holmatro CU 4000',          qty: 1, min: 1 },
      { id: `${u}-c3-3`, name: 'Separador de rescate',     desc: 'SP 3200',                   qty: 1, min: 1 },
    ],
    cofre4: [
      { id: `${u}-c4-1`, name: 'Generador 5kW',            desc: 'Honda EU70is',              qty: 1, min: 1 },
      { id: `${u}-c4-2`, name: 'Cable eléctrico 25m',      desc: '3×2.5mm² · carrete',       qty: 2, min: 2 },
      { id: `${u}-c4-3`, name: 'Foco halógeno portátil',   desc: '1000W',                     qty: 2, min: 2 },
    ],
    cofre5: [
      { id: `${u}-c5-1`, name: 'Lona de protección',       desc: '4×6m ignífuga',             qty: 1, min: 1 },
      { id: `${u}-c5-2`, name: 'Absorbente universal',     desc: '10kg bolsa',                qty: u % 4 === 0 ? 1 : 3, min: 3 },
      { id: `${u}-c5-3`, name: 'Señalización vial',        desc: 'Triángulos + conos',        qty: 6, min: 6 },
    ],
    cofre6: [
      { id: `${u}-c6-1`, name: 'Traje de derrames',        desc: 'Nivel 3 · talla M/L',       qty: 2, min: 2 },
      { id: `${u}-c6-2`, name: 'Mascarilla ABEK P3',       desc: 'Filtro combinado',           qty: 4, min: 4 },
    ],
    trasera: [
      { id: `${u}-tra-1`, name: 'Depósito agua 2.500L',    desc: 'Nivel: 95%',                qty: 1, min: 1 },
      { id: `${u}-tra-2`, name: 'Motobomba Honda B-65',    desc: '1200 l/min',                qty: 1, min: 1 },
      { id: `${u}-tra-3`, name: 'Espumógeno 20L',          desc: 'AFFF AR 3×3',               qty: u % 5 === 0 ? 0 : 2, min: 2 },
    ],
  }
}

// Calcula el estado de una lista de artículos
export function zoneStatus(items = []) {
  if (items.length === 0) return 'ok'
  if (items.some(i => i.qty === 0))         return 'alert'
  if (items.some(i => i.qty < i.min))       return 'warn'
  return 'ok'
}

// Resumen de una unidad completa
export function unitSummary(items, zones) {
  let total = 0, missing = 0, low = 0, ok = 0
  zones.forEach(z => {
    const zItems = items[z.id] || []
    zItems.forEach(it => {
      total++
      if (it.qty === 0)            missing++
      else if (it.qty < it.min)    low++
      else                         ok++
    })
  })
  return { total, missing, low, ok, zones: zones.length }
}

export function unitAlertLevel(items, zones) {
  const s = unitSummary(items, zones)
  if (s.missing > 0) return 'alert'
  if (s.low > 0)     return 'warn'
  return 'ok'
}
