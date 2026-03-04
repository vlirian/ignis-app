import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { useApp } from '../lib/AppContext'

export default function IncidentBanner() {
  const { revisionIncidents, session } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const dismissKey = `ignis:incidents:dismissed:${session?.access_token || 'anon'}`

  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(dismissKey) === '1')
    } catch {
      setDismissed(false)
    }
  }, [dismissKey])

  function dismissForSession() {
    setDismissed(true)
    try {
      window.sessionStorage.setItem(dismissKey, '1')
    } catch {}
  }

  // ── Incidencias activas (fuente única: revisiones diarias) ──
  const allIncidents = [...(revisionIncidents || [])]

  const dedupMap = new Map()
  allIncidents.forEach(inc => {
    const key = `${inc.unitId}|${String(inc.zone).trim().toLowerCase()}|${String(inc.item).trim().toLowerCase()}`
    if (!dedupMap.has(key)) dedupMap.set(key, inc)
  })
  const uniqueIncidents = Array.from(dedupMap.values())

  const isInIncidencias = location.pathname === '/incidencias' || location.pathname === '/alertas'
  useEffect(() => {
    if (isInIncidencias) dismissForSession()
  }, [isInIncidencias])

  if (uniqueIncidents.length === 0 || dismissed || isInIncidencias) return null

  const byUnit = uniqueIncidents.reduce((acc, inc) => {
    if (!acc[inc.unitId]) acc[inc.unitId] = []
    acc[inc.unitId].push(inc)
    return acc
  }, {})

  const unitCount = Object.keys(byUnit).length
  const pulse = uniqueIncidents.length > 0

  return (
    <div className="incident-banner-anchor" style={{
      maxWidth: expanded ? 420 : 'none',
      filter: 'drop-shadow(0 8px 32px rgba(192,57,43,0.4))',
      animation: pulse ? 'incidentPulse 2.5s ease-in-out infinite' : 'none',
    }}>

      {/* Panel expandido */}
      {expanded && (
        <div style={{
          background: 'var(--ash)', border: '1px solid rgba(192,57,43,0.4)',
          borderRadius: '12px 12px 0 0', marginBottom: -1,
          maxHeight: 340, overflowY: 'auto',
          animation: 'slideUp 0.2s ease',
        }}>
          {/* Cabecera del panel */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid rgba(192,57,43,0.2)',
            background: 'rgba(192,57,43,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 14, fontWeight: 800, color: 'var(--red-l)', letterSpacing: 0.5 }}>
              ⚠ {uniqueIncidents.length} INCIDENCIA{uniqueIncidents.length !== 1 ? 'S' : ''} ACTIVA{uniqueIncidents.length !== 1 ? 'S' : ''}
            </div>
            <button onClick={() => dismissForSession()} style={{ background: 'none', border: 'none', color: 'var(--mid)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }} title="Ocultar">✕</button>
          </div>

          {/* Lista por unidad */}
            {Object.entries(byUnit).map(([unitId, incs]) => (
            <div key={unitId} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div
                onClick={() => { navigate(`/unidades/${unitId}`); setExpanded(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px', cursor: 'pointer',
                  background: 'rgba(192,57,43,0.04)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(192,57,43,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(192,57,43,0.04)'}
              >
                <span style={{ fontFamily: 'Barlow Condensed', fontSize: 13, fontWeight: 800, color: 'var(--red-l)' }}>
                  🚒 U{String(unitId).padStart(2,'0')}
                </span>
                <span style={{ fontSize: 11, color: 'var(--mid)', flex: 1 }}>
                  {incs.length} incidencia{incs.length !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 10, color: 'var(--mid)' }}>→ ver</span>
              </div>
              {incs.map((inc, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 16px 5px 32px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: 11, color: 'var(--red-l)', flexShrink: 0 }}>⚠</span>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--light)' }}>{inc.item}</span>
                    <span style={{ fontSize: 11, color: 'var(--mid)' }}> · {inc.zone}</span>
                    {inc.note && <div style={{ fontSize: 11, color: 'var(--mid)', fontStyle: 'italic', marginTop: 1 }}>"{inc.note}"</div>}
                    {inc.source === 'revision' && (
                      <span style={{ fontSize: 9, background: 'rgba(155,89,182,0.2)', color: '#9B59B6', border: '1px solid rgba(155,89,182,0.3)', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>
                        BV{inc.bomberoId}
                      </span>
                    )}
                    {inc.source === 'unidad' && (
                      <span style={{ fontSize: 9, background: 'rgba(41,128,185,0.2)', color: '#3498DB', border: '1px solid rgba(41,128,185,0.35)', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>
                        UNIDADES
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* Ir a alertas */}
          <div style={{ padding: '8px 16px' }}>
            <button
              onClick={() => { dismissForSession(); navigate('/incidencias'); setExpanded(false) }}
              style={{
                width: '100%', padding: '8px', background: 'rgba(192,57,43,0.12)',
                border: '1px solid rgba(192,57,43,0.3)', borderRadius: 7,
                color: 'var(--red-l)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'Barlow Condensed', letterSpacing: 0.5,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(192,57,43,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(192,57,43,0.12)'}
            >
              Ver todas en Alertas →
            </button>
          </div>
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={() => setExpanded(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px',
          background: 'linear-gradient(135deg, #C0392B, #E74C3C)',
          border: 'none', borderRadius: expanded ? '0 0 12px 12px' : 12,
          color: 'white', cursor: 'pointer', width: '100%',
          boxShadow: '0 4px 20px rgba(192,57,43,0.5)',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'linear-gradient(135deg, #E74C3C, #C0392B)'}
        onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(135deg, #C0392B, #E74C3C)'}
      >
        {/* Icono parpadeante */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0,
          animation: 'bellShake 2.5s ease-in-out infinite',
        }}>
          🔔
        </div>
          <div style={{ textAlign: 'left', flex: 1 }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 15, fontWeight: 900, letterSpacing: 0.5, lineHeight: 1 }}>
            {uniqueIncidents.length} INCIDENCIA{uniqueIncidents.length !== 1 ? 'S' : ''}
            </div>
          <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
            {unitCount} unidad{unitCount !== 1 ? 'es' : ''} afectada{unitCount !== 1 ? 's' : ''} · {expanded ? 'Ocultar ▲' : 'Ver detalle ▼'}
          </div>
        </div>
        {/* Badge contador */}
        <div style={{
          background: 'white', color: '#C0392B',
          fontFamily: 'Barlow Condensed', fontWeight: 900, fontSize: 16,
          borderRadius: '50%', width: 30, height: 30,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {uniqueIncidents.length}
        </div>
      </button>

      <style>{`
        @keyframes incidentPulse {
          0%, 100% { filter: drop-shadow(0 8px 32px rgba(192,57,43,0.4)); }
          50%       { filter: drop-shadow(0 8px 48px rgba(192,57,43,0.75)); }
        }
        @keyframes bellShake {
          0%, 100%  { transform: rotate(0deg); }
          10%, 30%  { transform: rotate(-12deg); }
          20%, 40%  { transform: rotate(12deg); }
          50%       { transform: rotate(0deg); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
