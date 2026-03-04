import logoLeo from '../../L.E.O.png'

export default function BrandLogo({
  size = 'md',
  title = 'L.E.O',
  subtitle = 'Gestión de Parques — Bomberos Jaén',
  version = '',
  center = false,
}) {
  return (
    <div className={`brand-logo ${center ? 'center' : ''}`}>
      <div className={`brand-logo-shield-wrap ${size}`}>
        <img src={logoLeo} alt="Logo L.E.O" className="brand-logo-shield" />
      </div>
      <div className="brand-logo-text">
        <div className="brand-logo-title">{title}</div>
        {subtitle ? <div className="brand-logo-subtitle">{subtitle}</div> : null}
        {version ? <div className="brand-logo-version">{version}</div> : null}
      </div>
    </div>
  )
}
