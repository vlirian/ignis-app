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
  const centered = toast.type === 'warn' || toast.type === 'error'
  const isReviewPendingWarning =
    toast.type === 'warn' &&
    typeof toast.msg === 'string' &&
    toast.msg.toLowerCase().includes('falta material por revisar')

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: isReviewPendingWarning ? 350 : 300,
      pointerEvents: 'none',
    }}>
      {isReviewPendingWarning && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.48)',
          pointerEvents: 'none',
        }} />
      )}
      <div style={{
        position: 'fixed',
        bottom: centered ? 'auto' : 24,
        right: centered ? 'auto' : 24,
        top: centered ? '50%' : 'auto',
        left: centered ? '50%' : 'auto',
        transform: centered ? 'translate(-50%, -50%)' : 'none',
        background: 'var(--panel)',
        border: `1px solid var(--border2)`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 10,
        padding: centered ? '14px 22px' : '12px 20px',
        fontSize: centered ? 15 : 13,
        fontWeight: 500,
        boxShadow: isReviewPendingWarning
          ? `0 0 0 1px ${borderColor}, 0 0 24px ${borderColor}, 0 10px 38px rgba(0,0,0,0.55)`
          : '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 351,
        maxWidth: centered ? 620 : 280,
        width: centered ? 'min(92vw, 620px)' : 'auto',
        textAlign: centered ? 'center' : 'left',
        animation: centered ? 'none' : 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        {toast.msg}
      </div>
    </div>
  )
}
