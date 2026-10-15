import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

const COLORS = ['#1d4ed8', '#0f766e', '#d97706', '#9333ea', '#dc2626', '#64748b']

// Composición de eventos por modalidad a lo largo del tiempo (área apilada).
export default function ModalityArea({ title, subtitle, data, modalities }) {
  return (
    <div className="card wide">
      <h3>{title}</h3>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid stroke="#eef2f7" />
          <XAxis dataKey="anio" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {modalities.map((m, i) => (
            <Area key={m} type="monotone" dataKey={m} stackId="1"
                  stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.75} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
