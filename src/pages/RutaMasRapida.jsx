import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { PDF_CALLES_FILES } from '../data/pdfsCallesManifest'

const ORIGIN = 'Bomberos de Jaén, Avenida de Andalucía s/N, Jaén'
const ORIGIN_COORDS = '37.77860,-3.81144'

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function streetLabel(street) {
  if (!street) return ''
  return `${street.via_type || ''} ${street.name || ''}`.trim()
}

function normalizeFileStem(name) {
  let s = String(name || '')
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  s = s
    .replace(/[,._()[\]{}]/g, ' ')
    .replace(/\s+\d+(?:[-\s(].*)?$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s
}

function matchStreetPdf(streetName) {
  const target = normalizeFileStem(streetName)
  if (!target) return null
  const candidates = (PDF_CALLES_FILES || [])
    .map((file) => {
      const stem = normalizeFileStem(file)
      const starts = stem.startsWith(target) || target.startsWith(stem)
      const includes = stem.includes(target) || target.includes(stem)
      if (!starts && !includes) return null
      const score = starts ? 0 : 1
      return { file, stem, score, delta: Math.abs(stem.length - target.length) }
    })
    .filter(Boolean)
    .sort((a, b) => (a.score - b.score) || (a.delta - b.delta) || a.file.localeCompare(b.file))
  return candidates[0]?.file || null
}

function estimateStreetWidth(street) {
  const type = String(street?.via_type || '').toUpperCase()
  const name = normalizeSearchText(street?.name)

  if (type === 'AV' || type === 'PZ' || type === 'PS' || name.includes('avenida') || name.includes('autovia')) {
    return { level: 'ancha', colorClass: 'chip-ok', text: 'Vía ancha (mejor acceso)', source: 'estimada' }
  }

  if (type === 'CJ' || type === 'PJ' || type === 'CM' || type === 'TR' || name.includes('callejon') || name.includes('pasaje')) {
    return { level: 'estrecha', colorClass: 'chip-alert', text: 'Vía estrecha (maniobra difícil)', source: 'estimada' }
  }

  return { level: 'media', colorClass: 'chip-warn', text: 'Anchura media (precaución)', source: 'estimada' }
}

function manualWidthToBadge(level) {
  const l = String(level || '').toLowerCase()
  if (l === 'estrecha') return { level: 'estrecha', colorClass: 'chip-alert', text: 'Vía estrecha (criterio operativo)', source: 'manual' }
  if (l === 'ancha') return { level: 'ancha', colorClass: 'chip-ok', text: 'Vía ancha (criterio operativo)', source: 'manual' }
  return { level: 'media', colorClass: 'chip-warn', text: 'Anchura media (criterio operativo)', source: 'manual' }
}

function resolveStreetWidth(street, overrides = []) {
  const streetId = Number(street?.id)
  const streetNameNorm = normalizeSearchText(street?.name)
  const byId = overrides.find((o) => Number(o.street_id) === streetId)
  if (byId?.width_level) return manualWidthToBadge(byId.width_level)

  const byName = overrides.find((o) => normalizeSearchText(o.street_name) === streetNameNorm)
  if (byName?.width_level) return manualWidthToBadge(byName.width_level)

  return estimateStreetWidth(street)
}

export default function RutaMasRapida() {
  const { showToast } = useApp()
  const [query, setQuery] = useState('')
  const [allStreets, setAllStreets] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [selectedStreet, setSelectedStreet] = useState(null)
  const [activeClosures, setActiveClosures] = useState([])
  const [streetWidthOverrides, setStreetWidthOverrides] = useState([])
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const text = normalizeSearchText(query)
    if (text.length < 2) {
      setSuggestions([])
      return
    }
    const filtered = allStreets
      .filter((s) => normalizeSearchText(s.name).startsWith(text))
      .slice(0, 20)
    setSuggestions(filtered)
  }, [query, allStreets])

  async function loadData() {
    setLoading(true)

    const [
      { data: streets, error: streetsError },
      { data: closures, error: closuresError },
      { data: widthOverrides, error: widthOverridesErr },
    ] = await Promise.all([
      supabase
        .from('jaen_streets')
        .select('id, source_code, via_type, name')
        .order('name', { ascending: true })
        .limit(5000),
      supabase
        .from('street_closures')
        .select('id, closure_date, status, reason, street_id')
        .eq('status', 'activa')
        .order('closure_date', { ascending: false })
        .limit(1000),
      supabase
        .from('street_width_overrides')
        .select('street_id, street_name, width_level')
        .limit(2000),
    ])

    setLoading(false)

    if (streetsError) {
      const msg = String(streetsError.message || '')
      if (msg.includes('jaen_streets')) {
        showToast('Falta callejero: ejecuta calles-jaen.sql en Supabase', 'error')
      } else {
        showToast(`No se pudieron cargar calles: ${msg || 'error'}`, 'error')
      }
      return
    }

    if (closuresError) {
      showToast(`No se pudieron cargar cortes activos: ${closuresError.message || 'error'}`, 'warn')
    }
    if (widthOverridesErr) {
      const msg = String(widthOverridesErr.message || '')
      if (!msg.includes('street_width_overrides')) {
        showToast(`No se pudo cargar criterio manual de anchura: ${msg || 'error'}`, 'warn')
      }
    }

    setAllStreets(streets || [])
    setActiveClosures(closures || [])
    setStreetWidthOverrides(widthOverrides || [])
  }

  const selectedClosure = useMemo(() => {
    if (!selectedStreet?.id) return null
    return (activeClosures || []).find((c) => Number(c.street_id) === Number(selectedStreet.id)) || null
  }, [activeClosures, selectedStreet])

  function calculateRoute() {
    if (!selectedStreet) {
      showToast('Selecciona una calle de destino', 'warn')
      return
    }

    setCalculating(true)

    const width = resolveStreetWidth(selectedStreet, streetWidthOverrides)
    const destination = streetLabel(selectedStreet)
    const streetPdfFile = matchStreetPdf(selectedStreet?.name || destination)

    const steps = [
      `Salida desde parque: ${ORIGIN}.`,
      'Tomar eje principal de salida con prioridad para vehículos de emergencia.',
      `Dirigirse hacia ${destination}.`,
      width.level === 'estrecha'
        ? 'Último tramo por vía estrecha: reducir velocidad y prever maniobra.'
        : width.level === 'ancha'
          ? 'Último tramo por vía amplia: acceso favorable para autobomba.'
          : 'Último tramo con anchura media: mantener precaución en cruces y estacionados.',
    ]

    if (selectedClosure) {
      steps.push('ATENCIÓN: la calle destino aparece actualmente cortada en el registro diario.')
    }

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ORIGIN_COORDS)}&destination=${encodeURIComponent(destination + ', Jaén')}`
    const mapsEmbedUrl = `https://www.google.com/maps?output=embed&saddr=${encodeURIComponent(ORIGIN_COORDS)}&daddr=${encodeURIComponent(destination + ', Jaén')}`

    setResult({
      origin: ORIGIN,
      destination,
      width,
      isClosed: Boolean(selectedClosure),
      closureReason: selectedClosure?.reason || null,
      steps,
      mapsUrl,
      mapsEmbedUrl,
      streetPdfFile,
    })

    setCalculating(false)
  }

  return (
    <div className="animate-in page-container">
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>
          ⚡ Ruta más rápida
        </div>
        <div style={{ color: 'var(--mid)', fontSize: 13, marginTop: 4 }}>
          Origen fijo del parque y cálculo rápido de itinerario hasta calle de destino.
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Origen (fijo)</label>
            <input className="form-input" value={ORIGIN} readOnly />
          </div>

          <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
            <label className="form-label">Calle de destino</label>
            <input
              className="form-input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelectedStreet(null)
                setResult(null)
              }}
              placeholder="Ej: Sierra Mágina"
            />

            {suggestions.length > 0 && !selectedStreet && (
              <div className="card" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', maxHeight: 260, overflowY: 'auto', zIndex: 12, padding: 6 }}>
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6 }}
                    onClick={() => {
                      setSelectedStreet(s)
                      setQuery(streetLabel(s))
                      setSuggestions([])
                    }}
                  >
                    {streetLabel(s)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button className="btn btn-primary" onClick={calculateRoute} disabled={loading || calculating || !selectedStreet}>
              {calculating ? 'Calculando...' : 'Calcular ruta'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: selectedStreet ? 'var(--green-l)' : 'var(--mid)' }}>
          {selectedStreet ? `Destino seleccionado: ${streetLabel(selectedStreet)}` : 'Selecciona una calle del listado'}
        </div>
      </div>

      {result && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 22, fontWeight: 800 }}>
              Itinerario recomendado
            </div>
            <a href={result.mapsUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              Abrir en Maps
            </a>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginBottom: 12 }}>
            <div className="card" style={{ padding: 10, background: 'var(--panel)' }}>
              <div style={{ fontSize: 10, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Origen</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>{result.origin}</div>
            </div>
            <div className="card" style={{ padding: 10, background: 'var(--panel)' }}>
              <div style={{ fontSize: 10, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Destino</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>{result.destination}</div>
            </div>
            <div className="card" style={{ padding: 10, background: 'var(--panel)' }}>
              <div style={{ fontSize: 10, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Anchura estimada</div>
              <div style={{ marginTop: 6 }}>
                <span className={`chip ${result.width.colorClass}`}>{result.width.text}</span>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--mid)' }}>
                  Fuente: {result.width.source === 'manual' ? 'criterio manual del parque' : 'estimación automática'}
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: 10, background: 'var(--panel)' }}>
              <div style={{ fontSize: 10, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Estado de corte</div>
              <div style={{ marginTop: 6 }}>
                <span className={`chip ${result.isClosed ? 'chip-alert' : 'chip-ok'}`}>
                  {result.isClosed ? 'CALLE CORTADA' : 'SIN CORTE REGISTRADO'}
                </span>
                {result.isClosed && result.closureReason && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--mid)' }}>{result.closureReason}</div>
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 12, background: 'var(--panel)' }}>
            <div style={{ fontSize: 11, color: 'var(--mid)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
              Pasos
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              {result.steps.map((step, idx) => (
                <li key={`step-${idx}`} style={{ fontSize: 13, color: 'var(--light)' }}>{step}</li>
              ))}
            </ol>
          </div>

          {result.streetPdfFile && (
            <div className="card" style={{ padding: 12, background: 'var(--panel)', marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: 'var(--mid)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Itinerario PDF local
                </div>
                <a
                  className="btn btn-ghost btn-sm"
                  target="_blank"
                  rel="noreferrer"
                  href={`/pdfs_calles/${encodeURIComponent(result.streetPdfFile)}`}
                >
                  Abrir PDF
                </a>
              </div>
              <div style={{ width: '100%', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border2)' }}>
                <iframe
                  title="Itinerario PDF"
                  src={`/pdfs_calles/${encodeURIComponent(result.streetPdfFile)}`}
                  style={{ width: '100%', height: 440, border: 0, display: 'block' }}
                  loading="lazy"
                />
              </div>
            </div>
          )}
          {!result.streetPdfFile && (
            <div className="card" style={{ padding: 12, background: 'var(--panel)', marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--mid)' }}>
                No hay PDF de itinerario local para esta calle en <code>pdfs_calles</code>.
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 12, background: 'var(--panel)', marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--mid)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
              Mapa (Google Maps)
            </div>
            <div style={{ width: '100%', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border2)' }}>
              <iframe
                title="Ruta Google Maps"
                src={result.mapsEmbedUrl}
                style={{ width: '100%', height: 360, border: 0, display: 'block' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
