const VIA_TYPE_MAP = {
  CL: 'Calle',
  AV: 'Avenida',
  TR: 'Travesía',
  PZ: 'Plaza',
}

export function expandViaType(viaType) {
  const code = String(viaType || '').trim().toUpperCase()
  return VIA_TYPE_MAP[code] || String(viaType || '').trim()
}

export function formatStreetLabel(street) {
  if (!street) return ''
  const via = expandViaType(street.via_type)
  const name = String(street.name || '').trim()
  return `${via} ${name}`.trim()
}

