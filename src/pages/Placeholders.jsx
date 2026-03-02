// Páginas en construcción — se desarrollarán en la siguiente fase

export function EPI() {
  return <ComingSoon title="🦺 EPI" desc="Gestión de Equipos de Protección Individual" />
}

export function Herramientas() {
  return <ComingSoon title="⚙️ Herramientas y Rescate" desc="Inventario de herramientas y equipos de rescate" />
}

export function Sanitario() {
  return <ComingSoon title="🩺 Material Sanitario" desc="Botiquines, DEA, oxigenoterapia y más" />
}

export function Mantenimiento() {
  return <ComingSoon title="🔧 Mantenimiento" desc="Revisiones programadas, ITV y mantenimiento preventivo" />
}

export function Turnos() {
  return <ComingSoon title="📋 Registro de Turnos" desc="Registro de uso de material por guardia e incidencia" />
}

export function Novedades() {
  return <ComingSoon title="🆕 Novedades" desc="Comunicados, avisos internos y actualizaciones del servicio" />
}

function ComingSoon({ title, desc }) {
  return (
    <div className="animate-in" style={{ padding: '60px 28px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'Barlow Condensed', fontSize: 32, fontWeight: 900, marginBottom: 10 }}>{title}</div>
      <div style={{ color: 'var(--mid)', fontSize: 14, marginBottom: 24 }}>{desc}</div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,69,0,0.1)', border: '1px solid rgba(255,69,0,0.3)', color: 'var(--fire)', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600 }}>
        🔨 En construcción — próxima fase
      </div>
    </div>
  )
}
