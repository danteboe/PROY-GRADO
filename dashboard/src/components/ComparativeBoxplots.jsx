import ChartCard from './ChartCard.jsx'
import { useMemo, useState } from 'react'
import BoxplotChart from './BoxplotChart.jsx'
const COLOR_PART = '#2563eb' // participantes
const COLOR_NO = '#64748b'   // no participantes

// Rango FÍSICO válido de cada variable, para acotar el eje y evitar que el margen
// del dominio sugiera valores imposibles (p. ej. un boxplot de ICFES por área
// nunca debe mostrar más de 100). Los componentes del ICFES (mate/lectura/inglés)
// van de 0 a 100; el puntaje total histórico, de 0 a 500. Las que no están aquí
// usan el dominio automático calculado a partir de los bigotes.
// Para las variables cuyo mínimo físico es 0 pero no tienen un máximo natural
// acotado (conteos/porcentajes de avance), el máximo se deja abierto (Infinity):
// así el eje nunca baja de 0 pero el tope sigue el dominio automático de los
// bigotes (datoMax). Los nombres del campo 'var' se confirmaron contra
// comparativo.numericas de data.json (NUMERO_OPCIONES_INSCRITAS,
// CREDITOS_APROBADOS_TOTAL, SEMESTRE_AVANCE).
const RANGO_VALIDO = {
  ICFES_MATEMATICAS: [0, 100],
  ICFES_LECTURA_CRITICA: [0, 100],
  ICFES_INGLES: [0, 100],
  ICFES_PUNTAJE_TOTAL: [0, 500],
  PGA_ULTIMO: [0, 5],
  PGA_PROMEDIO_HIST: [0, 5],
  PCT_CREDITOS_APROBADOS: [0, 100],
  PCT_AVANCE_CREDITOS: [0, 100],
  PERCENTIL_PGA_PROGRAMA: [0, 100],
  PERCENTIL_PGA_NIVEL: [0, 100],
  NUMERO_OPCIONES_INSCRITAS: [0, Infinity],
  CREDITOS_APROBADOS_TOTAL: [0, Infinity],
  SEMESTRE_AVANCE: [0, Infinity],
}

// Construye las dos "cajas" (participa / no participa) de la variable seleccionada.
function cajasDe(d) {
  if (!d) return []
  const cajas = []
  if (d.q1_part != null) {
    cajas.push({
      grupo: 'Participantes', color: COLOR_PART,
      whisker_low: d.whisker_low_part, q1: d.q1_part, mediana: d.mediana_part,
      q3: d.q3_part, whisker_high: d.whisker_high_part, n: d.n_part,
    })
  }
  if (d.q1_no != null) {
    cajas.push({
      grupo: 'No participantes', color: COLOR_NO,
      whisker_low: d.whisker_low_no, q1: d.q1_no, mediana: d.mediana_no,
      q3: d.q3_no, whisker_high: d.whisker_high_no, n: d.n_no,
    })
  }
  return cajas
}

export default function ComparativeBoxplots({ data, initialVar }) {
  const numericas = useMemo(
    () => (data || []).filter((d) => d.q1_part != null || d.q1_no != null),
    [data],
  )
  const [sel, setSel] = useState(
    initialVar || (numericas[0] && numericas[0].var) || '',
  )
  if (!numericas.length) {
    return (
      <div className="card">
        <h3>Distribución comparada (boxplots)</h3>
        <p className="card-sub">Sin datos comparativos.</p>
      </div>
    )
  }

  const variable = numericas.find((d) => d.var === sel) || numericas[0]
  const cajas = cajasDe(variable)

  return (
    <ChartCard wide>
      <div className="card-head">
        <h3>Distribución comparada por grupo (boxplots)</h3>
        <label className="metric-toggle" style={{ marginLeft: 'auto' }}>
          <select
            className="range-num" style={{ width: 'auto', textAlign: 'left' }}
            value={variable.var} onChange={(e) => setSel(e.target.value)}
            aria-label="Seleccionar variable numérica para el boxplot"
          >
            {numericas.map((d) => (
              <option key={d.var} value={d.var}>{d.label}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="card-sub">
        Cajas de cuartiles (Q1-Q3), mediana y bigotes de Tukey para {variable.label}.
        Azul: participantes; gris: no participantes.
      </p>
      <BoxplotChart key={variable.var} cajas={cajas} label={variable.label}
                    rango={RANGO_VALIDO[variable.var]}
                    descripcion={`Diagramas de caja de ${variable.label} para participantes frente a no participantes`} />
    </ChartCard>
  )
}
