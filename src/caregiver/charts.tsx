import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDate } from '../lib/dates'
import type { Medication } from '../types'
import { CHART, type DayPoint } from './chartData'

const DIZZY_WORD = ['None', 'A little', 'Some', 'A lot']

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number | null; color: string; dataKey: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  const logged = payload.some((p) => p.value !== null && p.value !== undefined)
  return (
    <div className="chart-tip">
      <p className="chart-tip-date">{label}</p>
      {!logged && <p className="muted">No check-in</p>}
      {logged &&
        payload.map((p) => (
          <p key={p.dataKey} className="chart-tip-row">
            <span className="swatch" style={{ background: p.color }} />
            <span>{p.name}</span>
            <strong>{p.dataKey === 'dizziness' ? DIZZY_WORD[p.value ?? 0] : `${p.value} / 5`}</strong>
          </p>
        ))}
    </div>
  )
}

function medMarkers(meds: Medication[], data: DayPoint[]) {
  const first = data[0]?.date
  const last = data[data.length - 1]?.date
  return meds
    .filter((m) => first && last && m.startDate >= first && m.startDate <= last)
    .map((m) => (
      <ReferenceLine
        key={m.id}
        x={formatDate(m.startDate)}
        stroke={CHART.marker}
        strokeDasharray="4 4"
        label={{ value: `${m.name} started`, position: 'insideTopLeft', fill: '#6B645E', fontSize: 12, fontWeight: 700 }}
      />
    ))
}

const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 12 },
  tickLine: false,
  tickMargin: 8,
  axisLine: { stroke: CHART.grid },
}

export function EnergySleepChart({ data, meds, height = 260 }: { data: DayPoint[]; meds: Medication[]; height?: number }) {
  return (
    <div>
      <div className="legend" aria-hidden="true">
        <span>
          <span className="legend-line" style={{ background: CHART.energy }} /> Energy
        </span>
        <span>
          <span className="legend-line dashed" style={{ color: CHART.sleep }} /> Sleep quality
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 22, right: 16, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
          <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} {...axisProps} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART.axis, strokeWidth: 1 }} />
          {medMarkers(meds, data)}
          <Line
            type="monotone"
            dataKey="energy"
            name="Energy"
            stroke={CHART.energy}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, stroke: '#fffdf9', strokeWidth: 2 }}
            connectNulls
            animationDuration={700}
          />
          <Line
            type="monotone"
            dataKey="sleep"
            name="Sleep quality"
            stroke={CHART.sleep}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 5, stroke: '#fffdf9', strokeWidth: 2 }}
            connectNulls
            animationDuration={700}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DizzinessChart({ data, meds, height = 200 }: { data: DayPoint[]; meds: Medication[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 22, right: 16, bottom: 0, left: -18 }} barCategoryGap={2}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
        <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} tickFormatter={(v: number) => ['0', 'Little', 'Some', 'A lot'][v]} {...axisProps} width={70} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(147,138,130,0.1)' }} />
        {medMarkers(meds, data)}
        <Bar dataKey="dizziness" name="Dizziness" fill={CHART.dizziness} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  )
}
