import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/AppContext'
import { buildZones } from '../data/units'

export default function GlobalSearch() {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const { configs, items } = useApp()

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

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults([])
      setSelected(0)
    }
  }, [open])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSelected(0); return }
    const q = query.toLowerCase().trim()
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

    found.sort((a, b) => {
      const aExact = a.item.toLowerCase().startsWith(q) ? 0 : 1
      const bExact = b.item.toLowerCase().startsWith(q) ? 0 : 1
      if (aExact !== bExact) return aExact - bExact
      return a.unitId - b.unitId
    })

    setResults(found.slice(0, 40))
    setSelected(0)
  }, [query, configs, items])

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

  const unitGroups = results.reduce((acc, r) => {
    if (!acc[r.unitId]) acc[r.unitId] = 0
    acc[r.unitId]++
    return acc
  }, {})

  return (
    <>
      <button
        className="global-search-trigger"
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--panel)', border: '1px solid var(--border2)',
          borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
          color: 'var(--mid)', fontSize: 13, fontFamily: 'Barlow',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--light)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = '' }}
      >
        <span style={{ fontSize: 15 }}>🔍</span>
        <span style={{ flex: 1, textAlign: 'left' }}>Buscar material...</span>
        <kbd className="global-search-kbd" style={{
          background: 'var(--border)', border: '1px solid var(--border2)',
          borderRadius: 4, padding: '1px 5px', fontSize: 10,
          color: 'var(--mid)', fontFamily: 'monospace',
        }}>⌘K</kbd>
      </button>

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
                  <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--mid)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{results.length} resultado{results.length !== 1 ? 's' : ''}</span>
                    <span>{Object.keys(unitGroups).length} unidade{Object.keys(unitGroups).length !== 1 ? 's' : ''}</span>
                  </div>

                  {results.map((r, idx) => (
                    <button
                      key={`${r.unitId}-${r.zoneId}-${r.item}-${idx}`}
                      onClick={() => handleSelect(r.unitId)}
                      style={{
                        width: '100%', textAlign: 'left',
                        background: idx === selected ? 'rgba(255,69,0,0.12)' : 'transparent',
                        border: 'none', borderBottom: '1px solid var(--border)',
                        padding: '10px 14px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}
                      onMouseEnter={() => setSelected(idx)}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: 'var(--panel)', border: '1px solid var(--border)',
                        display: 'grid', placeItems: 'center', flexShrink: 0,
                        fontSize: 16,
                      }}>
                        {r.zoneIcon}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          marginBottom: 2,
                        }}>
                          <span style={{
                            fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 13,
                            color: 'var(--fire-l)', letterSpacing: 0.6,
                          }}>{r.unitLabel}</span>
                          <span style={{ fontSize: 11, color: 'var(--mid)' }}>· {r.zone}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--light)', lineHeight: 1.2 }}>
                          {highlight(r.item, query)}
                        </div>
                        {r.desc && (
                          <div style={{
                            fontSize: 12,
                            color: r.matchDesc ? 'var(--yellow-l)' : 'var(--mid)',
                            marginTop: 2,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                          }}>
                            {highlight(r.desc, query)}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{
                          fontSize: 11,
                          color: r.qty < r.min ? 'var(--red-l)' : 'var(--green-l)',
                          fontWeight: 700,
                        }}>
                          {r.qty}/{r.min}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--border2)', marginTop: 2 }}>
                          {r.qty < r.min ? 'Bajo stock' : 'OK'}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
