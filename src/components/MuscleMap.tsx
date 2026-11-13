import Body, { type ExtendedBodyPart, type Slug } from 'react-muscle-highlighter'
import type { Muscle, Sex } from '../lib/types'
import type { MuscleLoad } from '../lib/training'
import { LEVEL_COLORS, loadLevel } from './muscleLevels'

/** Which drawn muscles belong to each of our groups. */
export const MUSCLE_SLUGS: Partial<Record<Muscle, Slug[]>> = {
  chest: ['chest'],
  back: ['trapezius', 'upper-back', 'lower-back'],
  shoulders: ['deltoids'],
  quads: ['quadriceps'],
  hamstrings: ['hamstring'],
  glutes: ['gluteal'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  calves: ['calves'],
  core: ['abs', 'obliques'],
}
const SLUG_TO_MUSCLE = new Map<Slug, Muscle>(
  Object.entries(MUSCLE_SLUGS).flatMap(([m, slugs]) => slugs!.map(s => [s, m as Muscle] as const)),
)

/** Front and back body, shaded by weekly sets. Tap a muscle to select its group. */
export function MuscleMap({ loads, sex, selected, onSelect }: {
  loads: MuscleLoad[]; sex: Sex | null; selected: Muscle | null; onSelect: (m: Muscle | null) => void
}) {
  const data: ExtendedBodyPart[] = loads.flatMap(l => {
    const level = loadLevel(l)
    return (MUSCLE_SLUGS[l.muscle] ?? []).map(slug => ({
      slug,
      ...(level ? { intensity: level } : {}),
      ...(selected === l.muscle ? { styles: { stroke: '#ffffff', strokeWidth: 3 } } : {}),
    }))
  })
  const props = {
    data,
    colors: LEVEL_COLORS,
    gender: sex === 'female' ? 'female' as const : 'male' as const,
    border: 'none' as const,
    defaultFill: '#3a3a3c',
    onBodyPartPress: (p: ExtendedBodyPart) => {
      const m = p.slug ? SLUG_TO_MUSCLE.get(p.slug) ?? null : null
      onSelect(m === selected ? null : m)
    },
  }
  return (
    <div className="body-map" role="img" aria-label="Muscles trained, front and back">
      <figure><Body {...props} side="front" /><figcaption>Front</figcaption></figure>
      <figure><Body {...props} side="back" /><figcaption>Back</figcaption></figure>
    </div>
  )
}
