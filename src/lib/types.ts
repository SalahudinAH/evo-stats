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

export const MUSCLES = [
  'chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'biceps', 'triceps', 'calves', 'core', 'other',
] as const
export type Muscle = typeof MUSCLES[number]

export interface Exercise {
  id: string
  name: string
  /** Main muscle the exercise trains. Null for lifts added before muscles existed. */
  muscle: Muscle | null
}

export interface WorkoutSet {
  id: string
  exercise_id: string
  performed_at: string
  weight_kg: number
  reps: number
  /** Null for sets logged before workouts existed. */
  workout_id: string | null
  position: number | null
  is_warmup: boolean
}

export interface Routine {
  id: string
  name: string
  position: number
}

export interface RoutineExercise {
  id: string
  routine_id: string
  exercise_id: string
  position: number
  target_sets: number
  rep_min: number
  rep_max: number
}

export type RoutineItem = Pick<RoutineExercise, 'exercise_id' | 'target_sets' | 'rep_min' | 'rep_max'>

export interface Workout {
  id: string
  routine_id: string | null
  name: string
  started_at: string
  finished_at: string
  feel: string | null
  notes: string | null
}

export interface NewWorkout {
  routine_id: string | null
  name: string
  started_at: string
  finished_at: string
  feel: string | null
  notes: string | null
  sets: { exercise_id: string; weight_kg: number; reps: number; position: number; is_warmup: boolean }[]
}

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']

export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface Food extends Macros {
  id: string
  name: string
  serving: string
}

export interface FoodEntry extends Macros {
  id: string
  eaten_at: string
  meal: Meal
  food_id: string | null
  name: string
  serving: string
}

export type NewFoodEntry = Omit<FoodEntry, 'id' | 'eaten_at'> & { eaten_at?: string }

export interface Goals extends Macros {
  workouts_per_week: number
}

export const DEFAULT_GOALS: Goals = { kcal: 2600, protein: 160, carbs: 300, fat: 80, workouts_per_week: 4 }

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
  addExercise(name: string, muscle: Muscle | null): Promise<Exercise>
  updateExercise(id: string, patch: Partial<Pick<Exercise, 'name' | 'muscle'>>): Promise<void>
  deleteExercise(id: string): Promise<void>
  listSets(): Promise<WorkoutSet[]>
  deleteSet(id: string): Promise<void>

  listRoutines(): Promise<Routine[]>
  listRoutineExercises(): Promise<RoutineExercise[]>
  addRoutine(name: string): Promise<Routine>
  renameRoutine(id: string, name: string): Promise<void>
  deleteRoutine(id: string): Promise<void>
  /** Replaces the routine's exercise list (order = array order). */
  setRoutineExercises(routineId: string, items: RoutineItem[]): Promise<void>

  listWorkouts(): Promise<Workout[]>
  saveWorkout(w: NewWorkout): Promise<string>
  deleteWorkout(id: string): Promise<void>

  listFoods(): Promise<Food[]>
  addFood(f: Omit<Food, 'id'>): Promise<Food>
  deleteFood(id: string): Promise<void>
  /** Entries with eaten_at in [fromIso, toIso). */
  listFoodEntries(fromIso: string, toIso: string): Promise<FoodEntry[]>
  addFoodEntry(e: NewFoodEntry): Promise<void>
  deleteFoodEntry(id: string): Promise<void>

  getGoals(): Promise<Goals>
  saveGoals(g: Goals): Promise<void>

  getShortcutKey(): Promise<string | null>
  rotateShortcutKey(): Promise<string>

  signOut(): Promise<void>
  /** Deletes the login and all data. */
  deleteAccount(): Promise<void>
}
