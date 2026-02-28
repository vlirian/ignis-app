import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/AppContext'
import { UNIT_IDS, buildZones, unitAlertLevel, unitSummary } from '../data/units'

export default function UnidadesList() {
  const { configs, items, revisionIncidents } = useApp()
  const navigate = useNavigate()

  const levelColor = { ok: 'var(--green)', warn: 'var(--yellow)', alert: 'var(--red)' }
  const levelLabel = { ok: '✓ Completa', warn: 'Stock bajo', alert: 'Faltante' }
  const chipClass  = { ok: 'chip-ok', warn: 'chip-warn', alert: 'chip-alert' }

  const unitsWithRevisionIncidents = new Set(
    (revisionIncidents || []).map(inc => Number(inc.unitId)).filter(Number.isFinite)
  )

  return (
    <div className="animate-in page-container">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
        {UNIT_IDS.map(id => {
          const cfg = configs[id]
          const zones = buildZones(cfg.numCofres, cfg.hasTecho, cfg.hasTrasera)
          const s = unitSummary(items[id], zones)
          const level = unitAlertLevel(items[id], zones)
          const hasIncident = level !== 'ok' || unitsWithRevisionIncidents.has(id)
          return (
            <div
              key={id}
              className="card"
              style={{ cursor: 'pointer', padding: '18px 16px', transition: 'transform 0.15s, border-color 0.15s', borderTop: `3px solid ${levelColor[level]}`, position: 'relative' }}
              onClick={() => navigate(`/unidades/${id}`)}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--fire)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = '' }}
            >
              {hasIncident && <span className="incident-beacon incident-beacon-card" />}
              <div style={{ fontSize: 28, marginBottom: 8 }}>🚒</div>
              <div style={{ fontFamily: 'Barlow Condensed', fontSize: 24, fontWeight: 900, letterSpacing: 1, marginBottom: 2 }}>
                U{String(id).padStart(2,'0')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 10 }}>
                {cfg.numCofres} cofres · {s.total} artíc.
              </div>
              <span className={`chip ${chipClass[level]}`}>{levelLabel[level]}</span>
              {(s.missing > 0 || s.low > 0) && (
                <div style={{ fontSize: 11, marginTop: 6, color: s.missing > 0 ? 'var(--red-l)' : 'var(--yellow-l)' }}>
                  {s.missing > 0 ? `⚠ ${s.missing} faltante${s.missing>1?'s':''}` : `⚠ ${s.low} bajo stock`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
