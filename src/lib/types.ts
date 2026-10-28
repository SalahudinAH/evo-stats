export type VisitSource = 'manual' | 'arrival' | 'nfc' | 'wallet' | 'shortcut'

export interface Visit {
  id: string
  visited_at: string
  source: VisitSource
  club_name: string | null
}

export interface Club {
  id: string
  name: string
  lat: number
  lng: number
  is_favorite: boolean
}

export interface Weight {
  id: string
  measured_at: string
  kg: number
  source: 'manual' | 'health'
}

export interface Exercise {
  id: string
  name: string
}

export interface WorkoutSet {
  id: string
  exercise_id: string
  performed_at: string
  weight_kg: number
  reps: number
}

export interface CheckInResult {
  logged: boolean
  message: string
}

/** Everything the screens need. Implemented by Supabase (real) and Demo (in-memory). */
export interface Api {
  readonly mode: 'supabase' | 'demo'
  listVisits(): Promise<Visit[]>
  checkIn(club: string | null): Promise<CheckInResult>
  deleteVisit(id: string): Promise<void>

  listClubs(): Promise<Club[]>
  addClub(name: string, lat: number, lng: number, favorite: boolean): Promise<void>
  setFavorite(id: string): Promise<void>
  deleteClub(id: string): Promise<void>

  listWeights(): Promise<Weight[]>
  addWeight(kg: number): Promise<void>
  deleteWeight(id: string): Promise<void>

  listExercises(): Promise<Exercise[]>
  addExercise(name: string): Promise<void>
  deleteExercise(id: string): Promise<void>
  listSets(): Promise<WorkoutSet[]>
  addSet(exerciseId: string, weightKg: number, reps: number): Promise<void>
  deleteSet(id: string): Promise<void>

  getShortcutKey(): Promise<string | null>
  rotateShortcutKey(): Promise<string>

  signOut(): Promise<void>
}
