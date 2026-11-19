import { useEffect, useRef, useState } from 'react'
import { chartPng } from '../chartPng.js'

export default function ChartCard({ wide = false, children }) {
  const card = useRef(null)
  const timer = useRef(null)
  const [status, setStatus] = useState('')
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    window.clearTimeout(timer.current)
    setStatus('Copiando…')
    try {
      if (!navigator.clipboard?.write || !window.ClipboardItem) {
        throw new Error('El navegador no admite la copia de imágenes')
      }
      // Entregar la promesa al portapapeles mantiene el permiso del clic
      // mientras el navegador rasteriza la tarjeta.
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': chartPng(card.current) }),
      ])
      setStatus('PNG copiado')
    } catch {
      setStatus('No se pudo copiar el PNG')
    }
    timer.current = window.setTimeout(() => setStatus(''), 3500)
  }

  return (
    <div ref={card} className={`card chart-card${wide ? ' wide' : ''}`}>
      {children}
      <button type="button" className="chart-copy" data-snapshot-ignore
              onClick={copy} disabled={status === 'Copiando…'}
              title="Copiar gráfico como PNG" aria-label="Copiar gráfico como PNG">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 5V4H6a2 2 0 0 0-2 2v10h1" />
        </svg>
      </button>
      <span className="chart-copy-status" role="status" data-snapshot-ignore>{status}</span>
    </div>
  )
}
