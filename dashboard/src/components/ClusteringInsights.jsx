import ClusterSelection from './ClusterSelection.jsx'
import ClusterHeatmap from './ClusterHeatmap.jsx'
import ClusterExternalProfile from './ClusterExternalProfile.jsx'

// Contenedor de la sección de clustering en Insights. Recibe el objeto
// `clustering` (precalculado en Python). Si es null o meta.disponible===false,
// muestra un placeholder (patrón de ComparativoInsights en App.jsx). Si hay datos,
// muestra la narrativa, un encuadre descriptivo (asociación, no causa) y los tres
// gráficos: selección de k, heatmap de z-scores y perfilado externo.
export default function ClusteringInsights({ clustering }) {
  if (!clustering || clustering.meta?.disponible === false) {
    return (
      <div className="card wide">
        <p className="card-sub" style={{ margin: 0 }}>
          Sin datos de clustering disponibles. Ejecuta{' '}
          <code>python -m src.export_dashboard</code> para regenerar{' '}
          <code>data.json</code> con la clave <code>clustering</code>.
        </p>
      </div>
    )
  }

  const { meta, curvas, clusters, narrativa } = clustering

  return (
    <>
      {narrativa && (
        <div className="card wide">
          <p className="card-sub" style={{ margin: 0, lineHeight: 1.55 }}>{narrativa}</p>
        </div>
      )}
      <div className="card wide">
        <p className="card-sub" style={{ margin: 0, lineHeight: 1.55 }}>
          Estos grupos son <strong>patrones descriptivos</strong> hallados por K-means
          sobre los participantes de pregrado, <strong>no categorías administrativas</strong>{' '}
          ni relaciones causales. Describen cómo se agrupan los rasgos académicos y
          demográficos; las variables externas (ICFES, estrato, género, etc.) solo
          caracterizan los grupos resultantes.
        </p>
      </div>
      <ClusterSelection curvas={curvas} meta={meta} />
      <ClusterHeatmap clusters={clusters} meta={meta} />
      <ClusterExternalProfile clusters={clusters} meta={meta} />
    </>
  )
}
