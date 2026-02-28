import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/AppContext'

export default function ResetPasswordPage() {
  const { finishRecovery } = useApp()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  useEffect(() => {
    let mounted = true
    const boot = async () => {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const type = url.searchParams.get('type')
      const tokenHash = url.searchParams.get('token_hash')

      // 1) Flujo PKCE: ?code=...
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
        if (exErr && mounted) setError(exErr.message || 'No se pudo validar el enlace')
      }

      // 2) Flujo token_hash
      if (type === 'recovery' && tokenHash) {
        const { error: otpErr } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
        if (otpErr && mounted) setError(otpErr.message || 'No se pudo validar el enlace')
      }

      if (mounted) setReady(true)
    }
    boot()
    return () => { mounted = false }
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!password || password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) { setError(err.message || 'No se pudo actualizar la contraseña'); return }
    setOk(true)
    setTimeout(() => finishRecovery(), 1200)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--smoke)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: '28px 24px' }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Restablecer contraseña</div>
        <div style={{ color: 'var(--mid)', fontSize: 12, marginBottom: 18 }}>Introduce una contraseña nueva para tu cuenta.</div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">Nueva contraseña</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Repetir contraseña</label>
            <input className="form-input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>

          {error && <div style={{ color: 'var(--red-l)', fontSize: 12, marginBottom: 10 }}>⚠ {error}</div>}
          {ok && <div style={{ color: 'var(--green-l)', fontSize: 12, marginBottom: 10 }}>✔ Contraseña actualizada</div>}

          <button className="btn btn-primary" type="submit" disabled={loading || !ready} style={{ width: '100%' }}>
            {loading ? 'Guardando...' : !ready ? 'Validando enlace...' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
