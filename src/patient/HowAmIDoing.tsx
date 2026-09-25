import type { ComponentType } from 'react'
import { BatteryMedium, Brain, Footprints, Hourglass, Moon, RotateCcw, Sun, ThumbsUp, Utensils, type LucideProps } from 'lucide-react'
import { weekTrends, type SymptomKey, type TrendDirection, type WeekTrend } from '../lib/correlation'
import { useData } from '../store'

const ICONS: Record<SymptomKey, ComponentType<LucideProps>> = {
  dizziness: RotateCcw,
  confusion: Brain,
  fall: Footprints,
  appetite: Utensils,
  energy: BatteryMedium,
  sleep: Moon,
}

const TITLES: Record<SymptomKey, string> = {
  energy: 'Energy',
  sleep: 'Sleep',
  dizziness: 'Dizziness',
  confusion: 'Clear thinking',
  appetite: 'Appetite',
  fall: 'Falls',
}

const MESSAGES: Record<SymptomKey, Record<Exclude<TrendDirection, 'not-enough'>, string>> = {
  energy: {
    better: 'You’ve had more energy this week.',
    worse: 'Your energy has been lower this week.',
    same: 'Your energy has been about the same as last week.',
  },
  sleep: {
    better: 'You’ve been sleeping better this week.',
    worse: 'Your sleep has been harder this week.',
    same: 'Your sleep has been about the same as last week.',
  },
  dizziness: {
    better: 'Your dizziness has been better this week.',
    worse: 'You’ve felt dizzy more often this week.',
    same: 'Your dizziness has been about the same as last week.',
  },
  confusion: {
    better: 'Your thinking has felt clearer this week.',
    worse: 'You’ve had more foggy or forgetful moments this week.',
    same: 'Your thinking has been about the same as last week.',
  },
  appetite: {
    better: 'Your appetite has been better this week.',
    worse: 'Your appetite has been lower this week.',
    same: 'Your appetite has been steady.',
  },
  fall: {
    better: 'Fewer falls or near-falls this week.',
    worse: 'You’ve reported a fall or near-fall this week.',
    same: 'No change in falls this week.',
  },
}

const ORDER: SymptomKey[] = ['energy', 'sleep', 'dizziness', 'confusion', 'appetite', 'fall']

function daysText(t: WeekTrend, noun: string): string {
  const days = Math.round(t.thisWeek * t.thisWeekLogged)
  if (days === 0) return `No ${noun} on the days you checked in this week.`
  return `${noun[0].toUpperCase()}${noun.slice(1)} on ${days} of the ${t.thisWeekLogged} days you checked in this week.`
}

function detail(t: WeekTrend): string {
  switch (t.metric) {
    case 'dizziness':
      return daysText(t, 'dizziness')
    case 'confusion':
      return daysText(t, 'foggy moments')
    case 'appetite':
      return daysText(t, 'lower appetite')
    case 'fall':
      return daysText(t, 'falls or near-falls')
    default:
      return `This week’s average: ${t.thisWeek.toFixed(1)} out of 5.`
  }
}

function toneFor(t: WeekTrend): 'good' | 'mention' | 'steady' | 'waiting' {
  if (t.direction === 'not-enough') return 'waiting'
  if (t.metric === 'fall' && t.thisWeek > 0) return 'mention'
  if (t.direction === 'better') return 'good'
  if (t.direction === 'worse') return 'mention'
  return 'steady'
}

const TONE_LABEL = { good: 'Better', mention: 'Worth mentioning', steady: 'Steady', waiting: 'Keep logging' }

export function HowAmIDoing() {
  const { logs, profile } = useData()
  const trends = weekTrends(logs)
  const byKey = new Map(trends.map((t) => [t.metric, t]))
  const logged = trends[0]?.thisWeekLogged ?? 0
  const anyMention = trends.some((t) => toneFor(t) === 'mention')
  const notEnough = trends.every((t) => t.direction === 'not-enough')

  return (
    <div className="doing">
      <div className="pt-intro">
        <h2>How am I doing?</h2>
        <p className="muted">Comparing this week with last week.</p>
      </div>

      <section className="pt-card doing-summary">
        <Sun size={40} strokeWidth={1.75} aria-hidden="true" className="sun" />
        <div>
          <p className="big">
            You checked in on <strong>{logged} of the last 7 days</strong>.
          </p>
          <p className="muted">
            {notEnough
              ? 'After a few more days of check-ins, we can start showing how things are going.'
              : anyMention
                ? `A few things have been harder this week. ${profile.caregiverName} can see these too, and they’ll be ready for your next doctor visit.`
                : 'Things have been steady. Keep up the daily check-ins!'}
          </p>
        </div>
      </section>

      <ul className="trend-list">
        {ORDER.map((key) => {
          const t = byKey.get(key)!
          const Icon = ICONS[key]
          const tone = toneFor(t)
          const message =
            t.direction === 'not-enough'
              ? 'Not enough check-ins yet to compare. Keep checking in each day.'
              : key === 'fall'
                ? t.thisWeek === 0
                  ? 'No falls this week. Wonderful.'
                  : `${MESSAGES.fall.worse} Please make sure ${profile.caregiverName} and your doctor know.`
                : MESSAGES[key][t.direction]
          return (
            <li key={key} className={`pt-card trend tone-${tone}`}>
              <span className="trend-icon" aria-hidden="true">
                <Icon size={30} strokeWidth={1.9} />
              </span>
              <div className="trend-body">
                <div className="trend-head">
                  <h3>{TITLES[key]}</h3>
                  <span className="trend-badge">
                    {tone === 'good' && <ThumbsUp size={16} aria-hidden="true" />}
                    {tone === 'waiting' && <Hourglass size={16} aria-hidden="true" />}
                    {TONE_LABEL[tone]}
                  </span>
                </div>
                <p className="trend-msg">{message}</p>
                {t.direction !== 'not-enough' && <p className="muted trend-detail">{detail(t)}</p>}
              </div>
            </li>
          )
        })}
      </ul>

      <p className="pt-footnote muted">
        This is a simple summary of your own check-ins — not a medical assessment. If you feel unwell, contact your doctor.
      </p>
    </div>
  )
}
