import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) { setError('Introduce email y contraseña'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) setError('Credenciales incorrectas')
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
          <div style={{
            fontFamily: 'Barlow Condensed', fontSize: 56, fontWeight: 900,
            color: 'var(--fire)', letterSpacing: 6, lineHeight: 1,
          }}>
            🔥 IGNIS
          </div>
          <div style={{ fontSize: 12, color: 'var(--mid)', letterSpacing: 3, marginTop: 6, textTransform: 'uppercase' }}>
            Gestión de Material — Bomberos Jaén
          </div>
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
          </form>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--mid)', marginTop: 20 }}>
          Servicio de Prevención, Extinción de Incendios y Salvamentos de Jaén
        </div>
      </div>
    </div>
  )
}
