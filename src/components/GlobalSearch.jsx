import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/AppContext'
import { UNIT_IDS, buildZones } from '../data/units'

export default function GlobalSearch() {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const { configs, items } = useApp()

  // Ctrl+K / Cmd+K abre el buscador
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults([])
      setSelected(0)
    }
  }, [open])

  // Búsqueda en tiempo real
  useEffect(() => {
    if (!query.trim()) { setResults([]); setSelected(0); return }
    const q = query.toLowerCase().trim()
    const found = []

    UNIT_IDS.forEach(unitId => {
      const cfg   = configs[unitId]
      const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
      zones.forEach(zone => {
        const zItems = items[unitId]?.[zone.id] || []
        zItems.forEach(item => {
          const nameMatch = item.name.toLowerCase().includes(q)
          const descMatch = item.desc?.toLowerCase().includes(q)
          if (nameMatch || descMatch) {
            found.push({
              unitId,
              unitLabel: `U${String(unitId).padStart(2,'0')}`,
              zone: zone.label,
              zoneId: zone.id,
              zoneIcon: zone.icon,
              item: item.name,
              desc: item.desc,
              qty: item.qty,
              min: item.min,
              matchDesc: !nameMatch && descMatch,
            })
          }
        })
      })
    })

    // Ordenar: primero coincidencias exactas, luego por unidad
    found.sort((a, b) => {
      const aExact = a.item.toLowerCase().startsWith(q) ? 0 : 1
      const bExact = b.item.toLowerCase().startsWith(q) ? 0 : 1
      if (aExact !== bExact) return aExact - bExact
      return a.unitId - b.unitId
    })

    setResults(found.slice(0, 40))
    setSelected(0)
  }, [query, configs, items])

  // Navegación con teclado
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && results[selected]) {
        navigate(`/unidades/${results[selected].unitId}`)
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, results, selected, navigate])

  const handleSelect = useCallback((unitId) => {
    navigate(`/unidades/${unitId}`)
    setOpen(false)
  }, [navigate])

  // Highlight del texto buscado
  const highlight = (text, q) => {
    if (!q || !text) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(255,69,0,0.35)', color: 'var(--white)', borderRadius: 2, padding: '0 1px' }}>
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  // Agrupar resultados por unidad para el resumen
  const unitGroups = results.reduce((acc, r) => {
    if (!acc[r.unitId]) acc[r.unitId] = 0
    acc[r.unitId]++
    return acc
  }, {})

  return (
    <>
      {/* Botón en topbar */}
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--panel)', border: '1px solid var(--border2)',
          borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
          color: 'var(--mid)', fontSize: 13, fontFamily: 'Barlow',
          transition: 'all 0.15s', minWidth: 180,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--light)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = '' }}
      >
        <span style={{ fontSize: 15 }}>🔍</span>
        <span style={{ flex: 1, textAlign: 'left' }}>Buscar material...</span>
        <kbd style={{
          background: 'var(--border)', border: '1px solid var(--border2)',
          borderRadius: 4, padding: '1px 5px', fontSize: 10,
          color: 'var(--mid)', fontFamily: 'monospace',
        }}>⌘K</kbd>
      </button>

      {/* Overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            zIndex: 1000, display: 'flex', alignItems: 'flex-start',
            justifyContent: 'center', paddingTop: '10vh',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 640, background: 'var(--ash)',
              border: '1px solid var(--border2)', borderRadius: 14,
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
              overflow: 'hidden', margin: '0 16px',
              animation: 'slideDown 0.18s ease',
            }}
          >
            {/* Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>🔍</span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar material en todas las unidades..."
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--white)', fontSize: 16, fontFamily: 'Barlow',
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  style={{ background: 'none', border: 'none', color: 'var(--mid)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                >
                  ×
                </button>
              )}
              <kbd
                onClick={() => setOpen(false)}
                style={{ background: 'var(--panel)', border: '1px solid var(--border2)', borderRadius: 4, padding: '2px 7px', fontSize: 11, color: 'var(--mid)', fontFamily: 'monospace', cursor: 'pointer' }}
              >
                ESC
              </kbd>
            </div>

            {/* Resultados */}
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {!query && (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--mid)' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>Busca cualquier material</div>
                  <div style={{ fontSize: 12, marginTop: 6, color: 'var(--border2)' }}>
                    Ej: manguera, extintor, hacha, ERA...
                  </div>
                </div>
              )}

              {query && results.length === 0 && (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--mid)' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>😶</div>
                  <div style={{ fontSize: 14 }}>Sin resultados para <strong style={{ color: 'var(--light)' }}>"{query}"</strong></div>
                </div>
              )}

              {results.length > 0 && (
                <>
                  {/* Cabecera con resumen */}
                  <div style={{ padding: '8px 18px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'var(--mid)', letterSpacing: 1, textTransform: 'uppercase' }}>
                      {results.length} resultado{results.length !== 1 ? 's' : ''} en {Object.keys(unitGroups).length} unidad{Object.keys(unitGroups).length !== 1 ? 'es' : ''}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--mid)' }}>↑↓ navegar · Enter seleccionar</span>
                  </div>

                  {/* Lista de resultados */}
                  {results.map((r, i) => {
                    const isMissing = r.qty === 0
                    const isLow     = r.qty > 0 && r.qty < r.min
                    const qtyColor  = isMissing ? 'var(--red-l)' : isLow ? 'var(--yellow-l)' : 'var(--green-l)'
                    const isSelected = i === selected

                    // Mostrar separador de unidad si cambia
                    const prevUnit = i > 0 ? results[i-1].unitId : null
                    const showUnitHeader = r.unitId !== prevUnit

                    return (
                      <div key={i}>
                        {showUnitHeader && (
                          <div style={{
                            padding: '8px 18px 4px',
                            background: 'rgba(255,255,255,0.02)',
                            borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                          }}>
                            <span style={{
                              fontFamily: 'Barlow Condensed', fontSize: 12, fontWeight: 800,
                              letterSpacing: 1.5, color: 'var(--fire)', textTransform: 'uppercase',
                            }}>
                              🚒 Unidad {r.unitId} · {unitGroups[r.unitId]} artículo{unitGroups[r.unitId] !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        <div
                          onClick={() => handleSelect(r.unitId)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 18px', cursor: 'pointer',
                            background: isSelected ? 'rgba(255,69,0,0.1)' : 'transparent',
                            borderLeft: isSelected ? '3px solid var(--fire)' : '3px solid transparent',
                            transition: 'all 0.1s',
                          }}
                          onMouseEnter={() => setSelected(i)}
                        >
                          {/* Zona icon */}
                          <div style={{
                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                            background: isSelected ? 'rgba(255,69,0,0.15)' : 'var(--panel)',
                            border: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18,
                          }}>
                            {r.zoneIcon}
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: isSelected ? 'var(--white)' : 'var(--light)' }}>
                              {highlight(r.item, query)}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                background: 'var(--panel)', border: '1px solid var(--border)',
                                borderRadius: 4, padding: '1px 6px', fontSize: 10,
                                color: 'var(--light)', fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: 0.5
                              }}>
                                {r.zone}
                              </span>
                              {r.matchDesc && r.desc && (
                                <span style={{ fontStyle: 'italic' }}>en: {highlight(r.desc, query)}</span>
                              )}
                            </div>
                          </div>

                          {/* Cantidad */}
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: 'Roboto Mono', fontSize: 15, fontWeight: 600, color: qtyColor }}>
                              {r.qty}
                              <span style={{ fontSize: 11, color: 'var(--mid)', fontWeight: 400 }}>/{r.min}</span>
                            </div>
                            {isMissing && <div style={{ fontSize: 9, color: 'var(--red-l)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>FALTA</div>}
                            {isLow    && <div style={{ fontSize: 9, color: 'var(--yellow-l)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>BAJO</div>}
                          </div>

                          <div style={{ fontSize: 11, color: 'var(--border2)', flexShrink: 0 }}>→</div>
                        </div>
                      </div>
                    )
                  })}

                  {results.length === 40 && (
                    <div style={{ padding: '8px 18px 12px', fontSize: 11, color: 'var(--mid)', textAlign: 'center' }}>
                      Mostrando los primeros 40 resultados — afina la búsqueda para ver más
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  )
}
