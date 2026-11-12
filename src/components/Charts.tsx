import { useId } from 'react'

const W = 340
const PAD = { top: 12, right: 10, bottom: 22, left: 34 }

function niceRange(min: number, max: number): [number, number] {
  if (min === max) return [min - 1, max + 1]
  const pad = (max - min) * 0.12
  return [Math.floor(min - pad), Math.ceil(max + pad)]
}

const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

interface LineProps {
  points: { x: Date; y: number }[]
  unit: string
  height?: number
  decimals?: number
}

/** Minimal responsive line chart (no dependencies). */
export function LineChart({ points, unit, height = 170, decimals = 0 }: LineProps) {
  const gid = useId()
  if (points.length === 0) return null
  const H = height
  const xs = points.map(p => p.x.getTime())
  const ys = points.map(p => p.y)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = niceRange(Math.min(...ys), Math.max(...ys))
  const sx = (t: number) => PAD.left + (x1 === x0 ? (W - PAD.left - PAD.right) / 2 : ((t - x0) / (x1 - x0)) * (W - PAD.left - PAD.right))
  const sy = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x.getTime()).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const area = `${path} L${sx(x1).toFixed(1)},${H - PAD.bottom} L${sx(x0).toFixed(1)},${H - PAD.bottom} Z`
  const last = points[points.length - 1]
  const ticks = [y0, (y0 + y1) / 2, y1]

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Trend from ${ys[0].toFixed(decimals)} to ${last.y.toFixed(decimals)} ${unit}`}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map(t => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} className="grid" />
          <text x={PAD.left - 6} y={sy(t) + 4} textAnchor="end" className="axis">{t.toFixed(decimals)}</text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} className="line" />
      {points.length <= 40 && points.map(p => (
        <circle key={p.x.getTime()} cx={sx(p.x.getTime())} cy={sy(p.y)} r={2.6} className="dot" />
      ))}
      <circle cx={sx(last.x.getTime())} cy={sy(last.y)} r={4.5} className="dot-last" />
      <text x={PAD.left} y={H - 5} className="axis">{shortDate(new Date(x0))}</text>
      <text x={W - PAD.right} y={H - 5} textAnchor="end" className="axis">{shortDate(new Date(x1))}</text>
    </svg>
  )
}

interface BarProps {
  bars: { label: string; value: number; highlight?: boolean }[]
  height?: number
}

export function BarChart({ bars, height = 130 }: BarProps) {
  const H = height
  const max = Math.max(1, ...bars.map(b => b.value))
  const innerW = W - PAD.left - PAD.right
  const slot = innerW / bars.length
  const bw = Math.max(4, slot * 0.62)
  const sy = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Visits per week: ${bars.map(b => b.value).join(', ')}`}>
      {[0, max].map(t => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} className="grid" />
          <text x={PAD.left - 6} y={sy(t) + 4} textAnchor="end" className="axis">{t}</text>
        </g>
      ))}
      {bars.map((b, i) => {
        const x = PAD.left + i * slot + (slot - bw) / 2
        const y = sy(b.value)
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={Math.max(0, H - PAD.bottom - y)} rx={3}
              className={b.highlight ? 'bar bar-now' : 'bar'}>
              <title>{`${b.label}: ${b.value}`}</title>
            </rect>
            {(i === 0 || i === bars.length - 1) && (
              <text x={x + bw / 2} y={H - 5} textAnchor="middle" className="axis">{b.label}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** 24-hour strip for "how busy is it usually" (your own visit pattern). */
export function HourStrip({ values, nowHour }: { values: number[]; nowHour: number }) {
  const hours = values.slice(5, 24) // EVO is open roughly 05-24
  return (
    <div className="hourstrip" aria-hidden="true">
      {hours.map((v, i) => (
        <span key={i} className={i + 5 === nowHour ? 'now' : ''}
          style={{ height: `${Math.max(8, v * 100)}%`, opacity: 0.35 + v * 0.65 }} />
      ))}
    </div>
  )
}
