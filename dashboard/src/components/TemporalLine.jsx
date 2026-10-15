import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceArea,
} from 'recharts'
import ChartTooltip from './ChartTooltip.jsx'

// Serie temporal de eventos de movilidad por año, con franja de pandemia.
export default function TemporalLine({ title, subtitle, data }) {
  return (
    <div className="card wide">
      <h3>{title}</h3>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid stroke="#eef2f7" />
          <XAxis dataKey="anio" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <ReferenceArea x1={2020} x2={2021} fill="#ef4444" fillOpacity={0.1}
                         label={{ value: 'COVID-19', position: 'insideTop', fontSize: 11, fill: '#b91c1c' }} />
          <Tooltip content={<ChartTooltip labelKey="anio" />} />
          <Line type="monotone" dataKey="eventos" stroke="#1d4ed8" strokeWidth={2.4}
                dot={{ r: 2.5 }} activeDot={{ r: 5 }} name="Eventos" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
