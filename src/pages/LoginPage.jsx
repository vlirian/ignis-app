import { useState } from 'react'
import { supabase } from '../lib/supabase'
import BrandLogo from '../components/BrandLogo'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [requestOpen, setRequestOpen] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [requestMsg, setRequestMsg] = useState('')
  const [requestForm, setRequestForm] = useState({ name: '', email: '', notes: '' })

  const handleLogin = async (e) => {
    e.preventDefault()
    const cleanEmail = email.trim()
    const cleanPassword = password.trim()
    if (!cleanEmail || !cleanPassword) { setError('Introduce email y contraseña'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: cleanPassword })
    setLoading(false)
    if (err) setError(err.message || 'Error de autenticación')
  }

  const handleRequestAccess = async (e) => {
    e.preventDefault()
    const cleanEmail = requestForm.email.trim().toLowerCase()
    const cleanName = requestForm.name.trim()
    const cleanNotes = requestForm.notes.trim()
    if (!cleanEmail || !cleanName) {
      setRequestMsg('Indica nombre y email para enviar la solicitud')
      return
    }
    setRequesting(true)
    setRequestMsg('')
    const { error: reqErr } = await supabase
      .from('access_requests')
      .insert({
        email: cleanEmail,
        full_name: cleanName,
        notes: cleanNotes || null,
        status: 'pending',
      })
    setRequesting(false)
    if (reqErr) {
      setRequestMsg(`No se pudo enviar la solicitud: ${reqErr.message || 'error desconocido'}`)
      return
    }
    setRequestMsg('Solicitud enviada. Un administrador la revisará en el panel de Administración.')
    setRequestForm({ name: '', email: '', notes: '' })
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--smoke)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <BrandLogo
            size="lg"
            title="L.E.O."
            subtitle="Gestión de Parques — Bomberos Jaén"
            center
          />
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '32px 28px' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 22, fontWeight: 700, letterSpacing: 1, marginBottom: 24 }}>
            Acceso al sistema
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                placeholder="usuario@bomberos.es"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                autoComplete="email"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 24 }}>
              <label className="form-label">Contraseña</label>
              <input
                className="form-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.3)',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red-l)',
                marginBottom: 16,
              }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: 14, letterSpacing: 1 }}
              disabled={loading}
            >
              {loading ? 'Entrando...' : 'ENTRAR'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', padding: '11px', fontSize: 13, marginTop: 10 }}
              onClick={() => { setRequestOpen(true); setRequestMsg('') }}
            >
              Solicitar acceso
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--mid)', marginTop: 20 }}>
          Servicio de Prevención, Extinción de Incendios y Salvamentos de Jaén
        </div>
      </div>

      {requestOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setRequestOpen(false) }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title">Solicitar acceso</div>
              <button className="btn-icon" onClick={() => setRequestOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleRequestAccess}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nombre completo</label>
                  <input
                    className="form-input"
                    value={requestForm.name}
                    onChange={e => setRequestForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Nombre y apellidos"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    className="form-input"
                    type="email"
                    value={requestForm.email}
                    onChange={e => setRequestForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="usuario@bomberos.es"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Notas (opcional)</label>
                  <textarea
                    className="form-input"
                    style={{ minHeight: 90, resize: 'vertical', fontFamily: 'Barlow' }}
                    value={requestForm.notes}
                    onChange={e => setRequestForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Parque, turno o motivo de acceso"
                  />
                </div>
                {requestMsg && (
                  <div style={{
                    marginTop: 12,
                    background: requestMsg.startsWith('Solicitud enviada')
                      ? 'rgba(39,174,96,0.12)'
                      : 'rgba(192,57,43,0.12)',
                    border: requestMsg.startsWith('Solicitud enviada')
                      ? '1px solid rgba(39,174,96,0.3)'
                      : '1px solid rgba(192,57,43,0.3)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 12,
                    color: requestMsg.startsWith('Solicitud enviada') ? 'var(--green-l)' : 'var(--red-l)',
                  }}>
                    {requestMsg}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRequestOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={requesting}>
                  {requesting ? 'Enviando...' : 'Enviar solicitud'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
