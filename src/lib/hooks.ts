import { useCallback, useEffect, useState } from 'react'

/** Load async data, with a reload function and error state. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    fn().then(
      d => { if (alive) { setData(d); setError(null) } },
      e => { if (alive) setError(e instanceof Error ? e.message : String(e)) },
    )
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick(t => t + 1), [])
  return { data, error, reload }
}

export type GeoState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ok'; lat: number; lng: number; accuracy: number }
  | { status: 'error'; message: string }

export function useGeolocation() {
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' })
  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeo({ status: 'error', message: 'Location is not available in this browser.' })
      return
    }
    setGeo({ status: 'locating' })
    navigator.geolocation.getCurrentPosition(
      p => setGeo({ status: 'ok', lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      e => setGeo({
        status: 'error',
        message: e.code === e.PERMISSION_DENIED
          ? 'Location permission denied. Allow it in Settings > Privacy > Location Services > Safari Websites.'
          : 'Could not get your location. Try again.',
      }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }, [])
  return { geo, locate }
}
