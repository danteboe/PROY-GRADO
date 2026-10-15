export default function Kpi({ value, label, sub }) {
  return (
    <div className="kpi">
      <div className="kpi-val">{value}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}
