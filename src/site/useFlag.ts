/** A release flag (`./flags.ts`) as React state: re-renders when `setFlag` or another tab changes it. */
import { useSyncExternalStore } from 'react'
import { flag, subscribeFlags, type FlagId } from './flags'

export const useFlag = (id: FlagId): boolean => useSyncExternalStore(subscribeFlags, () => flag(id), () => flag(id))
