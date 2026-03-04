import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'
import { formatStreetLabel } from '../lib/streetFormat'

function streetLabel(street) {
  return formatStreetLabel(street)
}

export default function StreetClosuresBanner() {
  const { session, mobileBannersEnabled } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [rows, setRows] = useState([])
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const identity = session?.user?.id || session?.user?.email || 'anon'
  const dismissKey = `ignis:closures:dismissed:${identity}`
  const dismissCountKey = `ignis:closures:dismissed-count:${identity}`
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(dismissKey) === '1')
    } catch {
      setDismissed(false)
    }
  }, [dismissKey])

  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia('(max-width: 900px)').matches)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadClosures() {
      const { data, error } = await supabase
        .from('street_closures')
        .select('id, closure_date, status, reason, street_id, jaen_streets(via_type,name)')
        .eq('status', 'activa')
        .order('closure_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200)
      if (!mounted || error) return
      setRows(data || [])
    }
    loadClosures()
    const timer = window.setInterval(loadClosures, 60000)
    const onFocus = () => loadClosures()
    window.addEventListener('focus', onFocus)
    return () => {
      mounted = false
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const activeToday = useMemo(
    () => (rows || []).filter((r) => String(r.closure_date) === today),
    [rows, today]
  )

  useEffect(() => {
    try {
      const dismissedCount = Number(window.sessionStorage.getItem(dismissCountKey) || '0')
      if (activeToday.length > dismissedCount) {
        setDismissed(false)
        window.sessionStorage.removeItem(dismissKey)
      }
    } catch {
      // ignore
    }
  }, [activeToday.length, dismissCountKey, dismissKey])

  function dismissForSession() {
    setDismissed(true)
    try {
      window.sessionStorage.setItem(dismissKey, '1')
      window.sessionStorage.setItem(dismissCountKey, String(activeToday.length))
    } catch {}
  }

  const inClosuresPage = location.pathname === '/calles-cortadas-hoy'
  useEffect(() => {
    if (inClosuresPage) dismissForSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inClosuresPage])

  if (activeToday.length === 0 || dismissed || inClosuresPage) return null
  if (isMobile && !mobileBannersEnabled) return null

  return (
    <div className="closures-banner-anchor" style={{ filter: 'drop-shadow(0 8px 26px rgba(124,58,237,0.35))' }}>
      {expanded && (
        <div
          style={{
            background: 'var(--ash)',
            border: '1px solid rgba(124,58,237,0.45)',
            borderRadius: '12px 12px 0 0',
            marginBottom: -1,
            maxHeight: 320,
            overflowY: 'auto',
            animation: 'slideUp 0.2s ease',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(124,58,237,0.22)',
              background: 'rgba(124,58,237,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 14, fontWeight: 800, color: '#c4b5fd', letterSpacing: 0.5 }}>
              ⛔ {activeToday.length} CALLE{activeToday.length !== 1 ? 'S' : ''} CORTADA{activeToday.length !== 1 ? 'S' : ''} HOY
            </div>
            <button
              onClick={() => dismissForSession()}
              style={{ background: 'none', border: 'none', color: 'var(--mid)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
              title="Ocultar"
            >
              ✕
            </button>
          </div>

          {activeToday.slice(0, 8).map((r) => (
            <div key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '8px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="chip chip-alert">Activa</span>
                <span style={{ fontFamily: 'Barlow Condensed', fontSize: 14, fontWeight: 800, color: '#e9d5ff' }}>
                  {streetLabel(r.jaen_streets || null) || `ID ${r.street_id}`}
                </span>
              </div>
              {r.reason && <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 3 }}>{r.reason}</div>}
            </div>
          ))}

          <div style={{ padding: '8px 16px' }}>
            <button
              onClick={() => { dismissForSession(); setExpanded(false); navigate('/calles-cortadas-hoy') }}
              style={{
                width: '100%',
                padding: '8px',
                background: 'rgba(124,58,237,0.12)',
                border: '1px solid rgba(124,58,237,0.35)',
                borderRadius: 7,
                color: '#d8b4fe',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'Barlow Condensed',
                letterSpacing: 0.5,
              }}
            >
              Ver todas en Calles cortadas hoy →
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 18px',
          background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
          border: 'none',
          borderRadius: expanded ? '0 0 12px 12px' : 12,
          color: 'white',
          cursor: 'pointer',
          width: '100%',
          boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
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
          ⛔
        </div>
        <div style={{ textAlign: 'left', flex: 1 }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 15, fontWeight: 900, letterSpacing: 0.5, lineHeight: 1 }}>
            {activeToday.length} CALLE{activeToday.length !== 1 ? 'S' : ''} CORTADA{activeToday.length !== 1 ? 'S' : ''}
          </div>
          <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
            hoy · {expanded ? 'Ocultar ▲' : 'Ver detalle ▼'}
          </div>
        </div>
        <div
          style={{
            background: 'white',
            color: '#7c3aed',
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
          {activeToday.length}
        </div>
      </button>
    </div>
  )
}

