import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/AppContext'
import { findInventoryMatches } from '../lib/searchItems'

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

export default function ResultadoBusqueda() {
  const navigate = useNavigate()
  const { configs, items } = useApp()
  const queryParams = useQuery()
  const q = String(queryParams.get('q') || '').trim()

  const results = useMemo(() => findInventoryMatches(q, configs, items), [q, configs, items])

  const highlight = (text, query) => {
    if (!query || !text) return text
    const idx = String(text).toLowerCase().indexOf(String(query).toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(255,69,0,0.35)', color: 'var(--white)', borderRadius: 2, padding: '0 1px' }}>
          {text.slice(idx, idx + query.length)}
        </mark>
        {text.slice(idx + query.length)}
      </>
    )
  }

  return (
    <div className="animate-in page-container">
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>
          Resultado de búsqueda
        </div>
        <div style={{ marginTop: 4, color: 'var(--mid)', fontSize: 13 }}>
          {q ? <>Consulta: <strong style={{ color: 'var(--light)' }}>"{q}"</strong></> : 'Introduce una búsqueda en la barra superior'}
        </div>
      </div>

      {!q ? (
        <div className="card" style={{ padding: 24, color: 'var(--mid)' }}>Sin consulta.</div>
      ) : results.length === 0 ? (
        <div className="card" style={{ padding: 24, color: 'var(--mid)' }}>
          No hay resultados para <strong style={{ color: 'var(--light)' }}>"{q}"</strong>.
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Zona</th>
                  <th>Artículo</th>
                  <th>Ubicación</th>
                  <th>Stock</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr key={`${r.unitId}-${r.zoneId}-${r.item}-${idx}`}>
                    <td>
                      <span className="search-unit-label">{r.unitLabel}</span>
                    </td>
                    <td><span className="chip chip-gray">{r.zone}</span></td>
                    <td style={{ fontWeight: 700, color: 'var(--light)' }}>{highlight(r.item, q)}</td>
                    <td style={{ color: r.matchDesc ? 'var(--yellow-l)' : 'var(--mid)' }}>{highlight(r.desc || '—', q)}</td>
                    <td style={{ color: Number(r.qty) < Number(r.min) ? 'var(--red-l)' : 'var(--green-l)', fontWeight: 700 }}>
                      {r.qty}/{r.min}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/unidades/${r.unitId}?zoneId=${encodeURIComponent(r.zoneId)}&item=${encodeURIComponent(r.item)}`)}>
                        Ver unidad
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
