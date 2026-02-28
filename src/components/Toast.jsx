import { useEffect, useState } from 'react'
import { useApp } from '../lib/AppContext'

export default function Toast() {
  const { toast } = useApp()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (toast) {
      setVisible(true)
    } else {
      setVisible(false)
    }
  }, [toast])

  if (!toast) return null

  const borderColor = toast.type === 'ok' ? 'var(--green)' : toast.type === 'warn' ? 'var(--yellow)' : 'var(--red)'

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      background: 'var(--panel)',
      border: `1px solid var(--border2)`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 10,
      padding: '12px 20px',
      fontSize: 13,
      fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      zIndex: 300,
      maxWidth: 280,
      animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {toast.msg}
    </div>
  )
}
