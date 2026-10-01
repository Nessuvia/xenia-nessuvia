import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Tab selection driven by the URL hash so the sidebar can deep-link into a page's tab.
// Falls back to the first tab when the hash is empty or unknown. Picking a tab writes the hash
// too, so the sidebar's sub-item follows and a later click on that sub-item still lands.
export function useHashTab<T extends string>(ids: readonly T[]): [T, (id: T) => void] {
  const { hash } = useLocation()
  const fromHash = ids.find((id) => id === hash.slice(1))
  const [tab, setTab] = useState<T>(fromHash ?? ids[0])
  const navigate = useNavigate()
  useEffect(() => {
    if (fromHash) setTab(fromHash)
  }, [fromHash])
  const pick = (id: T) => {
    setTab(id)
    navigate({ hash: id }, { replace: true })
  }
  return [tab, pick]
}
