const scheduleStorageKey = 'classroom-schedule-maker:schedule'
const scheduleStagingStorageKey = 'classroom-schedule-maker:schedule-staging'
const scheduleLastGoodStorageKey = 'classroom-schedule-maker:schedule-last-good'
const builderPreviewCacheKey = 'classroom-schedule-maker:builder-preview-cache'
const linkedDeleteWarningKey = 'classroom-schedule-maker:linked-delete-warning-disabled'
const timeConflictWarningKey = 'classroom-schedule-maker:time-conflict-warning-disabled'
const referenceMondaySeedKey = 'classroom-schedule-maker:reference-monday-seeded-v1'
const advancedModeKey = 'classroom-schedule-maker:advanced-mode-enabled'

const persistedStorageKeys = [
  scheduleStorageKey,
  scheduleStagingStorageKey,
  scheduleLastGoodStorageKey,
  builderPreviewCacheKey,
  linkedDeleteWarningKey,
  timeConflictWarningKey,
  referenceMondaySeedKey,
  advancedModeKey,
] as const

export {
  advancedModeKey,
  builderPreviewCacheKey,
  linkedDeleteWarningKey,
  referenceMondaySeedKey,
  scheduleStorageKey,
  scheduleStagingStorageKey,
  scheduleLastGoodStorageKey,
  timeConflictWarningKey,
}

export function readStoredValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStoredValue(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function removeStoredValue(key: string): boolean {
  try {
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function clearPersistedAppState(): void {
  persistedStorageKeys.forEach((key) => {
    removeStoredValue(key)
  })
}

export function clearPersistedScheduleAutosaves(): void {
  removeStoredValue(scheduleStorageKey)
  removeStoredValue(scheduleStagingStorageKey)
  removeStoredValue(scheduleLastGoodStorageKey)
}

export function restorePersistedScheduleLastGood(): boolean {
  const lastGood = readStoredValue(scheduleLastGoodStorageKey)
  if (!lastGood) {
    return false
  }

  const restoredCurrent = writeStoredValue(scheduleStorageKey, lastGood)
  if (!restoredCurrent) {
    return false
  }

  removeStoredValue(scheduleStagingStorageKey)
  return true
}
