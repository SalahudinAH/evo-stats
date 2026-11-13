import type { MuscleLoad } from '../lib/training'

/** 1 = some work, 2 = close to target, 3 = on target. Muscles with no target are scaled against 10 sets. */
export function loadLevel(l: MuscleLoad): 0 | 1 | 2 | 3 {
  if (l.perWeek <= 0) return 0
  const r = l.target ? l.perWeek / l.target : l.perWeek / 10
  return r >= 1 ? 3 : r >= 0.6 ? 2 : 1
}

export const LEVEL_COLORS = ['rgba(215, 0, 90, 0.35)', 'rgba(215, 0, 90, 0.65)', '#ff2f86']

