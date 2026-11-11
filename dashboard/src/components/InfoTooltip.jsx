import { useState } from 'react'

// Ícono de ayuda reutilizable: un '?' enfocable (teclado y mouse) que muestra un
// popover accesible con el texto recibido por prop. Reutiliza el estilo
// 'badge-help' ya presente en el proyecto (ver CategoricalAssociation.jsx) y lo
// complementa con un popover propio en styles.css (.info-tooltip / .info-pop).
//
// Props:
//   text  : contenido de la ayuda (string o nodos React). Admite \n para saltos.
//   label : etiqueta accesible del botón (por defecto 'Más información').
export default function InfoTooltip({ text, label = 'Más información' }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <span className="info-tooltip">
      <span
        className="badge-help info-btn"
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-expanded={abierto}
        title={typeof text === 'string' ? text : undefined}
        onMouseEnter={() => setAbierto(true)}
        onMouseLeave={() => setAbierto(false)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setAbierto((v) => !v)
          } else if (e.key === 'Escape') {
            setAbierto(false)
          }
        }}
      >
        ⓘ
      </span>
      {abierto && (
        <span className="info-pop" role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}
