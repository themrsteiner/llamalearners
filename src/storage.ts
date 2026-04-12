import { createDefaultSchedule } from './defaultSchedule'
import {
  removeStoredValue,
  readStoredValue,
  scheduleLastGoodStorageKey,
  scheduleStagingStorageKey,
  scheduleStorageKey,
  writeStoredValue,
} from './persistence'
import {
  createDefaultStageElementTextStyles,
  defaultStageTextStyle,
  weekdayOrder,
  type DayActivity,
  type ScheduleBlock,
  type ScheduleState,
  type StageElementDefaultState,
  type StageElementId,
  type StageTextStyle,
  type WeekdayId,
} from './types'

const YOUTUBE_ASPECT_RATIO = 16 / 9
const REFERENCE_STAGE_WIDTH = 1280
const REFERENCE_STAGE_HEIGHT = 800
const scheduleStorageVersion = 1

type PersistedScheduleEnvelope = {
  version: number
  savedAt: number
  schedule: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isScheduleStateCandidate(value: unknown): value is Record<WeekdayId, unknown> {
  return isRecord(value) && weekdayOrder.every((dayId) => dayId in value)
}

function isPersistedScheduleEnvelope(value: unknown): value is PersistedScheduleEnvelope {
  return isRecord(value) && typeof value.version === 'number' && 'schedule' in value
}

function getPercentHeightForPixelAspect(widthPercent: number, pixelAspectRatio: number): number {
  return widthPercent / (pixelAspectRatio / (REFERENCE_STAGE_WIDTH / REFERENCE_STAGE_HEIGHT))
}

function sortBlocksByTime(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return [...blocks].sort((left, right) => {
    const [leftHours, leftMinutes] = left.startTime.split(':').map(Number)
    const [rightHours, rightMinutes] = right.startTime.split(':').map(Number)
    const startDifference = leftHours * 60 + leftMinutes - (rightHours * 60 + rightMinutes)
    if (startDifference !== 0) {
      return startDifference
    }

    const [leftEndHours, leftEndMinutes] = left.endTime.split(':').map(Number)
    const [rightEndHours, rightEndMinutes] = right.endTime.split(':').map(Number)
    const endDifference = leftEndHours * 60 + leftEndMinutes - (rightEndHours * 60 + rightEndMinutes)
    if (endDifference !== 0) {
      return endDifference
    }

    return left.title.localeCompare(right.title)
  })
}

function sortActivitiesByTime(activities: DayActivity[]): DayActivity[] {
  return [...activities].sort((left, right) => {
    const leftStart = Number(left.startTime.split(':')[0]) * 60 + Number(left.startTime.split(':')[1])
    const rightStart = Number(right.startTime.split(':')[0]) * 60 + Number(right.startTime.split(':')[1])
    if (leftStart !== rightStart) {
      return leftStart - rightStart
    }

    const leftEnd = Number(left.endTime.split(':')[0]) * 60 + Number(left.endTime.split(':')[1])
    const rightEnd = Number(right.endTime.split(':')[0]) * 60 + Number(right.endTime.split(':')[1])
    if (leftEnd !== rightEnd) {
      return leftEnd - rightEnd
    }

    return left.order - right.order
  })
}

function normalizeStageLayout(
  value: Partial<Record<StageElementId, Partial<ScheduleBlock['stageLayout'][StageElementId]>>>,
  fallback: ScheduleBlock['stageLayout'],
): ScheduleBlock['stageLayout'] {
  return {
    clock: {
      x: typeof value?.clock?.x === 'number' ? value.clock.x : fallback.clock.x,
      y: typeof value?.clock?.y === 'number' ? value.clock.y : fallback.clock.y,
      width: typeof value?.clock?.width === 'number' ? value.clock.width : fallback.clock.width,
      height: typeof value?.clock?.height === 'number' ? value.clock.height : fallback.clock.height,
    },
    timer: {
      x: typeof value?.timer?.x === 'number' ? value.timer.x : fallback.timer.x,
      y: typeof value?.timer?.y === 'number' ? value.timer.y : fallback.timer.y,
      width: typeof value?.timer?.width === 'number' ? value.timer.width : fallback.timer.width,
      height: typeof value?.timer?.height === 'number' ? value.timer.height : fallback.timer.height,
    },
    image: {
      x: typeof value?.image?.x === 'number' ? value.image.x : fallback.image.x,
      y: typeof value?.image?.y === 'number' ? value.image.y : fallback.image.y,
      width: typeof value?.image?.width === 'number' ? value.image.width : fallback.image.width,
      height: typeof value?.image?.height === 'number' ? value.image.height : fallback.image.height,
    },
    note: {
      x: typeof value?.note?.x === 'number' ? value.note.x : fallback.note.x,
      y: typeof value?.note?.y === 'number' ? value.note.y : fallback.note.y,
      width: typeof value?.note?.width === 'number' ? value.note.width : fallback.note.width,
      height: typeof value?.note?.height === 'number' ? value.note.height : fallback.note.height,
    },
    details: {
      x: typeof value?.details?.x === 'number' ? value.details.x : fallback.details.x,
      y: typeof value?.details?.y === 'number' ? value.details.y : fallback.details.y,
      width: typeof value?.details?.width === 'number' ? value.details.width : fallback.details.width,
      height: typeof value?.details?.height === 'number' ? value.details.height : fallback.details.height,
    },
    rotations: {
      x: typeof value?.rotations?.x === 'number' ? value.rotations.x : fallback.rotations.x,
      y: typeof value?.rotations?.y === 'number' ? value.rotations.y : fallback.rotations.y,
      width: typeof value?.rotations?.width === 'number' ? value.rotations.width : fallback.rotations.width,
      height: typeof value?.rotations?.height === 'number' ? value.rotations.height : fallback.rotations.height,
    },
    next: {
      x: typeof value?.next?.x === 'number' ? value.next.x : fallback.next.x,
      y: typeof value?.next?.y === 'number' ? value.next.y : fallback.next.y,
      width: typeof value?.next?.width === 'number' ? value.next.width : fallback.next.width,
      height: typeof value?.next?.height === 'number' ? value.next.height : fallback.next.height,
    },
    activity: {
      x: typeof value?.activity?.x === 'number' ? value.activity.x : fallback.activity.x,
      y: typeof value?.activity?.y === 'number' ? value.activity.y : fallback.activity.y,
      width: typeof value?.activity?.width === 'number' ? value.activity.width : fallback.activity.width,
      height: typeof value?.activity?.height === 'number' ? value.activity.height : fallback.activity.height,
    },
  }
}

function normalizeStageElementDefaults(
  value: Partial<Record<StageElementId, Partial<ScheduleBlock['stageLayout'][StageElementId]>>> | undefined,
): Partial<Record<StageElementId, StageElementDefaultState>> {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const fallback = createDefaultSchedule().monday.blocks[0].stageLayout
  const normalized = normalizeStageLayout(value, fallback)
  const result: Partial<Record<StageElementId, StageElementDefaultState>> = {}

  ;(['clock', 'timer', 'image', 'note', 'details', 'rotations', 'next', 'activity'] as const).forEach((elementId) => {
    const rawValue = value[elementId]
    if (rawValue) {
      const maybeObject = rawValue as { layout?: Partial<ScheduleBlock['stageLayout'][StageElementId]>; textStyle?: Partial<StageTextStyle> }
      result[elementId] = {
        layout: rawValue && 'layout' in rawValue ? normalizeStageLayout({ [elementId]: maybeObject.layout }, fallback)[elementId] : normalized[elementId],
        textStyle:
          elementId === 'image' || elementId === 'clock' || elementId === 'timer'
            ? undefined
            : normalizeTextStyle(rawValue && 'textStyle' in rawValue ? maybeObject.textStyle ?? {} : {}),
      }
    }
  })

  return result
}

function normalizeBlock(value: Partial<ScheduleBlock>, fallback: ScheduleBlock): ScheduleBlock {
  const normalizedStageLayout = normalizeStageLayout((value.stageLayout as Partial<Record<StageElementId, Partial<ScheduleBlock['stageLayout'][StageElementId]>>>) ?? {}, fallback.stageLayout)
  const normalizedStageObjects: ScheduleBlock['stageObjects'] = Array.isArray(value.stageObjects)
    ? value.stageObjects
        .filter((item): item is ScheduleBlock['stageObjects'][number] => Boolean(item) && typeof item === 'object')
        .map((item, index): ScheduleBlock['stageObjects'][number] => {
          const type =
            item.type === 'note-card' ||
            item.type === 'image' ||
            item.type === 'youtube' ||
            item.type === 'date' ||
            item.type === 'calendar' ||
            item.type === 'weather' ||
            item.type === 'weather-live' ||
            item.type === 'checklist'
              ? item.type
              : 'text'
          const width = typeof item.width === 'number' ? item.width : 28
          const rawHeight = typeof item.height === 'number' ? item.height : 16
          const height = type === 'youtube' ? Number(getPercentHeightForPixelAspect(width, YOUTUBE_ASPECT_RATIO).toFixed(2)) : rawHeight

          return {
            id: typeof item.id === 'string' ? item.id : `${fallback.id}-object-${index + 1}`,
            type,
            scope: item.scope === 'day' || item.scope === 'all-days' ? item.scope : 'block',
            syncKey: typeof item.syncKey === 'string' ? item.syncKey : '',
            displayMovable: typeof item.displayMovable === 'boolean' ? item.displayMovable : false,
            x: typeof item.x === 'number' ? item.x : 12,
            y: typeof item.y === 'number' ? item.y : 12,
            width,
            height,
            zIndex: typeof item.zIndex === 'number' ? item.zIndex : index,
            locked: false,
            text: typeof item.text === 'string' ? item.text : 'New text',
            src: typeof item.src === 'string' ? item.src : '',
            widgetData: typeof item.widgetData === 'string' ? item.widgetData : '',
            widgetLayoutPreset: typeof item.widgetLayoutPreset === 'string' ? item.widgetLayoutPreset : 'auto',
            textStyle: normalizeTextStyle((item.textStyle as Partial<StageTextStyle>) ?? {}),
          }
        })
    : fallback.stageObjects

  const legacyImageSrc = typeof value.imageSrc === 'string' ? value.imageSrc : fallback.imageSrc
  const stageObjectsWithLegacyImage =
    legacyImageSrc && !normalizedStageObjects.some((item) => item.type === 'image' && item.src === legacyImageSrc)
      ? [
          ...normalizedStageObjects,
          {
            id: `${typeof value.id === 'string' ? value.id : fallback.id}-legacy-image`,
            type: 'image' as const,
            scope: 'block' as const,
            syncKey: '',
            displayMovable: false,
            x: normalizedStageLayout.image.x,
            y: normalizedStageLayout.image.y,
            width: normalizedStageLayout.image.width,
            height: normalizedStageLayout.image.height,
            zIndex: normalizedStageObjects.length,
            locked: false,
            text: '',
            src: legacyImageSrc,
            widgetData: '',
            widgetLayoutPreset: 'auto',
            textStyle: normalizeTextStyle({}),
          },
        ]
      : normalizedStageObjects

  return {
    id: typeof value.id === 'string' ? value.id : fallback.id,
    title: typeof value.title === 'string' ? value.title : fallback.title,
    startTime: typeof value.startTime === 'string' ? value.startTime : fallback.startTime,
    endTime: typeof value.endTime === 'string' ? value.endTime : fallback.endTime,
    rowType: value.rowType === 'gap' ? 'gap' : 'activity',
    openTimeMode:
      value.openTimeMode === 'countdown' ||
      value.openTimeMode === 'blank' ||
      value.openTimeMode === 'previous-block' ||
      value.openTimeMode === 'next-block'
        ? value.openTimeMode
        : fallback.openTimeMode,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    note: typeof value.note === 'string' ? value.note : fallback.note,
    imageSrc: '',
    details: Array.isArray(value.details) ? value.details.filter((item): item is string => typeof item === 'string') : fallback.details,
    rotationGroups: Array.isArray(value.rotationGroups)
      ? value.rotationGroups.filter((item): item is string => typeof item === 'string')
      : fallback.rotationGroups,
    color: value.color ?? fallback.color,
    gentleBackground: typeof value.gentleBackground === 'boolean' ? value.gentleBackground : fallback.gentleBackground,
    layout: value.layout ?? fallback.layout,
    mobility: value.mobility === 'locked' ? 'locked' : 'movable',
    stageLayout: normalizedStageLayout,
    stageElementTextStyles: normalizeStageElementTextStyles((value.stageElementTextStyles as Partial<ScheduleBlock['stageElementTextStyles']>) ?? {}, fallback.stageElementTextStyles),
    stageObjects: stageObjectsWithLegacyImage,
    showTitle: typeof value.showTitle === 'boolean' ? value.showTitle : fallback.showTitle,
    showTimeRange: typeof value.showTimeRange === 'boolean' ? value.showTimeRange : fallback.showTimeRange,
    showNote: typeof value.showNote === 'boolean' ? value.showNote : fallback.showNote,
    showTimer: typeof value.showTimer === 'boolean' ? value.showTimer : fallback.showTimer,
    showNext: typeof value.showNext === 'boolean' ? value.showNext : fallback.showNext,
    showClock: typeof value.showClock === 'boolean' ? value.showClock : fallback.showClock,
    showActivity: typeof value.showActivity === 'boolean' ? value.showActivity : fallback.showActivity,
    clockMode: value.clockMode === 'analog' || value.clockMode === 'both' ? value.clockMode : fallback.clockMode,
    clockLayoutPreset: value.clockLayoutPreset === 'row' || value.clockLayoutPreset === 'stack' ? value.clockLayoutPreset : fallback.clockLayoutPreset,
    timerLayoutPreset:
      value.timerLayoutPreset === 'row' || value.timerLayoutPreset === 'stack' || value.timerLayoutPreset === 'compact'
        ? value.timerLayoutPreset
        : fallback.timerLayoutPreset,
    activityDisplayMode:
      value.activityDisplayMode === 'upcoming' || value.activityDisplayMode === 'both' || value.activityDisplayMode === 'list'
        ? value.activityDisplayMode
        : fallback.activityDisplayMode,
    activityStackMode: value.activityStackMode === 'primary' ? value.activityStackMode : fallback.activityStackMode,
    showActivityTitle: typeof value.showActivityTitle === 'boolean' ? value.showActivityTitle : fallback.showActivityTitle,
    showActivityTimeRange: typeof value.showActivityTimeRange === 'boolean' ? value.showActivityTimeRange : fallback.showActivityTimeRange,
    showActivityCountdown: typeof value.showActivityCountdown === 'boolean' ? value.showActivityCountdown : fallback.showActivityCountdown,
    showActivityStartsIn: typeof value.showActivityStartsIn === 'boolean' ? value.showActivityStartsIn : fallback.showActivityStartsIn,
  }
}

function normalizeStageElementTextStyles(
  value: Partial<ScheduleBlock['stageElementTextStyles']>,
  fallback: ScheduleBlock['stageElementTextStyles'] = createDefaultStageElementTextStyles(),
): ScheduleBlock['stageElementTextStyles'] {
  return {
    title: normalizeTextStyle(value.title ?? fallback.title),
    timeRange: normalizeTextStyle(value.timeRange ?? fallback.timeRange),
    note: normalizeTextStyle(value.note ?? fallback.note),
    details: normalizeTextStyle(value.details ?? fallback.details),
    rotations: normalizeTextStyle(value.rotations ?? fallback.rotations),
    next: normalizeTextStyle(value.next ?? fallback.next),
    activity: normalizeTextStyle(value.activity ?? fallback.activity),
  }
}

function normalizeActivity(value: Partial<DayActivity>, fallback: DayActivity, index: number): DayActivity {
  return {
    id: typeof value.id === 'string' ? value.id : `${fallback.id}-${index + 1}`,
    title: typeof value.title === 'string' ? value.title : fallback.title,
    startTime: typeof value.startTime === 'string' ? value.startTime : fallback.startTime,
    endTime: typeof value.endTime === 'string' ? value.endTime : fallback.endTime,
    color: value.color ?? fallback.color,
    order: typeof value.order === 'number' ? value.order : index,
  }
}

function normalizeTextStyle(value: Partial<StageTextStyle>): StageTextStyle {
  const normalizedColor = typeof value.color === 'string' ? value.color.toLowerCase() : ''
  return {
    fontSize: typeof value.fontSize === 'number' ? value.fontSize : defaultStageTextStyle.fontSize,
    fontWeight: value.fontWeight === '400' || value.fontWeight === '700' ? value.fontWeight : defaultStageTextStyle.fontWeight,
    fontStyle: value.fontStyle === 'italic' ? 'italic' : defaultStageTextStyle.fontStyle,
    textAlign: value.textAlign === 'center' || value.textAlign === 'right' ? value.textAlign : defaultStageTextStyle.textAlign,
    underline: typeof value.underline === 'boolean' ? value.underline : defaultStageTextStyle.underline,
    strikethrough: typeof value.strikethrough === 'boolean' ? value.strikethrough : defaultStageTextStyle.strikethrough,
    color: normalizedColor === '#2f2417' ? defaultStageTextStyle.color : typeof value.color === 'string' ? value.color : defaultStageTextStyle.color,
    backgroundColor: typeof value.backgroundColor === 'string' ? value.backgroundColor : defaultStageTextStyle.backgroundColor,
    padding: typeof value.padding === 'number' ? value.padding : defaultStageTextStyle.padding,
    borderRadius: typeof value.borderRadius === 'number' ? value.borderRadius : defaultStageTextStyle.borderRadius,
    lineHeight: typeof value.lineHeight === 'number' ? value.lineHeight : defaultStageTextStyle.lineHeight,
  }
}

function normalizeScheduleState(value: unknown, fallback: ScheduleState): ScheduleState {
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const parsed = value as Partial<ScheduleState>

  return Object.fromEntries(
    weekdayOrder.map((dayId) => {
      const fallbackDay = fallback[dayId]
      const parsedDay = parsed[dayId]
      const parsedBlocks = Array.isArray(parsedDay?.blocks) ? parsedDay.blocks : []
      const parsedActivities = Array.isArray(parsedDay?.activities) ? parsedDay.activities : []

      return [
        dayId,
        {
          id: fallbackDay.id,
          label: typeof parsedDay?.label === 'string' ? parsedDay.label : fallbackDay.label,
          summary: typeof parsedDay?.summary === 'string' ? parsedDay.summary : fallbackDay.summary,
          stageElementDefaults: normalizeStageElementDefaults(
            parsedDay?.stageElementDefaults as Partial<Record<StageElementId, Partial<ScheduleBlock['stageLayout'][StageElementId]>>> | undefined,
          ),
          activities: sortActivitiesByTime(
            parsedActivities.map((item, index) => normalizeActivity(item as Partial<DayActivity>, fallbackDay.activities[index] ?? fallbackDay.activities[0] ?? {
              id: `${dayId}-activity`,
              title: 'New activity',
              startTime: fallbackDay.blocks[0]?.startTime ?? '08:00',
              endTime: fallbackDay.blocks.at(-1)?.endTime ?? '08:30',
              color: 'sky',
              order: index,
            }, index)),
          ),
          blocks: sortBlocksByTime(
            parsedBlocks.map((item, index) =>
              normalizeBlock(
                item as Partial<ScheduleBlock>,
                fallbackDay.blocks[index] ?? fallbackDay.blocks[0] ?? createFallbackBlock(dayId, index),
              ),
            ),
          ),
        },
      ]
    }),
  ) as ScheduleState
}

export function loadScheduleState(): ScheduleState {
  const fallback = createDefaultSchedule()
  const savedValue = readStoredValue(scheduleStorageKey)
  const lastGoodValue = readStoredValue(scheduleLastGoodStorageKey)

  const candidates = [savedValue, lastGoodValue].filter((value): value is string => Boolean(value))

  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw) as unknown
      const candidate = isPersistedScheduleEnvelope(parsed) ? parsed.schedule : parsed

      if (isPersistedScheduleEnvelope(parsed) && parsed.version !== scheduleStorageVersion) {
        continue
      }

      if (!isScheduleStateCandidate(candidate)) {
        continue
      }

      const normalized = normalizeScheduleState(candidate, fallback)

      if (raw === lastGoodValue && savedValue && savedValue !== lastGoodValue) {
        writeStoredValue(
          scheduleStorageKey,
          JSON.stringify({
            version: scheduleStorageVersion,
            savedAt: Date.now(),
            schedule: normalized,
          } satisfies PersistedScheduleEnvelope),
        )
      }

      return normalized
    } catch {
      continue
    }
  }

  removeStoredValue(scheduleStorageKey)
  removeStoredValue(scheduleStagingStorageKey)
  return fallback
}

function createFallbackBlock(dayId: WeekdayId, index: number): ScheduleBlock {
  return {
    id: `${dayId}-block-${index + 1}`,
    title: 'Block',
    startTime: '08:00',
    endTime: '08:30',
    rowType: 'activity',
    openTimeMode: 'blank',
    enabled: true,
    note: '',
    imageSrc: '',
    details: [],
    rotationGroups: [],
    color: 'sky',
    gentleBackground: false,
    layout: 'standard',
    mobility: 'movable',
    stageLayout: {
      clock: { x: 76, y: 4, width: 18, height: 12 },
      timer: { x: 71, y: 84, width: 24, height: 10 },
      image: { x: 5, y: 6, width: 42, height: 36 },
      note: { x: 5, y: 46, width: 52, height: 22 },
      details: { x: 5, y: 70, width: 56, height: 18 },
      rotations: { x: 62, y: 18, width: 33, height: 52 },
      next: { x: 60, y: 76, width: 30, height: 12 },
      activity: { x: 58, y: 58, width: 34, height: 16 },
    },
    stageElementTextStyles: createDefaultStageElementTextStyles(),
    stageObjects: [],
    showTitle: true,
    showTimeRange: true,
    showNote: true,
    showTimer: true,
    showNext: true,
    showClock: true,
    showActivity: false,
    clockMode: 'digital',
    clockLayoutPreset: 'auto',
    timerLayoutPreset: 'auto',
    activityDisplayMode: 'active',
    activityStackMode: 'all',
    showActivityTitle: true,
    showActivityTimeRange: true,
    showActivityCountdown: true,
    showActivityStartsIn: false,
  }
}

export function saveScheduleState(value: ScheduleState): number | null {
  const fallback = createDefaultSchedule()
  const normalized = normalizeScheduleState(value, fallback)

  const payload: PersistedScheduleEnvelope = {
    version: scheduleStorageVersion,
    savedAt: Date.now(),
    schedule: normalized,
  }

  const serialized = JSON.stringify(payload)
  const staged = writeStoredValue(scheduleStagingStorageKey, serialized)
  if (!staged) {
    return null
  }

  const stagedValue = readStoredValue(scheduleStagingStorageKey)
  if (!stagedValue) {
    return null
  }

  try {
    const parsed = JSON.parse(stagedValue) as unknown
    const candidate = isPersistedScheduleEnvelope(parsed) ? parsed.schedule : parsed
    if (!isScheduleStateCandidate(candidate)) {
      return null
    }
    normalizeScheduleState(candidate, fallback)
  } catch {
    return null
  }

  const wroteCurrent = writeStoredValue(scheduleStorageKey, serialized)
  if (!wroteCurrent) {
    return null
  }

  writeStoredValue(scheduleLastGoodStorageKey, serialized)
  removeStoredValue(scheduleStagingStorageKey)
  return payload.savedAt
}

export function createScheduleExportString(value: ScheduleState): string {
  const payload: PersistedScheduleEnvelope = {
    version: scheduleStorageVersion,
    savedAt: Date.now(),
    schedule: value,
  }

  return JSON.stringify(payload, null, 2)
}

export function parseScheduleImportString(rawValue: string): ScheduleState | null {
  const fallback = createDefaultSchedule()

  try {
    const parsed = JSON.parse(rawValue) as unknown
    const candidate = isPersistedScheduleEnvelope(parsed) ? parsed.schedule : parsed

    if (!isScheduleStateCandidate(candidate)) {
      return null
    }

    return normalizeScheduleState(candidate, fallback)
  } catch {
    return null
  }
}

export function loadScheduleAutosaveSnapshot(): { schedule: ScheduleState; savedAt: number } | null {
  const fallback = createDefaultSchedule()
  const savedValue = readStoredValue(scheduleStorageKey)

  if (!savedValue) {
    return null
  }

  try {
    const parsed = JSON.parse(savedValue) as unknown
    const candidate = isPersistedScheduleEnvelope(parsed) ? parsed.schedule : parsed

    if (!isScheduleStateCandidate(candidate)) {
      return null
    }

    return {
      schedule: normalizeScheduleState(candidate, fallback),
      savedAt: isPersistedScheduleEnvelope(parsed) && typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    }
  } catch {
    return null
  }
}
