import { useEffect, useState } from 'react'
import { applyUpdate, startUpdateChecks } from '../lib/update'

/** Shown when a new version is out but reloading right now would interrupt you. */
export function UpdateBanner() {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => startUpdateChecks(setId), [])
  if (!id) return null
  return (
    <button className="update-banner" onClick={() => applyUpdate(id)}>
      New version ready <span>Update</span>
    </button>
  )
}
