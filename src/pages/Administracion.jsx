import { useMemo, useState } from 'react'
import { useApp } from '../lib/AppContext'

export default function Administracion() {
  const { isAdmin, session, revisionIncidents, clearAllIncidents, showToast } = useApp()
  const [working, setWorking] = useState(false)

  const uniqueCount = useMemo(() => {
    const map = new Map()
    ;(revisionIncidents || []).forEach(inc => {
      const key = `${inc.unitId}|${String(inc.zone || '').trim().toLowerCase()}|${String(inc.item || '').trim().toLowerCase()}`
      if (!map.has(key)) map.set(key, true)
    })
    return map.size
  }, [revisionIncidents])

  async function handleClearAll() {
    const ok = window.confirm('¿Seguro que quieres borrar TODAS las incidencias activas? Esta acción afecta a todos los informes.')
    if (!ok) return
    setWorking(true)
    const result = await clearAllIncidents()
    setWorking(false)
    if (!result?.ok) {
      showToast('No se pudieron borrar todas las incidencias', 'error')
      return
    }
    showToast('Todas las incidencias han sido borradas', 'ok')
  }

  if (!isAdmin) {
    return (
      <div className="animate-in" style={{ padding: '24px 28px' }}>
        <div className="card" style={{ padding: 24, border: '1px solid rgba(192,57,43,0.35)' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 22, fontWeight: 800, color: 'var(--red-l)', marginBottom: 8 }}>
            Acceso restringido
          </div>
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>
            Tu usuario (<strong style={{ color: 'var(--light)' }}>{session?.user?.email || 'sin email'}</strong>) no tiene permisos de administración.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in" style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>🛡️ Administración</div>
        <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 3 }}>
          Herramientas de mantenimiento global de incidencias.
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
          Estado actual
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--panel)' }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontSize: 26, fontWeight: 900, color: 'var(--red-l)' }}>{uniqueCount}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)' }}>Incidencias activas</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, border: '1px solid rgba(192,57,43,0.35)' }}>
        <div style={{ fontSize: 10, color: 'var(--mid)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>
          Acción global
        </div>
        <div style={{ fontSize: 13, color: 'var(--light)', marginBottom: 14 }}>
          Borra todas las incidencias de los informes de revisión y limpia Alertas/Banner.
        </div>
        <button className="btn btn-danger" onClick={handleClearAll} disabled={working}>
          {working ? 'Borrando...' : 'Borrar todas las incidencias'}
        </button>
      </div>
    </div>
  )
}
