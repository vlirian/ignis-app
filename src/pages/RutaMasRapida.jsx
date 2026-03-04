import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { formatStreetLabel } from '../lib/streetFormat'
import { PDF_CALLES_FILES } from '../data/streetPdfsManifest'

const ORIGIN = 'Bomberos de Jaén, Avenida de Andalucía s/N, Jaén'
const ORIGIN_COORDS = '37.77860,-3.81144'
const STREET_PDFS_BUCKET = import.meta.env.VITE_STREET_PDFS_BUCKET || 'pdfs-calles'
const TRAFFIC_LEGEND = [
  {
    key: 'fluido',
    label: 'Azul',
    dot: '#38bdf8',
    text: 'Tráfico fluido. La circulación es buena y puedes ir a la velocidad normal de la vía sin problemas.',
  },
  {
    key: 'moderado',
    label: 'Naranja',
    dot: '#f59e0b',
    text: 'Tráfico moderado. Hay más vehículos de lo habitual y es posible que la velocidad sea un poco más lenta, pero sigues avanzando sin grandes retenciones.',
  },
  {
    key: 'denso',
    label: 'Rojo',
    dot: '#ef4444',
    text: 'Tráfico denso. Significa que hay atascos y probablemente sufrirás retrasos.',
  },
  {
    key: 'muy-denso',
    label: 'Rojo oscuro',
    dot: '#7f1d1d',
    text: 'Tráfico muy pesado, con vehículos prácticamente detenidos.',
  },
]

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function streetLabel(street) {
  return formatStreetLabel(street)
}

function findMatchingStreets(streets, queryText) {
  const q = normalizeSearchText(queryText)
  if (!q) return []
  return (streets || [])
    .map((s) => {
      const name = normalizeSearchText(s.name)
      const label = normalizeSearchText(streetLabel(s))
      const tokens = name.split(/\s+/).filter(Boolean)
      let rank = 99
      if (name.startsWith(q)) rank = 0
      else if (label.startsWith(q)) rank = 1
      else if (tokens.some((t) => t.startsWith(q))) rank = 2
      else if (name.includes(q) || label.includes(q)) rank = 3
      if (rank === 99) return null
      return { s, rank, lenDelta: Math.abs(name.length - q.length) }
    })
    .filter(Boolean)
    .sort((a, b) => (a.rank - b.rank) || (a.lenDelta - b.lenDelta) || streetLabel(a.s).localeCompare(streetLabel(b.s)))
    .map((x) => x.s)
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

function buildStreetPdfUrls(fileName) {
  if (!fileName) return { publicUrl: null, localUrl: null }
  const localUrl = `/pdfs_calles/${encodeURIComponent(fileName)}`
  const { data } = supabase.storage.from(STREET_PDFS_BUCKET).getPublicUrl(fileName)
  return {
    publicUrl: data?.publicUrl || null,
    localUrl,
  }
}

async function resolveStreetPdfSource(fileName) {
  if (!fileName) {
    return {
      existsInStorage: false,
      resolvedUrl: null,
      storageUrl: null,
      localUrl: null,
    }
  }
  const urls = buildStreetPdfUrls(fileName)
  try {
    const { data, error } = await supabase.storage.from(STREET_PDFS_BUCKET).createSignedUrl(fileName, 60)
    if (!error && data?.signedUrl) {
      return {
        existsInStorage: true,
        resolvedUrl: urls.publicUrl || data.signedUrl,
        storageUrl: urls.publicUrl,
        localUrl: urls.localUrl,
      }
    }
  } catch (_) {
    // ignore: if storage object does not exist we do not show PDF block
  }
  return {
    existsInStorage: false,
    resolvedUrl: null,
    storageUrl: urls.publicUrl,
    localUrl: urls.localUrl,
  }
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
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [allStreets, setAllStreets] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [openSuggestions, setOpenSuggestions] = useState(false)
  const [selectedStreet, setSelectedStreet] = useState(null)
  const [activeClosures, setActiveClosures] = useState([])
  const [streetWidthOverrides, setStreetWidthOverrides] = useState([])
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [result, setResult] = useState(null)
  const [pdfText, setPdfText] = useState('')
  const [pdfTextLoading, setPdfTextLoading] = useState(false)
  const lastHandledSearchRef = useRef('')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const text = normalizeSearchText(query)
    if (text.length < 2) {
      setSuggestions([])
      setOpenSuggestions(false)
      return
    }
    const filtered = findMatchingStreets(allStreets, text).slice(0, 80)
    setSuggestions(filtered)
    setOpenSuggestions(filtered.length > 0)
  }, [query, allStreets])

  useEffect(() => {
    if (allStreets.length === 0) return
    const streetParam = String(searchParams.get('street') || '').trim()
    const auto = String(searchParams.get('auto') || '') === '1'
    if (!streetParam) return

    const key = `${streetParam}|${auto ? '1' : '0'}`
    if (lastHandledSearchRef.current === key) return
    lastHandledSearchRef.current = key

    const match = findMatchingStreets(allStreets, streetParam)[0] || null
    if (match) {
      setSelectedStreet(match)
      setQuery(streetLabel(match))
      setSuggestions([])
      setOpenSuggestions(false)
      if (auto) {
        calculateRoute(match)
      }
    } else {
      setSelectedStreet(null)
      setQuery(streetParam)
      setResult(null)
      if (auto) showToast('No se encontró una calle que coincida con la búsqueda', 'warn')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStreets, searchParams])

  useEffect(() => {
    let cancelled = false
    async function extractPdfText() {
      const url = result?.streetPdfUrls?.resolvedUrl
      if (!url) {
        setPdfText('')
        setPdfTextLoading(false)
        return
      }
      setPdfTextLoading(true)
      try {
        const task = pdfjsLib.getDocument(url)
        const pdf = await task.promise
        const page = await pdf.getPage(1)
        const content = await page.getTextContent()
        const merged = (content.items || [])
          .map((it) => String(it?.str || '').trim())
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        const clean = merged.length > 900 ? `${merged.slice(0, 900)}...` : merged
        if (!cancelled) setPdfText(clean)
      } catch (_) {
        if (!cancelled) setPdfText('')
      } finally {
        if (!cancelled) setPdfTextLoading(false)
      }
    }
    extractPdfText()
    return () => { cancelled = true }
  }, [result?.streetPdfUrls?.resolvedUrl])

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

  async function calculateRoute(streetOverride = null) {
    const targetStreet = streetOverride || selectedStreet
    if (!targetStreet) {
      showToast('Selecciona una calle de destino', 'warn')
      return
    }

    setCalculating(true)

    const width = resolveStreetWidth(targetStreet, streetWidthOverrides)
    const destination = streetLabel(targetStreet)
    const streetPdfFile = matchStreetPdf(targetStreet?.name || destination)
    const streetPdfResolution = await resolveStreetPdfSource(streetPdfFile)

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

    const closureForTarget = (activeClosures || []).find((c) => Number(c.street_id) === Number(targetStreet.id)) || null

    if (closureForTarget) {
      steps.push('ATENCIÓN: la calle destino aparece actualmente cortada en el registro diario.')
    }

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ORIGIN_COORDS)}&destination=${encodeURIComponent(destination + ', Jaén')}&travelmode=driving&dir_action=navigate&avoid=tolls|ferries`
    const mapsEmbedUrl = `https://www.google.com/maps?output=embed&saddr=${encodeURIComponent(ORIGIN_COORDS)}&daddr=${encodeURIComponent(destination + ', Jaén')}&travelmode=driving`

    setResult({
      origin: ORIGIN,
      destination,
      width,
      isClosed: Boolean(closureForTarget),
      closureReason: closureForTarget?.reason || null,
      steps,
      mapsUrl,
      mapsEmbedUrl,
      streetPdfFile,
      streetPdfUrls: {
        publicUrl: streetPdfResolution.storageUrl,
        localUrl: streetPdfResolution.localUrl,
        resolvedUrl: streetPdfResolution.resolvedUrl,
      },
      streetPdfExistsInStorage: streetPdfResolution.existsInStorage,
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
                setOpenSuggestions(true)
              }}
              onFocus={() => { if (suggestions.length > 0) setOpenSuggestions(true) }}
              onBlur={() => setTimeout(() => setOpenSuggestions(false), 120)}
              onKeyDown={async (e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                const first = selectedStreet || suggestions[0] || null
                if (!first) return
                if (!selectedStreet) {
                  setSelectedStreet(first)
                  setQuery(streetLabel(first))
                  setSuggestions([])
                  setOpenSuggestions(false)
                }
                await calculateRoute(first)
              }}
              placeholder="Ej: Sierra Mágina"
            />

            {openSuggestions && suggestions.length > 0 && !selectedStreet && (
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
                      setOpenSuggestions(false)
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

          {result.streetPdfFile && result.streetPdfUrls?.resolvedUrl && (
            <div className="card" style={{ padding: 12, background: 'var(--panel)', marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: 'var(--mid)', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Itinerario PDF (Supabase Storage)
                </div>
                <a
                  className="btn btn-ghost btn-sm"
                  target="_blank"
                  rel="noreferrer"
                  href={result.streetPdfUrls?.resolvedUrl || result.streetPdfUrls?.publicUrl || result.streetPdfUrls?.localUrl}
                >
                  Abrir PDF
                </a>
              </div>
              <div className="card" style={{ padding: 14, marginBottom: 10, background: 'rgba(20,27,40,0.75)', border: '1px solid var(--border2)' }}>
                <div style={{ fontSize: 11, color: 'var(--mid)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                  Indicaciones extraídas del PDF
                </div>
                <div style={{ fontSize: 22, lineHeight: 1.35, fontWeight: 700, color: 'var(--light)' }}>
                  {pdfTextLoading ? 'Extrayendo texto del PDF...' : (pdfText || 'No se pudo extraer texto de la primera página.')}
                </div>
              </div>
              <div style={{ width: '100%', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border2)' }}>
                <iframe
                  title="Itinerario PDF"
                  src={result.streetPdfUrls?.resolvedUrl || result.streetPdfUrls?.publicUrl || result.streetPdfUrls?.localUrl}
                  style={{ width: '100%', height: 680, border: 0, display: 'block' }}
                  loading="lazy"
                />
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 12, background: 'var(--panel)', marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--mid)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
              Indicaciones de tráfico (tiempo real en Google Maps)
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {TRAFFIC_LEGEND.map((row) => (
                <div key={row.key} className="card" style={{ padding: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: '50%',
                        background: row.dot,
                        boxShadow: `0 0 8px ${row.dot}`,
                        border: '1px solid rgba(255,255,255,0.25)',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontFamily: 'Barlow Condensed', fontSize: 18, fontWeight: 800, color: 'var(--white)' }}>
                      {row.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--light)', lineHeight: 1.45 }}>
                    {row.text}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 12, background: 'var(--panel)', marginTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--mid)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
              Mapa (Google Maps)
            </div>
            <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 8 }}>
              Ruta en modo conducción con optimización de Google y desvíos en tiempo real cuando estén disponibles.
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
