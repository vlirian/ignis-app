import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

function priorityLabel(priority) {
  const p = Number(priority || 2)
  if (p >= 4) return 'Crítica'
  if (p === 3) return 'Alta'
  if (p === 2) return 'Media'
  return 'Baja'
}

export default function NewsBanner() {
  const { session, revisionIncidents } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [incidentDismissed, setIncidentDismissed] = useState(false)
  const [rows, setRows] = useState([])
  const identity = session?.user?.id || session?.user?.email || 'anon'
  const dismissKey = `ignis:news:dismissed:${identity}`
  const incidentDismissKey = `ignis:incidents:dismissed:${identity}`

  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(dismissKey) === '1')
    } catch {
      setDismissed(false)
    }
  }, [dismissKey])

  useEffect(() => {
    try {
      setIncidentDismissed(window.sessionStorage.getItem(incidentDismissKey) === '1')
    } catch {
      setIncidentDismissed(false)
    }
  }, [incidentDismissKey])

  function dismissForSession() {
    setDismissed(true)
    try {
      window.sessionStorage.setItem(dismissKey, '1')
    } catch {}
  }

  useEffect(() => {
    let mounted = true

    async function loadNews() {
      let data = null
      let error = null
      const withArchive = await supabase
        .from('news_messages')
        .select('id, created_at, title, message, priority, created_by, is_archived')
        .or('is_archived.is.false,is_archived.is.null')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30)
      if (withArchive.error) {
        const legacy = await supabase
          .from('news_messages')
          .select('id, created_at, title, message, priority, created_by')
          .order('priority', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(30)
        data = legacy.data || []
        error = legacy.error
      } else {
        data = withArchive.data || []
        error = null
      }

      if (error || !mounted) return
      setRows(data || [])
    }

    loadNews()
    const timer = window.setInterval(loadNews, 60000)
    const onFocus = () => loadNews()
    window.addEventListener('focus', onFocus)
    return () => {
      mounted = false
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    if (location.pathname === '/novedades') {
      dismissForSession()
    }
  }, [location.pathname])

  const total = rows.length
  const top = useMemo(() => rows.slice(0, 6), [rows])
  const isInNovedades = location.pathname === '/novedades'
  const isInIncidencias = location.pathname === '/incidencias' || location.pathname === '/alertas'
  const activeIncidents = useMemo(() => {
    const all = [...(revisionIncidents || [])]
    const map = new Map()
    all.forEach(inc => {
      const key = `${inc.unitId}|${String(inc.zone).trim().toLowerCase()}|${String(inc.item).trim().toLowerCase()}`
      if (!map.has(key)) map.set(key, inc)
    })
    return Array.from(map.values())
  }, [revisionIncidents])
  const hasIncidentAnchor = activeIncidents.length > 0 && !isInIncidencias && !incidentDismissed
  if (total === 0 || dismissed || isInNovedades) return null

  return (
    <div
      className={`news-banner-anchor ${hasIncidentAnchor ? 'with-incidents' : 'no-incidents'}`}
      style={{
        maxWidth: expanded ? 420 : 'none',
        filter: 'drop-shadow(0 8px 26px rgba(37,99,235,0.35))',
        animation: total > 0 ? 'newsPulse 2.4s ease-in-out infinite' : 'none',
      }}
    >
      {expanded && (
        <div
          style={{
            background: 'var(--ash)',
            border: '1px solid rgba(37,99,235,0.4)',
            borderRadius: '12px 12px 0 0',
            marginBottom: -1,
            maxHeight: 340,
            overflowY: 'auto',
            animation: 'slideUp 0.2s ease',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(37,99,235,0.2)',
              background: 'rgba(37,99,235,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 14, fontWeight: 800, color: '#60a5fa', letterSpacing: 0.5 }}>
              📰 {total} NOVEDAD{total !== 1 ? 'ES' : ''} ACTIVA{total !== 1 ? 'S' : ''}
            </div>
            <button
              onClick={() => dismissForSession()}
              style={{ background: 'none', border: 'none', color: 'var(--mid)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
              title="Ocultar"
            >
              ✕
            </button>
          </div>

          {top.map((n) => (
            <div key={n.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '8px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="chip chip-blue">{priorityLabel(n.priority)}</span>
                <span style={{ fontFamily: 'Barlow Condensed', fontSize: 14, fontWeight: 800, color: '#93c5fd' }}>
                  {n.title}
                </span>
              </div>
              {n.message && (
                <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 4, lineHeight: 1.25 }}>
                  {n.message}
                </div>
              )}
            </div>
          ))}

          <div style={{ padding: '8px 16px' }}>
            <button
              onClick={() => { dismissForSession(); navigate('/novedades'); setExpanded(false) }}
              style={{
                width: '100%',
                padding: '8px',
                background: 'rgba(37,99,235,0.12)',
                border: '1px solid rgba(37,99,235,0.35)',
                borderRadius: 7,
                color: '#93c5fd',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'Barlow Condensed',
                letterSpacing: 0.5,
              }}
            >
              Ver todas en Novedades →
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          if (expanded) {
            dismissForSession()
            setExpanded(false)
            return
          }
          setExpanded(true)
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 18px',
          background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
          border: 'none',
          borderRadius: expanded ? '0 0 12px 12px' : 12,
          color: 'white',
          cursor: 'pointer',
          width: '100%',
          boxShadow: '0 4px 20px rgba(37,99,235,0.45)',
          transition: 'all 0.2s',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          📰
        </div>
        <div style={{ textAlign: 'left', flex: 1 }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 15, fontWeight: 900, letterSpacing: 0.5, lineHeight: 1 }}>
            {total} NOVEDAD{total !== 1 ? 'ES' : ''}
          </div>
          <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2 }}>
            {expanded ? 'Ocultar ▲' : 'Ver detalle ▼'}
          </div>
        </div>
        <div
          style={{
            background: 'white',
            color: '#2563eb',
            fontFamily: 'Barlow Condensed',
            fontWeight: 900,
            fontSize: 16,
            borderRadius: '50%',
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {total}
        </div>
      </button>

      <style>{`
        @keyframes newsPulse {
          0%, 100% { filter: drop-shadow(0 8px 26px rgba(37,99,235,0.35)); }
          50%      { filter: drop-shadow(0 8px 40px rgba(37,99,235,0.65)); }
        }
      `}</style>
    </div>
  )
}
