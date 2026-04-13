import { Fragment, useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import './App.css'
import { createDefaultSchedule, createDefaultStageLayout } from './defaultSchedule'
import {
  advancedModeKey,
  builderPreviewCacheKey,
  clearPersistedAppState,
  linkedDeleteWarningKey,
  readStoredValue,
  referenceMondaySeedKey,
  removeStoredValue,
  writeStoredValue,
} from './persistence'
import { createScheduleExportString, loadScheduleAutosaveSnapshot, loadScheduleState, parseScheduleImportString, saveScheduleState } from './storage'
import {
  formatClock,
  formatDuration,
  formatRange,
  getActiveBlockIndices,
  getCurrentBlockIndex,
  getDayProgress,
  getMinutesNow,
  getWeekdayFromDate,
  minutesToTime,
  timeToMinutes,
} from './time'
import {
  createDefaultStageElementTextStyles,
  defaultStageTextStyle,
  weekdayOrder,
  type ActivityDisplayMode,
  type ActivityStackMode,
  type ClockDisplayMode,
  type ClockLayoutPreset,
  type DayActivity,
  type NavItem,
  type ScheduleBlock,
  type ScheduleState,
  type StageElementDefaultState,
  type StageElementId,
  type StageElementLayout,
  type StageObject,
  type StageObjectScope,
  type StageTextElementId,
  type StageTextStyle,
  type StageObjectType,
  type TimerLayoutPreset,
  type WeekdayId,
} from './types'

const BUILD_LABEL =
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as { LLAMA_BUILD_LABEL?: unknown }).LLAMA_BUILD_LABEL === 'string'
    ? ((globalThis as { LLAMA_BUILD_LABEL?: string }).LLAMA_BUILD_LABEL ?? 'Alpha Build 0.1.432')
    : 'Alpha Build 0.1.432'
const HISTORY_LIMIT = 40
let youtubeApiPromise: Promise<unknown> | null = null
const REFERENCE_STAGE_WIDTH = 1280
const REFERENCE_STAGE_HEIGHT = 800
const YOUTUBE_ASPECT_RATIO = 16 / 9

const navItems: NavItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'display', label: 'Show' },
  { id: 'builder', label: 'Design' },
  { id: 'day-flow', label: 'Plan' },
]

const primaryNavOrder: NavItem['id'][] = ['home', 'day-flow', 'builder', 'display']

const weekdayShortLabels: Record<WeekdayId, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
}

const weekdayFolderClasses: Record<WeekdayId, string> = {
  monday: 'day-flow-folder-monday',
  tuesday: 'day-flow-folder-tuesday',
  wednesday: 'day-flow-folder-wednesday',
  thursday: 'day-flow-folder-thursday',
  friday: 'day-flow-folder-friday',
}

const colorFamilies: ColorFamily[] = [
  { id: 'black', label: 'Black', variants: ['#000000', '#141414', '#2b2b2b', '#464646', '#696969', '#969696'] },
  { id: 'neutral', label: 'Neutral', variants: ['#ffffff', '#f3eee7', '#ddd2c4', '#7f8a95'] },
  { id: 'warm', label: 'Warm', variants: ['#fff1de', '#f6d2b4', '#e29f4b', '#b76635'] },
  { id: 'sky', label: 'Sky', variants: ['#eef4fc', '#cfe0f4', '#6f9fcf', '#406d9b'] },
  { id: 'meadow', label: 'Meadow', variants: ['#eef8ed', '#c7dfc2', '#7da567', '#4f7446'] },
  { id: 'berry', label: 'Berry', variants: ['#fdf1f5', '#edc8d1', '#c66a7d', '#8c4354'] },
]

const colorVariantNames: Record<string, string> = {
  '#000000': 'Ink',
  '#141414': 'Charcoal',
  '#2b2b2b': 'Graphite',
  '#464646': 'Slate black',
  '#696969': 'Soft black',
  '#969696': 'Silver gray',
  '#ffffff': 'Pure white',
  '#f3eee7': 'Cream',
  '#ddd2c4': 'Sand',
  '#7f8a95': 'Stone',
  '#fff1de': 'Vanilla',
  '#f6d2b4': 'Peach cream',
  '#e29f4b': 'Marigold',
  '#b76635': 'Cinnamon',
  '#eef4fc': 'Cloud',
  '#cfe0f4': 'Powder blue',
  '#6f9fcf': 'Cornflower',
  '#406d9b': 'Harbor blue',
  '#eef8ed': 'Mint wash',
  '#c7dfc2': 'Sage mist',
  '#7da567': 'Leaf green',
  '#4f7446': 'Forest',
  '#fdf1f5': 'Blush',
  '#edc8d1': 'Rose dust',
  '#c66a7d': 'Berry rose',
  '#8c4354': 'Plum',
}

type ManualTimerSession = {
  blockId: string
  durationSeconds: number
  extraSeconds: number
  startedAt: number
  pausedRemainingSeconds: number | null
}

type LayoutDragSession = {
  blockId: string
  elementId: StageElementId
  mode: ObjectResizeMode
  pointerStartX: number
  pointerStartY: number
  origin: StageElementLayout
}

type PendingLayoutDragSession = LayoutDragSession

type ObjectResizeMode = 'move' | 'resize-n' | 'resize-s' | 'resize-e' | 'resize-w' | 'resize-ne' | 'resize-nw' | 'resize-se' | 'resize-sw'

type ObjectDragSession = {
  blockId: string
  objectId: string
  mode: ObjectResizeMode
  pointerStartX: number
  pointerStartY: number
  origin: Pick<StageObject, 'x' | 'y' | 'width' | 'height'>
}

type PendingObjectDragSession = ObjectDragSession

type BuilderSelectionId = StageElementId | StageTextElementId | 'background'

type QuickSaveWritable = {
  write: (data: string) => Promise<void>
  close: () => Promise<void>
}

type QuickSaveFileHandle = {
  createWritable: () => Promise<QuickSaveWritable>
}

type SavePickerAcceptOption = {
  description: string
  accept: Record<string, string[]>
}

type SavePickerOptions = {
  suggestedName?: string
  types?: SavePickerAcceptOption[]
}

const templateStageElementIds: StageElementId[] = ['image', 'note', 'details', 'rotations', 'next', 'clock', 'timer', 'activity']

function isTemplateStageElementId(value: string | null): value is StageElementId {
  return value !== null && templateStageElementIds.includes(value as StageElementId)
}

type PreviewTextStyleSnapshot = {
  fontSize: number
  fontWeight: StageTextStyle['fontWeight']
  fontStyle: StageTextStyle['fontStyle']
  textAlign: StageTextStyle['textAlign']
  underline: boolean
  strikethrough: boolean
  color: string
  backgroundColor: string
  padding: number
  borderRadius: number
  lineHeight: number
}

type BlockThumbnailSnapshot = {
  blockId: string
  signature: string
  rowType: ScheduleBlock['rowType']
  enabled: boolean
  color: ScheduleBlock['color']
  title: string
  timeLabel: string
  durationLabel?: string
  elements: Array<{
    id: StageElementId
    className: string
    x: number
    y: number
    width: number
    height: number
    clockMode?: ClockDisplayMode
    widgetLayoutPreset?: ClockLayoutPreset | TimerLayoutPreset
    text?: string
    items?: string[]
    imageSrc?: string
    style?: PreviewTextStyleSnapshot
  }>
  objects: Array<{
    id: string
    type: StageObjectType
    x: number
    y: number
    width: number
    height: number
    zIndex: number
    text?: string
    src?: string
    widgetData?: string
    widgetLayoutPreset?: string
    textStyle?: PreviewTextStyleSnapshot
  }>
}

type EditorHistorySnapshot = {
  schedule: ScheduleState
  builderDay: WeekdayId
  selectedBuilderBlockId: string | null
  selectedStageElementId: BuilderSelectionId | null
  selectedStageObjectId: string | null
}

type PendingLinkedDelete = {
  dayId: WeekdayId
  blockId: string
  objectId: string
}

type DisplayDragTarget =
  | { kind: 'element'; dayId: WeekdayId; blockId: string; elementId: StageElementId; pointerStartX: number; pointerStartY: number; origin: StageElementLayout }
  | { kind: 'object'; dayId: WeekdayId; blockId: string; objectId: string; pointerStartX: number; pointerStartY: number; origin: Pick<StageObject, 'x' | 'y' | 'width' | 'height'> }

type TextStyleChangeHandler = (field: keyof StageTextStyle, value: string | number | boolean) => void

type RatioLockRule = {
  aspectRatio: number
  canOverrideWithShift: boolean
}

type ChecklistWidgetItem = {
  id: string
  label: string
  checked: boolean
}

type WeatherWidgetData = {
  location: string
  condition: string
  temperature: string
  detail: string
}

type WeatherLiveDetailLevel = 'simple' | 'standard' | 'detailed'
type WeatherLiveForecastMode = 'current' | 'today-tomorrow'

type WeatherLiveWidgetData = {
  provider: 'open-meteo'
  locationInput: string
  detailLevel: WeatherLiveDetailLevel
  forecastMode: WeatherLiveForecastMode
  refreshMinutes: number
}

type WeatherLiveSnapshot = {
  locationLabel: string
  currentTemperature: string
  currentCondition: string
  currentDetail: string
  todayHighLow: string
  tomorrowHighLow: string
  updatedAt: number
}

type WeatherLiveRuntimeState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: WeatherLiveSnapshot | null
  error: string | null
  lastFetchedAt: number | null
  configKey: string
}

type PlanEditorMode = 'blocks' | 'activities'

type ResolvedActivityDisplayItem = {
  activity: DayActivity
  state: 'active' | 'upcoming'
}

type DayActivityDraft = {
  title: string
  startTime: string
  endTime: string
  color: DayActivity['color']
}

function getWeatherLivePreferredSize(data: WeatherLiveWidgetData): { width: number; height: number } {
  const baseWidth = data.forecastMode === 'today-tomorrow' ? 36 : 30
  const baseHeight =
    data.forecastMode === 'today-tomorrow'
      ? data.detailLevel === 'detailed'
        ? 25
        : data.detailLevel === 'standard'
          ? 23
          : 20
      : data.detailLevel === 'detailed'
        ? 21
        : data.detailLevel === 'standard'
          ? 19
          : 16

  return { width: baseWidth, height: baseHeight }
}

type CalendarWidgetMode = 'month' | 'week'

type CalendarWidgetData = {
  mode: CalendarWidgetMode
}

type ColorFamily = {
  id: string
  label: string
  variants: string[]
}

function toStagePercentAspectRatio(pixelAspectRatio: number): number {
  return pixelAspectRatio / (REFERENCE_STAGE_WIDTH / REFERENCE_STAGE_HEIGHT)
}

function getPercentHeightForPixelAspect(widthPercent: number, pixelAspectRatio: number): number {
  return widthPercent / toStagePercentAspectRatio(pixelAspectRatio)
}

function getPercentWidthForPixelAspect(heightPercent: number, pixelAspectRatio: number): number {
  return heightPercent * toStagePercentAspectRatio(pixelAspectRatio)
}

function getRenderedStageObjectFrameStyle(
  object: StageObject,
  zIndex: number,
  cursor?: CSSProperties['cursor'],
): CSSProperties {
  const baseStyle: CSSProperties = {
    left: `${object.x}%`,
    top: `${object.y}%`,
    width: `${object.width}%`,
    zIndex,
  }

  if (cursor) {
    baseStyle.cursor = cursor
  }

  if (object.type === 'youtube') {
    baseStyle.height = 'auto'
    baseStyle.aspectRatio = `${YOUTUBE_ASPECT_RATIO}`
    return baseStyle
  }

  baseStyle.height = `${object.height}%`
  return baseStyle
}

function duplicateSchedule(value: ScheduleState): ScheduleState {
  return JSON.parse(JSON.stringify(value)) as ScheduleState
}

function duplicatePreviewCache(value: Record<string, BlockThumbnailSnapshot>): Record<string, BlockThumbnailSnapshot> {
  return JSON.parse(JSON.stringify(value)) as Record<string, BlockThumbnailSnapshot>
}

function createResetStageLayout(
  layout: ScheduleBlock['layout'],
  stageElementDefaults: Partial<Record<StageElementId, StageElementDefaultState>> = {},
): ScheduleBlock['stageLayout'] {
  const nextLayout = createDefaultStageLayout(layout)

  ;(Object.keys(stageElementDefaults) as StageElementId[]).forEach((elementId) => {
    const fallback = stageElementDefaults[elementId]
    if (fallback) {
      nextLayout[elementId] = { ...fallback.layout }
    }
  })

  return nextLayout
}

function createResetStageTextStyles(
  stageElementDefaults: Partial<Record<StageElementId, StageElementDefaultState>> = {},
): ScheduleBlock['stageElementTextStyles'] {
  const nextTextStyles = createDefaultStageElementTextStyles()

  ;(Object.keys(stageElementDefaults) as StageElementId[]).forEach((elementId) => {
    const fallback = stageElementDefaults[elementId]
    if (fallback?.textStyle && elementId !== 'image' && elementId !== 'clock' && elementId !== 'timer') {
      nextTextStyles[elementId] = { ...fallback.textStyle }
    }
  })

  return nextTextStyles
}

function clearSlideContentFromSchedule(value: ScheduleState): ScheduleState {
  const next = duplicateSchedule(value)
  weekdayOrder.forEach((dayId) => {
    const defaults = next[dayId].stageElementDefaults
    next[dayId].blocks = next[dayId].blocks.map((block) => {
      if (block.rowType === 'gap') {
        return {
          ...block,
          note: 'Add a short teacher-facing note here.',
          imageSrc: '',
          details: [],
          rotationGroups: [],
          stageLayout: createResetStageLayout(block.layout, defaults),
          stageElementTextStyles: createResetStageTextStyles(defaults),
          stageObjects: [],
          showTitle: false,
          showTimeRange: false,
          showNote: false,
          showTimer: false,
          showNext: false,
          showClock: false,
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

      return {
        ...block,
        note: '',
        imageSrc: '',
        details: [],
        rotationGroups: [],
        stageLayout: createResetStageLayout(block.layout, defaults),
        stageElementTextStyles: createResetStageTextStyles(defaults),
        stageObjects: [],
        showTitle: true,
        showTimeRange: true,
        showNote: false,
        showTimer: false,
        showNext: false,
        showClock: false,
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
    })
  })

  return next
}

function createBlankSchedule(): ScheduleState {
  const next = createDefaultSchedule()

  weekdayOrder.forEach((dayId) => {
    next[dayId].activities = []
    next[dayId].blocks = []
  })

  return next
}

function cloneTextStyleSnapshot(value: StageTextStyle): PreviewTextStyleSnapshot {
  return {
    fontSize: value.fontSize,
    fontWeight: value.fontWeight,
    fontStyle: value.fontStyle,
    textAlign: value.textAlign,
    underline: value.underline,
    strikethrough: value.strikethrough,
    color: value.color,
    backgroundColor: value.backgroundColor,
    padding: value.padding,
    borderRadius: value.borderRadius,
    lineHeight: value.lineHeight,
  }
}

function cloneStageElementDefaultState(
  elementId: StageElementId,
  layout: StageElementLayout,
  textStyle?: StageTextStyle,
): StageElementDefaultState {
  return {
    layout: { ...layout },
    textStyle: elementId === 'image' || elementId === 'clock' || !textStyle ? undefined : { ...textStyle },
  }
}

function getClockHandRotations(now: Date): { hour: number; minute: number; second: number } {
  const hours = now.getHours() % 12
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()
  return {
    hour: hours * 30 + minutes * 0.5,
    minute: minutes * 6 + seconds * 0.1,
    second: seconds * 6,
  }
}

function createBlockPreviewSignature(block: ScheduleBlock, upcomingBlock: ScheduleBlock | null): string {
  return JSON.stringify({
    previewVersion: 2,
    title: block.title,
    startTime: block.startTime,
    endTime: block.endTime,
    rowType: block.rowType,
    enabled: block.enabled,
    color: block.color,
    layout: block.layout,
    showTitle: block.showTitle,
    showTimeRange: block.showTimeRange,
    showClock: block.showClock,
    clockMode: block.clockMode,
    clockLayoutPreset: block.clockLayoutPreset,
    showTimer: block.showTimer,
    timerLayoutPreset: block.timerLayoutPreset,
    details: block.details,
    rotationGroups: block.rotationGroups,
    showNext: block.showNext,
    showActivity: block.showActivity,
    activityDisplayMode: block.activityDisplayMode,
    activityStackMode: block.activityStackMode,
    showActivityTitle: block.showActivityTitle,
    showActivityTimeRange: block.showActivityTimeRange,
    showActivityCountdown: block.showActivityCountdown,
    showActivityStartsIn: block.showActivityStartsIn,
    nextTitle: upcomingBlock?.title ?? null,
    nextStartTime: upcomingBlock?.startTime ?? null,
    stageLayout: block.stageLayout,
    stageElementTextStyles: block.stageElementTextStyles,
    stageObjects: block.stageObjects.map((object) => ({
      id: object.id,
      type: object.type,
      scope: object.scope,
      syncKey: object.syncKey,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      zIndex: object.zIndex,
      text: object.text,
      src: object.src,
      widgetData: object.widgetData,
      widgetLayoutPreset: object.widgetLayoutPreset,
      textStyle: object.textStyle,
    })),
  })
}

function isDisabledBlock(block: ScheduleBlock): boolean {
  return block.enabled === false
}

function usesGapPresentation(block: ScheduleBlock): boolean {
  return block.rowType === 'gap' || isDisabledBlock(block)
}

function getDisplayBlockTitle(block: Pick<ScheduleBlock, 'rowType' | 'title'> | null | undefined): string {
  if (!block) {
    return ''
  }
  if (block.rowType === 'gap') {
    return 'Open'
  }
  return block.title
}

function createBlockThumbnailSnapshot(block: ScheduleBlock, upcomingBlock: ScheduleBlock | null): BlockThumbnailSnapshot {
  if (usesGapPresentation(block)) {
    return {
      blockId: block.id,
      signature: createBlockPreviewSignature(block, upcomingBlock),
      rowType: 'gap',
      enabled: block.enabled,
      color: block.color,
      title: block.rowType === 'gap' ? 'Open' : block.title || 'Open',
      timeLabel: formatRange(block.startTime, block.endTime),
      durationLabel: formatDurationHoursMinutes(block.startTime, block.endTime),
      elements: [],
      objects: [],
    }
  }

  const elements: BlockThumbnailSnapshot['elements'] = []

  elements.push({
    id: 'clock',
    className: 'stage-layout-item stage-layout-clock',
    clockMode: block.clockMode,
    widgetLayoutPreset: block.clockLayoutPreset,
    ...block.stageLayout.clock,
  })

  elements.push({
    id: 'timer',
    className: 'stage-layout-item stage-layout-timer',
    text: block.showTimer ? 'Time remaining' : 'Timer hidden',
    widgetLayoutPreset: block.timerLayoutPreset,
    ...block.stageLayout.timer,
  })

  if (block.details.length > 0) {
    elements.push({
      id: 'details',
      className: 'stage-layout-item stage-layout-details',
      items: [...block.details],
      style: cloneTextStyleSnapshot(block.stageElementTextStyles.details),
      ...block.stageLayout.details,
    })
  }

  if (block.rotationGroups.length > 0) {
    elements.push({
      id: 'rotations',
      className: 'stage-layout-item stage-layout-rotations',
      items: [...block.rotationGroups],
      style: cloneTextStyleSnapshot(block.stageElementTextStyles.rotations),
      ...block.stageLayout.rotations,
    })
  }

  if (block.showNext && upcomingBlock) {
    elements.push({
      id: 'next',
      className: 'stage-layout-item stage-layout-next',
      text: `Next up: ${getDisplayBlockTitle(upcomingBlock)} at ${formatClock(upcomingBlock.startTime)}`,
      style: cloneTextStyleSnapshot(block.stageElementTextStyles.next),
      ...block.stageLayout.next,
    })
  }

  if (block.showActivity) {
    elements.push({
      id: 'activity',
      className: 'stage-layout-item stage-layout-activity',
      text: 'Activity overlay',
      style: cloneTextStyleSnapshot(block.stageElementTextStyles.activity),
      ...block.stageLayout.activity,
    })
  }

  const objects = [...block.stageObjects]
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((object) => ({
      id: object.id,
      type: object.type,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      zIndex: object.zIndex,
      text: object.text,
      src: object.src,
      widgetData: object.widgetData,
      widgetLayoutPreset: object.widgetLayoutPreset,
      textStyle: cloneTextStyleSnapshot(object.textStyle),
    }))

  return {
    blockId: block.id,
    signature: createBlockPreviewSignature(block, upcomingBlock),
    rowType: block.rowType,
    enabled: block.enabled,
    color: block.color,
    title: getDisplayBlockTitle(block),
    timeLabel: formatRange(block.startTime, block.endTime),
    durationLabel: formatDurationHoursMinutes(block.startTime, block.endTime),
    elements,
    objects,
  }
}

function loadBuilderPreviewCache(): Record<string, BlockThumbnailSnapshot> {
  const saved = readStoredValue(builderPreviewCacheKey)
  if (!saved) {
    return {}
  }

  try {
    const parsed = JSON.parse(saved) as unknown
    if (typeof parsed !== 'object' || parsed === null) {
      removeStoredValue(builderPreviewCacheKey)
      return {}
    }

    const entries = Object.entries(parsed).filter(([, value]) => {
      if (typeof value !== 'object' || value === null) {
        return false
      }

      const snapshot = value as Partial<BlockThumbnailSnapshot>
      return (
        typeof snapshot.blockId === 'string' &&
        typeof snapshot.title === 'string' &&
        typeof snapshot.timeLabel === 'string' &&
        (typeof snapshot.durationLabel === 'undefined' || typeof snapshot.durationLabel === 'string') &&
        Array.isArray(snapshot.elements) &&
        Array.isArray(snapshot.objects)
      )
    })

    return Object.fromEntries(entries) as Record<string, BlockThumbnailSnapshot>
  } catch {
    removeStoredValue(builderPreviewCacheKey)
    return {}
  }
}

function saveBuilderPreviewCache(value: Record<string, BlockThumbnailSnapshot>) {
  writeStoredValue(builderPreviewCacheKey, JSON.stringify(value))
}

function loadLinkedDeleteWarningDisabled(): boolean {
  return readStoredValue(linkedDeleteWarningKey) === 'true'
}

function saveLinkedDeleteWarningDisabled(value: boolean) {
  writeStoredValue(linkedDeleteWarningKey, value ? 'true' : 'false')
}

function ClockFace({ now, showSecondHand = false }: { now: Date; showSecondHand?: boolean }) {
  const rotations = getClockHandRotations(now)
  return (
    <div className="stage-clock-face" aria-hidden="true">
      <span className="stage-clock-hand stage-clock-hand-hour" style={{ transform: `translateX(-50%) rotate(${rotations.hour}deg)` }} />
      <span className="stage-clock-hand stage-clock-hand-minute" style={{ transform: `translateX(-50%) rotate(${rotations.minute}deg)` }} />
      {showSecondHand && <span className="stage-clock-hand stage-clock-hand-second" style={{ transform: `translateX(-50%) rotate(${rotations.second}deg)` }} />}
      <span className="stage-clock-center" />
    </div>
  )
}

function resolveClockLayoutVariant(mode: ClockDisplayMode, preset: ClockLayoutPreset, frameWidth: number, frameHeight: number): 'analog' | 'row' | 'stack' {
  if (mode === 'analog') {
    return 'analog'
  }
  if (preset === 'row') {
    return 'row'
  }
  if (preset === 'stack') {
    return 'stack'
  }

  const ratio = frameHeight > 0 ? frameWidth / frameHeight : 1
  return ratio >= 1.5 ? 'row' : 'stack'
}

function ClockElement({
  mode,
  now,
  preset,
  frameWidth,
  frameHeight,
}: {
  mode: ClockDisplayMode
  now: Date
  preset: ClockLayoutPreset
  frameWidth: number
  frameHeight: number
}) {
  const digitalValue = formatClock(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
  const layoutVariant = resolveClockLayoutVariant(mode, preset, frameWidth, frameHeight)
  return (
    <div className={`stage-clock stage-clock-${mode} stage-clock-layout-${layoutVariant}`}>
      {(mode === 'analog' || mode === 'both') && <ClockFace now={now} showSecondHand={mode === 'analog'} />}
      {(mode === 'digital' || mode === 'both') && <strong className="stage-clock-digital">{digitalValue}</strong>}
    </div>
  )
}

function resolveTimerLayoutVariant(preset: TimerLayoutPreset, frameWidth: number, frameHeight: number): 'row' | 'stack' | 'compact' {
  if (preset === 'row' || preset === 'stack' || preset === 'compact') {
    return preset
  }

  const ratio = frameHeight > 0 ? frameWidth / frameHeight : 1
  if (ratio >= 2.3) {
    return 'row'
  }
  if (frameWidth <= 18) {
    return 'compact'
  }
  return 'stack'
}

function TimerElement({
  hidden,
  value,
  preset,
  frameWidth,
  frameHeight,
}: {
  hidden: boolean
  value: string
  preset: TimerLayoutPreset
  frameWidth: number
  frameHeight: number
}) {
  const layoutVariant = resolveTimerLayoutVariant(preset, frameWidth, frameHeight)
  return (
    <div className={hidden ? `stage-timer stage-timer-hidden stage-timer-layout-${layoutVariant}` : `stage-timer stage-timer-layout-${layoutVariant}`}>
      <span className="stage-timer-label">{hidden ? 'Timer hidden' : 'Time remaining'}</span>
      <strong className="stage-timer-value">{hidden ? '--:--' : value}</strong>
    </div>
  )
}

function resolveGenericWidgetLayoutVariant(preset: string, frameWidth: number, frameHeight: number): 'row' | 'stack' | 'compact' {
  if (preset === 'row' || preset === 'stack' || preset === 'compact') {
    return preset
  }

  const ratio = frameHeight > 0 ? frameWidth / frameHeight : 1
  if (ratio >= 1.7) {
    return 'row'
  }
  if (frameWidth <= 18 || frameHeight <= 12) {
    return 'compact'
  }
  return 'stack'
}

function DateWidget({
  now,
  preset,
  frameWidth,
  frameHeight,
  style,
}: {
  now: Date
  preset: string
  frameWidth: number
  frameHeight: number
  style?: CSSProperties
}) {
  const layoutVariant = resolveGenericWidgetLayoutVariant(preset, frameWidth, frameHeight)
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' })
  const monthDay = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

  return (
    <div className={`stage-widget-card stage-widget-date stage-widget-layout-${layoutVariant}`} style={style}>
      <span className="stage-widget-kicker">Today</span>
      <strong className="stage-widget-primary">{weekday}</strong>
      <span className="stage-widget-secondary">{monthDay}</span>
    </div>
  )
}

function buildCalendarMonthCells(year: number, monthIndex: number, today: Date) {
  const monthStart = new Date(year, monthIndex, 1)
  const startWeekday = monthStart.getDay()
  const firstGridOffset = (startWeekday + 6) % 7
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const previousMonth = new Date(year, monthIndex, 0)
  const daysInPreviousMonth = previousMonth.getDate()

  return Array.from({ length: 35 }, (_, index) => {
    const dayNumber = index - firstGridOffset + 1
    if (dayNumber < 1) {
      return { label: String(daysInPreviousMonth + dayNumber), muted: true, today: false }
    }
    if (dayNumber > daysInMonth) {
      return { label: String(dayNumber - daysInMonth), muted: true, today: false }
    }
    return {
      label: String(dayNumber),
      muted: false,
      today: year === today.getFullYear() && monthIndex === today.getMonth() && dayNumber === today.getDate(),
    }
  })
}


function CalendarWidget({
  now,
  data,
  preset,
  frameWidth,
  frameHeight,
  style,
}: {
  now: Date
  data: CalendarWidgetData
  preset: string
  frameWidth: number
  frameHeight: number
  style?: CSSProperties
}) {
  const layoutVariant = resolveGenericWidgetLayoutVariant(preset, frameWidth, frameHeight)
  const mode = data.mode
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthLabel = currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  if (mode === 'week') {
    const startOfWeek = new Date(now)
    const weekOffset = (startOfWeek.getDay() + 6) % 7
    startOfWeek.setDate(startOfWeek.getDate() - weekOffset)
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startOfWeek)
      date.setDate(startOfWeek.getDate() + index)
      return {
        weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
        label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        today: date.toDateString() === now.toDateString(),
      }
    })

    return (
      <div className={`stage-widget-card stage-widget-calendar stage-widget-calendar-week stage-widget-layout-${layoutVariant}`} style={style}>
        <span className="stage-widget-kicker">Current week</span>
        <strong className="stage-widget-primary">{`${days[0]?.label ?? ''} - ${days[6]?.label ?? ''}`}</strong>
        <div className="stage-widget-calendar-weeklist" aria-label="Current week">
          {days.map((day) => (
            <div
              className={day.today ? 'stage-widget-calendar-weekitem stage-widget-calendar-weekitem-today' : 'stage-widget-calendar-weekitem'}
              key={`${day.weekday}-${day.label}`}
            >
              <span className="stage-widget-calendar-weekday">{day.weekday}</span>
              <span className="stage-widget-calendar-weekdate">{day.label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const cells = buildCalendarMonthCells(now.getFullYear(), now.getMonth(), now)

  return (
    <div className={`stage-widget-card stage-widget-calendar stage-widget-layout-${layoutVariant}`} style={style}>
      <span className="stage-widget-kicker">{monthLabel}</span>
      <div className="stage-widget-calendar-daylabels" aria-hidden="true">
        {dayLabels.map((label) => (
          <span className="stage-widget-calendar-daylabel" key={label}>
            {label}
          </span>
        ))}
      </div>
      <div className="stage-widget-calendar-grid" aria-label={monthLabel}>
        {cells.map((cell, index) => (
          <span
            className={[
              'stage-widget-calendar-cell',
              cell.muted ? 'stage-widget-calendar-cell-muted' : '',
              cell.today ? 'stage-widget-calendar-cell-today' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={`${cell.label}-${index}`}
          >
            {cell.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function WeatherWidget({
  data,
  preset,
  frameWidth,
  frameHeight,
  style,
}: {
  data: WeatherWidgetData
  preset: string
  frameWidth: number
  frameHeight: number
  style?: CSSProperties
}) {
  const layoutVariant = resolveGenericWidgetLayoutVariant(preset, frameWidth, frameHeight)
  const icon =
    data.condition.toLowerCase().includes('rain')
      ? 'Rain'
      : data.condition.toLowerCase().includes('cloud')
        ? 'Cloud'
        : data.condition.toLowerCase().includes('snow')
          ? 'Snow'
          : 'Sun'

  return (
    <div className={`stage-widget-card stage-widget-weather stage-widget-layout-${layoutVariant}`} style={style}>
      <span className="stage-widget-kicker">{data.location || 'Weather'}</span>
      <strong className="stage-widget-primary">{data.temperature || '--'}</strong>
      <span className="stage-widget-secondary">{data.condition || 'Sunny'}</span>
      <span className="stage-widget-tertiary">{data.detail || icon}</span>
    </div>
  )
}

function WeatherLiveWidget({
  data,
  runtime,
  preset,
  frameWidth,
  frameHeight,
  onRefresh,
  style,
}: {
  data: WeatherLiveWidgetData
  runtime: WeatherLiveRuntimeState | null
  preset: string
  frameWidth: number
  frameHeight: number
  onRefresh?: () => void
  style?: CSSProperties
}) {
  const layoutVariant = resolveGenericWidgetLayoutVariant(preset, frameWidth, frameHeight)
  const snapshot = runtime?.data
  const locationLabel = snapshot?.locationLabel || (data.locationInput ? data.locationInput : 'Weather live')
  const loading = runtime?.status === 'loading' && !snapshot
  const error = runtime?.status === 'error'
  const showDetailLine = data.detailLevel === 'standard' || data.detailLevel === 'detailed'
  const showToday = data.forecastMode === 'today-tomorrow' && (data.detailLevel === 'standard' || data.detailLevel === 'detailed')
  const showTomorrow = data.forecastMode === 'today-tomorrow' && data.detailLevel === 'detailed'

  return (
    <div className={`stage-widget-card stage-widget-weather stage-widget-weather-live stage-widget-layout-${layoutVariant}`} style={style}>
      {onRefresh ? (
        <button
          aria-label="Refresh weather"
          className="stage-widget-refresh-button"
          disabled={runtime?.status === 'loading'}
          onClick={(event) => {
            event.stopPropagation()
            onRefresh()
          }}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M18.2 9.3A6.6 6.6 0 0 0 6.7 7.9M5.8 10.2V7.3h2.9M5.8 14.7A6.6 6.6 0 0 0 17.3 16.1M18.2 13.8v2.9h-2.9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </svg>
        </button>
      ) : null}
      <span className="stage-widget-kicker">{locationLabel}</span>
      <strong className="stage-widget-primary">{snapshot?.currentTemperature || (loading ? '...' : '--')}</strong>
      <span className="stage-widget-secondary">{snapshot?.currentCondition || (loading ? 'Loading forecast' : error ? 'Weather unavailable' : 'Enter location')}</span>
      {showDetailLine && (
        <span className="stage-widget-tertiary">
          {snapshot?.currentDetail || (error ? runtime?.error || 'Could not refresh' : loading ? 'Checking latest conditions' : 'Current conditions')}
        </span>
      )}
      {(showToday || showTomorrow) && (
        <div className="stage-widget-weather-forecast">
          {showToday && <span>{snapshot?.todayHighLow || 'Today --/--'}</span>}
          {showTomorrow && <span>{snapshot?.tomorrowHighLow || 'Tomorrow --/--'}</span>}
        </div>
      )}
      {runtime?.status === 'ready' && snapshot && (
        <span className="stage-widget-weather-updated">{`Updated ${new Date(snapshot.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</span>
      )}
    </div>
  )
}

function ChecklistWidget({
  items,
  textStyle,
  onToggle,
}: {
  items: ChecklistWidgetItem[]
  textStyle: CSSProperties
  onToggle?: (itemId: string) => void
}) {
  return (
    <div className="stage-widget-card stage-widget-checklist" style={textStyle}>
      <ul className="stage-widget-checklist-list">
        {items.map((item) => (
          <li className={item.checked ? 'stage-widget-checklist-item stage-widget-checklist-item-checked' : 'stage-widget-checklist-item'} key={item.id}>
            <button className="stage-widget-checklist-button" onClick={() => onToggle?.(item.id)} type="button">
              <span className="stage-widget-checklist-box" aria-hidden="true">
                {item.checked ? 'Done' : ''}
              </span>
              <span className="stage-widget-checklist-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function createDefaultTextStyle(): StageTextStyle {
  return { ...defaultStageTextStyle }
}

function createDefaultImageStyle(): StageTextStyle {
  return {
    ...defaultStageTextStyle,
    backgroundColor: 'transparent',
    padding: 0,
    borderRadius: 0,
  }
}

function normalizeHexColor(value: string): string | null {
  if (typeof document === 'undefined') {
    return null
  }

  const probe = document.createElement('span')
  probe.style.color = ''
  probe.style.color = value
  if (!probe.style.color) {
    return null
  }

  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  document.body.removeChild(probe)
  const match = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) {
    return null
  }

  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
}

function getEffectiveImageStyle(style: StageTextStyle): { backgroundColor: string; padding: number; borderRadius: number } {
  const looksLikeLegacyDefault =
    style.backgroundColor === defaultStageTextStyle.backgroundColor &&
    style.padding === defaultStageTextStyle.padding &&
    style.borderRadius === defaultStageTextStyle.borderRadius

  if (looksLikeLegacyDefault || style.backgroundColor === 'transparent') {
    return { backgroundColor: 'transparent', padding: 0, borderRadius: 0 }
  }

  return {
    backgroundColor: style.backgroundColor,
    padding: style.padding,
    borderRadius: style.borderRadius,
  }
}

function getColorPickerSummaryName(value: string): string {
  if (value === 'transparent') {
    return 'Transparent'
  }

  const normalized = normalizeHexColor(value) ?? value
  const family = colorFamilies.find((entry) => entry.variants.includes(normalized))
  const colorName = colorVariantNames[normalized]
  if (family && colorName) {
    return `${family.label}: ${colorName}`
  }

  return 'Custom color'
}

function getColorVariantDisplayLabel(value: string): string {
  const normalized = normalizeHexColor(value) ?? value
  const family = colorFamilies.find((entry) => entry.variants.includes(normalized))
  const colorName = colorVariantNames[normalized]
  if (family && colorName) {
    return `${family.label}: ${colorName}`
  }

  if (colorName) {
    return colorName
  }

  return 'Custom color'
}

function hexToRgbParts(value: string): { red: string; green: string; blue: string } {
  const normalized = normalizeHexColor(value)
  if (!normalized) {
    return { red: '', green: '', blue: '' }
  }

  return {
    red: String(Number.parseInt(normalized.slice(1, 3), 16)),
    green: String(Number.parseInt(normalized.slice(3, 5), 16)),
    blue: String(Number.parseInt(normalized.slice(5, 7), 16)),
  }
}

function rgbPartsToHex(red: string, green: string, blue: string): string {
  const channels = [red, green, blue].map((part) => {
    const numeric = Number.parseInt(part || '0', 10)
    const clamped = Number.isFinite(numeric) ? Math.max(0, Math.min(255, numeric)) : 0
    return clamped.toString(16).padStart(2, '0')
  })
  return `#${channels.join('')}`
}

function isLinkedStageObject(object: StageObject | null): boolean {
  return Boolean(object && object.scope !== 'block' && object.syncKey)
}

function getStageObjectScopeLabel(object: StageObject): string {
  if (object.scope === 'day') {
    return 'Linked: this day'
  }
  if (object.scope === 'all-days') {
    return 'Linked: all slides'
  }
  return 'This slide'
}

function isWidgetType(type: StageObjectType): boolean {
  return type === 'date' || type === 'calendar' || type === 'weather' || type === 'weather-live' || type === 'checklist'
}

function getStageObjectDisplayName(type: StageObjectType): string {
  if (type === 'text') {
    return 'Text box'
  }
  if (type === 'note-card') {
    return 'Note card'
  }
  if (type === 'image') {
    return 'Picture'
  }
  if (type === 'youtube') {
    return 'YouTube video'
  }
  if (type === 'date') {
    return 'Date widget'
  }
  if (type === 'calendar') {
    return 'Calendar'
  }
  if (type === 'weather') {
    return 'Weather widget'
  }
  if (type === 'weather-live') {
    return 'Weather live'
  }
  return 'Checklist widget'
}

function renderBuilderPaletteIcon(type: StageObjectType | 'image-url' | 'image-file'): ReactNode {
  if (type === 'text') {
    return (
      <svg aria-hidden="true" className="builder-palette-card-glyph" viewBox="0 0 24 24">
        <path
          d="M6.8 6.5v2.1M17.2 6.5v2.1M6.5 6.5h11M12 6.5v10.9M8.8 17.4h6.4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.9"
        />
      </svg>
    )
  }
  if (type === 'note-card') {
    return (
      <svg aria-hidden="true" className="builder-palette-card-glyph" viewBox="0 0 24 24">
        <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 9.2h10M7 12.2h10M7 15.2h6.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      </svg>
    )
  }
  if (type === 'image-url') {
    return (
      <svg aria-hidden="true" className="builder-palette-card-glyph" viewBox="0 0 24 24">
        <rect x="4.5" y="5.5" width="10" height="10" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7.2 12.8l2.2-2.4 2.1 2 1.8-1.7 1 1M16.5 9.5h3m0 0v3m0-3-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    )
  }
  if (type === 'image-file') {
    return (
      <svg aria-hidden="true" className="builder-palette-card-glyph" viewBox="0 0 24 24">
        <path d="M8 4.8h6l3 3v11.4H8z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M14 4.8v3h3M10 14.2l1.8-2 1.8 1.7 1.5-1.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      </svg>
    )
  }
  if (type === 'youtube') {
    return (
      <svg aria-hidden="true" className="builder-palette-card-glyph" viewBox="0 0 24 24">
        <rect x="4.5" y="6.5" width="15" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10.2 9.6l5 2.9-5 2.9z" fill="currentColor" />
      </svg>
    )
  }
  if (type === 'date') {
    return (
      <svg aria-hidden="true" className="builder-palette-card-glyph" viewBox="0 0 24 24">
        <rect x="5" y="6" width="14" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 4.8v3M16 4.8v3M5 10h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        <circle cx="12" cy="14.2" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  }
  if (type === 'calendar') {
    return (
      <svg aria-hidden="true" className="builder-palette-card-glyph" viewBox="0 0 24 24">
        <rect x="4.8" y="5.5" width="14.4" height="13.6" rx="2.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.8 10h14.4M9.6 5v3M14.4 5v3M9 13h1.2M12 13h1.2M15 13h1.2M9 16h1.2M12 16h1.2M15 16h1.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      </svg>
    )
  }
  if (type === 'weather') {
    return (
      <svg aria-hidden="true" className="builder-palette-card-glyph" viewBox="0 0 24 24">
        <path d="M9 17.5h7a3 3 0 0 0 .4-6 4.5 4.5 0 0 0-8.7-1.2A3.3 3.3 0 0 0 9 17.5Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M7.2 7.2h0M12 4.8h0M16.8 7.2h0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      </svg>
    )
  }
  if (type === 'weather-live') {
    return (
      <svg aria-hidden="true" className="builder-palette-card-glyph" viewBox="0 0 24 24">
        <path d="M7.5 17.2h8a3.2 3.2 0 0 0 .5-6.3 4.7 4.7 0 0 0-9-1.1 3.5 3.5 0 0 0 .5 7.4Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M6.1 7.2 7.4 5.9M12 4.6v-1.3M17.9 7.2 16.6 5.9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        <path d="M12 18.8v2.1M8.2 18.1l-1 1.8M15.8 18.1l1 1.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" className="builder-palette-card-glyph" viewBox="0 0 24 24">
      <rect x="5" y="5.5" width="14" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.3 9.5h7.4M8.3 12.5h5.8M8.3 15.5h6.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <path d="M6.8 9.5h0M6.8 12.5h0M6.8 15.5h0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  )
}

function getStageObjectCategoryLabel(type: StageObjectType): 'Widget' | 'Object' {
  return isWidgetType(type) ? 'Widget' : 'Object'
}

function renderPrimaryNavGlyph(id: NavItem['id']): ReactNode {
  if (id === 'home') {
    return (
      <svg aria-hidden="true" className="nav-button-glyph" viewBox="0 0 24 24">
        <path d="M5.5 10.2 12 5l6.5 5.2v8.1H14v-4.4h-4v4.4H5.5z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    )
  }
  if (id === 'day-flow') {
    return (
      <svg aria-hidden="true" className="nav-button-glyph" viewBox="0 0 24 24">
        <path d="M6 6.5h12M6 11.8h12M6 17.1h8.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    )
  }
  if (id === 'builder') {
    return (
      <svg aria-hidden="true" className="nav-button-glyph" viewBox="0 0 24 24">
        <path d="M6 17.5h12M8.2 14.8l6.9-6.9 1.7 1.7-6.9 6.9-2.6.9z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" className="nav-button-glyph" viewBox="0 0 24 24">
      <rect x="5.5" y="6.5" width="13" height="11" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 9.3 15 12l-5 2.7z" fill="currentColor" />
    </svg>
  )
}

function renderTrashGlyph(): ReactNode {
  return (
    <svg aria-hidden="true" className="button-inline-glyph" viewBox="0 0 24 24">
      <path
        d="M9 4.75h6l.55 1.5H19a.75.75 0 0 1 0 1.5h-1l-.73 10.04A2.25 2.25 0 0 1 15.02 20H8.98a2.25 2.25 0 0 1-2.25-2.21L6 7.75H5a.75.75 0 0 1 0-1.5h3.45L9 4.75Zm-1.5 3 .72 9.93a.75.75 0 0 0 .75.72h6.06a.75.75 0 0 0 .75-.72l.72-9.93H7.5Zm2.75 2a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 .75-.75Zm3.5 0a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 .75-.75Z"
        fill="currentColor"
      />
    </svg>
  )
}

function createChecklistWidgetData(items?: string[]): string {
  const nextItems = (items ?? ['Arrival jobs', 'Morning meeting', 'Choice time']).map((label, index) => ({
    id: `checklist-item-${index + 1}`,
    label,
    checked: false,
  }))
  return JSON.stringify({ items: nextItems })
}

function parseChecklistWidgetData(value: string): ChecklistWidgetItem[] {
  if (!value.trim()) {
    return JSON.parse(createChecklistWidgetData()).items as ChecklistWidgetItem[]
  }

  try {
    const parsed = JSON.parse(value) as { items?: Array<Partial<ChecklistWidgetItem>> }
    if (Array.isArray(parsed.items) && parsed.items.length > 0) {
      return parsed.items.map((item, index) => ({
        id: typeof item.id === 'string' ? item.id : `checklist-item-${index + 1}`,
        label: typeof item.label === 'string' ? item.label : `Step ${index + 1}`,
        checked: Boolean(item.checked),
      }))
    }
  } catch {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const checked = /^\[(x|X)\]\s*/.test(line)
        return {
          id: `checklist-item-${index + 1}`,
          label: line.replace(/^\[(x|X| )\]\s*/, ''),
          checked,
        }
      })
  }

  return JSON.parse(createChecklistWidgetData()).items as ChecklistWidgetItem[]
}

function checklistItemsToEditorText(items: ChecklistWidgetItem[]): string {
  return items.map((item) => `${item.checked ? '[x]' : '[ ]'} ${item.label}`).join('\n')
}

function updateChecklistWidgetFromEditorText(value: string): string {
  const items = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      id: `checklist-item-${index + 1}`,
      label: line.replace(/^\[(x|X| )\]\s*/, ''),
      checked: /^\[(x|X)\]\s*/.test(line),
    }))

  return JSON.stringify({ items: items.length > 0 ? items : JSON.parse(createChecklistWidgetData()).items })
}

function createWeatherWidgetData(): string {
  return JSON.stringify({
    location: 'Classroom',
    condition: 'Sunny',
    temperature: '72°',
    detail: 'Warm and bright',
  } satisfies WeatherWidgetData)
}

function parseWeatherWidgetData(value: string): WeatherWidgetData {
  if (!value.trim()) {
    return JSON.parse(createWeatherWidgetData()) as WeatherWidgetData
  }

  try {
    const parsed = JSON.parse(value) as Partial<WeatherWidgetData>
    return {
      location: typeof parsed.location === 'string' ? parsed.location : 'Classroom',
      condition: typeof parsed.condition === 'string' ? parsed.condition : 'Sunny',
      temperature: typeof parsed.temperature === 'string' ? parsed.temperature : '72°',
      detail: typeof parsed.detail === 'string' ? parsed.detail : 'Warm and bright',
    }
  } catch {
    return JSON.parse(createWeatherWidgetData()) as WeatherWidgetData
  }
}

function createWeatherLiveWidgetData(): string {
  return JSON.stringify({
    provider: 'open-meteo',
    locationInput: '',
    detailLevel: 'standard',
    forecastMode: 'today-tomorrow',
    refreshMinutes: 30,
  } satisfies WeatherLiveWidgetData)
}

function parseWeatherLiveWidgetData(value: string): WeatherLiveWidgetData {
  if (!value.trim()) {
    return JSON.parse(createWeatherLiveWidgetData()) as WeatherLiveWidgetData
  }

  try {
    const parsed = JSON.parse(value) as Partial<WeatherLiveWidgetData>
    return {
      provider: 'open-meteo',
      locationInput:
        typeof parsed.locationInput === 'string'
          ? parsed.locationInput.trim().slice(0, 64)
          : typeof (parsed as { zipCode?: string }).zipCode === 'string'
            ? (parsed as { zipCode?: string }).zipCode!.replace(/[^\d]/g, '').slice(0, 5)
            : '',
      detailLevel:
        parsed.detailLevel === 'simple' || parsed.detailLevel === 'detailed'
          ? parsed.detailLevel
          : 'standard',
      forecastMode: parsed.forecastMode === 'current' ? 'current' : 'today-tomorrow',
      refreshMinutes:
        typeof parsed.refreshMinutes === 'number' && [15, 30, 60, 180].includes(parsed.refreshMinutes)
          ? parsed.refreshMinutes
          : 30,
    }
  } catch {
    return JSON.parse(createWeatherLiveWidgetData()) as WeatherLiveWidgetData
  }
}

function getWeatherLiveConfigKey(data: WeatherLiveWidgetData): string {
  return `${data.provider}|${data.locationInput.trim().toLowerCase()}|${data.detailLevel}|${data.forecastMode}|${data.refreshMinutes}`
}

type ParsedWeatherLocation =
  | { kind: 'zip'; normalizedInput: string; query: string }
  | { kind: 'city-state'; normalizedInput: string; query: string; stateCode: string; stateName: string; cityName: string }

function parseWeatherLiveLocationInput(input: string): ParsedWeatherLocation | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const zipMatch = trimmed.match(/^(\d{5})(?:-\d{4})?$/)
  if (zipMatch) {
    const zip = zipMatch[1]
    return { kind: 'zip', normalizedInput: zip, query: zip }
  }

  const cityStateMatch = trimmed.match(/^(.+?),\s*([A-Za-z]{2})$/)
  if (cityStateMatch) {
    const cityName = cityStateMatch[1].trim().replace(/\s+/g, ' ')
    const stateCode = cityStateMatch[2].toUpperCase()
    const stateName = usStateNameByCode[stateCode]
    if (!cityName || !stateName) {
      return null
    }

    return {
      kind: 'city-state',
      normalizedInput: `${cityName}, ${stateCode}`,
      query: `${cityName}, ${stateName}`,
      stateCode,
      stateName,
      cityName,
    }
  }

  return null
}

function getWeatherConditionLabelFromCode(code: number): string {
  if (code === 0) {
    return 'Clear'
  }
  if ([1, 2, 3].includes(code)) {
    return 'Cloudy'
  }
  if ([45, 48].includes(code)) {
    return 'Fog'
  }
  if ([51, 53, 55, 56, 57].includes(code)) {
    return 'Drizzle'
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return 'Rain'
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return 'Snow'
  }
  if ([95, 96, 99].includes(code)) {
    return 'Storm'
  }
  return 'Weather'
}

function getWeatherDetailLabelFromCode(code: number): string {
  if (code === 0) {
    return 'Clear skies'
  }
  if (code === 1) {
    return 'Mostly clear'
  }
  if (code === 2) {
    return 'Partly cloudy'
  }
  if (code === 3) {
    return 'Overcast'
  }
  if ([45, 48].includes(code)) {
    return 'Foggy'
  }
  if ([51, 53, 55, 56, 57].includes(code)) {
    return 'Light drizzle'
  }
  if ([61, 63, 65, 66, 67].includes(code)) {
    return 'Rain showers'
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return 'Snow showers'
  }
  if ([80, 81, 82].includes(code)) {
    return 'Passing rain'
  }
  if ([95, 96, 99].includes(code)) {
    return 'Thunderstorms'
  }
  return 'Updated forecast'
}

const weatherLiveRefreshOptions = [15, 30, 60, 180] as const
const usStateNameByCode: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
}

function formatWholeTemperature(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--'
  }

  return `${Math.round(value)}°`
}

async function fetchOpenMeteoWeatherSnapshot(locationInput: string): Promise<WeatherLiveSnapshot> {
  const parsedLocation = parseWeatherLiveLocationInput(locationInput)
  if (!parsedLocation) {
    throw new Error('Enter a 5-digit ZIP code or City, ST.')
  }
  const resolvedLocation = parsedLocation

  async function fetchZippopotamLocation() {
    const endpoint =
      resolvedLocation.kind === 'zip'
        ? `https://api.zippopotam.us/us/${resolvedLocation.normalizedInput}`
        : `https://api.zippopotam.us/us/${resolvedLocation.stateCode.toLowerCase()}/${encodeURIComponent(resolvedLocation.cityName)}`
    const response = await fetch(endpoint)
    if (!response.ok) {
      throw new Error('Could not find that location.')
    }

    const payload = (await response.json()) as {
      country?: string
      state?: string
      'state abbreviation'?: string
      'place name'?: string
      'post code'?: string
      places?: Array<{
        'place name'?: string
        longitude?: string
        latitude?: string
        state?: string
        'state abbreviation'?: string
        'post code'?: string
      }>
    }

    const firstPlace = payload.places?.find((place) => typeof place.latitude === 'string' && typeof place.longitude === 'string')
    if (!firstPlace) {
      throw new Error('Could not find that location.')
    }

    const latitude = Number(firstPlace.latitude)
    const longitude = Number(firstPlace.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error('Could not find that location.')
    }

    return {
      latitude,
      longitude,
      placeName: firstPlace['place name'] || payload['place name'] || resolvedLocation.normalizedInput,
      stateName: firstPlace.state || payload.state || (resolvedLocation.kind === 'city-state' ? resolvedLocation.stateName : ''),
      stateCode: firstPlace['state abbreviation'] || payload['state abbreviation'] || (resolvedLocation.kind === 'city-state' ? resolvedLocation.stateCode : ''),
      zipCode: firstPlace['post code'] || payload['post code'] || (resolvedLocation.kind === 'zip' ? resolvedLocation.normalizedInput : ''),
    }
  }

  const place = await fetchZippopotamLocation()

  const forecastResponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=2`,
  )
  if (!forecastResponse.ok) {
    throw new Error('Weather service is unavailable right now.')
  }

  const forecastPayload = (await forecastResponse.json()) as {
    current?: { temperature_2m?: number; weather_code?: number }
    daily?: {
      time?: string[]
      weather_code?: number[]
      temperature_2m_max?: number[]
      temperature_2m_min?: number[]
    }
  }

  const currentTemp = forecastPayload.current?.temperature_2m
  const currentCode = forecastPayload.current?.weather_code ?? forecastPayload.daily?.weather_code?.[0] ?? 0
  const todayHigh = forecastPayload.daily?.temperature_2m_max?.[0]
  const todayLow = forecastPayload.daily?.temperature_2m_min?.[0]
  const tomorrowHigh = forecastPayload.daily?.temperature_2m_max?.[1]
  const tomorrowLow = forecastPayload.daily?.temperature_2m_min?.[1]
  const cityLabel = [place.placeName, place.stateCode || place.stateName].filter(Boolean).join(', ')

  return {
    locationLabel:
      cityLabel || (resolvedLocation.kind === 'zip' ? `ZIP ${place.zipCode || resolvedLocation.normalizedInput}` : resolvedLocation.normalizedInput),
    currentTemperature: formatWholeTemperature(currentTemp),
    currentCondition: getWeatherConditionLabelFromCode(currentCode),
    currentDetail: getWeatherDetailLabelFromCode(currentCode),
    todayHighLow: `Today ${formatWholeTemperature(todayHigh)}/${formatWholeTemperature(todayLow)}`,
    tomorrowHighLow: `Tomorrow ${formatWholeTemperature(tomorrowHigh)}/${formatWholeTemperature(tomorrowLow)}`,
    updatedAt: Date.now(),
  }
}

function createCalendarWidgetData(): string {
  return JSON.stringify({
    mode: 'month',
  } satisfies CalendarWidgetData)
}

function parseCalendarWidgetData(value: string): CalendarWidgetData {
  if (!value.trim()) {
    return JSON.parse(createCalendarWidgetData()) as CalendarWidgetData
  }

  try {
    const parsed = JSON.parse(value) as Partial<CalendarWidgetData>
    return {
      mode: parsed.mode === 'week' ? 'week' : 'month',
    }
  } catch {
    return JSON.parse(createCalendarWidgetData()) as CalendarWidgetData
  }
}

function getCalendarMinimumSize(data: CalendarWidgetData): { width: number; height: number } {
  if (data.mode === 'week') {
    return { width: 42, height: 16 }
  }

  return { width: 42, height: 30 }
}

function getCalendarAspectRatio(data: CalendarWidgetData): number {
  return data.mode === 'week' ? 42 / 16 : 42 / 30
}

function getCalendarPreferredSize(data: CalendarWidgetData): { width: number; height: number } {
  return data.mode === 'week'
    ? { width: 52, height: getPercentHeightForPixelAspect(52, getCalendarAspectRatio(data)) }
    : { width: 46, height: getPercentHeightForPixelAspect(46, getCalendarAspectRatio(data)) }
}

function getDefaultWidgetData(type: StageObjectType): string {
  if (type === 'calendar') {
    return createCalendarWidgetData()
  }
  if (type === 'checklist') {
    return createChecklistWidgetData()
  }
  if (type === 'weather') {
    return createWeatherWidgetData()
  }
  if (type === 'weather-live') {
    return createWeatherLiveWidgetData()
  }
  return ''
}

function getDefaultWidgetLayoutPreset(type: StageObjectType): string {
  if (type === 'date' || type === 'calendar' || type === 'weather' || type === 'weather-live') {
    return 'auto'
  }
  if (type === 'checklist') {
    return 'stack'
  }
  return 'auto'
}

function renderTextStyleGlyphGroup<T extends string>({
  ariaLabel,
  onChange,
  options,
  value,
}: {
  ariaLabel: string
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; glyph: ReactNode }>
  value: T
}) {
  return (
    <div className="builder-text-style-option-grid" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          aria-label={option.label}
          className={value === option.value ? 'builder-text-style-icon-button builder-text-style-icon-button-active' : 'builder-text-style-icon-button'}
          key={option.value}
          onClick={() => onChange(option.value)}
          title={option.label}
          type="button"
        >
          <span aria-hidden="true" className="builder-text-style-icon-glyph">{option.glyph}</span>
        </button>
      ))}
    </div>
  )
}

function renderNumericStepper({
  ariaLabel,
  max,
  min,
  onChange,
  value,
}: {
  ariaLabel: string
  max: number
  min: number
  onChange: (value: number) => void
  value: number
}) {
  const handleInputChange = (nextValue: string) => {
    const parsed = Number(nextValue)
    if (Number.isNaN(parsed)) {
      return
    }
    onChange(Math.min(max, Math.max(min, parsed)))
  }

  return (
    <div className="builder-stepper" role="group" aria-label={ariaLabel}>
      <button
        aria-label={`Decrease ${ariaLabel.toLowerCase()}`}
        className="builder-stepper-button"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        type="button"
      >
        <span aria-hidden="true" className="builder-stepper-glyph">
          <svg viewBox="0 0 24 24">
            <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
          </svg>
        </span>
      </button>
      <input
        aria-label={`${ariaLabel} value`}
        className="builder-stepper-input"
        inputMode="numeric"
        max={max}
        min={min}
        onChange={(event) => handleInputChange(event.target.value)}
        type="number"
        value={value}
      />
      <button
        aria-label={`Increase ${ariaLabel.toLowerCase()}`}
        className="builder-stepper-button"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        type="button"
      >
        <span aria-hidden="true" className="builder-stepper-glyph">
          <svg viewBox="0 0 24 24">
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
          </svg>
        </span>
      </button>
    </div>
  )
}

function getTextDecorationValue(style: Pick<StageTextStyle, 'underline' | 'strikethrough'>): string {
  const decorations: string[] = []
  if (style.underline) {
    decorations.push('underline')
  }
  if (style.strikethrough) {
    decorations.push('line-through')
  }
  return decorations.length > 0 ? decorations.join(' ') : 'none'
}

function TextStyleControls({ style, onChange }: { style: StageTextStyle; onChange: TextStyleChangeHandler }) {
  const isBold = Number(style.fontWeight) >= 700
  const [textOptionsCollapsed, setTextOptionsCollapsed] = useState(false)
  const [boxOptionsCollapsed, setBoxOptionsCollapsed] = useState(false)

  return (
    <div className="builder-text-style-grid">
      <div className="builder-section-join">
        {renderBuilderSectionToggleRow({
          collapsed: textOptionsCollapsed,
          label: 'Text options',
          onToggle: () => setTextOptionsCollapsed((current) => !current),
        })}
        <div className={textOptionsCollapsed ? 'builder-section-body builder-section-body-collapsed' : 'builder-section-body'}>
          <label className="field">
            <span>Text size</span>
            {renderNumericStepper({ ariaLabel: 'Text size', min: 18, max: 72, value: style.fontSize, onChange: (value) => onChange('fontSize', value) })}
          </label>
          <div className="field">
            <span>Text tools</span>
            <div className="builder-text-style-tool-cluster">
              <div className="builder-text-style-main-tools">
                <div className="builder-text-style-option-grid" role="group" aria-label="Text decoration">
                  <button
                    aria-label="Bold"
                    className={isBold ? 'builder-text-style-icon-button builder-text-style-icon-button-active' : 'builder-text-style-icon-button'}
                    onClick={() => onChange('fontWeight', isBold ? 400 : 700)}
                    title="Bold"
                    type="button"
                  >
                    <span aria-hidden="true" className="builder-text-style-icon-glyph">
                      <span style={{ fontWeight: 700 }}>B</span>
                    </span>
                  </button>
                  <button
                    aria-label="Italic"
                    className={style.fontStyle === 'italic' ? 'builder-text-style-icon-button builder-text-style-icon-button-active' : 'builder-text-style-icon-button'}
                    onClick={() => onChange('fontStyle', style.fontStyle === 'italic' ? 'normal' : 'italic')}
                    title="Italic"
                    type="button"
                  >
                    <span aria-hidden="true" className="builder-text-style-icon-glyph">
                      <span style={{ fontStyle: 'italic', fontWeight: 600 }}>I</span>
                    </span>
                  </button>
                  <button
                    aria-label="Underline"
                    className={style.underline ? 'builder-text-style-icon-button builder-text-style-icon-button-active' : 'builder-text-style-icon-button'}
                    onClick={() => onChange('underline', !style.underline)}
                    title="Underline"
                    type="button"
                  >
                    <span aria-hidden="true" className="builder-text-style-icon-glyph">
                      <span style={{ textDecoration: 'underline', fontWeight: 600 }}>U</span>
                    </span>
                  </button>
                  <button
                    aria-label="Strikethrough"
                    className={style.strikethrough ? 'builder-text-style-icon-button builder-text-style-icon-button-active' : 'builder-text-style-icon-button'}
                    onClick={() => onChange('strikethrough', !style.strikethrough)}
                    title="Strikethrough"
                    type="button"
                  >
                    <span aria-hidden="true" className="builder-text-style-icon-glyph">
                      <span style={{ textDecoration: 'line-through', fontWeight: 600 }}>S</span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="builder-text-style-align-tools">
                {renderTextStyleGlyphGroup({
                  ariaLabel: 'Text alignment',
                  onChange: (value) => onChange('textAlign', value),
                  value: style.textAlign,
                  options: [
                    {
                      value: 'left',
                      label: 'Left align',
                      glyph: (
                        <svg viewBox="0 0 24 24">
                          <path d="M5 7h12M5 11h9M5 15h12M5 19h8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                        </svg>
                      ),
                    },
                    {
                      value: 'center',
                      label: 'Center align',
                      glyph: (
                        <svg viewBox="0 0 24 24">
                          <path d="M6 7h12M8 11h8M6 15h12M8 19h8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                        </svg>
                      ),
                    },
                    {
                      value: 'right',
                      label: 'Right align',
                      glyph: (
                        <svg viewBox="0 0 24 24">
                          <path d="M7 7h12M10 11h9M7 15h12M11 19h8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                        </svg>
                      ),
                    },
                  ],
                })}
              </div>
            </div>
          </div>
          <ColorPickerField allowTransparent={false} label="Text color" onChange={(value) => onChange('color', value)} value={style.color} />
        </div>
      </div>
      <div className="builder-section-join">
        {renderBuilderSectionToggleRow({
          collapsed: boxOptionsCollapsed,
          label: 'Box options',
          onToggle: () => setBoxOptionsCollapsed((current) => !current),
        })}
        <div className={boxOptionsCollapsed ? 'builder-section-body builder-section-body-collapsed' : 'builder-section-body'}>
          <ColorPickerField allowTransparent={true} label="Box color" onChange={(value) => onChange('backgroundColor', value)} value={style.backgroundColor} />
          <label className="field">
            <span>Padding</span>
            {renderNumericStepper({ ariaLabel: 'Padding', min: 4, max: 32, value: style.padding, onChange: (value) => onChange('padding', value) })}
          </label>
          <label className="field">
            <span>Corners</span>
            {renderNumericStepper({ ariaLabel: 'Corners', min: 0, max: 36, value: style.borderRadius, onChange: (value) => onChange('borderRadius', value) })}
          </label>
        </div>
      </div>
    </div>
  )
}

function renderBuilderSectionToggleRow({
  collapsed,
  label,
  onToggle,
}: {
  collapsed: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <div
      className="builder-section-toggle-row"
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('button')) {
          return
        }
        onToggle()
      }}
    >
      <span>{label}</span>
      <button
        aria-expanded={!collapsed}
        className="builder-section-toggle-button"
        onClick={onToggle}
        type="button"
      >
        <span
          aria-hidden="true"
          className={collapsed ? 'builder-section-toggle-caret' : 'builder-section-toggle-caret builder-section-toggle-caret-open'}
        >
          ▸
        </span>
        <span className="sr-only">{collapsed ? `Expand ${label}` : `Collapse ${label}`}</span>
      </button>
    </div>
  )
}

function ColorPickerField({
  label,
  value,
  onChange,
  allowTransparent,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  allowTransparent: boolean
}) {
  const normalizedValue = value === 'transparent' ? 'transparent' : normalizeHexColor(value) ?? '#ffffff'
  const [activeFamily, setActiveFamily] = useState<string>(() => {
    const family = colorFamilies.find((entry) => entry.variants.includes(normalizedValue))
    return family?.id ?? 'neutral'
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [manualDraft, setManualDraft] = useState(normalizedValue)
  const rgbParts = normalizedValue === 'transparent' ? { red: '', green: '', blue: '' } : hexToRgbParts(normalizedValue)

  const availableFamilies = [...colorFamilies, { id: 'full', label: 'Full', variants: colorFamilies.flatMap((entry) => entry.variants) }]
  const selectedFamily = availableFamilies.find((entry) => entry.id === activeFamily) ?? availableFamilies.find((entry) => entry.id === 'neutral') ?? availableFamilies[0]
  const supportsEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window

  async function openEyeDropper() {
    if (!supportsEyeDropper) {
      return
    }

    const EyeDropperCtor = (window as Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
    if (!EyeDropperCtor) {
      return
    }

    try {
      const picker = new EyeDropperCtor()
      const result = await picker.open()
      onChange(result.sRGBHex)
      setManualDraft(result.sRGBHex)
    } catch {
      // user cancelled
    }
  }

  return (
    <div className="field color-field">
      <span>{label}</span>
      <button
        className="color-picker-current color-picker-trigger"
        onClick={() => {
          setManualDraft(normalizedValue)
          if (label === 'Text color') {
            setActiveFamily('black')
          } else {
            const matchingFamily = colorFamilies.find((entry) => entry.variants.includes(normalizedValue))
            if (matchingFamily) {
              setActiveFamily(matchingFamily.id)
            }
          }
          setPickerOpen((current) => !current)
        }}
        type="button"
      >
        <span className="color-picker-swatch" style={{ background: normalizedValue === 'transparent' ? 'linear-gradient(135deg, rgba(117, 101, 80, 0.18) 25%, transparent 25%, transparent 50%, rgba(117, 101, 80, 0.18) 50%, rgba(117, 101, 80, 0.18) 75%, transparent 75%, transparent)' : normalizedValue }} />
        <div className="color-picker-current-copy">
          <strong>{getColorPickerSummaryName(normalizedValue)}</strong>
        </div>
      </button>
      {pickerOpen && (
        <div className="color-picker-popover">
          <div className="color-family-row" role="tablist" aria-label={`${label} families`}>
            {availableFamilies.map((family) => (
              <button
                className={family.id === activeFamily ? `toggle-chip color-family-chip color-family-chip-${family.id} toggle-chip-active` : `toggle-chip color-family-chip color-family-chip-${family.id}`}
                key={family.id}
                onClick={() => setActiveFamily(family.id)}
                type="button"
              >
                {family.label}
              </button>
            ))}
          </div>
          <div className="color-variant-row">
            {selectedFamily.variants.map((variant) => (
              <button
                aria-label={`${label} ${getColorVariantDisplayLabel(variant)}`}
                className={normalizedValue === variant ? 'color-variant-button color-variant-button-active' : 'color-variant-button'}
                key={variant}
                onClick={() => {
                  onChange(variant)
                  setManualDraft(variant)
                }}
                style={{ background: variant }}
                title={getColorVariantDisplayLabel(variant)}
                type="button"
              />
            ))}
            {allowTransparent && (
              <button
                className={normalizedValue === 'transparent' ? 'color-variant-button color-variant-button-active color-variant-button-transparent' : 'color-variant-button color-variant-button-transparent'}
                onClick={() => {
                  onChange('transparent')
                  setManualDraft('transparent')
                }}
                type="button"
              >
                None
              </button>
            )}
          </div>
          <div className="builder-inline-actions color-picker-actions">
            {supportsEyeDropper && (
              <button className="secondary-button" onClick={() => void openEyeDropper()} type="button">
                Eyedropper
              </button>
            )}
            <label className="field color-manual-field">
              <span>HEX</span>
              <input
                onChange={(event) => setManualDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') {
                    return
                  }
                  event.preventDefault()
                  const nextValue = manualDraft.trim()
                  if (!nextValue) {
                    return
                  }
                  const normalized = nextValue.toLowerCase() === 'transparent' ? 'transparent' : normalizeHexColor(nextValue)
                  if (normalized) {
                    onChange(normalized)
                    setManualDraft(normalized)
                  }
                }}
                onBlur={() => {
                  const nextValue = manualDraft.trim()
                  if (!nextValue) {
                    return
                  }
                  const normalized = nextValue.toLowerCase() === 'transparent' ? 'transparent' : normalizeHexColor(nextValue)
                  if (normalized) {
                    onChange(normalized)
                    setManualDraft(normalized)
                  }
                }}
                value={manualDraft}
              />
            </label>
            <div className="color-rgb-group">
              <label className="field color-rgb-field">
                <span>R</span>
                <input
                  inputMode="numeric"
                  maxLength={3}
                  onChange={(event) => {
                    onChange(rgbPartsToHex(event.target.value, rgbParts.green, rgbParts.blue))
                  }}
                  value={rgbParts.red}
                />
              </label>
              <label className="field color-rgb-field">
                <span>G</span>
                <input
                  inputMode="numeric"
                  maxLength={3}
                  onChange={(event) => {
                    onChange(rgbPartsToHex(rgbParts.red, event.target.value, rgbParts.blue))
                  }}
                  value={rgbParts.green}
                />
              </label>
              <label className="field color-rgb-field">
                <span>B</span>
                <input
                  inputMode="numeric"
                  maxLength={3}
                  onChange={(event) => {
                    onChange(rgbPartsToHex(rgbParts.red, rgbParts.green, event.target.value))
                  }}
                  value={rgbParts.blue}
                />
              </label>
            </div>
            <p className="color-manual-note">Manual color: use hex or enter red, green, and blue values.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function renderWidgetTemplateCards<T extends string>(
  current: T,
  options: Array<{ id: T; label: string; previewClass: string }>,
  onSelect: (id: T) => void,
) {
  return (
    <div className="builder-widget-template-grid">
      {options.map((option) => (
        <button
          key={option.id}
          className={option.id === current ? 'builder-widget-template builder-widget-template-active' : 'builder-widget-template'}
          onClick={() => onSelect(option.id)}
          type="button"
        >
          <span className={`builder-widget-template-preview ${option.previewClass}`} aria-hidden="true" />
          <span className="builder-widget-template-label">{option.label}</span>
        </button>
      ))}
    </div>
  )
}

function createStageObjectId(blockId: string, type: StageObjectType): string {
  return `${blockId}-${type}-${Date.now()}-${Math.round(Math.random() * 1000)}`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Could not load image dimensions'))
    image.src = src
  })
}

function getImageObjectSize(width: number, height: number): { width: number; height: number } {
  const safeWidth = Math.max(width, 1)
  const safeHeight = Math.max(height, 1)
  const aspectRatio = safeWidth / safeHeight

  let nextWidth = 32
  let nextHeight = nextWidth / aspectRatio

  if (nextHeight > 30) {
    nextHeight = 30
    nextWidth = nextHeight * aspectRatio
  }

  if (nextWidth > 44) {
    nextWidth = 44
    nextHeight = nextWidth / aspectRatio
  }

  return {
    width: Math.max(nextWidth, 18),
    height: Math.max(nextHeight, 14),
  }
}

function measureTextObjectHeight(widthPercent: number, text: string, style: StageTextStyle): number | null {
  if (typeof document === 'undefined') {
    return null
  }

  const widthPx = Math.max((REFERENCE_STAGE_WIDTH * widthPercent) / 100, 80)
  const shell = document.createElement('div')
  shell.className = 'stage-object-text-shell'
  shell.style.position = 'absolute'
  shell.style.left = '-10000px'
  shell.style.top = '0'
  shell.style.width = `${widthPx}px`
  shell.style.height = 'auto'
  shell.style.overflow = 'visible'
    Object.assign(shell.style, {
      color: style.color,
      background: style.backgroundColor,
      padding: `${style.padding}px`,
      borderRadius: `${style.borderRadius}px`,
      fontSize: `${style.fontSize}px`,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      textAlign: style.textAlign,
      textDecoration: getTextDecorationValue(style),
      lineHeight: String(style.lineHeight),
      fontFamily: 'inherit',
      whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  })

  const paragraph = document.createElement('p')
  paragraph.className = 'stage-object-text'
  paragraph.textContent = text || ' '
  paragraph.style.whiteSpace = 'pre-wrap'
  paragraph.style.overflowWrap = 'anywhere'
  paragraph.style.wordBreak = 'break-word'
  paragraph.style.textAlign = style.textAlign
  paragraph.style.textDecoration = getTextDecorationValue(style)
  shell.appendChild(paragraph)
  document.body.appendChild(shell)
  const measuredHeight = shell.getBoundingClientRect().height
  document.body.removeChild(shell)

  const paddedHeight = measuredHeight + Math.max(style.fontSize * style.lineHeight * 0.45, style.padding * 0.8, 10)
  return Math.max((paddedHeight / REFERENCE_STAGE_HEIGHT) * 100, 8)
}

function measureChecklistObjectHeight(widthPercent: number, items: ChecklistWidgetItem[], style: StageTextStyle): number | null {
  if (typeof document === 'undefined') {
    return null
  }

  const shell = document.createElement('div')
  shell.style.position = 'absolute'
  shell.style.left = '-10000px'
  shell.style.top = '0'
  shell.style.width = `${(widthPercent / 100) * REFERENCE_STAGE_WIDTH}px`
  shell.style.boxSizing = 'border-box'
  shell.style.padding = `${style.padding}px`
  shell.style.borderRadius = `${style.borderRadius}px`
  shell.style.background = style.backgroundColor
  shell.style.fontSize = `${style.fontSize}px`
  shell.style.fontWeight = style.fontWeight
  shell.style.fontStyle = style.fontStyle
  shell.style.textDecoration = getTextDecorationValue(style)
  shell.style.lineHeight = String(style.lineHeight)
  shell.style.color = style.color

  const list = document.createElement('div')
  list.style.display = 'grid'
  list.style.rowGap = '8px'

  const labels = items.length > 0 ? items : [{ id: 'placeholder', label: 'New item', checked: false }]
  labels.forEach((item) => {
    const row = document.createElement('div')
    row.style.display = 'grid'
    row.style.gridTemplateColumns = '16px minmax(0, 1fr)'
    row.style.columnGap = '9px'
    row.style.alignItems = 'start'

    const box = document.createElement('span')
    box.style.display = 'inline-grid'
    box.style.width = '16px'
    box.style.minWidth = '16px'
    box.style.aspectRatio = '1'
    box.style.border = '2px solid currentColor'
    box.style.borderRadius = '6px'

    const label = document.createElement('span')
    label.textContent = item.label || 'New item'
    label.style.display = 'block'
    label.style.whiteSpace = 'pre-wrap'
    label.style.overflowWrap = 'anywhere'
    label.style.wordBreak = 'break-word'

    row.appendChild(box)
    row.appendChild(label)
    list.appendChild(row)
  })

  shell.appendChild(list)
  document.body.appendChild(shell)
  const measuredHeight = shell.getBoundingClientRect().height
  document.body.removeChild(shell)

  const paddedHeight = measuredHeight + Math.max(style.fontSize * style.lineHeight * 0.2, 6)
  return Math.max((paddedHeight / REFERENCE_STAGE_HEIGHT) * 100, 10)
}

function syncAutoHeightForTextObject(object: StageObject) {
  if (object.type !== 'text' && object.type !== 'note-card' && object.type !== 'checklist') {
    return
  }

  const measuredHeight =
    object.type === 'checklist'
      ? measureChecklistObjectHeight(object.width, parseChecklistWidgetData(object.widgetData), object.textStyle)
      : measureTextObjectHeight(object.width, object.text, object.textStyle)

  if (measuredHeight !== null) {
    object.height = Math.min(Math.max(measuredHeight, 10), 100 - object.y)
  }
}

async function importImageUrlAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`)
  }

  const blob = await response.blob()
  return readFileAsDataUrl(new File([blob], 'imported-image', { type: blob.type || 'image/png' }))
}

function getObjectPointerMode(event: ReactPointerEvent<HTMLElement>, objectType?: StageObjectType): ObjectDragSession['mode'] {
  const bounds = event.currentTarget.getBoundingClientRect()
  const edgeSize = Math.min(18, Math.max(bounds.width, bounds.height) * 0.12)
  const nearLeft = event.clientX - bounds.left <= edgeSize
  const nearRight = bounds.right - event.clientX <= edgeSize
  const nearTop = event.clientY - bounds.top <= edgeSize
  const nearBottom = bounds.bottom - event.clientY <= edgeSize

  if (objectType === 'text') {
    if (nearLeft) {
      return 'resize-w'
    }
    if (nearRight) {
      return 'resize-e'
    }
    return 'move'
  }

  if (nearTop && nearLeft) {
    return 'resize-nw'
  }
  if (nearTop && nearRight) {
    return 'resize-ne'
  }
  if (nearBottom && nearLeft) {
    return 'resize-sw'
  }
  if (nearBottom && nearRight) {
    return 'resize-se'
  }
  if (nearTop) {
    return 'resize-n'
  }
  if (nearBottom) {
    return 'resize-s'
  }
  if (nearLeft) {
    return 'resize-w'
  }
  if (nearRight) {
    return 'resize-e'
  }

  return 'move'
}

function getObjectPointerCursor(event: ReactPointerEvent<HTMLElement>, objectType?: StageObjectType): string {
  const mode = getObjectPointerMode(event, objectType)
  if (mode === 'resize-n' || mode === 'resize-s') {
    return 'ns-resize'
  }
  if (mode === 'resize-e' || mode === 'resize-w') {
    return 'ew-resize'
  }
  if (mode === 'resize-ne' || mode === 'resize-sw') {
    return 'nesw-resize'
  }
  if (mode === 'resize-nw' || mode === 'resize-se') {
    return 'nwse-resize'
  }

  return 'grab'
}

function getStageDeltaPercent(pointerDelta: number, axis: 'x' | 'y', bounds: DOMRect | undefined): number {
  const referenceSize =
    axis === 'x'
      ? Math.max(bounds?.width ?? Math.max(window.innerWidth * 0.32, 320), 1)
      : Math.max(bounds?.height ?? 520, 1)
  return (pointerDelta / referenceSize) * 100
}

function getRatioLockedElementRule(): RatioLockRule | null {
  return null
}

function getRatioLockedObjectRule(object: StageObject): RatioLockRule | null {
  if (object.type === 'image') {
    return object.height > 0 ? { aspectRatio: object.width / object.height, canOverrideWithShift: true } : null
  }

  if (object.type === 'youtube') {
    return { aspectRatio: toStagePercentAspectRatio(YOUTUBE_ASPECT_RATIO), canOverrideWithShift: false }
  }

  if (object.type === 'calendar') {
    return { aspectRatio: toStagePercentAspectRatio(getCalendarAspectRatio(parseCalendarWidgetData(object.widgetData))), canOverrideWithShift: false }
  }

  return null
}

function getMinimumStageElementSize(elementId: StageElementId): { width: number; height: number } {
  if (elementId === 'timer') {
    return { width: 18, height: 8 }
  }
  if (elementId === 'clock') {
    return { width: 14, height: 10 }
  }
  return { width: 14, height: 10 }
}

function resizeRect(
  origin: { x: number; y: number; width: number; height: number },
  mode: ObjectResizeMode,
  deltaX: number,
  deltaY: number,
  minimumWidth: number,
  minimumHeight: number,
  ratioRule: RatioLockRule | null,
  unlockRatio: boolean,
): { x: number; y: number; width: number; height: number } {
  const minX = 0
  const minY = 0
  const maxX = 100
  const maxY = 100
  const aspectRatio = ratioRule && !(unlockRatio && ratioRule.canOverrideWithShift) ? ratioRule.aspectRatio : null
  if (!aspectRatio || mode === 'move') {
    let nextX = origin.x
    let nextY = origin.y
    let nextWidth = origin.width
    let nextHeight = origin.height

    if (mode === 'resize-e' || mode === 'resize-ne' || mode === 'resize-se') {
      nextWidth = origin.width + deltaX
    }
    if (mode === 'resize-s' || mode === 'resize-se' || mode === 'resize-sw') {
      nextHeight = origin.height + deltaY
    }
    if (mode === 'resize-w' || mode === 'resize-nw' || mode === 'resize-sw') {
      nextX = origin.x + deltaX
      nextWidth = origin.width - deltaX
    }
    if (mode === 'resize-n' || mode === 'resize-ne' || mode === 'resize-nw') {
      nextY = origin.y + deltaY
      nextHeight = origin.height - deltaY
    }

    if (nextWidth < minimumWidth) {
      if (mode === 'resize-w' || mode === 'resize-nw' || mode === 'resize-sw') {
        nextX -= minimumWidth - nextWidth
      }
      nextWidth = minimumWidth
    }

    if (nextHeight < minimumHeight) {
      if (mode === 'resize-n' || mode === 'resize-ne' || mode === 'resize-nw') {
        nextY -= minimumHeight - nextHeight
      }
      nextHeight = minimumHeight
    }

    if (nextX < minX) {
      nextWidth -= minX - nextX
      nextX = minX
    }
    if (nextY < minY) {
      nextHeight -= minY - nextY
      nextY = minY
    }

    nextWidth = Math.min(nextWidth, maxX - nextX)
    nextHeight = Math.min(nextHeight, maxY - nextY)

    return {
      x: nextX,
      y: nextY,
      width: Math.max(nextWidth, minimumWidth),
      height: Math.max(nextHeight, minimumHeight),
    }
  }

  const lockedMinimumWidth = Math.max(minimumWidth, minimumHeight * aspectRatio)
  const lockedMinimumHeight = lockedMinimumWidth / aspectRatio
  const includesWest = mode === 'resize-w' || mode === 'resize-nw' || mode === 'resize-sw'
  const includesEast = mode === 'resize-e' || mode === 'resize-ne' || mode === 'resize-se'
  const includesNorth = mode === 'resize-n' || mode === 'resize-ne' || mode === 'resize-nw'
  const includesSouth = mode === 'resize-s' || mode === 'resize-se' || mode === 'resize-sw'
  let nextX = origin.x
  let nextY = origin.y
  let nextWidth = origin.width
  let nextHeight = origin.height

  if ((includesWest || includesEast) && (includesNorth || includesSouth)) {
    const widthFromHorizontal = includesWest ? origin.width - deltaX : origin.width + deltaX
    const heightFromVertical = includesNorth ? origin.height - deltaY : origin.height + deltaY
    const horizontalStrength = Math.abs(deltaX / Math.max(origin.width, 1))
    const verticalStrength = Math.abs(deltaY / Math.max(origin.height, 1))

    if (horizontalStrength >= verticalStrength) {
      nextWidth = Math.max(widthFromHorizontal, lockedMinimumWidth)
      nextHeight = nextWidth / aspectRatio
    } else {
      nextHeight = Math.max(heightFromVertical, lockedMinimumHeight)
      nextWidth = nextHeight * aspectRatio
    }

    nextX = includesWest ? origin.x + (origin.width - nextWidth) : origin.x
    nextY = includesNorth ? origin.y + (origin.height - nextHeight) : origin.y
  } else if (includesWest || includesEast) {
    nextWidth = Math.max((includesWest ? origin.width - deltaX : origin.width + deltaX), lockedMinimumWidth)
    nextHeight = nextWidth / aspectRatio
    nextX = includesWest ? origin.x + (origin.width - nextWidth) : origin.x
    nextY = origin.y
  } else if (includesNorth || includesSouth) {
    nextHeight = Math.max((includesNorth ? origin.height - deltaY : origin.height + deltaY), lockedMinimumHeight)
    nextWidth = nextHeight * aspectRatio
    nextY = includesNorth ? origin.y + (origin.height - nextHeight) : origin.y
    nextX = origin.x
  }

  if (nextX < minX) {
    nextWidth -= minX - nextX
    nextX = minX
    nextHeight = nextWidth / aspectRatio
  }
  if (nextY < minY) {
    nextHeight -= minY - nextY
    nextY = minY
    nextWidth = nextHeight * aspectRatio
  }
  if (nextX + nextWidth > maxX) {
    nextWidth = maxX - nextX
    nextHeight = nextWidth / aspectRatio
  }
  if (nextY + nextHeight > maxY) {
    nextHeight = maxY - nextY
    nextWidth = nextHeight * aspectRatio
  }

  nextWidth = Math.max(nextWidth, lockedMinimumWidth)
  nextHeight = Math.max(nextHeight, lockedMinimumHeight)

  if (nextX + nextWidth > maxX) {
    nextWidth = maxX - nextX
    nextHeight = nextWidth / aspectRatio
  }
  if (nextY + nextHeight > maxY) {
    nextHeight = maxY - nextY
    nextWidth = nextHeight * aspectRatio
  }

  return {
    x: Math.max(nextX, minX),
    y: Math.max(nextY, minY),
    width: nextWidth,
    height: nextHeight,
  }
}

function extractUrlFromEmbedHtml(value: string): string {
  const match = value.match(/src=["']([^"']+)["']/i)
  return match?.[1] ?? value
}

type YouTubeWindow = Window &
  typeof globalThis & {
    YT?: {
      Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayerInstance
    }
    onYouTubeIframeAPIReady?: () => void
  }

type YouTubePlayerInstance = {
  destroy?: () => void
  mute?: () => void
  playVideo?: () => void
  getPlayerState?: () => number
  getVideoLoadedFraction?: () => number
}

function normalizeYouTubeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  const maybeUrl = extractUrlFromEmbedHtml(trimmed)

  try {
    const url = new URL(maybeUrl)
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const videoId = url.pathname.split('/').filter(Boolean)[0]
      return videoId ? `https://www.youtube.com/embed/${videoId}` : trimmed
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') {
        const videoId = url.searchParams.get('v')
        return videoId ? `https://www.youtube.com/embed/${videoId}` : trimmed
      }

      if (url.pathname.startsWith('/embed/')) {
        const videoId = url.pathname.split('/').filter(Boolean)[1]
        return videoId ? `https://www.youtube.com/embed/${videoId}` : trimmed
      }

      if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/live/')) {
        const videoId = url.pathname.split('/').filter(Boolean)[1]
        return videoId ? `https://www.youtube.com/embed/${videoId}` : trimmed
      }
    }
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return `https://www.youtube.com/embed/${trimmed}`
    }

    return trimmed
  }

  return trimmed
}

function extractYouTubeVideoId(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed
  }

  try {
    const url = new URL(extractUrlFromEmbedHtml(trimmed))
    const host = url.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] ?? null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v')
      }

      if (url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/live/')) {
        return url.pathname.split('/').filter(Boolean)[1] ?? null
      }
    }
  } catch {
    return null
  }

  return null
}

function createYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

function createYouTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

function loadYouTubeIframeApi(): Promise<unknown> {
  if (youtubeApiPromise) {
    return youtubeApiPromise
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    const youtubeWindow = window as YouTubeWindow
    if (youtubeWindow.YT?.Player) {
      resolve(youtubeWindow.YT)
      return
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-youtube-iframe-api="true"]')
    if (!existingScript) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.dataset.youtubeIframeApi = 'true'
      script.onerror = () => reject(new Error('Failed to load YouTube API'))
      document.head.appendChild(script)
    }

    youtubeWindow.onYouTubeIframeAPIReady = () => resolve(youtubeWindow.YT)
  })

  return youtubeApiPromise
}

type YouTubePlayerErrorEvent = {
  data?: number
}

type YouTubeAvailabilityResult = {
  status: 'playable' | 'fallback' | 'unknown'
  errorCode: number | null
}

function probeYouTubePlayback(src: string): Promise<YouTubeAvailabilityResult> {
  const videoId = extractYouTubeVideoId(src)
  if (!videoId) {
    return Promise.resolve({ status: 'fallback', errorCode: null })
  }

  return new Promise((resolve) => {
    const host = document.createElement('div')
    host.style.position = 'fixed'
    host.style.left = '0'
    host.style.top = '0'
    host.style.width = '480px'
    host.style.height = '270px'
    host.style.pointerEvents = 'none'
    host.style.opacity = '0.01'
    host.style.zIndex = '-1'
    document.body.appendChild(host)

    let settled = false
    let playerInstance: YouTubePlayerInstance | null = null

    function finish(result: YouTubeAvailabilityResult) {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeout)
      playerInstance?.destroy?.()
      host.remove()
      resolve(result)
    }

    const timeout = window.setTimeout(() => {
      finish({ status: 'unknown', errorCode: null })
    }, 4500)

    loadYouTubeIframeApi()
      .then((api) => {
        const youtubeApi = api as NonNullable<YouTubeWindow['YT']>
        playerInstance = new youtubeApi.Player(host, {
          videoId,
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin !== 'null' ? window.location.origin : undefined,
          },
          events: {
            onReady: () => {
              try {
                playerInstance?.mute?.()
                playerInstance?.playVideo?.()
              } catch {
                // ignore; probe will continue via state/error/timeout
              }

              const checkLoaded = window.setInterval(() => {
                const loadedFraction = playerInstance?.getVideoLoadedFraction?.() ?? 0
                if (loadedFraction > 0) {
                  window.clearInterval(checkLoaded)
                  finish({ status: 'playable', errorCode: null })
                }
                if (settled) {
                  window.clearInterval(checkLoaded)
                }
              }, 400)
            },
            onStateChange: (event: YouTubePlayerErrorEvent) => {
              if (event.data === 1 || event.data === 3) {
                finish({ status: 'playable', errorCode: null })
              }
            },
            onError: (event: YouTubePlayerErrorEvent) =>
              finish({
                status: 'fallback',
                errorCode: typeof event.data === 'number' ? event.data : null,
              }),
          },
        })
      })
      .catch(() => finish({ status: 'unknown', errorCode: null }))
  })
}

type YouTubeFallbackCardProps = {
  src: string
  mode: 'display' | 'builder' | 'thumbnail'
  reason: 'checking' | 'ready' | 'fallback' | 'unknown'
  errorCode?: number | null
}

type YouTubePreviewCardProps = {
  src: string
  mode: 'display' | 'builder' | 'thumbnail'
  reason: 'checking' | 'ready' | 'fallback' | 'unknown'
  onPlay?: () => void
}

function YouTubePreviewCard({ src, mode, reason, onPlay }: YouTubePreviewCardProps) {
  const videoId = extractYouTubeVideoId(src)
  const watchUrl = videoId ? createYouTubeWatchUrl(videoId) : ''
  const thumbnailUrl = videoId ? createYouTubeThumbnailUrl(videoId) : ''
  const badge =
    reason === 'ready'
      ? 'Ready'
      : reason === 'unknown'
        ? 'Preview'
        : reason === 'checking'
          ? 'Checking'
          : 'Open'

  if (!videoId) {
    return <span className="stage-object-placeholder">Paste a YouTube link</span>
  }

  const content = (
    <div className={`youtube-preview-card youtube-preview-card-${mode}`}>
      <img alt="" className="youtube-preview-image" src={thumbnailUrl} />
      <div className="youtube-preview-overlay">
        <span className="youtube-preview-badge">{badge}</span>
        <span className="youtube-preview-play" aria-hidden="true">
          Play
        </span>
      </div>
    </div>
  )

  if (onPlay) {
    return (
      <button
        className="youtube-preview-button"
        onClick={(event) => {
          event.stopPropagation()
          onPlay()
        }}
        type="button"
      >
        {content}
      </button>
    )
  }

  if (mode === 'builder' || mode === 'thumbnail') {
    return <div className="youtube-preview-static">{content}</div>
  }

  return watchUrl ? (
    <a
      className="youtube-preview-link"
      href={watchUrl}
      onClick={(event) => event.stopPropagation()}
      rel="noreferrer"
      target="_blank"
    >
      {content}
    </a>
  ) : (
    content
  )
}

function YouTubeFallbackCard({ src, mode, reason, errorCode = null }: YouTubeFallbackCardProps) {
  const videoId = extractYouTubeVideoId(src)
  const watchUrl = videoId ? createYouTubeWatchUrl(videoId) : ''
  const badge =
    reason === 'fallback' ? 'Will open on YouTube' : reason === 'ready' ? 'Will play here' : reason === 'unknown' ? 'We will try here first' : 'Checking video'
  const title =
    reason === 'fallback' ? 'YouTube link card' : reason === 'ready' ? 'YouTube video ready' : reason === 'unknown' ? 'YouTube playback not confirmed yet' : 'YouTube check in progress'
  const lines =
    reason === 'checking'
      ? ['Checking whether this video can play on the schedule screen.', 'If YouTube blocks it, we will show a clean link card instead.']
      : reason === 'ready'
        ? ['This video should play right on the schedule screen.', 'Builder preview stays simple on purpose.']
        : reason === 'unknown'
          ? ['We could not confirm this ahead of time.', 'The display will try to play it here first and open YouTube only if needed.']
          : ['This video will not play inside the schedule screen.', errorCode ? `YouTube returned error ${errorCode}.` : 'We will show a button to open it on YouTube instead.']

  return (
    <div className={`youtube-fallback-card youtube-fallback-card-${mode} youtube-fallback-card-${reason}`}>
      <div className="youtube-fallback-art">
        <span className="youtube-fallback-pill">{badge}</span>
        <span className="youtube-fallback-play">Play</span>
      </div>
      <div className="youtube-fallback-copy">
        <strong>{title}</strong>
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
        {watchUrl && (
          <a className="youtube-fallback-link" href={watchUrl} rel="noreferrer" target="_blank">
            Open on YouTube
          </a>
        )}
      </div>
    </div>
  )
}

function YouTubeEmbed({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [playerError, setPlayerError] = useState(false)
  const videoId = extractYouTubeVideoId(src)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !videoId) {
      return
    }

    let cancelled = false
    let playerInstance: YouTubePlayerInstance | null = null
    const origin = window.location.origin !== 'null' ? window.location.origin : undefined

    container.innerHTML = ''

    loadYouTubeIframeApi()
      .then((api) => {
        if (cancelled || !container) {
          return
        }

        const youtubeApi = api as NonNullable<YouTubeWindow['YT']>
        playerInstance = new youtubeApi.Player(container, {
          videoId,
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            origin,
          },
          events: {
            onError: () => {
              if (!cancelled) {
                setPlayerError(true)
              }
            },
          },
        })
      })
      .catch(() => {
        if (!cancelled) {
          setPlayerError(true)
        }
      })

    return () => {
      cancelled = true
      playerInstance?.destroy?.()
      container.innerHTML = ''
    }
  }, [videoId])

  if (!videoId) {
    return <span className="stage-object-placeholder">Paste a YouTube link</span>
  }

  return (
    <div className="stage-object-embed-shell">
      <div className="stage-object-embed" ref={containerRef} />
      {playerError && (
        <a className="stage-object-embed-fallback" href={`https://www.youtube.com/watch?v=${videoId}`} rel="noreferrer" target="_blank">
          Open on YouTube
        </a>
      )}
    </div>
  )
}

function createNewBlock(
  dayId: WeekdayId,
  count: number,
  layout: ScheduleBlock['layout'] = 'standard',
  stageElementDefaults: Partial<Record<StageElementId, StageElementDefaultState>> = {},
): ScheduleBlock {
  const title = layout === 'focus' ? 'New Focus Activity' : layout === 'rotation' ? 'New Rotation Activity' : layout === 'transition' ? 'New Transition Activity' : 'New Activity'
  const stageLayout = createResetStageLayout(layout, stageElementDefaults)
  const stageElementTextStyles = createResetStageTextStyles(stageElementDefaults)

  return {
    id: `${dayId}-block-${count + 1}`,
    title,
    startTime: '08:00',
    endTime: '08:15',
    rowType: 'activity',
    openTimeMode: 'blank',
    enabled: true,
    note: 'Add a short teacher-facing note here.',
    imageSrc: '',
    details: [],
    rotationGroups: [],
    color: 'sunrise',
    gentleBackground: false,
    layout,
    mobility: 'movable',
    stageLayout,
    stageElementTextStyles,
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

function createGapBlock(dayId: WeekdayId, count: number, startTime: string, endTime: string): ScheduleBlock {
  return {
    ...createNewBlock(dayId, count, 'transition'),
    id: `${dayId}-gap-${count + 1}`,
    title: 'Open',
    startTime,
    endTime,
    rowType: 'gap',
    openTimeMode: 'default',
    color: 'slate',
    showTitle: false,
    showTimeRange: false,
    showNote: false,
    showTimer: false,
    showNext: false,
    showClock: false,
    showActivity: false,
  }
}

function sortBlocksByTime(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return [...blocks].sort((left, right) => {
    const startDifference = timeToMinutes(left.startTime) - timeToMinutes(right.startTime)
    if (startDifference !== 0) {
      return startDifference
    }

    const endDifference = timeToMinutes(left.endTime) - timeToMinutes(right.endTime)
    if (endDifference !== 0) {
      return endDifference
    }

    return left.title.localeCompare(right.title)
  })
}

function normalizeScheduleNoOverlaps(input: ScheduleState): ScheduleState {
  const next = duplicateSchedule(input)

  weekdayOrder.forEach((dayId) => {
    const orderedBlocks = sortBlocksByTime(next[dayId].blocks)
    let cursorMinutes: number | null = null

    orderedBlocks.forEach((block) => {
      const originalStart = timeToMinutes(block.startTime)
      const originalEnd = timeToMinutes(block.endTime)
      const normalizedStart = cursorMinutes === null ? originalStart : Math.max(originalStart, cursorMinutes)
      const normalizedEnd = Math.max(originalEnd, normalizedStart + 1)

      if (normalizedStart !== originalStart) {
        block.startTime = minutesToTime(normalizedStart)
      }
      if (normalizedEnd !== originalEnd) {
        block.endTime = minutesToTime(normalizedEnd)
      }

      cursorMinutes = normalizedEnd
    })

    next[dayId].blocks = mergeAdjacentGapBlocks(orderedBlocks)
    next[dayId].activities = sortActivitiesByTime(next[dayId].activities).map((activity, index) => ({
      ...activity,
      order: index,
    }))
  })

  return next
}

function sortActivitiesByTime(activities: DayActivity[]): DayActivity[] {
  return [...activities].sort((left, right) => {
    const startDifference = timeToMinutes(left.startTime) - timeToMinutes(right.startTime)
    if (startDifference !== 0) {
      return startDifference
    }

    const endDifference = timeToMinutes(left.endTime) - timeToMinutes(right.endTime)
    if (endDifference !== 0) {
      return endDifference
    }

    return left.order - right.order
  })
}

function getDayActivityBounds(blocks: ScheduleBlock[]): { startTime: string; endTime: string } | null {
  if (blocks.length === 0) {
    return null
  }

  const sorted = sortBlocksByTime(blocks)
  return {
    startTime: sorted[0].startTime,
    endTime: sorted[sorted.length - 1].endTime,
  }
}

function getDefaultDayActivity(blocks: ScheduleBlock[], existingCount: number): DayActivity {
  const bounds = getDayActivityBounds(blocks)
  const startTime = bounds?.startTime ?? '08:00'
  const startMinutes = timeToMinutes(startTime)
  const latestMinutes = bounds ? timeToMinutes(bounds.endTime) : startMinutes + 30
  const endMinutes = Math.min(startMinutes + 30, latestMinutes)
  const normalizedEndMinutes = endMinutes > startMinutes ? endMinutes : startMinutes + 15
  const hours = Math.floor(normalizedEndMinutes / 60)
  const minutes = normalizedEndMinutes % 60

  return {
    id: `activity-${Math.random().toString(36).slice(2, 10)}`,
    title: `New activity ${existingCount + 1}`,
    startTime,
    endTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    color: 'sky',
    order: existingCount,
  }
}

function getResolvedActivityDisplayItems(
  activities: DayActivity[],
  minutesNowValue: number,
  mode: ActivityDisplayMode,
  stackMode: ActivityStackMode,
): ResolvedActivityDisplayItem[] {
  const ordered = sortActivitiesByTime(activities)
  const activeItems = ordered
    .filter((activity) => timeToMinutes(activity.startTime) <= minutesNowValue && timeToMinutes(activity.endTime) > minutesNowValue)
    .map((activity) => ({ activity, state: 'active' as const }))
  const upcomingItems = ordered
    .filter((activity) => timeToMinutes(activity.startTime) > minutesNowValue)
    .map((activity) => ({ activity, state: 'upcoming' as const }))

  let result: ResolvedActivityDisplayItem[] = []

  if (mode === 'active') {
    result = activeItems
  } else if (mode === 'upcoming') {
    result = upcomingItems.slice(0, 1)
  } else if (mode === 'both') {
    result = [...activeItems, ...upcomingItems.slice(0, 1)]
  } else {
    result = ordered.map((activity) => ({
      activity,
      state: timeToMinutes(activity.startTime) <= minutesNowValue && timeToMinutes(activity.endTime) > minutesNowValue ? 'active' : 'upcoming',
    }))
  }

  return stackMode === 'primary' && result.length > 0 ? [result[0]] : result
}

function mergeAdjacentGapBlocks(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return blocks.reduce<ScheduleBlock[]>((merged, block) => {
    const previous = merged[merged.length - 1]
    if (previous && previous.rowType === 'gap' && block.rowType === 'gap' && previous.endTime === block.startTime) {
      previous.endTime = block.endTime
      previous.enabled = previous.enabled || block.enabled
      previous.showTimer = previous.showTimer || block.showTimer
      return merged
    }

    merged.push(block)
    return merged
  }, [])
}

function getNextEnabledBlock(blocks: ScheduleBlock[], startIndex: number): ScheduleBlock | null {
  for (let index = startIndex + 1; index < blocks.length; index += 1) {
    if (blocks[index].enabled !== false) {
      return blocks[index]
    }
  }
  return null
}

function getPreviousActivityBlock(blocks: ScheduleBlock[], startIndex: number): ScheduleBlock | null {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    if (blocks[index].enabled !== false && blocks[index].rowType !== 'gap') {
      return blocks[index]
    }
  }
  return null
}

function getNextActivityBlock(blocks: ScheduleBlock[], startIndex: number): ScheduleBlock | null {
  for (let index = startIndex + 1; index < blocks.length; index += 1) {
    if (blocks[index].enabled !== false && blocks[index].rowType !== 'gap') {
      return blocks[index]
    }
  }
  return null
}

function getBuilderSettingsHelperText(args: {
  selectedStageObject: StageObject | null
  selectedClockElementId: StageElementId | null
  selectedTimerElementId: StageElementId | null
  selectedTextElementId: StageTextElementId | null
  selectedBuilderBlock: ScheduleBlock | null
}): string {
  const { selectedStageObject, selectedClockElementId, selectedTimerElementId, selectedTextElementId, selectedBuilderBlock } = args

  if (selectedStageObject) {
    return `Adjust this ${getStageObjectDisplayName(selectedStageObject.type).toLowerCase()} on the current slide.`
  }

  if (selectedClockElementId) {
    return 'Adjust the clock style and layout for the current slide.'
  }

  if (selectedTimerElementId) {
    return 'Adjust the timer layout for the current slide.'
  }

  if (selectedTextElementId) {
    if (selectedTextElementId === 'title') {
      return 'Adjust the block name styling for the current slide.'
    }

    if (selectedTextElementId === 'timeRange') {
      return 'Adjust the time range styling for the current slide.'
    }

    return `Adjust the ${selectedTextElementId} text styling for the current slide.`
  }

  if (selectedBuilderBlock) {
    const hasVisibleSlideContent =
      selectedBuilderBlock.showTitle ||
      selectedBuilderBlock.showTimeRange ||
      selectedBuilderBlock.showTimer ||
      selectedBuilderBlock.showNext ||
      selectedBuilderBlock.showClock ||
      selectedBuilderBlock.details.length > 0 ||
      selectedBuilderBlock.rotationGroups.length > 0 ||
      selectedBuilderBlock.stageObjects.length > 0

    return selectedBuilderBlock.rowType === 'gap'
      ? 'Open this time slot in Plan to create or expand blocks. Design editing is only for activity blocks.'
      : hasVisibleSlideContent
        ? 'Adjust the current slide background, color, and layout defaults.'
        : 'This slide is blank. Add content from the left, or use Plan to change the schedule.'
  }
  return ''
}

function getBlockIdsInRange(blocks: ScheduleBlock[], anchorId: string, targetId: string): string[] {
  const anchorIndex = blocks.findIndex((block) => block.id === anchorId)
  const targetIndex = blocks.findIndex((block) => block.id === targetId)
  if (anchorIndex < 0 || targetIndex < 0) {
    return [targetId]
  }

  const start = Math.min(anchorIndex, targetIndex)
  const end = Math.max(anchorIndex, targetIndex)
  return blocks.slice(start, end + 1).map((block) => block.id)
}

function formatDurationHoursMinutes(startTime: string, endTime: string): string {
  const totalMinutes = Math.max(timeToMinutes(endTime) - timeToMinutes(startTime), 0)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}:${String(minutes).padStart(2, '0')}`
}



function loadAdvancedModeEnabled(): boolean {
  return readStoredValue(advancedModeKey) === 'true'
}

function saveAdvancedModeEnabled(value: boolean): void {
  writeStoredValue(advancedModeKey, value ? 'true' : 'false')
}

function App() {
  const layoutDragRef = useRef<LayoutDragSession | null>(null)
  const pendingLayoutDragRef = useRef<PendingLayoutDragSession | null>(null)
  const objectDragRef = useRef<ObjectDragSession | null>(null)
  const pendingObjectDragRef = useRef<PendingObjectDragSession | null>(null)
  const undoStackRef = useRef<EditorHistorySnapshot[]>([])
  const redoStackRef = useRef<EditorHistorySnapshot[]>([])
  const youtubeProbePendingRef = useRef<Record<string, true>>({})
  const shiftResizeOverrideRef = useRef(false)
  const builderStageShellRef = useRef<HTMLDivElement | null>(null)
  const builderStageFrameRef = useRef<HTMLDivElement | null>(null)
  const builderTitleInputRef = useRef<HTMLInputElement | null>(null)
  const importScheduleInputRef = useRef<HTMLInputElement | null>(null)
  const saveMenuRef = useRef<HTMLDivElement | null>(null)
  const builderStageCanvasRef = useRef<HTMLDivElement | null>(null)
  const displayStageCanvasRef = useRef<HTMLDivElement | null>(null)
  const builderBlockStripRef = useRef<HTMLDivElement | null>(null)
  const builderBlockStripDragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number; dragged: boolean } | null>(null)
  const builderBlockStripSuppressClickRef = useRef(false)
  const displayDragRef = useRef<DisplayDragTarget | null>(null)
  const blockImageFileInputRef = useRef<HTMLInputElement | null>(null)
  const [schedule, setSchedule] = useState<ScheduleState>(() => normalizeScheduleNoOverlaps(loadScheduleState()))
  const [undoDepth, setUndoDepth] = useState(0)
  const [redoDepth, setRedoDepth] = useState(0)
  const [view, setView] = useState<NavItem['id']>('home')

  const [advancedModeEnabled, setAdvancedModeEnabled] = useState(() => loadAdvancedModeEnabled())
  const [displayDay, setDisplayDay] = useState<WeekdayId>(() => getWeekdayFromDate(new Date()))
  const [builderDay, setBuilderDay] = useState<WeekdayId>('monday')
  const [planEditorMode, setPlanEditorMode] = useState<PlanEditorMode>('blocks')
  const [planActivitiesClosing, setPlanActivitiesClosing] = useState(false)
  const [selectedBuilderBlockId, setSelectedBuilderBlockId] = useState<string | null>(null)
  const [selectedBuilderBlockIds, setSelectedBuilderBlockIds] = useState<string[]>([])
  const [selectedDayActivityId, setSelectedDayActivityId] = useState<string | null>(null)
  const [selectedDayActivityIds, setSelectedDayActivityIds] = useState<string[]>([])
  const [dayActivityDraft, setDayActivityDraft] = useState<DayActivityDraft | null>(null)
  const [allowEmptyDayFlowSelection, setAllowEmptyDayFlowSelection] = useState(false)
  const [builderSelectionAnchorId, setBuilderSelectionAnchorId] = useState<string | null>(null)
  const [selectedStageElementId, setSelectedStageElementId] = useState<BuilderSelectionId | null>(null)
  const [selectedStageObjectId, setSelectedStageObjectId] = useState<string | null>(null)
  const [editingStageObjectId, setEditingStageObjectId] = useState<string | null>(null)
  const [builderCoreObjectsCollapsed, setBuilderCoreObjectsCollapsed] = useState(false)
  const [builderContentObjectsCollapsed, setBuilderContentObjectsCollapsed] = useState(false)
  const [builderWidgetsCollapsed, setBuilderWidgetsCollapsed] = useState(false)
  const [builderDisplayBehaviorCollapsed, setBuilderDisplayBehaviorCollapsed] = useState(false)
  const [builderArrangeCollapsed, setBuilderArrangeCollapsed] = useState(false)
  const [builderActionsCollapsed, setBuilderActionsCollapsed] = useState(false)
  const [builderTemplateMenuCollapsed, setBuilderTemplateMenuCollapsed] = useState(false)
  const [builderObjectContentCollapsed, setBuilderObjectContentCollapsed] = useState(false)
  const [builderAppearanceCollapsed, setBuilderAppearanceCollapsed] = useState(false)
  const [builderBackgroundCollapsed, setBuilderBackgroundCollapsed] = useState(false)
  const [builderClockCollapsed, setBuilderClockCollapsed] = useState(false)
  const [builderTimerCollapsed, setBuilderTimerCollapsed] = useState(false)
  const [clockNow, setClockNow] = useState(() => new Date())
  const [followClockDay, setFollowClockDay] = useState(true)
  const [displayLocked, setDisplayLocked] = useState(false)
  const [showFullscreenMode, setShowFullscreenMode] = useState(false)
  const [showFullscreenTopbar, setShowFullscreenTopbar] = useState(false)
  const [sidebarMode, setSidebarMode] = useState<'pinned' | 'auto' | 'hidden'>('pinned')
  const [displaySidebarSettingsOpen, setDisplaySidebarSettingsOpen] = useState(true)
  const [manualBlockId, setManualBlockId] = useState<string | null>(null)
  const [manualTimer, setManualTimer] = useState<ManualTimerSession | null>(null)
  const [displayHoldBlockId, setDisplayHoldBlockId] = useState<string | null>(null)
  const [displayReplayState, setDisplayReplayState] = useState<{
    blockId: string
    startedAt: number
    startMinutes: number
  } | null>(null)
  const [liveToggleSnapshot, setLiveToggleSnapshot] = useState<{
    displayDay: WeekdayId
    manualBlockId: string | null
    followClockDay: boolean
    displayHoldBlockId: string | null
    displayReplayState: {
      blockId: string
      startedAt: number
      startMinutes: number
    } | null
  } | null>(null)
  const [youtubeAvailability, setYouTubeAvailability] = useState<Record<string, YouTubeAvailabilityResult>>({})
  const [displayPlayingYouTubeIds, setDisplayPlayingYouTubeIds] = useState<Record<string, true>>({})
  const [weatherLiveState, setWeatherLiveState] = useState<Record<string, WeatherLiveRuntimeState>>({})
  const [builderStageScale, setBuilderStageScale] = useState(1)
  const [builderStageFitMode, setBuilderStageFitMode] = useState<'width' | 'height'>('width')
  const [builderStripIndicator, setBuilderStripIndicator] = useState<{ visible: boolean; left: number; width: number }>({
    visible: false,
    left: 0,
    width: 0,
  })
  const [builderTransferMessage, setBuilderTransferMessage] = useState<string | null>(null)
  const [builderInteractionMessage, setBuilderInteractionMessage] = useState<string | null>(null)
  const [builderPreviewCache, setBuilderPreviewCache] = useState<Record<string, BlockThumbnailSnapshot>>(() => loadBuilderPreviewCache())
  const [lastAutosaveAt, setLastAutosaveAt] = useState<number | null>(() => loadScheduleAutosaveSnapshot()?.savedAt ?? null)
  const [lastFileSaveAt, setLastFileSaveAt] = useState<number | null>(null)
  const [lastFileLoadAt, setLastFileLoadAt] = useState<number | null>(null)
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const [quickSaveFileHandle, setQuickSaveFileHandle] = useState<QuickSaveFileHandle | null>(null)
  const [lastManualSaveDigest, setLastManualSaveDigest] = useState<string | null>(null)
  const [saveSetupPromptOpen, setSaveSetupPromptOpen] = useState(false)
  const [saveSetupPromptDismissedDigest, setSaveSetupPromptDismissedDigest] = useState<string | null>(null)
  const [builderTitleEditingBlockId, setBuilderTitleEditingBlockId] = useState<string | null>(null)
  const [linkedDeleteWarningDisabled, setLinkedDeleteWarningDisabled] = useState(() => loadLinkedDeleteWarningDisabled())
  const [pendingLinkedDelete, setPendingLinkedDelete] = useState<PendingLinkedDelete | null>(null)
  const [dontShowLinkedDeleteAgain, setDontShowLinkedDeleteAgain] = useState(false)
  const [timeInputDrafts, setTimeInputDrafts] = useState<Record<string, string>>({})
  const [dayFlowDragIndex, setDayFlowDragIndex] = useState<number | null>(null)
  const [dayFlowDropIndex, setDayFlowDropIndex] = useState<number | null>(null)
  const [dayFlowRefreshing, setDayFlowRefreshing] = useState(false)
  const [dayFlowExpandedGapId, setDayFlowExpandedGapId] = useState<string | null>(null)
  const [builderSettingsHelperPreview, setBuilderSettingsHelperPreview] = useState<string | null>(null)
  const [displayActivityDrawerOpen, setDisplayActivityDrawerOpen] = useState(false)
  const dayFlowDragIndexRef = useRef<number | null>(null)
  const dayFlowDragDayRef = useRef<WeekdayId | null>(null)
  const planActivitiesCloseTimeoutRef = useRef<number | null>(null)
  const weatherLiveInFlightRef = useRef<Record<string, true>>({})
  const builderDayRef = useRef<WeekdayId>(builderDay)
  const displaySidebarModeRef = useRef<'pinned' | 'auto'>('pinned')
  const displaySidebarBlockClickTimeoutRef = useRef<number | null>(null)
  const dayFlowRefreshTimeoutRef = useRef<number | null>(null)
  const selectedBuilderBlockIdRef = useRef<string | null>(selectedBuilderBlockId)
  const selectedStageElementIdRef = useRef<BuilderSelectionId | null>(selectedStageElementId)
  const selectedStageObjectIdRef = useRef<string | null>(selectedStageObjectId)
  const previousViewRef = useRef<NavItem['id']>(view)
  const builderDragSelectionLockedRef = useRef(false)
  const activityDrawerGestureRef = useRef<{
    dayId: WeekdayId
    blockId: string
    pointerId: number
    startX: number
    startY: number
    startOpen: boolean
    moved: boolean
    undoCaptured: boolean
    origin: StageElementLayout
  } | null>(null)
  const [sessionStartDigest] = useState(() => JSON.stringify(schedule))
  const scheduleDigest = useMemo(() => JSON.stringify(schedule), [schedule])
  const unsavedBaselineDigest = lastManualSaveDigest ?? sessionStartDigest
  const hasUnsavedSaveChanges = scheduleDigest !== unsavedBaselineDigest
  const needsQuickSaveSetup = hasUnsavedSaveChanges && quickSaveFileHandle === null && lastFileSaveAt === null

  function lockBuilderDragSelection() {
    if (builderDragSelectionLockedRef.current) {
      return
    }
    builderDragSelectionLockedRef.current = true
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
  }

  function unlockBuilderDragSelection() {
    if (!builderDragSelectionLockedRef.current) {
      return
    }
    builderDragSelectionLockedRef.current = false
    document.body.style.userSelect = ''
    document.body.style.webkitUserSelect = ''
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(new Date())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const savedAt = saveScheduleState(schedule)
    if (savedAt !== null) {
      setLastAutosaveAt(savedAt)
    }
  }, [schedule])

  useEffect(() => {
    saveAdvancedModeEnabled(advancedModeEnabled)
  }, [advancedModeEnabled])

  useEffect(() => {
    if (!(view === 'display' && showFullscreenMode)) {
      return
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.clientY <= 14) {
        setShowFullscreenTopbar(true)
      } else if (event.clientY >= 96) {
        setShowFullscreenTopbar(false)
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [showFullscreenMode, view])

  useEffect(() => {
    if (sidebarMode !== 'hidden') {
      displaySidebarModeRef.current = sidebarMode
    }
  }, [sidebarMode])


  useEffect(() => {
    return () => {
      if (displaySidebarBlockClickTimeoutRef.current !== null) {
        window.clearTimeout(displaySidebarBlockClickTimeoutRef.current)
        displaySidebarBlockClickTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    saveBuilderPreviewCache(builderPreviewCache)
  }, [builderPreviewCache])

  useEffect(() => {
    saveLinkedDeleteWarningDisabled(linkedDeleteWarningDisabled)
  }, [linkedDeleteWarningDisabled])

  useEffect(() => {
    if (previousViewRef.current !== 'day-flow' && view === 'day-flow') {
      clearDayFlowSelection()
    }
    previousViewRef.current = view
  }, [view])

  useEffect(() => {
    if (view !== 'day-flow' || dayFlowExpandedGapId === null) {
      return
    }

    const closeExpandedGapOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) {
        return
      }

      if (target.closest('[data-gap-action-shell="true"]') || target.closest('[data-gap-trigger="true"]')) {
        return
      }

      setDayFlowExpandedGapId(null)
    }

    window.addEventListener('pointerdown', closeExpandedGapOnOutsideClick, true)
    return () => window.removeEventListener('pointerdown', closeExpandedGapOnOutsideClick, true)
  }, [dayFlowExpandedGapId, view])

  useEffect(() => {
    if (readStoredValue(referenceMondaySeedKey) === 'true') {
      return
    }

    if (schedule.monday.blocks.length > 0) {
      writeStoredValue(referenceMondaySeedKey, 'true')
      return
    }

    const referenceMonday = createDefaultSchedule().monday
    writeStoredValue(referenceMondaySeedKey, 'true')
    setSchedule((current) => {
      if (current.monday.blocks.length > 0) {
        return current
      }

      const next = duplicateSchedule(current)
      next.monday = JSON.parse(JSON.stringify(referenceMonday))
      return next
    })
  }, [schedule.monday.blocks.length])

  useEffect(() => {
    if (!builderTitleEditingBlockId) {
      return
    }

    builderTitleInputRef.current?.focus()
    builderTitleInputRef.current?.select()
  }, [builderTitleEditingBlockId])

  useEffect(() => {
    if (!saveMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) {
        return
      }
      if (saveMenuRef.current?.contains(target)) {
        return
      }
      setSaveMenuOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => window.removeEventListener('pointerdown', handlePointerDown, true)
  }, [saveMenuOpen])

  useEffect(() => {
    if (!needsQuickSaveSetup) {
      setSaveSetupPromptOpen(false)
      return
    }

    if (saveSetupPromptDismissedDigest === scheduleDigest) {
      return
    }

    const timeout = window.setTimeout(() => {
      setSaveSetupPromptOpen(true)
    }, 12000)

    return () => window.clearTimeout(timeout)
  }, [needsQuickSaveSetup, saveSetupPromptDismissedDigest, scheduleDigest])

  useEffect(() => {
    builderDayRef.current = builderDay
  }, [builderDay])

  useEffect(() => {
    const availableIds = new Set(schedule[builderDay].activities.map((activity) => activity.id))
    setSelectedDayActivityIds((current) => current.filter((activityId) => availableIds.has(activityId)))
    setSelectedDayActivityId((current) => (current && availableIds.has(current) ? current : schedule[builderDay].activities[0]?.id ?? null))
  }, [builderDay, schedule])

  useEffect(() => {
    return () => {
      unlockBuilderDragSelection()
      if (dayFlowRefreshTimeoutRef.current !== null) {
        window.clearTimeout(dayFlowRefreshTimeoutRef.current)
      }
      if (planActivitiesCloseTimeoutRef.current !== null) {
        window.clearTimeout(planActivitiesCloseTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    selectedBuilderBlockIdRef.current = selectedBuilderBlockId
  }, [selectedBuilderBlockId])

  useEffect(() => {
    if (builderTitleEditingBlockId && selectedBuilderBlockId !== builderTitleEditingBlockId) {
      setBuilderTitleEditingBlockId(null)
    }
  }, [builderTitleEditingBlockId, selectedBuilderBlockId])

  useEffect(() => {
    selectedStageElementIdRef.current = selectedStageElementId
  }, [selectedStageElementId])

  useEffect(() => {
    selectedStageObjectIdRef.current = selectedStageObjectId
  }, [selectedStageObjectId])

  function syncHistoryDepths() {
    setUndoDepth(undoStackRef.current.length)
    setRedoDepth(redoStackRef.current.length)
  }

  function createEditorSnapshot(snapshot: ScheduleState): EditorHistorySnapshot {
    return {
      schedule: duplicateSchedule(snapshot),
      builderDay: builderDayRef.current,
      selectedBuilderBlockId: selectedBuilderBlockIdRef.current,
      selectedStageElementId: selectedStageElementIdRef.current,
      selectedStageObjectId: selectedStageObjectIdRef.current,
    }
  }

  function restoreEditorSnapshot(snapshot: EditorHistorySnapshot) {
    setBuilderDay(snapshot.builderDay)
    setSelectedBuilderBlockId(snapshot.selectedBuilderBlockId)
    setSelectedStageElementId(snapshot.selectedStageElementId ?? null)
    setSelectedStageObjectId(snapshot.selectedStageObjectId)
  }

  function applyBuilderBlockSelection(dayId: WeekdayId, blockIds: string[], primaryBlockId: string | null = blockIds[0] ?? null) {
    const availableBlocks = schedule[dayId].blocks
    const availableIdSet = new Set(availableBlocks.map((block) => block.id))
    const nextIds = [...new Set(blockIds)].filter((blockId) => availableIdSet.has(blockId))
    const fallbackPrimaryId =
      primaryBlockId && availableIdSet.has(primaryBlockId)
        ? primaryBlockId
        : nextIds[0] ?? availableBlocks[0]?.id ?? null
    const normalizedIds = nextIds.length > 0 ? nextIds : fallbackPrimaryId ? [fallbackPrimaryId] : []

    setSelectedBuilderBlockIds(normalizedIds)
    setSelectedBuilderBlockId(fallbackPrimaryId)
    setBuilderSelectionAnchorId(fallbackPrimaryId)
    setAllowEmptyDayFlowSelection(false)
    setSelectedStageObjectId(null)
    setSelectedStageElementId(null)
  }

  function clearDayFlowSelection() {
    setSelectedBuilderBlockIds([])
    setSelectedBuilderBlockId(null)
    setBuilderSelectionAnchorId(null)
    setAllowEmptyDayFlowSelection(true)
    setSelectedStageObjectId(null)
    setSelectedStageElementId(null)
    setBuilderTitleEditingBlockId(null)
    setDayFlowExpandedGapId(null)
  }

  function handleBlockSelection(dayId: WeekdayId, blockId: string, options?: { additive?: boolean; range?: boolean }) {
    const blocks = schedule[dayId].blocks
    const additive = options?.additive ?? false
    const range = options?.range ?? false

    if (range && builderSelectionAnchorId) {
      const rangeIds = getBlockIdsInRange(blocks, builderSelectionAnchorId, blockId)
      if (additive) {
        applyBuilderBlockSelection(dayId, [...selectedBuilderBlockIds, ...rangeIds], blockId)
        return
      }

      applyBuilderBlockSelection(dayId, rangeIds, blockId)
      return
    }

    if (additive) {
      const isSelected = selectedBuilderBlockIds.includes(blockId)
      const nextIds =
        isSelected && selectedBuilderBlockIds.length > 1
          ? selectedBuilderBlockIds.filter((id) => id !== blockId)
          : isSelected
            ? [blockId]
            : [...selectedBuilderBlockIds, blockId]
      applyBuilderBlockSelection(dayId, nextIds, blockId)
      return
    }

    applyBuilderBlockSelection(dayId, [blockId], blockId)
  }

  function handleBlockSelectionFromMouse(dayId: WeekdayId, blockId: string, event: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>) {
    handleBlockSelection(dayId, blockId, {
      additive: event.ctrlKey || event.metaKey,
      range: event.shiftKey,
    })
  }

  function showBuilderInteractionMessage(message: string) {
    setBuilderInteractionMessage(message)
    window.setTimeout(() => {
      setBuilderInteractionMessage((current) => (current === message ? null : current))
    }, 1600)
  }

  function switchDayFlowDay(dayId: WeekdayId) {
    if (dayId === builderDay) {
      return
    }

    setBuilderDay(dayId)
    setDayFlowRefreshing(false)

    if (dayFlowRefreshTimeoutRef.current !== null) {
      window.clearTimeout(dayFlowRefreshTimeoutRef.current)
    }

    window.setTimeout(() => {
      setDayFlowRefreshing(true)
      dayFlowRefreshTimeoutRef.current = window.setTimeout(() => {
        setDayFlowRefreshing(false)
        dayFlowRefreshTimeoutRef.current = null
      }, 180)
    }, 0)
  }

  function setPlanMode(nextMode: PlanEditorMode) {
    if (nextMode === planEditorMode && !planActivitiesClosing) {
      return
    }

    if (planActivitiesCloseTimeoutRef.current !== null) {
      window.clearTimeout(planActivitiesCloseTimeoutRef.current)
      planActivitiesCloseTimeoutRef.current = null
    }

    if (nextMode === 'activities') {
      setPlanActivitiesClosing(false)
      setPlanEditorMode('activities')
      return
    }

    if (planEditorMode === 'activities') {
      setPlanActivitiesClosing(true)
      planActivitiesCloseTimeoutRef.current = window.setTimeout(() => {
        setPlanActivitiesClosing(false)
        setPlanEditorMode('blocks')
        planActivitiesCloseTimeoutRef.current = null
      }, 420)
      return
    }

    setPlanEditorMode('blocks')
  }

  function pushUndoSnapshot(snapshot: ScheduleState) {
    undoStackRef.current.push(createEditorSnapshot(snapshot))
    if (undoStackRef.current.length > HISTORY_LIMIT) {
      undoStackRef.current.shift()
    }
    redoStackRef.current = []
    syncHistoryDepths()
  }

  function updateSchedule(
    updater: (current: ScheduleState) => ScheduleState,
    options: { recordUndo?: boolean } = {},
  ) {
    setSchedule((current) => {
      const next = updater(current)
      if (next === current) {
        return current
      }

      if (options.recordUndo !== false) {
        pushUndoSnapshot(current)
      }

      return next
    })
  }

  function clearEditorHistory() {
    undoStackRef.current = []
    redoStackRef.current = []
    syncHistoryDepths()
  }

  function resetAllSlideContent() {
    if (!window.confirm('Reset all slide content across every day? This keeps your block schedule and times, but clears slide content back to a clean state.')) {
      return
    }

    removeStoredValue(builderPreviewCacheKey)
    setBuilderPreviewCache({})
    updateSchedule((current) => clearSlideContentFromSchedule(current))
  }

  function resetSlidesAndSchedules() {
    if (!window.confirm('Clear all slide content and block schedules across every day? This leaves you with a blank week.')) {
      return
    }

    clearEditorHistory()
    removeStoredValue(builderPreviewCacheKey)
    setBuilderPreviewCache({})
    setBuilderDay('monday')
    setPlanEditorMode('blocks')
    setSelectedBuilderBlockId(null)
    setSelectedBuilderBlockIds([])
    setSelectedDayActivityId(null)
    setSelectedDayActivityIds([])
    setBuilderSelectionAnchorId(null)
    setSelectedStageElementId(null)
    setSelectedStageObjectId(null)
    setManualBlockId(null)
    setFollowClockDay(true)
    setDisplayDay(getWeekdayFromDate(new Date()))
    setSchedule(createBlankSchedule())
  }

  function restoreKnownGoodDefaultState() {
    if (!window.confirm('Restore the entire app to a known good default state? This resets the schedule, clears builder cache, and restores default app controls.')) {
      return
    }

    clearEditorHistory()
    removeStoredValue(builderPreviewCacheKey)
    removeStoredValue(linkedDeleteWarningKey)
    removeStoredValue(referenceMondaySeedKey)
    setBuilderPreviewCache({})
    setLinkedDeleteWarningDisabled(false)
    setPendingLinkedDelete(null)
    setDontShowLinkedDeleteAgain(false)
    setView('home')
    setDisplayDay(getWeekdayFromDate(new Date()))
    setBuilderDay('monday')
    setPlanEditorMode('blocks')
    setSelectedBuilderBlockId(null)
    setSelectedBuilderBlockIds([])
    setSelectedDayActivityId(null)
    setSelectedDayActivityIds([])
    setBuilderSelectionAnchorId(null)
    setSelectedStageElementId(null)
    setSelectedStageObjectId(null)
    setFollowClockDay(true)
    setDisplayLocked(false)
    setShowFullscreenMode(false)
    setShowFullscreenTopbar(false)
    setSidebarMode('pinned')
    setManualBlockId(null)
    setManualTimer(null)
    setYouTubeAvailability({})
    setBuilderTransferMessage(null)
    setBuilderInteractionMessage(null)
    setBuilderTitleEditingBlockId(null)
    setDayFlowDragIndex(null)
    setDayFlowDropIndex(null)
    setDayFlowRefreshing(false)
    setDayFlowExpandedGapId(null)
    setBuilderSettingsHelperPreview(null)
    setSchedule(createDefaultSchedule())
  }

  function resetSavedBrowserState() {
    if (!window.confirm('Clear this app’s saved browser data and reload? This removes saved schedule state, cached thumbnails, and local app flags for this browser profile only.')) {
      return
    }

    clearPersistedAppState()
    window.location.reload()
  }

  function createSaveFileName(): string {
    const today = new Date()
    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${String(today.getHours()).padStart(2, '0')}${String(today.getMinutes()).padStart(2, '0')}`
    return `llama-schedule-backup-${stamp}.json`
  }

  function canUseFilePickerApi(): boolean {
    return typeof (window as Window & { showSaveFilePicker?: (options?: SavePickerOptions) => Promise<QuickSaveFileHandle> }).showSaveFilePicker === 'function'
  }

  async function writeScheduleToFileHandle(handle: QuickSaveFileHandle): Promise<boolean> {
    try {
      const payload = createScheduleExportString(schedule)
      const writable = await handle.createWritable()
      await writable.write(payload)
      await writable.close()
      setLastFileSaveAt(Date.now())
      setLastManualSaveDigest(JSON.stringify(schedule))
      setSaveSetupPromptOpen(false)
      return true
    } catch {
      return false
    }
  }

  async function promptForSaveFileHandle(): Promise<QuickSaveFileHandle | null> {
    if (!canUseFilePickerApi()) {
      return null
    }

    try {
      const showSaveFilePicker = (window as Window & { showSaveFilePicker?: (options?: SavePickerOptions) => Promise<QuickSaveFileHandle> }).showSaveFilePicker
      if (!showSaveFilePicker) {
        return null
      }

      const handle = await showSaveFilePicker({
        suggestedName: createSaveFileName(),
        types: [
          {
            description: 'Schedule save file',
            accept: {
              'application/json': ['.json'],
            },
          },
        ],
      })
      return handle
    } catch {
      return null
    }
  }

  function exportScheduleBackup() {
    const payload = createScheduleExportString(schedule)
    const fileName = createSaveFileName()
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setLastFileSaveAt(Date.now())
    setLastManualSaveDigest(JSON.stringify(schedule))
    setSaveSetupPromptOpen(false)
  }

  async function saveAsScheduleFile(): Promise<boolean> {
    if (!canUseFilePickerApi()) {
      exportScheduleBackup()
      setSaveMenuOpen(false)
      return true
    }

    const handle = await promptForSaveFileHandle()
    if (!handle) {
      return false
    }

    const saved = await writeScheduleToFileHandle(handle)
    if (saved) {
      setQuickSaveFileHandle(handle)
      setSaveMenuOpen(false)
    }
    return saved
  }

  async function quickSaveSchedule(): Promise<boolean> {
    if (!canUseFilePickerApi()) {
      exportScheduleBackup()
      return true
    }

    let handle = quickSaveFileHandle
    if (!handle) {
      handle = await promptForSaveFileHandle()
      if (!handle) {
        return false
      }
      setQuickSaveFileHandle(handle)
    }

    const saved = await writeScheduleToFileHandle(handle)
    if (saved) {
      return true
    }

    if (!saved) {
      const retryHandle = await promptForSaveFileHandle()
      if (!retryHandle) {
        return false
      }
      const retrySaved = await writeScheduleToFileHandle(retryHandle)
      if (retrySaved) {
        setQuickSaveFileHandle(retryHandle)
        return true
      }
    }

    return false
  }

  async function handleQuickSaveSetupNow() {
    const saved = await quickSaveSchedule()
    if (saved) {
      setSaveSetupPromptOpen(false)
    }
  }

  function restoreLatestAutosave() {
    const snapshot = loadScheduleAutosaveSnapshot()
    if (!snapshot) {
      window.alert('No autosave snapshot was found for this browser yet.')
      return
    }

    const savedLabel = new Date(snapshot.savedAt).toLocaleString()
    const shouldRestore = window.confirm(`Restore last autosave from ${savedLabel}? This replaces your current schedule.`)
    if (!shouldRestore) {
      return
    }

    clearEditorHistory()
    setSelectedBuilderBlockId(null)
    setSelectedBuilderBlockIds([])
    setSelectedStageElementId(null)
    setSelectedStageObjectId(null)
    setBuilderSelectionAnchorId(null)
    setSchedule(normalizeScheduleNoOverlaps(snapshot.schedule))
    setLastAutosaveAt(snapshot.savedAt)
    setSaveMenuOpen(false)
  }

  async function importScheduleBackup(file: File | null) {
    if (!file) {
      return
    }

    const rawValue = await file.text()
    const parsed = parseScheduleImportString(rawValue)
    if (!parsed) {
      window.alert('That file is not a valid schedule save file.')
      return
    }

    const shouldReplace = window.confirm('Load this save file and replace the current schedule?')
    if (!shouldReplace) {
      return
    }

    clearEditorHistory()
    setSelectedBuilderBlockId(null)
    setSelectedBuilderBlockIds([])
    setSelectedStageElementId(null)
    setSelectedStageObjectId(null)
    setBuilderSelectionAnchorId(null)
    setSchedule(parsed)
    setLastManualSaveDigest(JSON.stringify(parsed))
    setLastFileLoadAt(Date.now())
    setSaveMenuOpen(false)
  }

  function handleTopNavClick(targetView: NavItem['id']) {
    setView(targetView)
  }

  function createManualTimerSession(block: ScheduleBlock): ManualTimerSession {
    return {
      blockId: block.id,
      durationSeconds: Math.max(timeToMinutes(block.endTime) - timeToMinutes(block.startTime), 1) * 60,
      extraSeconds: 0,
      startedAt: Date.now(),
      pausedRemainingSeconds: null,
    }
  }

  function updateDayBlocks(
    dayId: WeekdayId,
    updater: (blocks: ScheduleBlock[], next: ScheduleState) => boolean,
    options: { recordUndo?: boolean } = {},
  ) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const changed = updater(next[dayId].blocks, next)
      return changed ? next : current
    }, options)
  }

  function updateDayActivities(
    dayId: WeekdayId,
    updater: (activities: DayActivity[], next: ScheduleState) => boolean,
    options: { recordUndo?: boolean } = {},
  ) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const changed = updater(next[dayId].activities, next)
      if (changed) {
        next[dayId].activities = sortActivitiesByTime(next[dayId].activities).map((activity, index) => ({
          ...activity,
          order: index,
        }))
      }
      return changed ? next : current
    }, options)
  }

  function undoSchedule() {
    setSchedule((current) => {
      const previous = undoStackRef.current.pop()
      if (!previous) {
        return current
      }

      redoStackRef.current.push(createEditorSnapshot(current))
      if (redoStackRef.current.length > HISTORY_LIMIT) {
        redoStackRef.current.shift()
      }
      restoreEditorSnapshot(previous)
      syncHistoryDepths()
      return previous.schedule
    })
  }

  function redoSchedule() {
    setSchedule((current) => {
      const next = redoStackRef.current.pop()
      if (!next) {
        return current
      }

      undoStackRef.current.push(createEditorSnapshot(current))
      if (undoStackRef.current.length > HISTORY_LIMIT) {
        undoStackRef.current.shift()
      }
      restoreEditorSnapshot(next)
      syncHistoryDepths()
      return next.schedule
    })
  }

  const onGlobalKeyDown = useEffectEvent((event: KeyboardEvent) => {
    shiftResizeOverrideRef.current = event.shiftKey
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
      return
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && view === 'builder' && selectedBuilderBlockId && selectedStageObjectId) {
      event.preventDefault()
      removeStageObject(builderDay, selectedBuilderBlockId, selectedStageObjectId)
      return
    }

    if ((event.ctrlKey || event.metaKey) && !event.altKey && ((event.shiftKey && event.key.toLowerCase() === 'z') || event.key.toLowerCase() === 'y')) {
      event.preventDefault()
      redoSchedule()
      return
    }

    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'z') {
      return
    }

    event.preventDefault()
    undoSchedule()
  })

  const onGlobalKeyUp = useEffectEvent((event: KeyboardEvent) => {
    shiftResizeOverrideRef.current = event.shiftKey
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      onGlobalKeyDown(event)
    }

    function handleKeyUp(event: KeyboardEvent) {
      onGlobalKeyUp(event)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    const sources = Array.from(
      new Set(
        weekdayOrder.flatMap((dayId) =>
          schedule[dayId].blocks.flatMap((block) =>
            block.stageObjects
              .filter((object) => object.type === 'youtube' && object.src.trim())
              .map((object) => normalizeYouTubeUrl(object.src)),
          ),
        ),
      ),
    )

    sources.forEach((src) => {
      if (youtubeAvailability[src] || youtubeProbePendingRef.current[src]) {
        return
      }

      youtubeProbePendingRef.current[src] = true
      probeYouTubePlayback(src).then((result) => {
        delete youtubeProbePendingRef.current[src]
        setYouTubeAvailability((current) => (current[src] ? current : { ...current, [src]: result }))
      })
    })
  }, [schedule, youtubeAvailability])

  useEffect(() => {
    const shell = builderStageShellRef.current
    if (!shell) {
      return
    }

    const referenceAspect = REFERENCE_STAGE_WIDTH / REFERENCE_STAGE_HEIGHT
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      const { width, height } = entry.contentRect
      if (!width || !height) {
        return
      }

      const shellAspect = width / height
      setBuilderStageFitMode(shellAspect <= referenceAspect ? 'width' : 'height')
    })

    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const frame = builderStageFrameRef.current
    if (!frame) {
      return
    }

    const syncScaleFromFrame = () => {
      const frameWidth = frame.getBoundingClientRect().width
      if (!frameWidth) {
        return
      }
      setBuilderStageScale(frameWidth / REFERENCE_STAGE_WIDTH)
    }

    syncScaleFromFrame()
    const observer = new ResizeObserver(() => syncScaleFromFrame())
    observer.observe(frame)
    return () => observer.disconnect()
  }, [builderStageFitMode, selectedBuilderBlockId, view])

  useEffect(() => {
    const strip = builderBlockStripRef.current
    if (!strip) {
      return
    }

    refreshBuilderStripIndicator()
    const onScroll = () => refreshBuilderStripIndicator()
    strip.addEventListener('scroll', onScroll, { passive: true })

    const observer = new ResizeObserver(() => refreshBuilderStripIndicator())
    observer.observe(strip)
    window.addEventListener('resize', refreshBuilderStripIndicator)

    return () => {
      strip.removeEventListener('scroll', onScroll)
      observer.disconnect()
      window.removeEventListener('resize', refreshBuilderStripIndicator)
    }
  }, [builderDay, schedule, view])

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      onBuilderPaste(event)
    }

    function onCopy(event: ClipboardEvent) {
      onBuilderCopy(event)
    }

    window.addEventListener('paste', onPaste)
    window.addEventListener('copy', onCopy)

    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('copy', onCopy)
    }
  }, [])

  useEffect(() => {
    const blocks = schedule[builderDay].blocks
    if (blocks.length === 0) {
      setSelectedBuilderBlockId(null)
      setSelectedBuilderBlockIds([])
      setBuilderSelectionAnchorId(null)
      setAllowEmptyDayFlowSelection(false)
      return
    }

    if (
      view === 'day-flow' &&
      selectedBuilderBlockId === null &&
      selectedBuilderBlockIds.length === 0
    ) {
      if (builderSelectionAnchorId !== null) {
        setBuilderSelectionAnchorId(null)
      }
      if (!allowEmptyDayFlowSelection) {
        setAllowEmptyDayFlowSelection(true)
      }
      return
    }

    const availableIds = new Set(blocks.map((block) => block.id))
    const filteredSelectedIds = selectedBuilderBlockIds.filter((blockId) => availableIds.has(blockId))
    const nextPrimaryId =
      selectedBuilderBlockId && availableIds.has(selectedBuilderBlockId)
        ? selectedBuilderBlockId
        : filteredSelectedIds[0] ?? blocks[0].id
    const nextSelectedIds = filteredSelectedIds.length > 0 ? filteredSelectedIds : [nextPrimaryId]

    if (selectedBuilderBlockId !== nextPrimaryId) {
      setSelectedBuilderBlockId(nextPrimaryId)
    }

    if (
      selectedBuilderBlockIds.length !== nextSelectedIds.length ||
      selectedBuilderBlockIds.some((blockId, index) => blockId !== nextSelectedIds[index])
    ) {
      setSelectedBuilderBlockIds(nextSelectedIds)
    }

    if (!builderSelectionAnchorId || !availableIds.has(builderSelectionAnchorId)) {
      setBuilderSelectionAnchorId(nextPrimaryId)
    }
  }, [allowEmptyDayFlowSelection, builderDay, builderSelectionAnchorId, schedule, selectedBuilderBlockId, selectedBuilderBlockIds, view])

  useEffect(() => {
    const blocks = schedule[builderDay].blocks
    const blockIndex = blocks.findIndex((entry) => entry.id === selectedBuilderBlockId)
    const block = blockIndex >= 0 ? blocks[blockIndex] : null
    if (!block) {
      return
    }

    const availableElements = [
      block.showTitle ? 'title' : null,
      block.showTimeRange ? 'timeRange' : null,
      block.showClock ? 'clock' : null,
      block.showTimer ? 'timer' : null,
      block.details.length > 0 ? 'details' : null,
      block.rotationGroups.length > 0 ? 'rotations' : null,
      block.showNext && blockIndex < blocks.length - 1 ? 'next' : null,
    ].filter(Boolean) as BuilderSelectionId[]

    if (selectedStageElementId !== null && selectedStageElementId !== 'background' && !availableElements.includes(selectedStageElementId)) {
      setSelectedStageElementId(availableElements[0] ?? null)
    }
  }, [builderDay, schedule, selectedBuilderBlockId, selectedStageElementId])

  useEffect(() => {
    const block = schedule[builderDay].blocks.find((entry) => entry.id === selectedBuilderBlockId)
    if (!block) {
      setSelectedStageObjectId(null)
      setEditingStageObjectId(null)
      return
    }

    if (block.stageObjects.length === 0) {
      setSelectedStageObjectId(null)
      setEditingStageObjectId(null)
      return
    }

    if (selectedStageObjectId && !block.stageObjects.some((item) => item.id === selectedStageObjectId)) {
      setSelectedStageObjectId(null)
      setEditingStageObjectId(null)
    }
  }, [builderDay, schedule, selectedBuilderBlockId, selectedStageObjectId])

  const handleStageDragMove = useEffectEvent((event: PointerEvent) => {
    const canvasBounds = builderStageCanvasRef.current?.getBoundingClientRect()
    let session = layoutDragRef.current
    if (!session && pendingLayoutDragRef.current) {
      const pendingSession = pendingLayoutDragRef.current
      const movedX = Math.abs(event.clientX - pendingSession.pointerStartX)
      const movedY = Math.abs(event.clientY - pendingSession.pointerStartY)
      if (movedX >= 4 || movedY >= 4 || pendingSession.mode !== 'move') {
        pushUndoSnapshot(schedule)
        layoutDragRef.current = pendingSession
        pendingLayoutDragRef.current = null
        session = pendingSession
      }
    }

    if (session) {
      const deltaX = getStageDeltaPercent(event.clientX - session.pointerStartX, 'x', canvasBounds)
      const deltaY = getStageDeltaPercent(event.clientY - session.pointerStartY, 'y', canvasBounds)
      updateStageElementLayout(
        builderDay,
        session.blockId,
        session.elementId,
        session.mode,
        session.origin,
        deltaX,
        deltaY,
        event.shiftKey || shiftResizeOverrideRef.current,
      )
      return
    }

    let objectSession = objectDragRef.current
    if (!objectSession && pendingObjectDragRef.current) {
      const pendingSession = pendingObjectDragRef.current
      const movedX = Math.abs(event.clientX - pendingSession.pointerStartX)
      const movedY = Math.abs(event.clientY - pendingSession.pointerStartY)
      if (movedX < 4 && movedY < 4) {
        return
      }

      pushUndoSnapshot(schedule)
      objectDragRef.current = pendingSession
      pendingObjectDragRef.current = null
      objectSession = pendingSession
    }

    if (!objectSession) {
      return
    }

      const deltaX = getStageDeltaPercent(event.clientX - objectSession.pointerStartX, 'x', canvasBounds)
      const deltaY = getStageDeltaPercent(event.clientY - objectSession.pointerStartY, 'y', canvasBounds)
      updateStageObjectLayout(
        builderDay,
        objectSession.blockId,
        objectSession.objectId,
        objectSession.mode,
        objectSession.origin,
        deltaX,
        deltaY,
        event.shiftKey || shiftResizeOverrideRef.current,
      )
  })

  useEffect(() => {
    function handlePointerUp() {
      unlockBuilderDragSelection()
      layoutDragRef.current = null
      pendingLayoutDragRef.current = null
      objectDragRef.current = null
      pendingObjectDragRef.current = null
      activityDrawerGestureRef.current = null
      displayDragRef.current = null
      shiftResizeOverrideRef.current = false
    }

    window.addEventListener('pointermove', handleStageDragMove)
    window.addEventListener('pointermove', onDisplayPointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handleStageDragMove)
      window.removeEventListener('pointermove', onDisplayPointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [])

  useEffect(() => {
    if (manualBlockId !== null || !followClockDay) {
      return
    }

    setDisplayDay(getWeekdayFromDate(clockNow))
  }, [clockNow, followClockDay, manualBlockId])

  const daySchedule = schedule[displayDay]
  const displayBlocks = daySchedule.blocks
  const minutesNow = getMinutesNow(clockNow)
  const liveIndex = getCurrentBlockIndex(displayBlocks, minutesNow)
  const manualIndex = manualBlockId ? displayBlocks.findIndex((block) => block.id === manualBlockId) : null
  const effectiveIndex = manualIndex !== null && manualIndex >= 0 ? manualIndex : liveIndex
  const activeBlock = effectiveIndex >= 0 ? displayBlocks[effectiveIndex] : undefined
  const nextBlock = effectiveIndex >= 0 ? getNextEnabledBlock(displayBlocks, effectiveIndex) : null
  const mode = manualBlockId === null ? 'live' : 'manual'
  const activeBlockIsGap = activeBlock?.rowType === 'gap'

  useEffect(() => {
    setDisplayActivityDrawerOpen(false)
  }, [displayDay, activeBlock?.id])

  const dayProgress = getDayProgress(displayBlocks, minutesNow)

  useEffect(() => {
    if (manualBlockId === null) {
      return
    }

    if (!displayBlocks.some((block) => block.id === manualBlockId)) {
      setManualBlockId(null)
      setManualTimer(null)
    }
  }, [displayBlocks, manualBlockId])

  useEffect(() => {
    if (!activeBlock || manualBlockId === null) {
      return
    }

    setManualTimer((current) => {
      if (current?.blockId === activeBlock.id) {
        return current
      }

      return createManualTimerSession(activeBlock)
    })
  }, [activeBlock, manualBlockId])

  function openManualMode(targetIndex: number) {
    if (displayLocked) {
      return
    }

    const block = displayBlocks[targetIndex]
    if (!block) {
      return
    }

    setManualBlockId(block.id)
    setManualTimer(createManualTimerSession(block))
  }

  function returnToLiveSchedule(nextDay = getWeekdayFromDate(new Date())) {
    if (displayLocked) {
      return
    }

    setManualBlockId(null)
    setManualTimer(null)
    setDisplayHoldBlockId(null)
    setDisplayReplayState(null)
    setFollowClockDay(nextDay === getWeekdayFromDate(new Date()))
    setDisplayDay(nextDay)
  }

  function openCurrentForEditingFromDisplay() {
    if (activeBlock && activeBlock.rowType === 'gap') {
      setBuilderDay(displayDay)
      applyBuilderBlockSelection(displayDay, [activeBlock.id], activeBlock.id)
      setDayFlowExpandedGapId(activeBlock.id)
      setView('day-flow')
      return
    }

    if (activeBlock) {
      setBuilderDay(displayDay)
      applyBuilderBlockSelection(displayDay, [activeBlock.id], activeBlock.id)
    }
    setView('builder')
  }

  function openGapInPlan(dayId: WeekdayId, gapBlockId: string) {
    setView('day-flow')
    setBuilderDay(dayId)
    setDayFlowExpandedGapId(gapBlockId)
  }

  function refreshBuilderStripIndicator() {
    const strip = builderBlockStripRef.current
    if (!strip) {
      setBuilderStripIndicator({ visible: false, left: 0, width: 0 })
      return
    }

    const trackWidth = strip.clientWidth
    const maxScroll = strip.scrollWidth - strip.clientWidth
    if (trackWidth <= 0 || maxScroll <= 0) {
      setBuilderStripIndicator({ visible: false, left: 0, width: 0 })
      return
    }

    const thumbWidth = Math.max((trackWidth * trackWidth) / strip.scrollWidth, 24)
    const maxLeft = Math.max(trackWidth - thumbWidth, 0)
    const progress = maxScroll > 0 ? strip.scrollLeft / maxScroll : 0
    const left = Math.min(Math.max(progress * maxLeft, 0), maxLeft)
    setBuilderStripIndicator({ visible: true, left, width: thumbWidth })
  }

  function toggleLiveDisplay() {
    if (displayLocked) {
      return
    }

    const isLive = manualBlockId === null && displayHoldBlockId === null && displayReplayState === null && followClockDay
    if (isLive && liveToggleSnapshot) {
      setManualBlockId(liveToggleSnapshot.manualBlockId)
      setManualTimer(null)
      setDisplayHoldBlockId(liveToggleSnapshot.displayHoldBlockId)
      setDisplayReplayState(liveToggleSnapshot.displayReplayState)
      setFollowClockDay(liveToggleSnapshot.followClockDay)
      setDisplayDay(liveToggleSnapshot.displayDay)
      return
    }

    setLiveToggleSnapshot({
      displayDay,
      manualBlockId,
      followClockDay,
      displayHoldBlockId,
      displayReplayState,
    })
    returnToLiveSchedule()
  }

  function togglePausePlayDisplay() {
    if (displayLocked) {
      return
    }

    if (displayHoldBlockId !== null) {
      setDisplayHoldBlockId(null)
      return
    }

    const block = displayStageBlock ?? activeBlock
    if (!block) {
      return
    }

    setDisplayReplayState(null)
    setDisplayHoldBlockId(block.id)
  }

  function restartCurrentDisplay() {
    if (displayLocked) {
      return
    }

    const block = displayStageBlock ?? activeBlock
    if (!block || block.rowType === 'gap') {
      return
    }

    setDisplayHoldBlockId(null)
    setManualBlockId(null)
    setManualTimer(null)
    setDisplayReplayState({
      blockId: block.id,
      startMinutes: timeToMinutes(block.startTime),
      startedAt: clockNow.getTime(),
    })
  }

  function previewDay(dayId: WeekdayId) {
    if (displayLocked) {
      return
    }

    setManualBlockId(null)
    setManualTimer(null)
    setFollowClockDay(false)
    setDisplayDay(dayId)
  }

  function updateManualTimer(action: 'pause' | 'resume' | 'add1' | 'add5' | 'reset') {
    if (displayLocked) {
      return
    }

    setManualTimer((current) => {
      if (!current) {
        return current
      }

      if (action === 'pause' && current.pausedRemainingSeconds === null) {
        const elapsed = Math.floor((Date.now() - current.startedAt) / 1000)
        const remaining = Math.max(current.durationSeconds + current.extraSeconds - elapsed, 0)
        return { ...current, pausedRemainingSeconds: remaining }
      }

      if (action === 'resume' && current.pausedRemainingSeconds !== null) {
        return {
          ...current,
          startedAt: Date.now(),
          durationSeconds: current.pausedRemainingSeconds,
          extraSeconds: 0,
          pausedRemainingSeconds: null,
        }
      }

      if (action === 'add1') {
        return { ...current, extraSeconds: current.extraSeconds + 60 }
      }

      if (action === 'add5') {
        return { ...current, extraSeconds: current.extraSeconds + 300 }
      }

      if (action === 'reset') {
        return {
          ...current,
          extraSeconds: 0,
          startedAt: Date.now(),
          pausedRemainingSeconds: null,
        }
      }

      return current
    })
  }

  function getRemainingSeconds(): number {
    if (!activeBlock) {
      return 0
    }

    if (manualBlockId === null) {
      const endMinutes = timeToMinutes(activeBlock.endTime)
      return Math.max(Math.round((endMinutes - minutesNow) * 60), 0)
    }

    if (!manualTimer) {
      return 0
    }

    if (manualTimer.pausedRemainingSeconds !== null) {
      return manualTimer.pausedRemainingSeconds
    }

    const elapsed = Math.floor((Date.now() - manualTimer.startedAt) / 1000)
    return Math.max(manualTimer.durationSeconds + manualTimer.extraSeconds - elapsed, 0)
  }

  function getScopeTargetBlocks(current: ScheduleState, dayId: WeekdayId, scope: StageObjectScope) {
    if (scope === 'all-days') {
      return weekdayOrder.flatMap((targetDayId) =>
        current[targetDayId].blocks
          .filter((block) => block.rowType === 'activity')
          .map((block) => ({ dayId: targetDayId, block })),
      )
    }

    if (scope === 'day') {
      return current[dayId].blocks
        .filter((block) => block.rowType === 'activity')
        .map((block) => ({ dayId, block }))
    }

    return []
  }

  function cloneStageObjectForBlock(source: StageObject, blockId: string): StageObject {
    return {
      ...source,
      id: createStageObjectId(blockId, source.type),
      textStyle: { ...source.textStyle },
    }
  }

  function syncStageObjectAcrossScope(
    next: ScheduleState,
    dayId: WeekdayId,
    blockId: string,
    objectId: string,
    updater: (object: StageObject, block: ScheduleBlock) => void,
  ): boolean {
    const sourceBlock = next[dayId].blocks.find((entry) => entry.id === blockId)
    const sourceObject = sourceBlock?.stageObjects.find((entry) => entry.id === objectId)
    if (!sourceBlock || !sourceObject) {
      return false
    }

    updater(sourceObject, sourceBlock)

    if (sourceObject.scope === 'block' || !sourceObject.syncKey) {
      return true
    }

    const targets = getScopeTargetBlocks(next, dayId, sourceObject.scope)
    targets.forEach(({ block: targetBlock }) => {
      if (targetBlock.id === blockId) {
        return
      }

      const existing = targetBlock.stageObjects.find((entry) => entry.syncKey === sourceObject.syncKey)
      if (existing) {
        updater(existing, targetBlock)
        existing.scope = sourceObject.scope
        existing.syncKey = sourceObject.syncKey
        return
      }

      const clone = cloneStageObjectForBlock(sourceObject, targetBlock.id)
      clone.scope = sourceObject.scope
      clone.syncKey = sourceObject.syncKey
      updater(clone, targetBlock)
      targetBlock.stageObjects.push(clone)
    })

    return true
  }

  function updateBlock(dayId: WeekdayId, blockId: string, field: keyof ScheduleBlock, value: string | boolean) {
    if (field === 'startTime' || field === 'endTime') {
      const nextValue = String(value)
      const dayBlocks = schedule[dayId].blocks
      const sortedBlocks = sortBlocksByTime(dayBlocks)
      const sortedIndex = sortedBlocks.findIndex((entry) => entry.id === blockId)
      const block = sortedIndex >= 0 ? sortedBlocks[sortedIndex] : null
      if (!block) {
        return
      }

      const previousBlock = sortedIndex > 0 ? sortedBlocks[sortedIndex - 1] : null
      const nextBlock = sortedIndex < sortedBlocks.length - 1 ? sortedBlocks[sortedIndex + 1] : null
      const proposedStart = field === 'startTime' ? nextValue : block.startTime
      const proposedEnd = field === 'endTime' ? nextValue : block.endTime
      const shouldCheckPrevious = field === 'startTime'
      const shouldCheckNext = field === 'endTime'

      if (timeToMinutes(proposedEnd) <= timeToMinutes(proposedStart)) {
        showBuilderInteractionMessage('Each block must have a real duration.')
        return
      }

      const hitsPrevious = shouldCheckPrevious && previousBlock !== null && timeToMinutes(proposedStart) < timeToMinutes(previousBlock.endTime)
      const hitsNext = shouldCheckNext && nextBlock !== null && timeToMinutes(proposedEnd) > timeToMinutes(nextBlock.startTime)
      if (hitsPrevious || hitsNext) {
        const adjusted = applyBlockTimeEdit(dayId, blockId, field, nextValue, true)
        if (adjusted) {
          showBuilderInteractionMessage('Adjusted the touching block to keep the day in order.')
        }
        return
      }

      applyBlockTimeEdit(dayId, blockId, field, nextValue, true)
      return
    }

    updateDayBlocks(dayId, (blocks) => {
      const block = blocks.find((entry) => entry.id === blockId)
      if (!block) {
        return false
      }

      if (field === 'details' || field === 'rotationGroups') {
        block[field] = String(value)
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean)
        return true
      }

      if (field === 'showTitle') {
        block.showTitle = Boolean(value)
        return true
      }

      if (field === 'showTimeRange') {
        block.showTimeRange = Boolean(value)
        return true
      }

      if (field === 'showTimer') {
        block.showTimer = Boolean(value)
        return true
      }

      if (field === 'showNext') {
        block.showNext = Boolean(value)
        return true
      }

      if (field === 'showClock') {
        block.showClock = Boolean(value)
        return true
      }

      if (field === 'showActivity') {
        block.showActivity = Boolean(value)
        return true
      }

      if (field === 'enabled') {
        block.enabled = Boolean(value)
        return true
      }

      if (field === 'gentleBackground') {
        block.gentleBackground = Boolean(value)
        return true
      }

      if (field === 'activityDisplayMode') {
        block.activityDisplayMode =
          value === 'upcoming' || value === 'both' || value === 'list'
            ? value
            : 'active'
        return true
      }

      if (field === 'activityStackMode') {
        block.activityStackMode = value === 'primary' ? 'primary' : 'all'
        return true
      }

      if (field === 'showActivityTitle') {
        block.showActivityTitle = Boolean(value)
        return true
      }

      if (field === 'showActivityTimeRange') {
        block.showActivityTimeRange = Boolean(value)
        return true
      }

      if (field === 'showActivityCountdown') {
        block.showActivityCountdown = Boolean(value)
        return true
      }

      if (field === 'showActivityStartsIn') {
        block.showActivityStartsIn = Boolean(value)
        return true
      }

      if (field === 'rowType') {
        block.rowType = value === 'gap' ? 'gap' : 'activity'
        if (block.rowType === 'gap') {
          block.color = 'slate'
          block.openTimeMode = 'default'
          block.showTitle = false
          block.showTimeRange = false
          block.showTimer = false
          block.showNext = false
          block.showClock = false
          block.showActivity = false
          block.stageObjects = []
        }
        return true
      }

      if (field === 'openTimeMode') {
        block.openTimeMode =
          value === 'countdown' ||
          value === 'blank' ||
          value === 'previous-block' ||
          value === 'next-block'
            ? value
            : 'default'
        return true
      }

      ;(block[field] as string) = String(value)

      if (field === 'layout') {
        block.stageLayout = createDefaultStageLayout(String(value) as ScheduleBlock['layout'])
      }

      return true
    })
  }

  function normalizeActivityTimesForDay(dayId: WeekdayId, activity: DayActivity): DayActivity {
    const bounds = getDayActivityBounds(schedule[dayId].blocks)
    if (!bounds) {
      return activity
    }

    const minStart = timeToMinutes(bounds.startTime)
    const maxEnd = timeToMinutes(bounds.endTime)
    const proposedStart = Math.max(timeToMinutes(activity.startTime), minStart)
    const proposedEnd = Math.min(timeToMinutes(activity.endTime), maxEnd)
    const finalEnd = Math.max(proposedEnd, proposedStart + 1)

    return {
      ...activity,
      startTime: `${String(Math.floor(proposedStart / 60)).padStart(2, '0')}:${String(proposedStart % 60).padStart(2, '0')}`,
      endTime: `${String(Math.floor(finalEnd / 60)).padStart(2, '0')}:${String(finalEnd % 60).padStart(2, '0')}`,
    }
  }

  function addDayActivity(dayId: WeekdayId) {
    const newActivity = normalizeActivityTimesForDay(dayId, getDefaultDayActivity(schedule[dayId].blocks, schedule[dayId].activities.length))
    updateDayActivities(dayId, (activities) => {
      activities.push(newActivity)
      return true
    })
    setSelectedDayActivityId(newActivity.id)
    setSelectedDayActivityIds([newActivity.id])
  }

  function applyDayActivityDraft(dayId: WeekdayId, activityId: string, draft: DayActivityDraft) {
    updateDayActivities(dayId, (activities) => {
      const activity = activities.find((entry) => entry.id === activityId)
      if (!activity) {
        return false
      }

      activity.title = draft.title
      activity.startTime = draft.startTime
      activity.endTime = draft.endTime
      activity.color = draft.color

      const normalized = normalizeActivityTimesForDay(dayId, activity)
      activity.startTime = normalized.startTime
      activity.endTime = normalized.endTime
      return true
    })
  }

  function toggleDayActivitySelection(activityId: string) {
    setSelectedDayActivityIds((current) => (current.includes(activityId) ? current.filter((id) => id !== activityId) : [...current, activityId]))
    setSelectedDayActivityId(activityId)
  }

  function removeDayActivities(dayId: WeekdayId, activityIds: string[]) {
    if (activityIds.length === 0) {
      return
    }

    updateDayActivities(dayId, (activities) => {
      const before = activities.length
      const idSet = new Set(activityIds)
      const remaining = activities.filter((activity) => !idSet.has(activity.id))
      activities.splice(0, activities.length, ...remaining)
      return remaining.length !== before
    })
    setSelectedDayActivityIds([])
    setSelectedDayActivityId(null)
  }

  function copyDayActivitiesToTargets(sourceDayId: WeekdayId, targetDayIds: WeekdayId[]) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const sourceActivities = next[sourceDayId].activities.map((activity) => ({ ...activity }))
      targetDayIds.forEach((dayId) => {
        next[dayId].activities = sourceActivities.map((activity, index) => ({
          ...activity,
          id: `${dayId}-${activity.id}-${index + 1}`,
          order: index,
        }))
      })
      return next
    })
  }

  function copySelectedActivitiesToTargets(sourceDayId: WeekdayId, activityIds: string[], targetDayIds: WeekdayId[]) {
    if (activityIds.length === 0) {
      return
    }

    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const sourceActivities = sortActivitiesByTime(next[sourceDayId].activities).filter((activity) => activityIds.includes(activity.id))
      targetDayIds.forEach((dayId) => {
        next[dayId].activities = sourceActivities.map((activity, index) => ({
          ...activity,
          id: `${dayId}-${activity.id}-${index + 1}`,
          order: index,
        }))
      })
      return next
    })
  }

  function moveDayActivity(dayId: WeekdayId, activityId: string, direction: 'earlier' | 'later') {
    updateDayActivities(dayId, (activities) => {
      const ordered = sortActivitiesByTime(activities)
      const currentIndex = ordered.findIndex((activity) => activity.id === activityId)
      if (currentIndex < 0) {
        return false
      }

      const targetIndex = direction === 'earlier' ? currentIndex - 1 : currentIndex + 1
      if (targetIndex < 0 || targetIndex >= ordered.length) {
        return false
      }

      const [entry] = ordered.splice(currentIndex, 1)
      ordered.splice(targetIndex, 0, entry)
      activities.splice(0, activities.length, ...ordered)
      return true
    })
  }

  function updateStageElementLayout(
    dayId: WeekdayId,
    blockId: string,
    elementId: StageElementId,
    mode: LayoutDragSession['mode'],
    origin: StageElementLayout,
    deltaX: number,
    deltaY: number,
    unlockRatio: boolean,
  ) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const block = next[dayId].blocks.find((entry) => entry.id === blockId)
      if (!block) {
        return current
      }

      const { width: minimumWidth, height: minimumHeight } = getMinimumStageElementSize(elementId)
      const currentLayout = block.stageLayout[elementId]
      const isActivityElement = elementId === 'activity'

      if (mode === 'move') {
        currentLayout.x = isActivityElement ? Math.max(0, 100 - currentLayout.width) : Math.min(Math.max(origin.x + deltaX, 0), 100 - currentLayout.width)
        currentLayout.y = Math.min(Math.max(origin.y + deltaY, 0), 100 - currentLayout.height)
      } else {
        const nextRect = resizeRect(
          origin,
          mode,
          deltaX,
          deltaY,
          minimumWidth,
          minimumHeight,
          getRatioLockedElementRule(),
          unlockRatio,
        )
        currentLayout.x = isActivityElement ? Math.max(0, 100 - nextRect.width) : nextRect.x
        currentLayout.y = nextRect.y
        currentLayout.width = nextRect.width
        currentLayout.height = nextRect.height
      }
      return next
    }, { recordUndo: false })
  }

  function updateStageObjectLayout(
    dayId: WeekdayId,
    blockId: string,
    objectId: string,
    mode: ObjectDragSession['mode'],
    origin: Pick<StageObject, 'x' | 'y' | 'width' | 'height'>,
    deltaX: number,
    deltaY: number,
    unlockRatio: boolean,
  ) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const sourceBlock = next[dayId].blocks.find((entry) => entry.id === blockId)
      const sourceObject = sourceBlock?.stageObjects.find((entry) => entry.id === objectId)
      if (!sourceBlock || !sourceObject) {
        return current
      }

      const didSync = syncStageObjectAcrossScope(next, dayId, blockId, objectId, (object) => {
        if (mode === 'move') {
          object.x = Math.min(Math.max(origin.x + deltaX, 0), 100 - object.width)
          object.y = Math.min(Math.max(origin.y + deltaY, 0), 100 - object.height)
          return
        }

        const calendarMinimum = object.type === 'calendar' ? getCalendarMinimumSize(parseCalendarWidgetData(object.widgetData)) : null
        const minimumWidth = calendarMinimum?.width ?? 14
        const minimumHeight = calendarMinimum?.height ?? 10
        const nextRect = resizeRect(
          origin,
          mode,
          deltaX,
          deltaY,
          minimumWidth,
          minimumHeight,
          getRatioLockedObjectRule(object),
          unlockRatio,
        )
        object.x = nextRect.x
        object.y = nextRect.y
        object.width = nextRect.width
        object.height = nextRect.height
        syncAutoHeightForTextObject(object)
      })

      if (!didSync) {
        return current
      }

      return next
    }, { recordUndo: false })
  }

  function addStageObject(
    dayId: WeekdayId,
    blockId: string,
    type: StageObjectType,
    x = 12,
    y = 12,
    overrides: Partial<Pick<StageObject, 'src' | 'text' | 'width' | 'height' | 'locked' | 'scope' | 'syncKey' | 'widgetData' | 'widgetLayoutPreset' | 'displayMovable'>> = {},
  ) {
    const objectId = createStageObjectId(blockId, type)
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const block = next[dayId].blocks.find((entry) => entry.id === blockId)
      if (!block) {
        return current
      }

      const defaultCalendarData = parseCalendarWidgetData(overrides.widgetData ?? getDefaultWidgetData(type))
      const preferredCalendarSize = getCalendarPreferredSize(defaultCalendarData)
      const defaultWeatherLiveData = parseWeatherLiveWidgetData(overrides.widgetData ?? getDefaultWidgetData(type))
      const preferredWeatherLiveSize = getWeatherLivePreferredSize(defaultWeatherLiveData)
      const defaultWidth =
        overrides.width ??
        (type === 'youtube'
          ? 34
          : type === 'calendar'
            ? preferredCalendarSize.width
            : type === 'weather-live'
              ? preferredWeatherLiveSize.width
              : type === 'image'
                ? 28
                : type === 'checklist'
                  ? 28
                  : type === 'note-card'
                    ? 34
                    : 24)
      const defaultHeight =
        overrides.height ??
        (type === 'youtube'
          ? Number(getPercentHeightForPixelAspect(defaultWidth, YOUTUBE_ASPECT_RATIO).toFixed(2))
          : type === 'calendar'
            ? Number(preferredCalendarSize.height.toFixed(2))
            : type === 'note-card'
              ? 14
              : type === 'text'
                ? 16
                  : type === 'date'
                    ? 18
                    : type === 'weather'
                      ? 18
                      : type === 'weather-live'
                        ? preferredWeatherLiveSize.height
                    : 22)
      const stageObject: StageObject = {
        id: objectId,
        type,
        scope: overrides.scope ?? 'block',
        syncKey: overrides.syncKey ?? '',
        displayMovable: overrides.displayMovable ?? false,
        x,
        y,
        width: defaultWidth,
        height: defaultHeight,
        zIndex: block.stageObjects.length,
        locked: false,
        text: overrides.text ?? (type === 'note-card' ? 'New note card' : type === 'text' ? 'New text box' : ''),
        src: overrides.src ?? '',
        widgetData: overrides.widgetData ?? getDefaultWidgetData(type),
        widgetLayoutPreset: overrides.widgetLayoutPreset ?? getDefaultWidgetLayoutPreset(type),
        textStyle: type === 'image' ? createDefaultImageStyle() : createDefaultTextStyle(),
      }
      syncAutoHeightForTextObject(stageObject)
      block.stageObjects.push(stageObject)
      setEditingStageObjectId(null)
      setSelectedStageObjectId(objectId)
      setSelectedStageElementId('background')
      return next
    })
  }

  function updateStageObject(dayId: WeekdayId, blockId: string, objectId: string, field: keyof StageObject, value: string | boolean) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const didSync = syncStageObjectAcrossScope(next, dayId, blockId, objectId, (object) => {
        if (field === 'displayMovable') {
          object.displayMovable = Boolean(value)
          return
        }

        if (field === 'src' && object.type === 'youtube') {
          object.src = normalizeYouTubeUrl(String(value))
          return
        }

      if (field === 'widgetData' || field === 'widgetLayoutPreset') {
        object[field] = String(value)
        if (field === 'widgetData' && object.type === 'checklist') {
          syncAutoHeightForTextObject(object)
        }
        return
      }

        ;(object[field] as string) = String(value)
        syncAutoHeightForTextObject(object)
      })
      if (!didSync) {
        return current
      }
      return next
    })
  }

  function updateCalendarObjectMode(dayId: WeekdayId, blockId: string, objectId: string, mode: CalendarWidgetMode) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const didSync = syncStageObjectAcrossScope(next, dayId, blockId, objectId, (object) => {
        if (object.type !== 'calendar') {
          return
        }

        const nextData: CalendarWidgetData = { ...parseCalendarWidgetData(object.widgetData), mode }
        const aspectRatio = getCalendarAspectRatio(nextData)
        const minimum = getCalendarMinimumSize(nextData)
        const preferred = getCalendarPreferredSize(nextData)
        const maxWidth = Math.max(100 - object.x, minimum.width)
        const maxHeight = Math.max(100 - object.y, minimum.height)

        let width = Math.min(Math.max(object.width, minimum.width), maxWidth)
        let height = getPercentHeightForPixelAspect(width, aspectRatio)

        if (height < minimum.height) {
          height = minimum.height
          width = Math.min(Math.max(getPercentWidthForPixelAspect(height, aspectRatio), minimum.width), maxWidth)
        }

        if (height > maxHeight) {
          height = maxHeight
          width = Math.min(Math.max(getPercentWidthForPixelAspect(height, aspectRatio), minimum.width), maxWidth)
        }

        if (mode === 'week' && width < preferred.width && preferred.width <= maxWidth) {
          width = preferred.width
          height = getPercentHeightForPixelAspect(width, aspectRatio)
        }

        if (mode === 'month' && height < preferred.height && preferred.height <= maxHeight) {
          height = preferred.height
          width = Math.min(Math.max(getPercentWidthForPixelAspect(height, aspectRatio), minimum.width), maxWidth)
        }

        if (height > maxHeight) {
          height = maxHeight
          width = Math.min(Math.max(getPercentWidthForPixelAspect(height, aspectRatio), minimum.width), maxWidth)
        }

        object.widgetData = JSON.stringify(nextData)
        object.width = Number(Math.min(width, maxWidth).toFixed(2))
        object.height = Number(Math.min(Math.max(height, minimum.height), maxHeight).toFixed(2))
      })

      if (!didSync) {
        return current
      }

      return next
    })
  }

  function toggleChecklistWidgetItem(dayId: WeekdayId, blockId: string, objectId: string, itemId: string) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const didSync = syncStageObjectAcrossScope(next, dayId, blockId, objectId, (object) => {
        if (object.type !== 'checklist') {
          return
        }

        const items = parseChecklistWidgetData(object.widgetData).map((item) =>
          item.id === itemId ? { ...item, checked: !item.checked } : item,
        )
        object.widgetData = JSON.stringify({ items })
      })

      if (!didSync) {
        return current
      }

      return next
    })
  }

  function updateStageObjectTextStyle(
    dayId: WeekdayId,
    blockId: string,
    objectId: string,
    field: keyof StageTextStyle,
    value: string | number | boolean,
  ) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const sourceBlock = next[dayId].blocks.find((entry) => entry.id === blockId)
      const sourceObject = sourceBlock?.stageObjects.find((entry) => entry.id === objectId)
      if (!sourceBlock || !sourceObject || (sourceObject.type !== 'text' && sourceObject.type !== 'note-card' && sourceObject.type !== 'checklist')) {
        return current
      }

      syncStageObjectAcrossScope(next, dayId, blockId, objectId, (object) => {
        if (object.type !== 'text' && object.type !== 'note-card' && object.type !== 'checklist') {
          return
        }
        if (field === 'fontSize' || field === 'padding' || field === 'borderRadius' || field === 'lineHeight') {
          object.textStyle[field] = Number(value) as never
        } else if (field === 'underline' || field === 'strikethrough') {
          object.textStyle[field] = Boolean(value) as never
        } else {
          object.textStyle[field] = String(value) as never
        }
        syncAutoHeightForTextObject(object)
      })

      return next
    })
  }

  function updateStageElementTextStyle(
    dayId: WeekdayId,
    blockId: string,
    elementId: StageTextElementId,
    field: keyof StageTextStyle,
    value: string | number | boolean,
  ) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const block = next[dayId].blocks.find((entry) => entry.id === blockId)
      if (!block) {
        return current
      }

      if (field === 'fontSize' || field === 'padding' || field === 'borderRadius' || field === 'lineHeight') {
        block.stageElementTextStyles[elementId][field] = Number(value) as never
      } else if (field === 'underline' || field === 'strikethrough') {
        block.stageElementTextStyles[elementId][field] = Boolean(value) as never
      } else {
        block.stageElementTextStyles[elementId][field] = String(value) as never
      }

      return next
    })
  }

  function moveStageElementToDefault(dayId: WeekdayId, blockId: string, elementId: StageElementId) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const block = next[dayId].blocks.find((entry) => entry.id === blockId)
      if (!block) {
        return current
      }

      const target = next[dayId].stageElementDefaults[elementId]
      if (target) {
        block.stageLayout[elementId] = { ...target.layout }
        if (target.textStyle && elementId !== 'image' && elementId !== 'clock' && elementId !== 'timer') {
          block.stageElementTextStyles[elementId] = { ...target.textStyle }
        }
      } else {
        block.stageLayout[elementId] = { ...createDefaultStageLayout(block.layout)[elementId] }
      }
      return next
    })
    showBuilderInteractionMessage(`${elementId} moved to its default spot.`)
  }

  function resetStageElementToTemplate(dayId: WeekdayId, blockId: string, elementId: StageElementId) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const block = next[dayId].blocks.find((entry) => entry.id === blockId)
      if (!block) {
        return current
      }

      block.stageLayout[elementId] = { ...createDefaultStageLayout(block.layout)[elementId] }
      if (elementId !== 'image' && elementId !== 'clock' && elementId !== 'timer') {
        block.stageElementTextStyles[elementId] = { ...createDefaultStageElementTextStyles()[elementId] }
      }
      return next
    })
    showBuilderInteractionMessage(`${elementId} reset to the ${selectedBuilderBlock?.layout ?? 'slide'} template.`)
  }

  function setStageElementDefault(dayId: WeekdayId, blockId: string, elementId: StageElementId, scope: 'day' | 'all-days') {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const sourceBlock = next[dayId].blocks.find((entry) => entry.id === blockId)
      if (!sourceBlock) {
        return current
      }

      const targetDays = scope === 'all-days' ? weekdayOrder : [dayId]
      const defaultState = cloneStageElementDefaultState(
        elementId,
        sourceBlock.stageLayout[elementId],
        elementId === 'image' || elementId === 'clock' || elementId === 'timer' ? undefined : sourceBlock.stageElementTextStyles[elementId],
      )

      targetDays.forEach((targetDayId) => {
        next[targetDayId].stageElementDefaults[elementId] = {
          layout: { ...defaultState.layout },
          textStyle: defaultState.textStyle ? { ...defaultState.textStyle } : undefined,
        }
        next[targetDayId].blocks.forEach((block) => {
          block.stageLayout[elementId] = { ...defaultState.layout }
          if (defaultState.textStyle && elementId !== 'image' && elementId !== 'clock' && elementId !== 'timer') {
            block.stageElementTextStyles[elementId] = { ...defaultState.textStyle }
          }
        })
      })

      return next
    })
    showBuilderInteractionMessage(scope === 'day' ? `${elementId} default saved for this day.` : `${elementId} default saved for all days.`)
  }

  function arrangeStageObject(dayId: WeekdayId, blockId: string, objectId: string, direction: 'forward' | 'backward' | 'front' | 'back') {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const block = next[dayId].blocks.find((entry) => entry.id === blockId)
      if (!block) {
        return current
      }

      const ordered = [...block.stageObjects].sort((left, right) => left.zIndex - right.zIndex)
      const currentIndex = ordered.findIndex((entry) => entry.id === objectId)
      if (currentIndex < 0) {
        return current
      }

      const [target] = ordered.splice(currentIndex, 1)

      if (direction === 'forward') {
        ordered.splice(Math.min(currentIndex + 1, ordered.length), 0, target)
      } else if (direction === 'backward') {
        ordered.splice(Math.max(currentIndex - 1, 0), 0, target)
      } else if (direction === 'front') {
        ordered.push(target)
      } else {
        ordered.unshift(target)
      }

      block.stageObjects = ordered.map((entry, index) => ({ ...entry, zIndex: index }))
      return next
    })
  }

  function removeStageObject(dayId: WeekdayId, blockId: string, objectId: string) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const block = next[dayId].blocks.find((entry) => entry.id === blockId)
      const object = block?.stageObjects.find((entry) => entry.id === objectId)
      if (!block || !object) {
        return current
      }

      if (object.scope !== 'block' && object.syncKey) {
        getScopeTargetBlocks(next, dayId, object.scope).forEach(({ block: targetBlock }) => {
          targetBlock.stageObjects = targetBlock.stageObjects
            .filter((entry) => entry.syncKey !== object.syncKey)
            .map((entry, index) => ({ ...entry, zIndex: index }))
        })
      } else {
        block.stageObjects = block.stageObjects
          .filter((entry) => entry.id !== objectId)
          .map((entry, index) => ({ ...entry, zIndex: index }))
      }

      setSelectedStageObjectId(null)
      return next
    })
  }

  function removeStageObjectFromCurrentBlock(dayId: WeekdayId, blockId: string, objectId: string) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const block = next[dayId].blocks.find((entry) => entry.id === blockId)
      if (!block) {
        return current
      }

      const initialLength = block.stageObjects.length
      block.stageObjects = block.stageObjects
        .filter((entry) => entry.id !== objectId)
        .map((entry, index) => ({ ...entry, zIndex: index }))

      if (block.stageObjects.length === initialLength) {
        return current
      }

      setSelectedStageObjectId(null)
      return next
    })
  }

  function unlinkStageObjectFromCurrentBlock(dayId: WeekdayId, blockId: string, objectId: string) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const block = next[dayId].blocks.find((entry) => entry.id === blockId)
      const object = block?.stageObjects.find((entry) => entry.id === objectId)
      if (!block || !object) {
        return current
      }

      object.scope = 'block'
      object.syncKey = ''
      return next
    })
    showBuilderInteractionMessage('This slide is now independent.')
  }

  function requestRemoveAllLinkedCopies(dayId: WeekdayId, blockId: string, objectId: string) {
    if (linkedDeleteWarningDisabled) {
      removeStageObject(dayId, blockId, objectId)
      return
    }

    setDontShowLinkedDeleteAgain(false)
    setPendingLinkedDelete({ dayId, blockId, objectId })
  }

  function confirmRemoveAllLinkedCopies() {
    if (!pendingLinkedDelete) {
      return
    }

    if (dontShowLinkedDeleteAgain) {
      setLinkedDeleteWarningDisabled(true)
    }

    removeStageObject(pendingLinkedDelete.dayId, pendingLinkedDelete.blockId, pendingLinkedDelete.objectId)
    setPendingLinkedDelete(null)
    setDontShowLinkedDeleteAgain(false)
  }

  function startStageObjectDrag(event: ReactPointerEvent<HTMLElement>, block: ScheduleBlock, object: StageObject, mode: ObjectDragSession['mode']) {
    pendingObjectDragRef.current = {
      blockId: block.id,
      objectId: object.id,
      mode,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      origin: { x: object.x, y: object.y, width: object.width, height: object.height },
    }
  }

  function onBuilderStageObjectPointerDown(event: ReactPointerEvent<HTMLDivElement>, block: ScheduleBlock, object: StageObject) {
    event.stopPropagation()
    applyBuilderBlockSelection(builderDay, [block.id], block.id)
    setSelectedStageObjectId(object.id)
    setSelectedStageElementId('background')

    const isInlineEditable = object.type === 'text' || object.type === 'note-card'
    const shouldEnterInlineEdit = isInlineEditable && selectedStageObjectId === object.id && editingStageObjectId !== object.id
    if (shouldEnterInlineEdit) {
      setEditingStageObjectId(object.id)
      return
    }

    event.preventDefault()
    lockBuilderDragSelection()
    setEditingStageObjectId(null)
    startStageObjectDrag(event, block, object, getObjectPointerMode(event, object.type))
  }

  function moveBlock(dayId: WeekdayId, index: number, direction: -1 | 1) {
    reorderBlockSlots(dayId, index, index + direction)
  }

  function removeBlock(dayId: WeekdayId, blockId: string) {
    updateDayBlocks(dayId, (blocks) => {
      const index = blocks.findIndex((entry) => entry.id === blockId)
      if (index < 0) {
        return false
      }

      const block = blocks[index]
      if (block.rowType === 'gap') {
        const remainingBlocks = blocks.filter((entry) => entry.id !== blockId)
        blocks.splice(0, blocks.length, ...mergeAdjacentGapBlocks(sortBlocksByTime(remainingBlocks)))
        return true
      }

      blocks[index] = createGapBlock(dayId, index, block.startTime, block.endTime)
      blocks.splice(0, blocks.length, ...mergeAdjacentGapBlocks(sortBlocksByTime(blocks)))
      return true
    })
  }

  function duplicateBlock(dayId: WeekdayId, index: number) {
    let duplicatePlaced = false
    updateDayBlocks(dayId, (blocks) => {
      const source = blocks[index]
      if (!source) {
        return false
      }

      if (source.rowType === 'gap') {
        return false
      }

      const targetGap = blocks.find((entry, entryIndex) => entryIndex > index && entry.rowType === 'gap')
      if (!targetGap) {
        return false
      }

      const timestamp = Date.now()
      const replacement: ScheduleBlock = {
        ...source,
        id: `${source.id}-copy-${timestamp}`,
        title: `${source.title} Copy`,
        startTime: targetGap.startTime,
        endTime: targetGap.endTime,
        rowType: 'activity',
        openTimeMode: 'blank',
        stageLayout: JSON.parse(JSON.stringify(source.stageLayout)) as ScheduleBlock['stageLayout'],
        stageElementTextStyles: JSON.parse(JSON.stringify(source.stageElementTextStyles)) as ScheduleBlock['stageElementTextStyles'],
        stageObjects: source.stageObjects.map((entry, objectIndex) => ({ ...entry, id: `${entry.id}-copy-${timestamp}-${objectIndex}`, zIndex: objectIndex })),
      }

      const gapIndex = blocks.findIndex((entry) => entry.id === targetGap.id)
      if (gapIndex < 0) {
        return false
      }
      blocks[gapIndex] = replacement
      duplicatePlaced = true
      return true
    })

    if (duplicatePlaced) {
      showBuilderInteractionMessage('Block copied into the next open-time slot.')
      return
    }

    showBuilderInteractionMessage('No open-time slot available. Add open time first.')
  }

  function setBlocksEnabled(dayId: WeekdayId, blockIds: string[], enabled: boolean) {
    if (blockIds.length === 0) {
      return
    }

    updateDayBlocks(dayId, (blocks) => {
      const selectedIds = new Set(blockIds)
      let changed = false
      blocks.forEach((block) => {
        if (selectedIds.has(block.id) && block.enabled !== enabled) {
          block.enabled = enabled
          changed = true
        }
      })
      return changed
    })
  }

  function removeBlocks(dayId: WeekdayId, blockIds: string[]) {
    if (blockIds.length === 0) {
      return
    }

    updateDayBlocks(dayId, (blocks) => {
      const selectedIds = new Set(blockIds)
      let changed = false
      const nextBlocks = blocks.flatMap((block, index) => {
        if (!selectedIds.has(block.id)) {
          return [block]
        }

        changed = true
        if (block.rowType === 'gap') {
          return []
        }

        return [createGapBlock(dayId, index, block.startTime, block.endTime)]
      })

      if (!changed) {
        return false
      }

      blocks.splice(0, blocks.length, ...mergeAdjacentGapBlocks(sortBlocksByTime(nextBlocks)))
      return true
    })
  }

  function applyBlockTimeEdit(
    dayId: WeekdayId,
    blockId: string,
    field: 'startTime' | 'endTime',
    value: string,
    allowNeighborPush: boolean,
  ): boolean {
    let changed = false
    let blockedMessage: string | null = null

    updateDayBlocks(dayId, (blocks) => {
      const block = blocks.find((entry) => entry.id === blockId)
      if (!block) {
        return false
      }

      const originalValue = block[field]
      if (originalValue === value) {
        return false
      }

      const originalBlocks = blocks.map((entry) => ({
        id: entry.id,
        startTime: entry.startTime,
        endTime: entry.endTime,
      }))

      block[field] = value
      blocks.splice(0, blocks.length, ...sortBlocksByTime(blocks))

      const sortedIndex = blocks.findIndex((entry) => entry.id === blockId)
      if (sortedIndex < 0) {
        blockedMessage = 'That time change could not be applied.'
        blocks.forEach((entry) => {
          const original = originalBlocks.find((item) => item.id === entry.id)
          if (original) {
            entry.startTime = original.startTime
            entry.endTime = original.endTime
          }
        })
        return false
      }

      const sortedBlock = blocks[sortedIndex]
      if (timeToMinutes(sortedBlock.endTime) <= timeToMinutes(sortedBlock.startTime)) {
        blockedMessage = 'Each block must have a real duration.'
        blocks.forEach((entry) => {
          const original = originalBlocks.find((item) => item.id === entry.id)
          if (original) {
            entry.startTime = original.startTime
            entry.endTime = original.endTime
          }
        })
        blocks.splice(0, blocks.length, ...sortBlocksByTime(blocks))
        return false
      }

      const previousBlock = sortedIndex > 0 ? blocks[sortedIndex - 1] : null
      const nextBlock = sortedIndex < blocks.length - 1 ? blocks[sortedIndex + 1] : null
      const shouldCheckPrevious = field === 'startTime'
      const shouldCheckNext = field === 'endTime'
      let blocked = false

      if (shouldCheckPrevious && previousBlock && timeToMinutes(sortedBlock.startTime) < timeToMinutes(previousBlock.endTime)) {
        if (!allowNeighborPush) {
          blocked = true
        } else {
          previousBlock.endTime = sortedBlock.startTime
          if (timeToMinutes(previousBlock.endTime) <= timeToMinutes(previousBlock.startTime)) {
            blocked = true
          }
        }
      }

      if (!blocked && shouldCheckNext && nextBlock && timeToMinutes(sortedBlock.endTime) > timeToMinutes(nextBlock.startTime)) {
        if (!allowNeighborPush) {
          blocked = true
        } else {
          nextBlock.startTime = sortedBlock.endTime
          if (timeToMinutes(nextBlock.endTime) <= timeToMinutes(nextBlock.startTime)) {
            blocked = true
          }
        }
      }

      if (blocked) {
        blockedMessage = 'That edit would collide with another block. Open space first or use a smaller time range.'
        blocks.forEach((entry) => {
          const original = originalBlocks.find((item) => item.id === entry.id)
          if (original) {
            entry.startTime = original.startTime
            entry.endTime = original.endTime
          }
        })
        blocks.splice(0, blocks.length, ...sortBlocksByTime(blocks))
        return false
      }

      changed = true
      return true
    })

    if (!changed && blockedMessage) {
      showBuilderInteractionMessage(blockedMessage)
    }

    return changed
  }

  function reorderBlockSlots(dayId: WeekdayId, fromIndex: number, toIndex: number) {
    updateDayBlocks(dayId, (blocks) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= blocks.length ||
        toIndex >= blocks.length
      ) {
        return false
      }

      const insertionIndex = toIndex
      if (fromIndex === insertionIndex) {
        return false
      }

      const slots = blocks.map((block) => ({ startTime: block.startTime, endTime: block.endTime }))
      const [moved] = blocks.splice(fromIndex, 1)
      blocks.splice(insertionIndex, 0, moved)
      blocks.forEach((block, index) => {
        block.startTime = slots[index].startTime
        block.endTime = slots[index].endTime
      })
      return true
    })
  }

  function insertGapBlock(dayId: WeekdayId, insertAt: number, startTime: string, endTime: string): string | null {
    let createdGapId: string | null = null
    updateDayBlocks(dayId, (blocks) => {
      const newGap = createGapBlock(dayId, blocks.length, startTime, endTime)
      createdGapId = newGap.id
      blocks.splice(insertAt, 0, newGap)
      blocks.splice(0, blocks.length, ...sortBlocksByTime(blocks))
      return true
    })
    return createdGapId
  }

  function convertGapToActivity(dayId: WeekdayId, blockId: string) {
    updateDayBlocks(dayId, (blocks, next) => {
      const index = blocks.findIndex((entry) => entry.id === blockId)
      if (index < 0) {
        return false
      }

      const block = blocks[index]
      if (block.rowType !== 'gap') {
        return false
      }

      const replacement = createNewBlock(dayId, index, 'standard', next[dayId].stageElementDefaults)
      replacement.id = block.id
      replacement.startTime = block.startTime
      replacement.endTime = block.endTime
      replacement.title = 'New block'
      replacement.color = 'sunrise'
      blocks[index] = replacement
      return true
    })
  }

  function addBottomBlockFromDayFlow(dayId: WeekdayId) {
    const dayBlocks = sortBlocksByTime(schedule[dayId].blocks)
    const defaultStart = '08:00'
    const defaultEnd = '15:30'
    const timelineEndMinutes = timeToMinutes(defaultEnd)

    setBuilderDay(dayId)

    if (dayBlocks.length === 0) {
      const createdGapId = insertGapBlock(dayId, 0, defaultStart, defaultEnd)
      if (createdGapId) {
        setDayFlowExpandedGapId(createdGapId)
      }
      return
    }

    const lastBlock = dayBlocks[dayBlocks.length - 1]
    const lastEndMinutes = timeToMinutes(lastBlock.endTime)
    if (lastEndMinutes < timelineEndMinutes) {
      const createdGapId = insertGapBlock(dayId, dayBlocks.length, lastBlock.endTime, defaultEnd)
      if (createdGapId) {
        setDayFlowExpandedGapId(createdGapId)
      }
      return
    }

    let createdBlockId: string | null = null
    updateDayBlocks(dayId, (blocks, next) => {
      const ordered = sortBlocksByTime(blocks)
      if (ordered.length === 0) {
        return false
      }

      const currentLast = ordered[ordered.length - 1]
      const startMinutes = timeToMinutes(currentLast.endTime)
      const endMinutes = Math.min(startMinutes + 30, 23 * 60 + 59)
      if (endMinutes <= startMinutes) {
        return false
      }

      const insertAt = blocks.length
      const created = createNewBlock(dayId, insertAt, 'standard', next[dayId].stageElementDefaults)
      created.startTime = minutesToTime(startMinutes)
      created.endTime = minutesToTime(endMinutes)
      created.title = 'New block'
      created.color = 'sunrise'
      createdBlockId = created.id
      blocks.push(created)
      blocks.splice(0, blocks.length, ...sortBlocksByTime(blocks))
      return true
    })

    if (createdBlockId) {
      applyBuilderBlockSelection(dayId, [createdBlockId], createdBlockId)
      setDayFlowExpandedGapId(null)
    } else {
      showBuilderInteractionMessage('No additional time is available to add another block.')
    }
  }

  function extendAdjacentBlockIntoGap(dayId: WeekdayId, gapId: string, direction: 'previous' | 'next') {
    let didExtend = false
    updateDayBlocks(dayId, (blocks) => {
      const gapIndex = blocks.findIndex((entry) => entry.id === gapId)
      if (gapIndex < 0) {
        return false
      }

      const gapBlock = blocks[gapIndex]
      if (gapBlock.rowType !== 'gap') {
        return false
      }

      const neighborIndex = direction === 'previous' ? gapIndex - 1 : gapIndex + 1
      if (neighborIndex < 0 || neighborIndex >= blocks.length) {
        return false
      }

      const neighbor = blocks[neighborIndex]
      if (neighbor.rowType !== 'activity') {
        return false
      }

      if (direction === 'previous') {
        neighbor.endTime = gapBlock.endTime
      } else {
        neighbor.startTime = gapBlock.startTime
      }

      blocks.splice(gapIndex, 1)
      blocks.splice(0, blocks.length, ...mergeAdjacentGapBlocks(sortBlocksByTime(blocks)))
      didExtend = true
      return true
    })

    if (!didExtend) {
      showBuilderInteractionMessage('No adjacent activity block can fill this open time.')
      return
    }

    setDayFlowExpandedGapId(null)
  }

  function getSuggestedImageObjectPlacement(block: ScheduleBlock) {
    const layout = block.stageLayout.image
    return {
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
    }
  }

  function handleImageSelection(dayId: WeekdayId, blockId: string, file: File | null) {
    if (!file) {
      return
    }

    const block = schedule[dayId].blocks.find((entry) => entry.id === blockId)
    if (!block) {
      return
    }

    const placement = getSuggestedImageObjectPlacement(block)
    void addImageObjectFromFile(dayId, blockId, file, placement.x, placement.y, placement.width, placement.height)
  }

  async function addImageObjectFromFile(dayId: WeekdayId, blockId: string, file: File, x = 24, y = 24, preferredWidth?: number, preferredHeight?: number) {
    setBuilderTransferMessage('Setting up picture...')
    try {
      const src = await readFileAsDataUrl(file)
      const dimensions = await loadImageDimensions(src)
      const size = preferredWidth && preferredHeight ? { width: preferredWidth, height: preferredHeight } : getImageObjectSize(dimensions.width, dimensions.height)
      addStageObject(dayId, blockId, 'image', x, y, { src, ...size })
    } finally {
      window.setTimeout(() => setBuilderTransferMessage(null), 250)
    }
  }

  async function importBlockImageFromUrl(dayId: WeekdayId, blockId: string) {
    const nextUrl = window.prompt('Paste a picture URL')
    if (!nextUrl) {
      return
    }

    setBuilderTransferMessage('Importing picture...')
    try {
      const src = await importImageUrlAsDataUrl(nextUrl.trim())
      const block = schedule[dayId].blocks.find((entry) => entry.id === blockId)
      if (!block) {
        return
      }
      const placement = getSuggestedImageObjectPlacement(block)
      addStageObject(dayId, blockId, 'image', placement.x, placement.y, {
        src,
        width: placement.width,
        height: placement.height,
      })
    } catch {
      setBuilderTransferMessage('Could not import that picture.')
    } finally {
      window.setTimeout(() => setBuilderTransferMessage(null), 900)
    }
  }

  function addClipboardTextObject(dayId: WeekdayId, blockId: string, text: string) {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }

    const videoId = extractYouTubeVideoId(trimmed)
    if (videoId) {
      addStageObject(dayId, blockId, 'youtube', 24, 22, { src: trimmed })
      return
    }

    addStageObject(dayId, blockId, 'text', 24, 24, {
      text: trimmed,
      width: 34,
      height: 12,
    })
  }

  function duplicateSelectedStageObject(dayId: WeekdayId, blockId: string, source: StageObject) {
    addStageObject(dayId, blockId, source.type, Math.min(source.x + 4, 76), Math.min(source.y + 4, 84), {
      src: source.src,
      text: source.text,
      width: source.width,
      height: source.height,
      locked: false,
      displayMovable: source.displayMovable,
      scope: 'block',
      syncKey: '',
      widgetData: source.widgetData,
      widgetLayoutPreset: source.widgetLayoutPreset,
    })
  }

  async function handleBuilderPaste(event: ClipboardEvent) {
    if (view !== 'builder' || !selectedBuilderBlock) {
      return
    }

    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
      return
    }

    const clipboard = event.clipboardData
    if (!clipboard) {
      return
    }

    const customObject = clipboard.getData('application/x-classroom-stage-object')
    if (customObject) {
      try {
        const parsed = JSON.parse(customObject) as StageObject
        event.preventDefault()
        duplicateSelectedStageObject(builderDay, selectedBuilderBlock.id, parsed)
        return
      } catch {
        // fall through to plain clipboard handling
      }
    }

    const imageItem = Array.from(clipboard.items).find((item) => item.type.startsWith('image/'))
    if (imageItem) {
      const file = imageItem.getAsFile()
      if (file) {
        event.preventDefault()
        await addImageObjectFromFile(builderDay, selectedBuilderBlock.id, file)
        return
      }
    }

    const text = clipboard.getData('text/plain')
    if (text.trim()) {
      event.preventDefault()
      addClipboardTextObject(builderDay, selectedBuilderBlock.id, text)
    }
  }

  function handleBuilderCopy(event: ClipboardEvent) {
    if (view !== 'builder' || !selectedBuilderBlock || !selectedStageObject) {
      return
    }

    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
      return
    }

    event.preventDefault()
    event.clipboardData?.setData('application/x-classroom-stage-object', JSON.stringify(selectedStageObject))
    if (selectedStageObject.type === 'text') {
      event.clipboardData?.setData('text/plain', selectedStageObject.text)
    } else if (selectedStageObject.src) {
      event.clipboardData?.setData('text/plain', selectedStageObject.src)
    }
  }

  async function handleCanvasDrop(event: React.DragEvent<HTMLDivElement>, block: ScheduleBlock) {
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(((event.clientX - bounds.left) / bounds.width) * 100 - 12, 76))
    const y = Math.max(0, Math.min(((event.clientY - bounds.top) / bounds.height) * 100 - 8, 84))

    const imageFile = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith('image/'))
    if (imageFile) {
      await addImageObjectFromFile(builderDay, block.id, imageFile, x, y)
      return
    }

    const type = event.dataTransfer.getData('text/stage-object-type') as StageObjectType
    if (type) {
      addStageObject(builderDay, block.id, type, x, y)
      return
    }

    const droppedText = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain')
    if (droppedText.trim()) {
      addClipboardTextObject(builderDay, block.id, droppedText)
    }
  }

  const onBuilderPaste = useEffectEvent((event: ClipboardEvent) => {
    void handleBuilderPaste(event)
  })

  const onBuilderCopy = useEffectEvent((event: ClipboardEvent) => {
    handleBuilderCopy(event)
  })

  const onDisplayPointerMove = useEffectEvent((event: PointerEvent) => {
    const drag = displayDragRef.current
    if (!drag) {
      return
    }

    const canvasBounds = displayStageCanvasRef.current?.getBoundingClientRect()
    const deltaX = getStageDeltaPercent(event.clientX - drag.pointerStartX, 'x', canvasBounds)
    const deltaY = getStageDeltaPercent(event.clientY - drag.pointerStartY, 'y', canvasBounds)

    if (drag.kind === 'element') {
      updateStageElementLayout(drag.dayId, drag.blockId, drag.elementId, 'move', drag.origin, deltaX, deltaY, false)
      return
    }

    updateStageObjectLayout(drag.dayId, drag.blockId, drag.objectId, 'move', drag.origin, deltaX, deltaY, false)
  })

  async function toggleShowFullscreen() {
    if (showFullscreenMode) {
      setShowFullscreenMode(false)
      setShowFullscreenTopbar(false)
      setSidebarMode(displaySidebarModeRef.current)
      return
    }

    setShowFullscreenMode(true)
    setShowFullscreenTopbar(false)
    setSidebarMode('hidden')
  }

  function copyDayToTargets(sourceDayId: WeekdayId, targetDayIds: WeekdayId[]) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const sourceDay = next[sourceDayId]
      const sourceBlocks = sourceDay.blocks.map((item) => ({
        ...item,
        details: [...item.details],
        rotationGroups: [...item.rotationGroups],
        stageLayout: JSON.parse(JSON.stringify(item.stageLayout)) as ScheduleBlock['stageLayout'],
        stageElementTextStyles: JSON.parse(JSON.stringify(item.stageElementTextStyles)) as ScheduleBlock['stageElementTextStyles'],
        stageObjects: item.stageObjects.map((entry, index) => ({ ...entry, zIndex: index })),
      }))

      targetDayIds.forEach((dayId) => {
        if (dayId !== sourceDayId) {
          next[dayId].stageElementDefaults = JSON.parse(JSON.stringify(sourceDay.stageElementDefaults)) as Partial<Record<StageElementId, StageElementDefaultState>>
          next[dayId].blocks = sourceBlocks.map((item) => ({
            ...item,
            id: `${dayId}-${item.id}`,
            details: [...item.details],
            rotationGroups: [...item.rotationGroups],
            stageLayout: JSON.parse(JSON.stringify(item.stageLayout)) as ScheduleBlock['stageLayout'],
            stageElementTextStyles: JSON.parse(JSON.stringify(item.stageElementTextStyles)) as ScheduleBlock['stageElementTextStyles'],
            stageObjects: item.stageObjects.map((entry, index) => ({ ...entry, id: `${dayId}-${entry.id}`, zIndex: index })),
          }))
        }
      })

      return next
    })
  }

  function copyDayToAll(sourceDayId: WeekdayId) {
    copyDayToTargets(
      sourceDayId,
      weekdayOrder.filter((dayId) => dayId !== sourceDayId),
    )
  }

  function copySelectedBlocksToTargets(sourceDayId: WeekdayId, blockIds: string[], targetDayIds: WeekdayId[]) {
    updateSchedule((current) => {
      const next = duplicateSchedule(current)
      const sourceDay = next[sourceDayId]
      const selectedIdSet = new Set(blockIds)
      const sourceBlocks = sourceDay.blocks
        .filter((item) => selectedIdSet.has(item.id))
        .map((item) => ({
          ...item,
          details: [...item.details],
          rotationGroups: [...item.rotationGroups],
          stageLayout: JSON.parse(JSON.stringify(item.stageLayout)) as ScheduleBlock['stageLayout'],
          stageElementTextStyles: JSON.parse(JSON.stringify(item.stageElementTextStyles)) as ScheduleBlock['stageElementTextStyles'],
          stageObjects: item.stageObjects.map((entry, index) => ({ ...entry, zIndex: index })),
        }))

      targetDayIds.forEach((dayId) => {
        if (dayId !== sourceDayId) {
          next[dayId].stageElementDefaults = JSON.parse(JSON.stringify(sourceDay.stageElementDefaults)) as Partial<Record<StageElementId, StageElementDefaultState>>
          next[dayId].blocks = sourceBlocks.map((item) => ({
            ...item,
            id: `${dayId}-${item.id}`,
            details: [...item.details],
            rotationGroups: [...item.rotationGroups],
            stageLayout: JSON.parse(JSON.stringify(item.stageLayout)) as ScheduleBlock['stageLayout'],
            stageElementTextStyles: JSON.parse(JSON.stringify(item.stageElementTextStyles)) as ScheduleBlock['stageElementTextStyles'],
            stageObjects: item.stageObjects.map((entry, index) => ({ ...entry, id: `${dayId}-${entry.id}`, zIndex: index })),
          }))
        }
      })

      return next
    })
  }

  function startLayoutElementDrag(
    event: ReactPointerEvent<HTMLElement>,
    block: ScheduleBlock,
    elementId: StageElementId,
    mode: LayoutDragSession['mode'],
  ) {
    event.stopPropagation()
    applyBuilderBlockSelection(builderDay, [block.id], block.id)
    setSelectedStageElementId(elementId)
    const session: LayoutDragSession = {
      blockId: block.id,
      elementId,
      mode,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      origin: { ...block.stageLayout[elementId] },
    }

    if (mode === 'move') {
      event.preventDefault()
      lockBuilderDragSelection()
      pendingLayoutDragRef.current = session
      return
    }

    event.preventDefault()
    pushUndoSnapshot(schedule)
    layoutDragRef.current = session
  }

  function onBuilderStageElementPointerDown(event: ReactPointerEvent<HTMLDivElement>, block: ScheduleBlock, elementId: StageElementId) {
    startLayoutElementDrag(event, block, elementId, getObjectPointerMode(event))
  }

  function onDisplayStageElementPointerDown(event: ReactPointerEvent<HTMLDivElement>, block: ScheduleBlock, elementId: StageElementId) {
    if (displayLocked || usesGapPresentation(block)) {
      return
    }

    event.stopPropagation()
    pushUndoSnapshot(schedule)
    displayDragRef.current = {
      kind: 'element',
      dayId: displayDay,
      blockId: block.id,
      elementId,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      origin: { ...block.stageLayout[elementId] },
    }
  }

  function onDisplayStageObjectPointerDown(event: ReactPointerEvent<HTMLDivElement>, block: ScheduleBlock, object: StageObject) {
    if (displayLocked || !object.displayMovable) {
      return
    }

    event.stopPropagation()
    pushUndoSnapshot(schedule)
    displayDragRef.current = {
      kind: 'object',
      dayId: displayDay,
      blockId: block.id,
      objectId: object.id,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      origin: { x: object.x, y: object.y, width: object.width, height: object.height },
    }
  }

  const remainingSeconds = getRemainingSeconds()
  const builderBlocks = schedule[builderDay].blocks
  const builderActivities = sortActivitiesByTime(schedule[builderDay].activities)
  const selectedBuilderBlocks = builderBlocks.filter((block) => selectedBuilderBlockIds.includes(block.id))
  const selectedDayActivities = builderActivities.filter((activity) => selectedDayActivityIds.includes(activity.id))
  const selectedDayActivity = builderActivities.find((activity) => activity.id === selectedDayActivityId) ?? null
  const selectedBuilderBlock =
    builderBlocks.find((block) => block.id === selectedBuilderBlockId) ??
    (view === 'day-flow' && selectedBuilderBlockId === null ? null : builderBlocks[0] ?? null)
  const selectedBuilderIndex = selectedBuilderBlock ? builderBlocks.findIndex((block) => block.id === selectedBuilderBlock.id) : -1
  const selectedBuilderEnabledCount = selectedBuilderBlocks.filter((block) => block.enabled).length
  const selectedStageObject = selectedBuilderBlock?.stageObjects.find((item) => item.id === selectedStageObjectId) ?? null
  const selectedTextElementId =
    selectedStageObjectId === null &&
    selectedBuilderBlock &&
    (
      selectedStageElementId === 'title' ||
      selectedStageElementId === 'timeRange' ||
      selectedStageElementId === 'details' ||
      selectedStageElementId === 'rotations' ||
      selectedStageElementId === 'next'
    )
      ? selectedStageElementId
      : null
  const selectedClockElementId =
    selectedStageObjectId === null &&
    selectedBuilderBlock &&
    selectedStageElementId === 'clock'
      ? 'clock'
      : null
  const selectedTimerElementId =
    selectedStageObjectId === null &&
    selectedBuilderBlock &&
    selectedStageElementId === 'timer'
      ? 'timer'
      : null
  const selectedCoreTitle = selectedBuilderBlock?.showTitle ?? false
  const selectedCoreRange = selectedBuilderBlock?.showTimeRange ?? false
  const selectedCoreClock = selectedBuilderBlock?.showClock ?? false
  const selectedBuilderNextBlock =
    selectedBuilderBlock === null
      ? null
      : getNextEnabledBlock(builderBlocks, selectedBuilderIndex)
  const selectedTemplateElementId =
    selectedBuilderBlock &&
    selectedStageObjectId === null &&
    isTemplateStageElementId(selectedStageElementId)
      ? selectedStageElementId
      : null
  const primaryNavItems = primaryNavOrder
    .map((id) => navItems.find((item) => item.id === id))
    .filter(Boolean) as NavItem[]
  const secondaryNavItems = navItems
    .filter((item) => !primaryNavOrder.includes(item.id))
  const builderSettingsHelperText =
    builderSettingsHelperPreview ??
    (selectedStageElementId === null
      ? ''
      : getBuilderSettingsHelperText({
          selectedStageObject,
          selectedClockElementId,
          selectedTimerElementId,
          selectedTextElementId,
          selectedBuilderBlock,
        }))
  const builderSettingsTargetLabel =
    selectedStageElementId === null
      ? ''
      : selectedStageObject
        ? getStageObjectDisplayName(selectedStageObject.type)
        : selectedStageElementId === 'background' && selectedBuilderBlock
          ? 'Background'
          : selectedClockElementId
            ? 'Clock'
            : selectedTimerElementId
              ? 'Timer'
              : selectedTextElementId === 'title'
                  ? 'Block name'
                  : selectedTextElementId === 'timeRange'
                    ? 'Time range'
                    : selectedTextElementId === 'details'
                      ? 'Details'
                      : selectedTextElementId === 'rotations'
                        ? 'Rotations'
                      : selectedTextElementId === 'next'
                          ? 'Next up'
                          : selectedBuilderBlock
                            ? selectedBuilderBlock.title
                            : ''

  const activeHomePreviewPhase = {
    id: 'ready',
    caption: 'A quick preview of the full daily workflow.',
  }
  const homePreviewIndex = 3
  const homePreviewStageClassName = 'home-preview-stage home-preview-stage-ready'
  const replayHomePreview = () => {}



  function renderBuilderSectionBody(children: ReactNode, collapsed: boolean, extraClassName?: string, ariaLabel?: string) {
    const className = ['builder-section-body', extraClassName ?? '', collapsed ? 'builder-section-body-collapsed' : ''].filter(Boolean).join(' ')

    return (
      <div
        aria-hidden={collapsed}
        aria-label={ariaLabel}
        className={className}
        role={ariaLabel ? 'group' : undefined}
      >
        {children}
      </div>
    )
  }

  const selectedDayActivityIsDirty =
    selectedDayActivity !== null &&
    dayActivityDraft !== null &&
    (
      selectedDayActivity.title !== dayActivityDraft.title ||
      selectedDayActivity.startTime !== dayActivityDraft.startTime ||
      selectedDayActivity.endTime !== dayActivityDraft.endTime ||
      selectedDayActivity.color !== dayActivityDraft.color
    )

  useEffect(() => {
    if (!selectedDayActivity) {
      setDayActivityDraft(null)
      return
    }

    setDayActivityDraft({
      title: selectedDayActivity.title,
      startTime: selectedDayActivity.startTime,
      endTime: selectedDayActivity.endTime,
      color: selectedDayActivity.color,
    })
  }, [selectedDayActivity])

  function renderActivityCoreElement(block: ScheduleBlock, dayId: WeekdayId, mode: 'display' | 'thumbnail') {
    const resolvedItems =
      mode === 'display'
        ? sortActivitiesByTime(schedule[dayId].activities).map((activity) => {
            const activityStart = timeToMinutes(activity.startTime)
            const activityEnd = timeToMinutes(activity.endTime)
            const blockStart = timeToMinutes(block.startTime)
            const blockEnd = timeToMinutes(block.endTime)
            const overlapsDisplayedBlock = activityStart < blockEnd && activityEnd > blockStart
            return {
              activity,
              state: overlapsDisplayedBlock ? ('active' as const) : ('upcoming' as const),
            }
          })
        : getResolvedActivityDisplayItems(schedule[dayId].activities, minutesNow, block.activityDisplayMode, block.activityStackMode)
    const style = getStageElementTextStyle(block, 'activity', mode)
    const activityTextStyle: CSSProperties = {
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      textAlign: style.textAlign,
      lineHeight: style.lineHeight,
      textDecoration: style.textDecoration,
    }
    const drawerOpen = mode === 'display' ? displayActivityDrawerOpen : false
    const canMove = !displayLocked

    const toggleDrawer = () => {
      if (mode === 'display') {
        setDisplayActivityDrawerOpen((current) => !current)
      }
    }
    const setDrawerOpen = (nextOpen: boolean) => {
      if (mode === 'display') {
        setDisplayActivityDrawerOpen(nextOpen)
      }
    }

    if (mode === 'thumbnail') {
      return (
        <div className="stage-element-text-shell">
          <div className="stage-activity-tab stage-activity-tab-inactive">Activity</div>
        </div>
      )
    }

    const hasItems = resolvedItems.length > 0

    return (
      <div className="stage-activity-shell-host" style={activityTextStyle}>
        <div className={drawerOpen ? `stage-activity-shell stage-activity-shell-${mode} stage-activity-shell-open` : `stage-activity-shell stage-activity-shell-${mode}`}>
          <button
            className="stage-activity-tab-handle"
            onPointerDown={(event) => {
              event.stopPropagation()
              activityDrawerGestureRef.current = {
                dayId,
                blockId: block.id,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                startOpen: drawerOpen,
                moved: false,
                undoCaptured: false,
                origin: { ...block.stageLayout.activity },
              }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              const gesture = activityDrawerGestureRef.current
              if (!gesture || gesture.pointerId !== event.pointerId || gesture.dayId !== dayId || gesture.blockId !== block.id) {
                return
              }
              const deltaX = event.clientX - gesture.startX
              const deltaY = event.clientY - gesture.startY

              if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) >= 6) {
                if (!canMove) {
                  return
                }
                if (!gesture.undoCaptured) {
                  pushUndoSnapshot(schedule)
                  gesture.undoCaptured = true
                }
                gesture.moved = true
                const deltaYPercent = getStageDeltaPercent(deltaY, 'y', displayStageCanvasRef.current?.getBoundingClientRect())
                updateStageElementLayout(dayId, block.id, 'activity', 'move', gesture.origin, 0, deltaYPercent, false)
                return
              }

              if (Math.abs(deltaX) >= 10 && Math.abs(deltaX) >= Math.abs(deltaY)) {
                setDrawerOpen(gesture.startOpen ? deltaX < 0 : deltaX <= -10)
              }
            }}
            onPointerUp={(event) => {
              const gesture = activityDrawerGestureRef.current
              if (gesture && gesture.pointerId === event.pointerId) {
                const movedX = Math.abs(event.clientX - gesture.startX)
                const movedY = Math.abs(event.clientY - gesture.startY)
                if (movedX < 6 && movedY < 6) {
                  toggleDrawer()
                }
                activityDrawerGestureRef.current = null
              }
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
            onPointerCancel={(event) => {
              const gesture = activityDrawerGestureRef.current
              if (gesture && gesture.pointerId === event.pointerId) {
                activityDrawerGestureRef.current = null
              }
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
            type="button"
          >
            Activity
          </button>
          <div className={mode === 'display' ? 'stage-activity-card stage-activity-card-display stage-activity-drawer' : 'stage-activity-card stage-activity-drawer'}>
            {hasItems ? (
              resolvedItems.map((item) => {
                const activityStartMinutes = timeToMinutes(item.activity.startTime)
                const activityEndMinutes = timeToMinutes(item.activity.endTime)
                const remainingSecondsForItem = Math.max((activityEndMinutes - minutesNow) * 60, 0)
                const startsInSeconds = Math.max((activityStartMinutes - minutesNow) * 60, 0)
                return (
                  <article
                    className={item.state === 'active' ? 'stage-activity-entry stage-activity-entry-active' : 'stage-activity-entry'}
                    key={`${item.activity.id}-${item.state}`}
                  >
                    {block.showActivityTitle && <strong className="stage-activity-entry-title">{item.activity.title}</strong>}
                    {block.showActivityTimeRange && <span className="stage-activity-entry-range">{formatRange(item.activity.startTime, item.activity.endTime)}</span>}
                    {item.state === 'active' && block.showActivityCountdown && <span className="stage-activity-entry-meta">Ends in {formatDuration(remainingSecondsForItem)}</span>}
                    {item.state === 'upcoming' && block.showActivityStartsIn && <span className="stage-activity-entry-meta">Starts in {formatDuration(startsInSeconds)}</span>}
                  </article>
                )
              })
            ) : (
              <div className="stage-activity-tab stage-activity-tab-inactive">No activities</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderDisplayActivityOverlay(block: ScheduleBlock, dayId: WeekdayId) {
    if (!block.showActivity || usesGapPresentation(block)) {
      return null
    }
    const layout = block.stageLayout.activity
    const overlaySafeEdge = 5
    const overlayMaxHeight = Math.max(12, 100 - overlaySafeEdge * 2)
    const overlayHeight = Math.max(12, Math.min(layout.height, 48, overlayMaxHeight))
    const overlayTop = Math.max(overlaySafeEdge, Math.min(layout.y, 100 - overlaySafeEdge - overlayHeight))
    return (
      <div
        className="display-activity-overlay stage-activity-overlay"
        style={{
          top: `${overlayTop}%`,
          height: `${overlayHeight}%`,
        }}
      >
        {renderActivityCoreElement(block, dayId, 'display')}
      </div>
    )
  }

  function getStageElements(block: ScheduleBlock, upcomingBlock: ScheduleBlock | null, mode: 'display' | 'builder' | 'thumbnail' = 'display', timerSecondsOverride?: number) {
    if (usesGapPresentation(block)) {
      return []
    }

    return [
      block.showClock
        ? {
            id: 'clock' as const,
            className: 'stage-layout-item stage-layout-clock',
            content: (
              <ClockElement
                frameHeight={block.stageLayout.clock.height}
                frameWidth={block.stageLayout.clock.width}
                mode={block.clockMode}
                now={clockNow}
                preset={block.clockLayoutPreset}
              />
            ),
          }
        : null,
      block.showTimer || mode === 'builder'
        ? {
            id: 'timer' as const,
            className: 'stage-layout-item stage-layout-timer',
            content: (
              <TimerElement
                frameHeight={block.stageLayout.timer.height}
                frameWidth={block.stageLayout.timer.width}
                hidden={!block.showTimer}
                preset={block.timerLayoutPreset}
                value={formatDuration(timerSecondsOverride ?? remainingSeconds)}
              />
            ),
          }
        : null,
      block.details.length > 0
        ? {
            id: 'details' as const,
            className: 'stage-layout-item stage-layout-details',
            content: (
              <div className="stage-element-text-shell" style={getStageElementTextStyle(block, 'details', mode)}>
                <ul className="note-list">
                  {block.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </div>
            ),
          }
        : null,
      block.rotationGroups.length > 0
        ? {
            id: 'rotations' as const,
            className: 'stage-layout-item stage-layout-rotations',
            content: (
              <div className="rotation-board" aria-label="Rotation groups">
                {block.rotationGroups.map((group) => (
                  <article key={group} className="rotation-card" style={getStageElementTextStyle(block, 'rotations', mode)}>
                    <span>{group}</span>
                  </article>
                ))}
              </div>
            ),
          }
        : null,
      block.showNext && upcomingBlock
        ? {
            id: 'next' as const,
            className: 'stage-layout-item stage-layout-next',
            content: (
              <div className="stage-element-text-shell" style={getStageElementTextStyle(block, 'next', mode)}>
                <p className="next-up">
                  Next up: <strong>{getDisplayBlockTitle(upcomingBlock)}</strong> at {formatClock(upcomingBlock.startTime)}
                </p>
              </div>
            ),
          }
        : null,
      block.showActivity && mode === 'display'
        ? {
            id: 'activity' as const,
            className: 'stage-layout-item stage-layout-activity',
            content: renderActivityCoreElement(block, displayDay, 'display'),
          }
        : null,
    ].filter(Boolean) as Array<{ id: StageElementId; className: string; content: ReactNode }>
  }

  const activeGapPreviousBlock = activeBlock ? getPreviousActivityBlock(displayBlocks, effectiveIndex) : null
  const activeGapNextBlock = activeBlock ? getNextActivityBlock(displayBlocks, effectiveIndex) : null
  const openTimeDisplayBlock =
    activeBlock?.rowType === 'gap'
      ? activeBlock.openTimeMode === 'previous-block'
        ? activeGapPreviousBlock
        : activeBlock.openTimeMode === 'next-block'
          ? activeGapNextBlock
          : null
      : null
  const displayShowsDisabledBlock = activeBlock?.enabled === false
  const displayShowsOpenTimeGap = activeBlock?.rowType === 'gap'
  const displayNoBlocks = daySchedule.blocks.length === 0
  const displayReplayElapsedMinutes = displayReplayState ? (clockNow.getTime() - displayReplayState.startedAt) / 60000 : 0
  const displayReplayMinutesNow = displayReplayState ? displayReplayState.startMinutes + displayReplayElapsedMinutes : minutesNow
  const displayReplayActiveIndices = displayReplayState ? getActiveBlockIndices(displayBlocks, displayReplayMinutesNow) : []
  const displayReplayIndex = displayReplayState ? getCurrentBlockIndex(displayBlocks, displayReplayMinutesNow) : -1
  const displayReplayEffectiveIndex =
    displayReplayState && displayReplayActiveIndices.length > 0
      ? displayReplayActiveIndices[displayReplayActiveIndices.length - 1]
      : displayReplayIndex
  const displayHoldBlock = displayHoldBlockId ? displayBlocks.find((block) => block.id === displayHoldBlockId) ?? null : null
  const displayStageBlock =
    displayReplayState && displayReplayEffectiveIndex >= 0
      ? displayBlocks[displayReplayEffectiveIndex]
      : displayHoldBlock ?? (activeBlock && activeBlock.enabled === false ? null : openTimeDisplayBlock ?? activeBlock ?? null)
  const displayStageCurrentIndex = displayStageBlock ? displayBlocks.findIndex((block) => block.id === displayStageBlock.id) : -1
  const displayStageUpcomingBlock =
    displayStageBlock
      ? displayStageBlock.rowType === 'gap'
        ? displayStageBlock.openTimeMode === 'next-block'
          ? getNextActivityBlock(displayBlocks, displayStageCurrentIndex)
          : displayStageBlock.openTimeMode === 'previous-block'
            ? getPreviousActivityBlock(displayBlocks, displayStageCurrentIndex)
            : null
        : getNextEnabledBlock(displayBlocks, displayStageCurrentIndex)
      : null
  const displayStageTimerSeconds =
    displayReplayState && displayStageBlock
      ? Math.max((timeToMinutes(displayStageBlock.endTime) - displayReplayMinutesNow) * 60, 0)
      : activeBlock?.rowType === 'gap'
        ? Math.max((timeToMinutes(activeBlock.endTime) - minutesNow) * 60, 0)
        : remainingSeconds
  const displayStageClockNow = displayReplayState
    ? new Date(clockNow.getTime() + (displayReplayMinutesNow - minutesNow) * 60000)
    : clockNow
  const displayStageLiveEndClock = !displayHoldBlockId && displayStageBlock
    ? new Date(displayStageClockNow.getTime() + displayStageTimerSeconds * 1000)
    : null
  const displayUsesStageCanvas =
    Boolean(activeBlock) &&
    !displayShowsDisabledBlock &&
    (
      !displayShowsOpenTimeGap ||
      (
        Boolean(displayStageBlock) &&
        activeBlock?.openTimeMode !== 'blank' &&
        activeBlock?.openTimeMode !== 'default' &&
        activeBlock?.openTimeMode !== 'countdown'
      )
    )
  const displayShowsActivityOverlay = Boolean(displayUsesStageCanvas && displayStageBlock?.showActivity && !usesGapPresentation(displayStageBlock))
  const displaySidebarFocusIndex = displayStageCurrentIndex >= 0 ? displayStageCurrentIndex : effectiveIndex
  const displaySidebarBlockDurations = displayBlocks.map((block) => Math.max(timeToMinutes(block.endTime) - timeToMinutes(block.startTime), 1))
  const displayDayStartMinutes = displayBlocks.length > 0 ? timeToMinutes(displayBlocks[0].startTime) : 0
  const displayDayEndMinutes = displayBlocks.length > 0 ? timeToMinutes(displayBlocks[displayBlocks.length - 1].endTime) : 0
  const displayTimeTickMinutes = useMemo(() => {
    if (displayBlocks.length === 0 || displayDayEndMinutes <= displayDayStartMinutes) {
      return []
    }

    const firstQuarter = Math.ceil(displayDayStartMinutes / 15) * 15
    const ticks: number[] = []
    for (let minute = firstQuarter; minute <= displayDayEndMinutes; minute += 15) {
      ticks.push(minute)
    }
    return ticks
  }, [displayBlocks.length, displayDayEndMinutes, displayDayStartMinutes])
  const showSidebarHasBlockContext = displayBlocks.length > 0
  const showSidebarCanGoPrevious = !displayLocked && showSidebarHasBlockContext && displaySidebarFocusIndex > 0
  const showSidebarCanGoNext = !displayLocked && showSidebarHasBlockContext && displaySidebarFocusIndex >= 0 && displaySidebarFocusIndex < displayBlocks.length - 1
  const showSidebarCanRestart =
    !displayLocked && displayStageBlock !== null && displayStageBlock.rowType !== 'gap'
  const showSidebarCanHold =
    !displayLocked && (displayStageBlock ?? activeBlock ?? null) !== null
  const showSidebarControlsDisabled = displayLocked || !showSidebarHasBlockContext
  const activeStageElements = displayStageBlock ? getStageElements(displayStageBlock, displayStageUpcomingBlock, 'display', displayStageTimerSeconds) : []
  const selectedStageElements = selectedBuilderBlock ? getStageElements(selectedBuilderBlock, selectedBuilderNextBlock, 'builder') : []
  const activeStageObjects = displayStageBlock ? [...displayStageBlock.stageObjects].sort((left, right) => left.zIndex - right.zIndex) : []
  const selectedBuilderStageObjects = selectedBuilderBlock
    ? [...selectedBuilderBlock.stageObjects].sort((left, right) => left.zIndex - right.zIndex)
    : []
  const builderBlockPreviewSnapshots = useMemo(() => {
    const nextCache = duplicatePreviewCache(builderPreviewCache)

    builderBlocks.forEach((block, index) => {
      const upcomingBlock = builderBlocks[index + 1] ?? null
      const signature = createBlockPreviewSignature(block, upcomingBlock)
      if (!nextCache[block.id] || nextCache[block.id].signature !== signature) {
        nextCache[block.id] = createBlockThumbnailSnapshot(block, upcomingBlock)
      }
    })

    Object.keys(nextCache).forEach((blockId) => {
      if (!builderBlocks.some((block) => block.id === blockId)) {
        delete nextCache[blockId]
      }
    })

    return nextCache
  }, [builderBlocks, builderPreviewCache])
  useEffect(() => {
    if (JSON.stringify(builderPreviewCache) !== JSON.stringify(builderBlockPreviewSnapshots)) {
      setBuilderPreviewCache(builderBlockPreviewSnapshots)
    }
  }, [builderBlockPreviewSnapshots, builderPreviewCache])
  const visibleDisplayStageElements = activeStageElements
  const visibleDisplayStageObjects = activeStageObjects
  const selectedWeatherLiveObject = view === 'builder' && selectedStageObject?.type === 'weather-live' ? selectedStageObject : null
  const visibleDisplayWeatherLiveObjects = useMemo(
    () => (view === 'display' ? visibleDisplayStageObjects.filter((object): object is StageObject => object.type === 'weather-live') : []),
    [view, visibleDisplayStageObjects],
  )

  async function refreshWeatherLiveObject(object: Pick<StageObject, 'id' | 'type' | 'widgetData'>) {
    if (object.type !== 'weather-live') {
      return
    }

    const parsed = parseWeatherLiveWidgetData(object.widgetData)
    const runtimeKey = object.id
    const configKey = getWeatherLiveConfigKey(parsed)
    if (!parsed.locationInput.trim()) {
      setWeatherLiveState((current) => ({
        ...current,
        [runtimeKey]: {
          status: 'idle',
          data: current[runtimeKey]?.data ?? null,
          error: null,
          lastFetchedAt: current[runtimeKey]?.lastFetchedAt ?? null,
          configKey,
        },
      }))
      return
    }

    if (weatherLiveInFlightRef.current[runtimeKey]) {
      return
    }

    weatherLiveInFlightRef.current[runtimeKey] = true
    setWeatherLiveState((current) => {
      const existing = current[runtimeKey]
      const sameConfig = existing?.configKey === configKey
      return {
        ...current,
        [runtimeKey]: {
          status: 'loading',
          data: sameConfig ? existing?.data ?? null : null,
          error: null,
          lastFetchedAt: sameConfig ? existing?.lastFetchedAt ?? null : null,
          configKey,
        },
      }
    })

    try {
      const snapshot = await fetchOpenMeteoWeatherSnapshot(parsed.locationInput)
      setWeatherLiveState((current) => ({
        ...current,
        [runtimeKey]: {
          status: 'ready',
          data: snapshot,
          error: null,
          lastFetchedAt: Date.now(),
          configKey,
        },
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not refresh weather.'
      setWeatherLiveState((current) => {
        const existing = current[runtimeKey]
        const sameConfig = existing?.configKey === configKey
        return {
          ...current,
          [runtimeKey]: {
            status: 'error',
            data: sameConfig ? existing?.data ?? null : null,
            error: message,
            lastFetchedAt: Date.now(),
            configKey,
          },
        }
      })
    } finally {
      delete weatherLiveInFlightRef.current[runtimeKey]
    }
  }

  useEffect(() => {
    if (!selectedWeatherLiveObject) {
      return
    }

    const parsed = parseWeatherLiveWidgetData(selectedWeatherLiveObject.widgetData)
    const existing = weatherLiveState[selectedWeatherLiveObject.id]
    const configKey = getWeatherLiveConfigKey(parsed)
    if (existing?.configKey === configKey && (existing.status === 'ready' || existing.status === 'error' || existing.status === 'loading')) {
      return
    }

    void refreshWeatherLiveObject(selectedWeatherLiveObject)
  }, [selectedWeatherLiveObject, weatherLiveState])

  useEffect(() => {
    if (visibleDisplayWeatherLiveObjects.length === 0) {
      return
    }

    const refreshVisibleWeather = () => {
      visibleDisplayWeatherLiveObjects.forEach((object) => {
        const parsed = parseWeatherLiveWidgetData(object.widgetData)
        if (!parsed.locationInput.trim()) {
          return
        }

        const existing = weatherLiveState[object.id]
        const configKey = getWeatherLiveConfigKey(parsed)
        const due =
          !existing ||
          existing.configKey !== configKey ||
          existing.lastFetchedAt === null ||
          Date.now() - existing.lastFetchedAt >= parsed.refreshMinutes * 60 * 1000

        if (due) {
          void refreshWeatherLiveObject(object)
        }
      })
    }

    refreshVisibleWeather()
    const interval = window.setInterval(refreshVisibleWeather, 60 * 1000)
    return () => window.clearInterval(interval)
  }, [visibleDisplayWeatherLiveObjects, weatherLiveState])

  const getYouTubeAvailability = (src: string): { reason: 'checking' | 'ready' | 'fallback' | 'unknown'; errorCode: number | null } => {
    const normalized = normalizeYouTubeUrl(src)
    const result = youtubeAvailability[normalized]
    if (!normalized) {
      return { reason: 'checking', errorCode: null }
    }

    if (!result) {
      return { reason: 'checking', errorCode: null }
    }

    if (result.status === 'playable') {
      return { reason: 'ready', errorCode: null }
    }

    if (result.status === 'unknown') {
      return { reason: 'unknown', errorCode: null }
    }

    return { reason: 'fallback', errorCode: result.errorCode }
  }
  const displayGridClass = [
    'display-grid',
    sidebarMode === 'pinned' ? 'sidebar-pinned' : sidebarMode === 'hidden' ? 'sidebar-hidden' : 'sidebar-auto',
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    setDisplayPlayingYouTubeIds({})
  }, [displayDay, displayStageBlock?.id])

  function getTextObjectStyle(object: StageObject, mode: 'display' | 'builder' | 'thumbnail'): CSSProperties {
    const baseScale = mode === 'thumbnail' ? 0.34 : mode === 'builder' ? builderStageScale : 1
    return {
      color: object.textStyle.color,
      background: object.textStyle.backgroundColor,
      padding: `${Math.max(object.textStyle.padding * baseScale, mode === 'thumbnail' ? 4 : 10)}px`,
      borderRadius: `${Math.max(object.textStyle.borderRadius * baseScale, mode === 'thumbnail' ? 6 : 12)}px`,
      fontSize: `${Math.max(object.textStyle.fontSize * baseScale, mode === 'thumbnail' ? 7 : 14)}px`,
      fontWeight: Number(object.textStyle.fontWeight),
      fontStyle: object.textStyle.fontStyle,
      textAlign: object.textStyle.textAlign,
      textDecoration: getTextDecorationValue(object.textStyle),
      lineHeight: object.textStyle.lineHeight,
    }
  }

  function getNoteCardTextStyle(object: StageObject, mode: 'display' | 'builder' | 'thumbnail'): CSSProperties {
    const baseScale = mode === 'thumbnail' ? 0.34 : mode === 'builder' ? builderStageScale : 1
    return {
      color: object.textStyle.color,
      fontSize: `${Math.max(object.textStyle.fontSize * baseScale, mode === 'thumbnail' ? 7 : 14)}px`,
      fontWeight: Number(object.textStyle.fontWeight),
      fontStyle: object.textStyle.fontStyle,
      textAlign: object.textStyle.textAlign,
      textDecoration: getTextDecorationValue(object.textStyle),
      lineHeight: object.textStyle.lineHeight,
      fontFamily: 'inherit',
    }
  }

  function getStageElementTextStyle(
    block: ScheduleBlock,
    elementId: StageTextElementId,
    mode: 'display' | 'builder' | 'thumbnail',
  ): CSSProperties {
    const style = block.stageElementTextStyles[elementId]
    const baseScale = mode === 'thumbnail' ? 0.34 : mode === 'builder' ? builderStageScale : 1
    return {
      color: style.color,
      background: style.backgroundColor,
      padding: `${Math.max(style.padding * baseScale, mode === 'thumbnail' ? 4 : 0)}px`,
      borderRadius: `${Math.max(style.borderRadius * baseScale, mode === 'thumbnail' ? 6 : 0)}px`,
      fontSize: `${Math.max(style.fontSize * baseScale, mode === 'thumbnail' ? 7 : 14)}px`,
      fontWeight: Number(style.fontWeight),
      fontStyle: style.fontStyle,
      textAlign: style.textAlign,
      textDecoration: getTextDecorationValue(style),
      lineHeight: style.lineHeight,
    }
  }

  function getSnapshotTextStyle(style: PreviewTextStyleSnapshot | undefined): CSSProperties {
    if (!style) {
      return {}
    }

    return {
      color: style.color,
      background: style.backgroundColor,
      padding: `${Math.max(style.padding * 0.34, 4)}px`,
      borderRadius: `${Math.max(style.borderRadius * 0.34, 6)}px`,
      fontSize: `${Math.max(style.fontSize * 0.34, 7)}px`,
      fontWeight: Number(style.fontWeight),
      fontStyle: style.fontStyle,
      textAlign: style.textAlign,
      textDecoration: getTextDecorationValue(style),
      lineHeight: style.lineHeight,
    }
  }

  function renderGapCard(block: ScheduleBlock, upcomingBlock: ScheduleBlock | null, mode: 'display' | 'builder' | 'thumbnail') {
    const countdownSeconds = Math.max((timeToMinutes(block.endTime) - minutesNow) * 60, 0)
    const compact = mode === 'thumbnail'
    const disabled = isDisabledBlock(block)
    const showCountdown = block.showTimer && upcomingBlock
    return (
      <div className={`stage-gap-card stage-gap-card-${mode}`}>
        <span className="stage-gap-kicker">{disabled ? 'Disabled' : 'Open'}</span>
        <strong className="stage-gap-title">{upcomingBlock ? `Next: ${getDisplayBlockTitle(upcomingBlock)}` : disabled ? 'Hidden from display' : 'No next activity yet'}</strong>
        <span className="stage-gap-range">
          {upcomingBlock
            ? showCountdown
              ? `Starts in ${formatDuration(countdownSeconds)}`
              : 'Countdown hidden'
            : disabled
              ? 'This block is skipped on the live display until it is enabled again.'
              : 'Add another activity to continue the day'}
        </span>
        {!compact && upcomingBlock && <span className="stage-gap-time">{formatClock(upcomingBlock.startTime)}</span>}
      </div>
    )
  }

  function renderDisplayEmptyState() {
    const hasAnyBlocks = daySchedule.blocks.length > 0
    const message = hasAnyBlocks
          ? 'Every block for this day is currently disabled, so Show has nothing active to display.'
              : 'This day does not have any blocks yet, so Show is waiting for a plan.'

    return (
      <div className="display-empty-state">
        <div className="display-empty-card">
          <span className="display-empty-kicker">{hasAnyBlocks ? 'No active blocks' : 'No blocks yet'}</span>
          <h3>{daySchedule.label} is not ready for display</h3>
          <p>{message}</p>
          <div className="display-empty-actions">
            <button className="primary-button" onClick={() => setView('day-flow')} type="button">
              Open Plan
            </button>
            <button className="secondary-button" onClick={() => setView('builder')} type="button">
              Open Design
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderDisplayNoBlocksSidebarHelper() {
    return (
      <div className="display-sidebar-empty-helper">
        <div className="display-empty-card display-empty-card-sidebar">
          <span className="display-empty-kicker">No blocks yet</span>
          <h3>{daySchedule.label} is blank.</h3>
          <p>Add blocks in Plan, or open Design after you add your first block.</p>
          <div className="display-empty-actions display-empty-actions-sidebar">
            <button className="primary-button" onClick={() => setView('day-flow')} type="button">
              Open Plan
            </button>
            <button className="secondary-button" onClick={() => setView('builder')} type="button">
              Open Design
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderDisplayNoBlocksClockState() {
    return (
      <div className="display-empty-clock-state">
        <div className="display-empty-clock-shell">
          <ClockElement frameHeight={44} frameWidth={44} mode="both" now={clockNow} preset="stack" />
        </div>
      </div>
    )
  }

  function toggleSidebarMinMaxMode() {
    setSidebarMode((current) => (current === 'pinned' ? 'auto' : 'pinned'))
  }

  function getTimeInputDraftKey(dayId: WeekdayId, blockId: string, field: 'startTime' | 'endTime'): string {
    return `${dayId}:${blockId}:${field}`
  }

  function setTimeInputDraft(dayId: WeekdayId, blockId: string, field: 'startTime' | 'endTime', value: string) {
    const draftKey = getTimeInputDraftKey(dayId, blockId, field)
    setTimeInputDrafts((current) => ({ ...current, [draftKey]: value }))
  }

  function clearTimeInputDraft(dayId: WeekdayId, blockId: string, field: 'startTime' | 'endTime') {
    const draftKey = getTimeInputDraftKey(dayId, blockId, field)
    setTimeInputDrafts((current) => {
      if (!(draftKey in current)) {
        return current
      }
      const next = { ...current }
      delete next[draftKey]
      return next
    })
  }

  function renderDayFlowDayColumn(dayId: WeekdayId) {
    const dayBlocks = schedule[dayId].blocks

    return (
      <section
        className={`day-flow-day-column day-flow-day-column-active ${weekdayFolderClasses[dayId]}`}
        key={dayId}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            clearDayFlowSelection()
          }
        }}
      >
        <div
          className="timeline-shell day-flow-timeline-shell"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              clearDayFlowSelection()
            }
          }}
        >
          <div
            className="timeline-list sidebar-list day-flow-week-list"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                clearDayFlowSelection()
              }
            }}
            role="list"
          >
            {dayBlocks.map((block, index) => {
              const duration = Math.max(timeToMinutes(block.endTime) - timeToMinutes(block.startTime), 1)
              const isPrimary = block.id === selectedBuilderBlockId
              const isSelected = selectedBuilderBlockIds.includes(block.id)
              const previousBlock = index > 0 ? dayBlocks[index - 1] : null
              const nextBlock = index < dayBlocks.length - 1 ? dayBlocks[index + 1] : null
              const canExtendPrevious =
                block.rowType === 'gap' &&
                previousBlock !== null &&
                previousBlock.rowType !== 'gap' &&
                previousBlock.endTime === block.startTime
              const canExtendNext =
                block.rowType === 'gap' &&
                nextBlock !== null &&
                nextBlock.rowType !== 'gap' &&
                nextBlock.startTime === block.endTime
              return (
                <Fragment key={block.id}>
                  {index > 0 &&
                    timeToMinutes(dayBlocks[index - 1].endTime) < timeToMinutes(block.startTime) && (
                      <button
                        aria-label="Create open time block"
                        className="day-flow-gap-insert day-flow-gap-insert-inline day-flow-gap-insert-icon"
                        data-gap-trigger="true"
                        onClick={() => {
                          setBuilderDay(dayId)
                          const createdGapId = insertGapBlock(dayId, index, dayBlocks[index - 1].endTime, block.startTime)
                          if (createdGapId) {
                            setDayFlowExpandedGapId(createdGapId)
                          }
                        }}
                        type="button"
                      >
                        +
                      </button>
                    )}
                  <div
                    className={[
                      'day-flow-week-block-shell',
                      isPrimary ? 'day-flow-week-block-shell-active' : '',
                      isSelected ? 'day-flow-week-block-shell-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDayFlowDropIndex(index)
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      if (dayFlowDragIndexRef.current === null || dayFlowDropIndex === null || dayFlowDragDayRef.current !== dayId) {
                        return
                      }
                      reorderBlockSlots(dayId, dayFlowDragIndexRef.current, dayFlowDropIndex)
                      dayFlowDragIndexRef.current = null
                      dayFlowDragDayRef.current = null
                      setDayFlowDragIndex(null)
                      setDayFlowDropIndex(null)
                    }}
                    style={{ flexGrow: duration, minHeight: block.rowType === 'gap' ? '2.15rem' : '2.2rem' }}
                  >
                    <div
                      className={[
                        'day-flow-time-slot',
                        isPrimary ? 'day-flow-time-slot-active' : '',
                        isSelected ? 'day-flow-time-slot-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <input
                        aria-label="Start time"
                        className="day-flow-time-slot-input"
                        onBlur={(event) => {
                          updateBlock(dayId, block.id, 'startTime', event.target.value)
                          clearTimeInputDraft(dayId, block.id, 'startTime')
                        }}
                        onChange={(event) => setTimeInputDraft(dayId, block.id, 'startTime', event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onFocus={() => {
                          if (builderDay !== dayId || selectedBuilderBlockId !== block.id) {
                            setBuilderDay(dayId)
                            applyBuilderBlockSelection(dayId, [block.id], block.id)
                          }
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation()
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            event.currentTarget.blur()
                          }
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        type="time"
                        value={timeInputDrafts[getTimeInputDraftKey(dayId, block.id, 'startTime')] ?? block.startTime}
                      />
                      <span className="day-flow-time-slot-divider" aria-hidden="true">
                        to
                      </span>
                      <input
                        aria-label="End time"
                        className="day-flow-time-slot-input"
                        onBlur={(event) => {
                          updateBlock(dayId, block.id, 'endTime', event.target.value)
                          clearTimeInputDraft(dayId, block.id, 'endTime')
                        }}
                        onChange={(event) => setTimeInputDraft(dayId, block.id, 'endTime', event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onFocus={() => {
                          if (builderDay !== dayId || selectedBuilderBlockId !== block.id) {
                            setBuilderDay(dayId)
                            applyBuilderBlockSelection(dayId, [block.id], block.id)
                          }
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation()
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            event.currentTarget.blur()
                          }
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        type="time"
                        value={timeInputDrafts[getTimeInputDraftKey(dayId, block.id, 'endTime')] ?? block.endTime}
                      />
                      <div className="day-flow-duration-box" title="Duration">
                        {formatDurationHoursMinutes(block.startTime, block.endTime)}
                      </div>
                    </div>
                    <div
                      className={[
                        block.rowType === 'gap' ? 'day-flow-open-slot' : 'day-flow-content-card',
                        isPrimary ? 'day-flow-row-active' : '',
                        dayFlowDropIndex === index && dayFlowDragIndexRef.current !== null && dayFlowDragIndexRef.current !== index ? 'day-flow-row-drop-target' : '',
                        isSelected ? 'day-flow-row-selected' : '',
                        block.enabled ? '' : 'day-flow-row-disabled',
                        dayFlowDragIndex === index ? 'day-flow-row-dragging' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      draggable={block.rowType !== 'gap'}
                      onClick={(event) => {
                        if (block.rowType === 'gap') {
                          return
                        }
                        setBuilderDay(dayId)
                        handleBlockSelectionFromMouse(dayId, block.id, {
                          ctrlKey: event.ctrlKey,
                          metaKey: event.metaKey,
                          shiftKey: event.shiftKey,
                        })
                      }}
                      onDragEnd={() => {
                        dayFlowDragIndexRef.current = null
                        dayFlowDragDayRef.current = null
                        setDayFlowDragIndex(null)
                        setDayFlowDropIndex(null)
                      }}
                      onDragStart={(event) => {
                        if (block.rowType === 'gap') {
                          event.preventDefault()
                          return
                        }
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', block.id)
                        dayFlowDragIndexRef.current = index
                        dayFlowDragDayRef.current = dayId
                      }}
                      onKeyDown={(event) => {
                        if (block.rowType === 'gap') {
                          return
                        }
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setBuilderDay(dayId)
                          applyBuilderBlockSelection(dayId, [block.id], block.id)
                        }
                      }}
                      role={block.rowType === 'gap' ? undefined : 'button'}
                      style={{ minHeight: block.rowType === 'gap' ? '2.15rem' : '2.2rem' }}
                      tabIndex={block.rowType === 'gap' ? -1 : 0}
                    >
                      {block.rowType === 'gap' ? (
                        <div className="day-flow-open-slot-layout">
                          {dayFlowExpandedGapId === block.id ? (
                            <div className="day-flow-open-slot-actions day-flow-open-slot-actions-enter" data-gap-action-shell="true" onClick={(event) => event.stopPropagation()}>
                              <button
                                aria-label="Close gap actions"
                                className="day-flow-open-slot-collapse"
                                onClick={() => setDayFlowExpandedGapId(null)}
                                type="button"
                              >
                                -
                              </button>
                              <button
                                className="day-flow-block-chip"
                                onClick={() => {
                                  convertGapToActivity(dayId, block.id)
                                  setDayFlowExpandedGapId(null)
                                }}
                                type="button"
                              >
                                Create block
                              </button>
                              <button
                                className="day-flow-block-chip"
                                disabled={!canExtendPrevious}
                                onClick={() => {
                                  extendAdjacentBlockIntoGap(dayId, block.id, 'previous')
                                  setDayFlowExpandedGapId(null)
                                }}
                                type="button"
                              >
                                Expand previous
                              </button>
                              <button
                                className="day-flow-block-chip"
                                disabled={!canExtendNext}
                                onClick={() => {
                                  extendAdjacentBlockIntoGap(dayId, block.id, 'next')
                                  setDayFlowExpandedGapId(null)
                                }}
                                type="button"
                              >
                                Expand next
                              </button>
                            </div>
                          ) : (
                            <button
                              aria-expanded={false}
                              aria-label="Open gap actions"
                              className="day-flow-open-slot-plus"
                              data-gap-trigger="true"
                              onClick={(event) => {
                                event.stopPropagation()
                                setBuilderDay(dayId)
                                setDayFlowExpandedGapId(block.id)
                              }}
                              type="button"
                            >
                              +
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          <span
                            className={`timeline-item-fill sidebar-block color-${block.color}`}
                            aria-hidden="true"
                            onClick={(event) => {
                              event.stopPropagation()
                              clearDayFlowSelection()
                            }}
                          />
                          <div className="day-flow-content-card-layout">
                            <div className="day-flow-content-card-main">
                              <span className="day-flow-drag-cue" aria-hidden="true">
                                :::
                              </span>
                              {isPrimary ? (
                                <div className="day-flow-content-title-shell">
                                  <input
                                    aria-label="Block name"
                                    className="day-flow-content-title-input"
                                    onChange={(event) => updateBlock(builderDay, block.id, 'title', event.target.value)}
                                    onClick={(event) => event.stopPropagation()}
                                    size={Math.max(12, Math.min(block.title.length + 2, 30))}
                                    value={block.title}
                                  />
                                  {!block.enabled && <small className="day-flow-visibility-note">Hidden: will not display in Show mode</small>}
                                </div>
                              ) : (
                                <span className="day-flow-content-copy">
                                  <strong>{block.title}</strong>
                                  {!block.enabled && <small className="day-flow-visibility-note">Hidden: will not display in Show mode</small>}
                                </span>
                              )}
                            </div>
                            <div className="day-flow-content-actions" onClick={(event) => event.stopPropagation()}>
                              <button
                                aria-label="Move earlier"
                                className="day-flow-block-icon"
                                disabled={index <= 0}
                                onClick={() => moveBlock(builderDay, index, -1)}
                                type="button"
                              >
                                ↑
                              </button>
                              <button
                                aria-label="Move later"
                                className="day-flow-block-icon"
                                disabled={index < 0 || index >= builderBlocks.length - 1}
                                onClick={() => moveBlock(builderDay, index, 1)}
                                type="button"
                              >
                                ↓
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <div
                      className={[
                        'day-flow-row-controls',
                        isPrimary ? 'day-flow-row-controls-active' : '',
                        isSelected ? 'day-flow-row-controls-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {block.rowType === 'gap' ? null : (
                        <>
                          <button className="day-flow-block-chip" onClick={() => duplicateBlock(builderDay, index)} type="button">
                            Copy
                          </button>
                          <button aria-label="Design" className="day-flow-block-chip day-flow-block-chip-icon-only" onClick={() => setView('builder')} type="button">
                            <span aria-hidden="true" className="nav-button-icon nav-button-icon-oversize">{renderPrimaryNavGlyph('builder')}</span>
                          </button>
                          <button
                            className={block.enabled ? 'day-flow-block-chip' : 'day-flow-block-chip day-flow-block-chip-active'}
                            onClick={() => updateBlock(builderDay, block.id, 'enabled', !block.enabled)}
                            type="button"
                          >
                            {block.enabled ? 'Hide' : 'Show'}
                          </button>
                          <button
                            className="day-flow-block-chip day-flow-block-chip-danger day-flow-block-chip-icon-only"
                            onClick={() => removeBlock(builderDay, block.id)}
                            type="button"
                            aria-label="Remove block"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </Fragment>
              )
            })}
            <button
              aria-label="Create open time block"
              className="day-flow-gap-insert day-flow-gap-insert-inline day-flow-gap-insert-icon day-flow-gap-insert-bottom"
              data-gap-trigger="true"
              onClick={() => addBottomBlockFromDayFlow(dayId)}
              type="button"
            >
              <span aria-hidden="true">+</span>
              <span>Add Block</span>
            </button>
          </div>
        </div>
      </section>
    )
  }

  function renderActivityReferenceTimeline(dayId: WeekdayId) {
    return (
      <div className="day-flow-activity-surface">
        {renderDayFlowDayColumn(dayId)}
      </div>
    )
  }

  function renderActivitiesWorkspace(dayId: WeekdayId) {
    const dayActivities = sortActivitiesByTime(schedule[dayId].activities)

    return (
      <section className="day-flow-activity-workspace">
        <div className="panel day-flow-activity-list-panel">
          <div className="section-heading">
            <h3>Set activities</h3>
          </div>
          <button className="secondary-button day-flow-action-button" onClick={() => addDayActivity(dayId)} type="button">
            Add activity
          </button>
          <div className="day-flow-activity-list" role="list" aria-label="Activities for this day">
            {dayActivities.length === 0 ? (
              <div className="builder-empty-state">
                <p>No activities yet.</p>
              </div>
            ) : (
              dayActivities.map((activity) => {
                const selected = selectedDayActivityIds.includes(activity.id)
                const primary = selectedDayActivityId === activity.id
                return (
                  <div
                    className={[
                      'day-flow-activity-row',
                      selected ? 'day-flow-activity-row-selected' : '',
                      primary ? 'day-flow-activity-row-active' : '',
                    ].filter(Boolean).join(' ')}
                    key={activity.id}
                    role="listitem"
                  >
                    <button
                      className="day-flow-activity-row-main"
                      onClick={() => setSelectedDayActivityId(activity.id)}
                      type="button"
                    >
                      <span className={`day-flow-activity-swatch day-flow-activity-swatch-${activity.color}`} aria-hidden="true" />
                      <span className="day-flow-activity-row-copy">
                        <strong>{activity.title}</strong>
                        <small>{formatRange(activity.startTime, activity.endTime)}</small>
                      </span>
                    </button>
                    <button
                      aria-pressed={selected}
                      aria-label={selected ? 'Remove from selection' : 'Add to selection'}
                      className={selected ? 'day-flow-activity-row-toggle day-flow-activity-row-toggle-selected' : 'day-flow-activity-row-toggle'}
                      onClick={() => toggleDayActivitySelection(activity.id)}
                      type="button"
                    >
                      <span aria-hidden="true">{selected ? '✓' : '·'}</span>
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
        <div className="panel day-flow-activity-editor-panel">
          {selectedDayActivity ? (
            <div className="builder-object-inspector">
              <label className="field">
                <span>Activity name</span>
                <input
                  value={dayActivityDraft?.title ?? ''}
                  onChange={(event) => setDayActivityDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                />
              </label>
              <div className="day-flow-activity-time-grid">
                <label className="field">
                  <span>Start</span>
                  <input
                    type="time"
                    value={dayActivityDraft?.startTime ?? ''}
                    onChange={(event) => setDayActivityDraft((current) => (current ? { ...current, startTime: event.target.value } : current))}
                  />
                </label>
                <label className="field">
                  <span>End</span>
                  <input
                    type="time"
                    value={dayActivityDraft?.endTime ?? ''}
                    onChange={(event) => setDayActivityDraft((current) => (current ? { ...current, endTime: event.target.value } : current))}
                  />
                </label>
              </div>
              <div className="field">
                <span>Color</span>
                <div className="color-family-row" role="group" aria-label="Choose activity color">
                  {(['sunrise', 'sky', 'meadow', 'berry', 'lavender', 'peach', 'slate'] as const).map((value) => (
                    <button
                      className={dayActivityDraft?.color === value ? `toggle-chip color-family-chip color-family-chip-${value} toggle-chip-active` : `toggle-chip color-family-chip color-family-chip-${value}`}
                      key={value}
                      onClick={() => setDayActivityDraft((current) => (current ? { ...current, color: value } : current))}
                      type="button"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="builder-actions day-flow-activity-editor-actions">
                <button
                  className="primary-button"
                  disabled={!dayActivityDraft || !selectedDayActivityIsDirty}
                  onClick={() => {
                    if (dayActivityDraft) {
                      applyDayActivityDraft(dayId, selectedDayActivity.id, dayActivityDraft)
                    }
                  }}
                  type="button"
                >
                  Apply
                </button>
                <button
                  className="secondary-button"
                  disabled={!selectedDayActivityIsDirty}
                  onClick={() =>
                    setDayActivityDraft({
                      title: selectedDayActivity.title,
                      startTime: selectedDayActivity.startTime,
                      endTime: selectedDayActivity.endTime,
                      color: selectedDayActivity.color,
                    })
                  }
                  type="button"
                >
                  Reset
                </button>
                <button className="secondary-button" disabled={dayActivities[0]?.id === selectedDayActivity.id} onClick={() => moveDayActivity(dayId, selectedDayActivity.id, 'earlier')} type="button">
                  Move earlier
                </button>
                <button className="secondary-button" disabled={dayActivities.at(-1)?.id === selectedDayActivity.id} onClick={() => moveDayActivity(dayId, selectedDayActivity.id, 'later')} type="button">
                  Move later
                </button>
              </div>
            </div>
          ) : (
            <div className="builder-empty-state">
              <p>Select an activity to edit it.</p>
            </div>
          )}
        </div>
      </section>
    )
  }

  function renderStructuredWidget(
    object: Pick<StageObject, 'id' | 'type' | 'widgetData' | 'widgetLayoutPreset' | 'textStyle' | 'width' | 'height'>,
    mode: 'display' | 'builder' | 'thumbnail',
  ) {
    const sharedStyle = mode === 'thumbnail' ? getSnapshotTextStyle(cloneTextStyleSnapshot(object.textStyle)) : getTextObjectStyle(object as StageObject, mode)
    const nowForWidget = mode === 'thumbnail' ? new Date(2026, 0, 1, 10, 10, 0) : clockNow

    if (object.type === 'date') {
      return (
        <DateWidget
          frameHeight={object.height}
          frameWidth={object.width}
          now={nowForWidget}
          preset={object.widgetLayoutPreset}
          style={sharedStyle}
        />
      )
    }

    if (object.type === 'calendar') {
      return (
        <CalendarWidget
          data={parseCalendarWidgetData(object.widgetData)}
          frameHeight={object.height}
          frameWidth={object.width}
          now={nowForWidget}
          preset={object.widgetLayoutPreset}
          style={sharedStyle}
        />
      )
    }

    if (object.type === 'weather') {
      return (
        <WeatherWidget
          data={parseWeatherWidgetData(object.widgetData)}
          frameHeight={object.height}
          frameWidth={object.width}
          preset={object.widgetLayoutPreset}
          style={sharedStyle}
        />
      )
    }

    if (object.type === 'weather-live') {
      return (
        <WeatherLiveWidget
          data={parseWeatherLiveWidgetData(object.widgetData)}
          frameHeight={object.height}
          frameWidth={object.width}
          onRefresh={mode === 'thumbnail' ? undefined : () => void refreshWeatherLiveObject(object)}
          preset={object.widgetLayoutPreset}
          runtime={mode === 'thumbnail' ? null : weatherLiveState[object.id] ?? null}
          style={sharedStyle}
        />
      )
    }

    if (object.type === 'checklist') {
      return <ChecklistWidget items={parseChecklistWidgetData(object.widgetData)} textStyle={sharedStyle} />
    }

    return null
  }

  function renderBlockThumbnailSnapshot(snapshot: BlockThumbnailSnapshot) {
    if (snapshot.rowType === 'gap') {
      const durationLabel = snapshot.durationLabel ?? '0:00'
      const [hoursPartRaw, minutesPartRaw] = durationLabel.split(':')
      const hours = Number.parseInt(hoursPartRaw ?? '0', 10) || 0
      const minutes = Number.parseInt(minutesPartRaw ?? '0', 10) || 0
      return (
        <div className="builder-block-thumb-stage builder-block-thumb-stage-gap builder-block-thumb-stage-gap-preview">
          <div className="builder-block-thumb-compact-summary builder-block-thumb-gap-time-summary" aria-hidden="true">
            {hours > 0 && (
              <span className="builder-block-thumb-compact-time builder-block-thumb-gap-time-line">
                {`${hours} Hour${hours === 1 ? '' : 's'}`}
              </span>
            )}
            <span className="builder-block-thumb-compact-time builder-block-thumb-gap-time-line">
              {`${minutes} Minute${minutes === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
      )
    }

    return (
      <div className={`builder-block-thumb-stage stage-${snapshot.color}`}>
        <div className="builder-block-thumb-overlay">
          <span className="builder-block-thumb-time">{snapshot.timeLabel}</span>
          <span className="builder-block-thumb-title">{snapshot.title}</span>
        </div>
        {snapshot.enabled === false && (
          <div className="builder-block-thumb-warning" aria-hidden="true">
            <strong>Disabled</strong>
            <span>Hidden on Show until enabled</span>
          </div>
        )}
        <div className="builder-block-thumb-canvas">
          {snapshot.elements.map((element) => (
            <div
              className={`builder-block-thumb-element ${element.className}`}
              key={`${snapshot.blockId}-${element.id}`}
              style={{
                left: `${element.x}%`,
                top: `${element.y}%`,
                width: `${element.width}%`,
                height: `${element.height}%`,
              }}
            >
              {element.id === 'clock' ? (
                <div className="builder-thumb-clock-shell">
                  <ClockElement
                    frameHeight={element.height}
                    frameWidth={element.width}
                    mode={element.clockMode ?? 'digital'}
                    now={new Date(2026, 0, 1, 10, 10, 0)}
                    preset={(element.widgetLayoutPreset as ClockLayoutPreset | undefined) ?? 'auto'}
                  />
                </div>
              ) : element.id === 'timer' ? (
                <TimerElement
                  frameHeight={element.height}
                  frameWidth={element.width}
                  hidden={element.text === 'Timer hidden'}
                  preset={(element.widgetLayoutPreset as TimerLayoutPreset | undefined) ?? 'auto'}
                  value="12:34"
                />
              ) : element.id === 'image' && element.imageSrc ? (
                <div className="stage-image-shell">
                  <img className="stage-image" src={element.imageSrc} alt="" />
                </div>
              ) : element.id === 'rotations' ? (
                <div className="rotation-board" aria-label="Rotation groups">
                  {(element.items ?? []).map((group) => (
                    <article className="rotation-card" key={group} style={getSnapshotTextStyle(element.style)}>
                      <span>{group}</span>
                    </article>
                  ))}
                </div>
              ) : element.id === 'details' ? (
                <div className="stage-element-text-shell" style={getSnapshotTextStyle(element.style)}>
                  <ul className="note-list">
                    {(element.items ?? []).map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="stage-element-text-shell" style={getSnapshotTextStyle(element.style)}>
                  {element.id === 'note' ? (
                    <div className="stage-note-card">
                      <p className="stage-note">{element.text}</p>
                    </div>
                  ) : (
                    <p className={element.id === 'next' ? 'next-up' : 'stage-note'}>{element.text}</p>
                  )}
                </div>
              )}
            </div>
          ))}
          {snapshot.objects.map((object) => (
            <div
              className="builder-block-thumb-object"
              key={object.id}
              style={{
                left: `${object.x}%`,
                top: `${object.y}%`,
                width: `${object.width}%`,
                height: `${object.height}%`,
                zIndex: object.zIndex + 1,
              }}
            >
              {object.type === 'image' && object.src ? (
                <img className="stage-object-image" src={object.src} alt="" />
              ) : object.type === 'youtube' ? (
                <YouTubeFallbackCard mode="thumbnail" reason="unknown" src={object.src ?? ''} />
              ) : isWidgetType(object.type) ? (
                renderStructuredWidget(
                  {
                    id: object.id,
                    type: object.type,
                    widgetData: object.widgetData ?? '',
                    widgetLayoutPreset: object.widgetLayoutPreset ?? 'auto',
                    textStyle: {
                      fontSize: object.textStyle?.fontSize ?? defaultStageTextStyle.fontSize,
                      fontWeight: object.textStyle?.fontWeight ?? defaultStageTextStyle.fontWeight,
                      fontStyle: object.textStyle?.fontStyle ?? defaultStageTextStyle.fontStyle,
                      textAlign: object.textStyle?.textAlign ?? defaultStageTextStyle.textAlign,
                      underline: object.textStyle?.underline ?? defaultStageTextStyle.underline,
                      strikethrough: object.textStyle?.strikethrough ?? defaultStageTextStyle.strikethrough,
                      color: object.textStyle?.color ?? defaultStageTextStyle.color,
                      backgroundColor: object.textStyle?.backgroundColor ?? defaultStageTextStyle.backgroundColor,
                      padding: object.textStyle?.padding ?? defaultStageTextStyle.padding,
                      borderRadius: object.textStyle?.borderRadius ?? defaultStageTextStyle.borderRadius,
                      lineHeight: object.textStyle?.lineHeight ?? defaultStageTextStyle.lineHeight,
                    },
                    width: object.width,
                    height: object.height,
                  },
                  'thumbnail',
                )
              ) : (
                <div className="stage-object-text-shell" style={getSnapshotTextStyle(object.textStyle)}>
                  <p className="stage-object-text">{object.text}</p>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="builder-block-thumb-compact-summary" aria-hidden="true">
          <span className="builder-block-thumb-compact-time">{snapshot.timeLabel}</span>
          <span className="builder-block-thumb-compact-title">{snapshot.title}</span>
        </div>
      </div>
    )
  }

  function renderStageObject(
    object: StageObject,
    mode: 'display' | 'builder' | 'thumbnail' = 'display',
    options?: { startDisplayPlayback?: () => void; displayPlaybackActive?: boolean },
  ) {
    if (object.type === 'image') {
      const imageStyle = getEffectiveImageStyle(object.textStyle)
      return object.src ? (
        <div
          className="stage-object-image-shell"
          style={{
            background: imageStyle.backgroundColor,
            padding: `${Math.max(imageStyle.padding * (mode === 'thumbnail' ? 0.34 : mode === 'builder' ? builderStageScale : 1), 0)}px`,
            borderRadius: `${Math.max(imageStyle.borderRadius * (mode === 'thumbnail' ? 0.34 : mode === 'builder' ? builderStageScale : 1), 0)}px`,
          }}
        >
          <img className="stage-object-image" draggable={false} onDragStart={(event) => event.preventDefault()} src={object.src} alt="" />
        </div>
      ) : (
        <span className="stage-object-placeholder">Picture</span>
      )
    }

    if (object.type === 'youtube') {
      if (!object.src) {
        return <span className="stage-object-placeholder">Paste a YouTube link</span>
      }

      const availability = getYouTubeAvailability(object.src)

      if (mode !== 'display') {
        return availability.reason === 'fallback'
          ? <YouTubeFallbackCard errorCode={availability.errorCode} mode={mode} reason={availability.reason} src={object.src} />
          : <YouTubePreviewCard mode={mode} reason={availability.reason} src={object.src} />
      }

      if (availability.reason === 'fallback') {
        return <YouTubeFallbackCard errorCode={availability.errorCode} mode="display" reason="fallback" src={object.src} />
      }

      if (!options?.displayPlaybackActive) {
        return <YouTubePreviewCard mode="display" onPlay={options?.startDisplayPlayback} reason={availability.reason} src={object.src} />
      }

      return <YouTubeEmbed key={object.src} src={object.src} />
    }

    if (isWidgetType(object.type)) {
      return renderStructuredWidget(object, mode)
    }

    if (object.type === 'note-card') {
      return (
        <div className="stage-note-card">
          <p className="stage-note" style={getNoteCardTextStyle(object, mode)}>
            {object.text}
          </p>
        </div>
      )
    }

    return (
      <div className="stage-object-text-shell" style={getTextObjectStyle(object, mode)}>
        <p className="stage-object-text">{object.text}</p>
      </div>
    )
  }

  function renderBuilderStageObject(blockId: string, object: StageObject) {
    if (object.type === 'note-card' && selectedStageObjectId === object.id && editingStageObjectId === object.id) {
      return (
        <div className="builder-stage-text-surface builder-stage-text-surface-note">
          <div className="stage-note-card builder-stage-note-card-edit-shell">
            <p className="stage-note builder-stage-edit-preview-hidden" style={getNoteCardTextStyle(object, 'builder')}>
              {object.text}
            </p>
          </div>
          <textarea
            autoFocus
            aria-label="Note card"
            className="builder-stage-object-text-editor builder-stage-inline-editor builder-stage-inline-editor-note"
            draggable={false}
            onBlur={() => setEditingStageObjectId(null)}
            onChange={(event) => updateStageObject(builderDay, blockId, object.id, 'text', event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => event.preventDefault()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            style={getNoteCardTextStyle(object, 'builder')}
            value={object.text}
          />
        </div>
      )
    }

    if (object.type === 'text' && selectedStageObjectId === object.id && editingStageObjectId === object.id) {
      const builderTextStyle = getTextObjectStyle(object, 'builder')
      return (
        <div
          className="builder-stage-text-surface builder-stage-text-surface-plain"
          style={{ borderRadius: builderTextStyle.borderRadius as string }}
        >
          <div className="stage-object-text-shell builder-stage-textbox-edit-shell" style={builderTextStyle}>
            <p className="stage-object-text builder-stage-edit-preview-hidden">{object.text}</p>
          </div>
          <textarea
            autoFocus
            aria-label="Text box"
            className="builder-stage-object-text-editor builder-stage-inline-editor"
            draggable={false}
            onBlur={() => setEditingStageObjectId(null)}
            onChange={(event) => updateStageObject(builderDay, blockId, object.id, 'text', event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => event.preventDefault()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            style={builderTextStyle}
            value={object.text}
          />
        </div>
      )
    }

    return renderStageObject(object, 'builder')
  }

  function renderBuilderStageElement(block: ScheduleBlock, upcomingBlock: ScheduleBlock | null, elementId: StageElementId): ReactNode {
    if (elementId === 'details') {
      if (selectedStageObjectId === null && selectedStageElementId === 'details') {
        return (
          <div className="builder-stage-edit-shell">
            <div className="builder-stage-edit-preview builder-stage-edit-preview-hidden">
              <div className="stage-element-text-shell" style={getStageElementTextStyle(block, 'details', 'builder')}>
                <ul className="note-list">
                  {block.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </div>
            </div>
            <textarea
              aria-label="Block details"
              className="builder-stage-object-text-editor builder-stage-inline-editor"
              onChange={(event) => updateBlock(builderDay, block.id, 'details', event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
              style={getStageElementTextStyle(block, 'details', 'builder')}
              value={block.details.join('\n')}
            />
          </div>
        )
      }

      return (
        <div className="stage-element-text-shell" style={getStageElementTextStyle(block, 'details', 'builder')}>
          <ul className="note-list">
            {block.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </div>
      )
    }

    if (elementId === 'rotations') {
      if (selectedStageObjectId === null && selectedStageElementId === 'rotations') {
        return (
          <div className="builder-stage-edit-shell">
            <div className="builder-stage-edit-preview builder-stage-edit-preview-hidden">
              <div className="rotation-board" aria-label="Rotation groups">
                {block.rotationGroups.map((group) => (
                  <article key={group} className="rotation-card" style={getStageElementTextStyle(block, 'rotations', 'builder')}>
                    <span>{group}</span>
                  </article>
                ))}
              </div>
            </div>
            <textarea
              aria-label="Rotation groups"
              className="builder-stage-object-text-editor builder-stage-inline-editor"
              onChange={(event) => updateBlock(builderDay, block.id, 'rotationGroups', event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
              style={getStageElementTextStyle(block, 'rotations', 'builder')}
              value={block.rotationGroups.join('\n')}
            />
          </div>
        )
      }

      return (
        <div className="rotation-board" aria-label="Rotation groups">
          {block.rotationGroups.map((group) => (
            <article key={group} className="rotation-card" style={getStageElementTextStyle(block, 'rotations', 'builder')}>
              <span>{group}</span>
            </article>
          ))}
        </div>
      )
    }

    if (elementId === 'next' && upcomingBlock) {
      return (
        <div className="stage-element-text-shell" style={getStageElementTextStyle(block, 'next', 'builder')}>
          <p className="next-up">
            Next up: <strong>{getDisplayBlockTitle(upcomingBlock)}</strong> at {formatClock(upcomingBlock.startTime)}
          </p>
        </div>
      )
    }

    return getStageElements(block, upcomingBlock, 'builder').find((element) => element.id === elementId)?.content ?? null
  }

  function renderStageElementTemplateSection(elementId: StageElementId, block: ScheduleBlock) {
    return (
      <div className="builder-section-join">
        {renderBuilderSectionToggleRow({
          collapsed: builderTemplateMenuCollapsed,
          label: 'Template',
          onToggle: () => setBuilderTemplateMenuCollapsed((current) => !current),
        })}
        {renderBuilderSectionBody(
          <>
            <div className="builder-arrange-row">
              <button className="secondary-button" onClick={() => moveStageElementToDefault(builderDay, block.id, elementId)} type="button">
                Restore day default
              </button>
              <button className="secondary-button" onClick={() => resetStageElementToTemplate(builderDay, block.id, elementId)} type="button">
                Restore site template
              </button>
              <button className="secondary-button" onClick={() => setStageElementDefault(builderDay, block.id, elementId, 'day')} type="button">
                Save as day default
              </button>
              <button className="secondary-button" onClick={() => setStageElementDefault(builderDay, block.id, elementId, 'all-days')} type="button">
                Save as all-days default
              </button>
            </div>
            <p className="builder-helper-copy">Site template is read-only and can always be restored.</p>
          </>,
          builderTemplateMenuCollapsed,
        )}
      </div>
    )
  }

  return (
    <main className={`app-shell app-shell-${view}${view === 'display' && showFullscreenMode ? ' app-shell-display-fullscreen' : ''}`}>
      {view === 'display' && showFullscreenMode && !showFullscreenTopbar && <div aria-hidden="true" className="topbar-reveal-zone" />}
      <header
        className={`topbar${view === 'display' && showFullscreenMode && !showFullscreenTopbar ? ' topbar-hidden' : ''}`}
        onPointerEnter={() => {
          if (view === 'display' && showFullscreenMode) {
            setShowFullscreenTopbar(true)
          }
        }}
      >
        <div className="topbar-brand">
          <h1 className="topbar-title">
            <a className="topbar-brand-link" href="/">
              Llama Learners
            </a>
            <span aria-hidden="true" className="topbar-title-separator">
              {'>'}
            </span>
            <button className="topbar-brand-button" onClick={() => handleTopNavClick('home')} type="button">
              Schedule Maker
            </button>
          </h1>
          <p className="topbar-build">{BUILD_LABEL}</p>
        </div>

        <div className="topnav-shell">
          <nav className="topnav topnav-primary" aria-label="Primary">
            {primaryNavItems.map((item) => (
              <button
                key={item.id}
                aria-label={item.id === 'home' ? 'Home' : undefined}
                className={[
                  'nav-button',
                  `nav-button-${item.id}`,
                  item.id === 'home' ? 'nav-button-home-icon-only' : '',
                  item.id === view ? 'nav-button-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                disabled={displayLocked && view === 'display'}
                onClick={() => handleTopNavClick(item.id)}
                type="button"
              >
                <span aria-hidden="true" className="nav-button-icon">{renderPrimaryNavGlyph(item.id)}</span>
                {item.id === 'home' ? null : item.label}
              </button>
            ))}
          </nav>
          <div className="topnav topnav-secondary">
            {secondaryNavItems.map((item) => (
              <button
                key={item.id}
                className={item.id === view ? 'nav-button nav-button-active' : 'nav-button'}
                disabled={displayLocked && view === 'display'}
                onClick={() => handleTopNavClick(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
            <div className="topbar-slot topbar-slot-mode" role="group" aria-label="Mode specific controls">
              <div className="topbar-mode-group topbar-reset-group" role="group" aria-label="Mode controls">
                <span className="topbar-mode-label">Mode:</span>
                <button
                  className={advancedModeEnabled ? 'nav-button nav-button-active' : 'nav-button'}
                  onClick={() => setAdvancedModeEnabled((current) => !current)}
                  type="button"
                >
                  {advancedModeEnabled ? 'Advanced on' : 'Advanced off'}
                </button>
              </div>
              {advancedModeEnabled ? (
                <div className="topbar-mode-group topbar-reset-group" role="group" aria-label="Reset controls">
                  <span className="topbar-mode-label">Reset:</span>
                  <button className="nav-button" onClick={resetSavedBrowserState} type="button">
                    Browser data
                  </button>
                  <button className="nav-button nav-button-danger" onClick={resetAllSlideContent} type="button">
                    Slides
                  </button>
                  <button className="nav-button nav-button-danger" onClick={resetSlidesAndSchedules} type="button">
                    Slides + plan
                  </button>
                  <button className="nav-button nav-button-danger" onClick={restoreKnownGoodDefaultState} type="button">
                    Site default
                  </button>
                </div>
              ) : null}
              {view === 'display' ? (
                <>
                  <button
                    className="nav-button topbar-glyph-button"
                    onClick={() => void toggleShowFullscreen()}
                    type="button"
                  >
                    <span aria-hidden="true" className="nav-button-icon">
                      <svg className="nav-button-glyph" viewBox="0 0 24 24">
                        {showFullscreenMode ? (
                          <>
                            <path d="M9 5H5v4M15 5h4v4M9 19H5v-4M15 19h4v-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
                          </>
                        ) : (
                          <>
                            <path d="M5 10V5h5M19 10V5h-5M5 14v5h5M19 14v5h-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
                          </>
                        )}
                      </svg>
                    </span>
                    {showFullscreenMode ? 'Exit full view' : 'Full view'}
                  </button>
                  <button
                    className={displayLocked ? 'nav-button lock-button lock-button-active topbar-glyph-button' : 'nav-button lock-button topbar-glyph-button'}
                    onClick={() => setDisplayLocked((current) => !current)}
                    type="button"
                  >
                    <span aria-hidden="true" className="nav-button-icon">
                      <svg className="nav-button-glyph" viewBox="0 0 24 24">
                        <rect x="6.2" y="10.4" width="11.6" height="8.8" rx="1.9" fill="none" stroke="currentColor" strokeWidth="1.7" />
                        {displayLocked ? (
                          <path d="M8.8 10.4V8.5a3.2 3.2 0 1 1 6.4 0v1.9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                        ) : (
                          <path d="M15.2 10.4V8.5a3.2 3.2 0 0 0-6.4 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                        )}
                      </svg>
                    </span>
                    {displayLocked ? 'Unlock' : 'Lock'}
                  </button>
                  <div className="topbar-mode-group" role="group" aria-label="Sidebar mode">
                    <span className="topbar-mode-label">Sidebar:</span>
                    <button
                      className={sidebarMode === 'auto' ? 'nav-button nav-button-active' : 'nav-button'}
                      onClick={() => {
                        setSidebarMode('auto')
                      }}
                      type="button"
                    >
                      Min
                    </button>
                    <button
                      className={sidebarMode === 'pinned' ? 'nav-button nav-button-active' : 'nav-button'}
                      onClick={() => {
                        setSidebarMode('pinned')
                      }}
                      type="button"
                    >
                      Max
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            <div className="topbar-slot topbar-slot-save" role="group" aria-label="Save controls">
              <button
                aria-label="Quick save"
                className={hasUnsavedSaveChanges ? 'nav-button topbar-save-trigger topbar-save-trigger-nudge' : 'nav-button topbar-save-trigger'}
                onClick={() => void quickSaveSchedule()}
                type="button"
              >
                <span aria-hidden="true" className="nav-button-icon">
                  <svg className="nav-button-glyph" viewBox="0 0 24 24">
                    <path d="M4 3h13l3 3v15H4z" fill="none" stroke="currentColor" strokeWidth="1.7" />
                    <path d="M7 3h9v6H7z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 14h8v5H8z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </span>
              </button>
              <div className="topbar-save-menu" ref={saveMenuRef}>
                <button
                  aria-expanded={saveMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Open file menu"
                  className={saveMenuOpen ? 'nav-button topbar-save-trigger nav-button-active' : 'nav-button topbar-save-trigger'}
                  onClick={() => setSaveMenuOpen((current) => !current)}
                  type="button"
                >
                  <span aria-hidden="true" className="nav-button-icon">
                    <svg className="nav-button-glyph" viewBox="0 0 24 24">
                      <path d="M3.5 7.5h6.8l2 2h8.2v9.8H3.5z" fill="none" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M3.5 6.2V4h6.8l1.4 1.8h8.8v3.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </span>
                </button>
                {saveMenuOpen ? (
                  <div className="topbar-save-dropdown" role="menu" aria-label="Save options">
                    <div className="topbar-save-file-actions">
                      <button className="nav-button" onClick={() => void saveAsScheduleFile()} role="menuitem" type="button">
                        Save As
                      </button>
                      <button className="nav-button" onClick={() => importScheduleInputRef.current?.click()} role="menuitem" type="button">
                        Load
                      </button>
                    </div>
                    <div className="topbar-save-status-grid">
                      <span className="topbar-save-status">
                        {lastFileSaveAt
                          ? `File save: ${new Date(lastFileSaveAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                          : 'File save: not yet this session'}
                      </span>
                      <span className="topbar-save-status">
                        {lastFileLoadAt
                          ? `File load: ${new Date(lastFileLoadAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                          : 'File load: not yet this session'}
                      </span>
                    </div>
                    <span aria-hidden="true" className="topbar-save-divider" />
                    <button className="nav-button" onClick={restoreLatestAutosave} role="menuitem" type="button">
                      Restore last autosave
                    </button>
                    <div className="topbar-save-status-grid">
                      <span className="topbar-save-status">
                        {lastAutosaveAt
                          ? `Browser autosave: ${new Date(lastAutosaveAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                          : 'Browser autosave: pending'}
                      </span>
                    </div>
                    <p className="topbar-save-warning">
                      Clearing browser data may clear all site data permanently! Use Quick Save{' '}
                      <span aria-label="Quick Save icon" className="topbar-save-inline-icon" role="img">
                        <svg className="nav-button-glyph" viewBox="0 0 24 24">
                          <path d="M4 3h13l3 3v15H4z" fill="none" stroke="currentColor" strokeWidth="1.7" />
                          <path d="M7 3h9v6H7z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M8 14h8v5H8z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      </span>{' '}
                      or Save As as a backup.
                    </p>
                  </div>
                ) : null}
                <input
                  accept=".json,application/json"
                  className="builder-hidden-file-input"
                  onChange={(event) => {
                    void importScheduleBackup(event.target.files?.[0] ?? null)
                    event.currentTarget.value = ''
                    setSaveMenuOpen(false)
                  }}
                  ref={importScheduleInputRef}
                  type="file"
                />
              </div>
            </div>

            <div className="topbar-slot topbar-slot-history" role="group" aria-label="History controls">
              <button
                className={!(view === 'builder' || view === 'day-flow') ? 'nav-button topbar-glyph-button topbar-inactive-control' : 'nav-button topbar-glyph-button'}
                disabled={!(view === 'builder' || view === 'day-flow') || undoDepth === 0}
                onClick={undoSchedule}
                type="button"
              >
                <span aria-hidden="true" className="nav-button-icon">
                  <svg className="nav-button-glyph" viewBox="0 0 24 24">
                    <path d="M3.9 8.6 10.2 4v3.1c5.6 0 10 4.3 10 9.8 0 1-.2 2-.5 2.9-.2-4.7-4.1-8.4-8.9-8.4v3.1z" fill="currentColor" />
                  </svg>
                </span>
                Undo
              </button>
              <button
                className={!(view === 'builder' || view === 'day-flow') ? 'nav-button topbar-glyph-button topbar-inactive-control' : 'nav-button topbar-glyph-button'}
                disabled={!(view === 'builder' || view === 'day-flow') || redoDepth === 0}
                onClick={redoSchedule}
                type="button"
              >
                <span aria-hidden="true" className="nav-button-icon">
                  <svg className="nav-button-glyph" viewBox="0 0 24 24">
                    <path d="M20.1 8.6 13.8 4v3.1c-5.6 0-10 4.3-10 9.8 0 1 .2 2 .5 2.9.2-4.7 4.1-8.4 8.9-8.4v3.1z" fill="currentColor" />
                  </svg>
                </span>
                Redo
              </button>
            </div>

          </div>
        </div>
      </header>

      {view === 'home' && (
        <section className="home-preview-page">
          <article className="home-preview-hero">
            <p className="eyebrow">Preview</p>
            <h2>See what users will do, start to finish.</h2>
            <p className="home-summary">
              Plan the timeline, design each block, and run Show live.
            </p>
          </article>

          <article className="home-preview-shell" aria-label="Schedule Maker guided preview">
            <div className={homePreviewStageClassName}>
              <div className="home-preview-filmstrip">
                <section className="home-preview-frame home-preview-frame-intro">
                  <p className="home-preview-frame-label">Schedule Maker</p>
                  <h3>Daily classroom flow</h3>
                  <div className="home-preview-intro-bars" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                </section>
                <section className="home-preview-frame home-preview-frame-plan">
                  <p className="home-preview-frame-label">Plan</p>
                  <div className="home-preview-plan-bars" aria-hidden="true">
                    <span className="home-preview-plan-slot home-preview-plan-slot-a" />
                    <span className="home-preview-plan-slot home-preview-plan-slot-b" />
                    <span className="home-preview-plan-slot home-preview-plan-slot-c" />
                    <span className="home-preview-plan-slot home-preview-plan-slot-d" />
                  </div>
                </section>
                <section className="home-preview-frame home-preview-frame-design">
                  <p className="home-preview-frame-label">Design</p>
                  <div className="home-preview-design-canvas" aria-hidden="true">
                    <span className="home-preview-design-title" />
                    <span className="home-preview-design-text" />
                    <span className="home-preview-design-widget" />
                    <span className="home-preview-design-chip" />
                  </div>
                </section>
                <section className="home-preview-frame home-preview-frame-show">
                  <p className="home-preview-frame-label">Show</p>
                  <div className="home-preview-show-stage" aria-hidden="true">
                    <span className="home-preview-show-timer" />
                    <span className="home-preview-show-activity" />
                    <span className="home-preview-show-next" />
                  </div>
                </section>
                <section className="home-preview-frame home-preview-frame-ready">
                  <p className="home-preview-frame-label">Let&apos;s get started</p>
                  <div className="home-preview-ready-row" aria-hidden="true">
                    <span className="home-preview-ready-chip home-preview-ready-chip-active">Plan</span>
                    <span className="home-preview-ready-chip">Design</span>
                    <span className="home-preview-ready-chip">Show</span>
                  </div>
                </section>
              </div>
            </div>

            <div className="home-preview-footer">
              <div className="home-preview-progress" aria-label="Preview steps">
                <span className={['home-preview-progress-pill', homePreviewIndex >= 1 ? 'home-preview-progress-pill-active' : ''].filter(Boolean).join(' ')}>
                  Plan
                </span>
                <span className={['home-preview-progress-pill', homePreviewIndex >= 2 ? 'home-preview-progress-pill-active' : ''].filter(Boolean).join(' ')}>
                  Design
                </span>
                <span className={['home-preview-progress-pill', homePreviewIndex >= 3 ? 'home-preview-progress-pill-active' : ''].filter(Boolean).join(' ')}>
                  Show
                </span>
              </div>
              <button aria-label="Replay preview" className="home-preview-replay" onClick={replayHomePreview} type="button">
                <svg aria-hidden="true" className="home-preview-replay-glyph" viewBox="0 0 24 24">
                  <path d="M6.2 8.7V4.8l3.9 3.9z" />
                  <path d="M6.9 8.7a6.7 6.7 0 1 1-1.1 7" />
                </svg>
              </button>
              <p className="home-preview-caption">{activeHomePreviewPhase.caption}</p>
            </div>
          </article>
        </section>
      )}

      {view === 'day-flow' && (
        <section className="day-flow-page">
          <article className="panel panel-elevated day-flow-panel">
            <div className="day-flow-intro-row">
              <div className="day-flow-intro-copy">
                <div className="section-heading">
                  <p className="eyebrow">Whole-day editor</p>
                  <h2>Plan</h2>
                </div>
                <p className="home-summary">See the full week as a classroom timeline. Pick a block directly in the day view, then edit it in place.</p>
              </div>
              <div className={dayFlowRefreshing ? 'day-flow-topbar day-flow-content-refresh' : 'day-flow-topbar'}>
                <div className="builder-actions day-flow-actions day-flow-actions-row">
                  <span className="day-flow-copy-label">Mode:</span>
                  <button
                    className={planEditorMode === 'blocks' ? 'secondary-button day-flow-action-button nav-button-active' : 'secondary-button day-flow-action-button'}
                    onClick={() => setPlanMode('blocks')}
                    type="button"
                  >
                    Blocks
                  </button>
                  <button
                    className={planEditorMode === 'activities' ? 'secondary-button day-flow-action-button nav-button-active' : 'secondary-button day-flow-action-button'}
                    onClick={() => setPlanMode('activities')}
                    type="button"
                  >
                    Activities
                  </button>
                </div>
                {planEditorMode === 'blocks' && !planActivitiesClosing ? (
                  <>
                <div className="builder-actions day-flow-actions day-flow-actions-row">
                  <span className="day-flow-copy-label">Copy full day to:</span>
                  {weekdayOrder
                    .filter((dayId) => dayId !== builderDay)
                    .map((dayId) => (
                      <button
                        key={dayId}
                        className="secondary-button day-flow-action-button"
                        disabled={builderBlocks.length === 0}
                        onClick={() => copyDayToTargets(builderDay, [dayId])}
                        type="button"
                      >
                        {weekdayShortLabels[dayId]}
                      </button>
                    ))}
                  <button className="secondary-button day-flow-action-button" disabled={builderBlocks.length === 0} onClick={() => copyDayToAll(builderDay)} type="button">
                    All days
                  </button>
                </div>
                <div className="builder-actions day-flow-actions day-flow-actions-row">
                  <span className="day-flow-copy-label">Copy selected to:</span>
                  {weekdayOrder
                    .filter((dayId) => dayId !== builderDay)
                    .map((dayId) => (
                      <button
                        key={`selected-${dayId}`}
                        className="secondary-button day-flow-action-button"
                        disabled={selectedBuilderBlocks.length === 0}
                        onClick={() => copySelectedBlocksToTargets(builderDay, selectedBuilderBlockIds, [dayId])}
                        type="button"
                      >
                        {weekdayShortLabels[dayId]}
                      </button>
                    ))}
                  <button
                    className="secondary-button day-flow-action-button"
                    disabled={selectedBuilderBlocks.length === 0}
                    onClick={() => copySelectedBlocksToTargets(builderDay, selectedBuilderBlockIds, weekdayOrder.filter((dayId) => dayId !== builderDay))}
                    type="button"
                  >
                    All days
                  </button>
                </div>
                <div className="builder-actions day-flow-actions day-flow-actions-row">
                  <button
                    className="secondary-button day-flow-action-button"
                    disabled={selectedBuilderBlocks.length === 0 || selectedBuilderEnabledCount === selectedBuilderBlocks.length}
                    onClick={() => setBlocksEnabled(builderDay, selectedBuilderBlockIds, true)}
                    type="button"
                  >
                    Show selected
                  </button>
                  <button
                    className="secondary-button day-flow-action-button"
                    disabled={selectedBuilderBlocks.length === 0 || selectedBuilderEnabledCount === 0}
                    onClick={() => setBlocksEnabled(builderDay, selectedBuilderBlockIds, false)}
                    type="button"
                  >
                    Hide selected
                  </button>
                  <button
                    className="ghost-button icon-danger day-flow-action-button"
                    disabled={selectedBuilderBlocks.length === 0}
                    onClick={() => removeBlocks(builderDay, selectedBuilderBlockIds)}
                    type="button"
                  >
                    <span className="day-flow-action-icon" aria-hidden="true">
                      {renderTrashGlyph()}
                    </span>
                    Remove selected
                  </button>
                  <button
                    className="ghost-button icon-danger day-flow-action-button"
                    disabled={builderBlocks.length === 0}
                    onClick={() => removeBlocks(builderDay, builderBlocks.map((block) => block.id))}
                    type="button"
                  >
                    <span className="day-flow-action-icon" aria-hidden="true">
                      {renderTrashGlyph()}
                    </span>
                    Remove all
                  </button>
                </div>
                  </>
                ) : (
                  <>
                    <div className="builder-actions day-flow-actions day-flow-actions-row">
                      <span className="day-flow-copy-label">Copy full activity set to:</span>
                      {weekdayOrder
                        .filter((dayId) => dayId !== builderDay)
                        .map((dayId) => (
                          <button
                            key={`activities-${dayId}`}
                            className="secondary-button day-flow-action-button"
                            disabled={builderActivities.length === 0}
                            onClick={() => copyDayActivitiesToTargets(builderDay, [dayId])}
                            type="button"
                          >
                            {weekdayShortLabels[dayId]}
                          </button>
                        ))}
                      <button
                        className="secondary-button day-flow-action-button"
                        disabled={builderActivities.length === 0}
                        onClick={() => copyDayActivitiesToTargets(builderDay, weekdayOrder.filter((dayId) => dayId !== builderDay))}
                        type="button"
                      >
                        All days
                      </button>
                    </div>
                    <div className="builder-actions day-flow-actions day-flow-actions-row">
                      <span className="day-flow-copy-label">Copy selected to:</span>
                      {weekdayOrder
                        .filter((dayId) => dayId !== builderDay)
                        .map((dayId) => (
                          <button
                            key={`selected-activity-${dayId}`}
                            className="secondary-button day-flow-action-button"
                            disabled={selectedDayActivities.length === 0}
                            onClick={() => copySelectedActivitiesToTargets(builderDay, selectedDayActivityIds, [dayId])}
                            type="button"
                          >
                            {weekdayShortLabels[dayId]}
                          </button>
                        ))}
                      <button
                        className="secondary-button day-flow-action-button"
                        disabled={selectedDayActivities.length === 0}
                        onClick={() => copySelectedActivitiesToTargets(builderDay, selectedDayActivityIds, weekdayOrder.filter((dayId) => dayId !== builderDay))}
                        type="button"
                      >
                        All days
                      </button>
                    </div>
                    <div className="builder-actions day-flow-actions day-flow-actions-row">
                      <button className="secondary-button day-flow-action-button" onClick={() => addDayActivity(builderDay)} type="button">
                        Add activity
                      </button>
                      <button
                        className="ghost-button icon-danger day-flow-action-button"
                        disabled={selectedDayActivities.length === 0}
                        onClick={() => removeDayActivities(builderDay, selectedDayActivityIds)}
                        type="button"
                      >
                        <span className="day-flow-action-icon" aria-hidden="true">
                          {renderTrashGlyph()}
                        </span>
                        Remove selected
                      </button>
                      <button
                        className="ghost-button icon-danger day-flow-action-button"
                        disabled={builderActivities.length === 0}
                        onClick={() => removeDayActivities(builderDay, builderActivities.map((activity) => activity.id))}
                        type="button"
                      >
                        <span className="day-flow-action-icon" aria-hidden="true">
                          {renderTrashGlyph()}
                        </span>
                        Remove all
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className={dayFlowRefreshing ? 'day-flow-folder-shell day-flow-content-refresh' : 'day-flow-folder-shell'}>
              <div className="day-flow-tabs-row">
                <div className="day-flow-tabs" role="tablist" aria-label="Choose block plan day">
                  {weekdayOrder.map((dayId) => (
                    <button
                      key={dayId}
                      aria-selected={builderDay === dayId}
                      className={
                        builderDay === dayId
                          ? `day-flow-tab day-flow-tab-active ${weekdayFolderClasses[dayId]}`
                          : `day-flow-tab ${weekdayFolderClasses[dayId]}`
                      }
                      onClick={() => switchDayFlowDay(dayId)}
                      role="tab"
                      type="button"
                    >
                      {schedule[dayId].label}
                    </button>
                  ))}
                </div>
                <div className="day-flow-tabs-meta">
                  <span className="builder-summary-pill builder-summary-pill-active">
                    {planEditorMode === 'blocks' ? `${selectedBuilderBlocks.length} selected` : `${selectedDayActivities.length} selected`}
                  </span>
                </div>
              </div>
              {planEditorMode === 'blocks' && !planActivitiesClosing ? (
                <div
                  className="day-flow-weekboard"
                  onClick={(event) => {
                    if (event.target === event.currentTarget) {
                      clearDayFlowSelection()
                    }
                  }}
                  role="list"
                  aria-label={`${schedule[builderDay].label} block timeline`}
                >
                  {renderDayFlowDayColumn(builderDay)}
                </div>
              ) : (
                <div className={planActivitiesClosing ? 'day-flow-activities-board day-flow-activities-board-closing' : 'day-flow-activities-board'}>
                  {renderActivityReferenceTimeline(builderDay)}
                  <div className={planActivitiesClosing ? 'day-flow-activity-overlay day-flow-activity-overlay-closing' : 'day-flow-activity-overlay'}>
                    {renderActivitiesWorkspace(builderDay)}
                  </div>
                </div>
              )}
            </div>
          </article>
        </section>
      )}

      {view === 'display' && (
        <section className={displayGridClass}>
          <aside
            className={
              sidebarMode === 'pinned' && !displaySidebarSettingsOpen
                ? 'sidebar panel sidebar-settings-collapsed'
                : 'sidebar panel'
            }
          >
            {sidebarMode === 'pinned' ? (
              <button
                aria-expanded={displaySidebarSettingsOpen}
                aria-label={displaySidebarSettingsOpen ? 'Hide sidebar settings' : 'Show sidebar settings'}
                className={displaySidebarSettingsOpen ? 'display-sidebar-settings-toggle display-sidebar-settings-toggle-active' : 'display-sidebar-settings-toggle'}
                onClick={() => setDisplaySidebarSettingsOpen((current) => !current)}
                type="button"
              >
                <svg className="display-sidebar-settings-glyph nav-button-glyph" viewBox="0 0 24 24">
                  <rect x="3.2" y="2.8" width="17.6" height="18.4" rx="2.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M3.8 15.2h16.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  {displaySidebarSettingsOpen ? (
                    <path d="m8.7 10.8 3.3-3.3 3.3 3.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
                  ) : (
                    <path d="m8.7 7.6 3.3 3.3 3.3-3.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
                  )}
                </svg>
              </button>
            ) : null}
            {(sidebarMode !== 'pinned' || displaySidebarSettingsOpen) ? (
              <>
                <div className="display-sidebar-actions" aria-label="Show navigation">
                <div className="display-sidebar-actions-row display-sidebar-actions-row-primary">
                <div className="display-sidebar-action-group display-sidebar-action-group-transport">
                  <div className="display-sidebar-split-button" aria-label="Show navigation">
                    <button
                      className="display-sidebar-split-arrow-button display-sidebar-split-button-left"
                      disabled={!showSidebarCanGoPrevious}
                      onClick={() => openManualMode(Math.max(displaySidebarFocusIndex - 1, 0))}
                      aria-label="Previous"
                      data-tooltip="Previous block"
                      type="button"
                    >
                      <svg aria-hidden="true" className="display-sidebar-nav-glyph display-sidebar-nav-arrow display-sidebar-nav-arrow-flipped" viewBox="0 0 24 24">
                        <path d="M6 13h10.17l-4.59 4.59L12 19l7-7-7-7-1.42 1.41L16.17 11H6z" fill="currentColor" />
                      </svg>
                    </button>
                    <span aria-hidden="true" className="display-sidebar-split-divider" />
                    <button
                      className="display-sidebar-split-arrow-button display-sidebar-split-button-right"
                      disabled={!showSidebarCanGoNext}
                      onClick={() => openManualMode(Math.min(displaySidebarFocusIndex + 1, displayBlocks.length - 1))}
                      aria-label="Next"
                      data-tooltip="Next block"
                      type="button"
                    >
                      <svg aria-hidden="true" className="display-sidebar-nav-glyph display-sidebar-nav-arrow" viewBox="0 0 24 24">
                        <path d="M6 13h10.17l-4.59 4.59L12 19l7-7-7-7-1.42 1.41L16.17 11H6z" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                  <button
                    className="display-sidebar-compact-action-button"
                    disabled={!showSidebarCanRestart}
                    onClick={restartCurrentDisplay}
                    aria-label="Restart"
                    data-tooltip="Restart current block from the beginning"
                    type="button"
                  >
                    <svg aria-hidden="true" className="display-sidebar-nav-glyph" viewBox="0 0 24 24">
                      <path d="M12 5V2L7 7l5 5V9c2.8 0 5 2.2 5 5s-2.2 5-5 5-5-2.2-5-5H5c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z" fill="currentColor" />
                    </svg>
                  </button>
                </div>
                </div>
                <div className="display-sidebar-actions-row display-sidebar-actions-row-secondary">
                <div className="display-sidebar-action-group display-sidebar-action-group-playback">
                  <button
                    className={`display-sidebar-live-toggle-button display-sidebar-live-toggle-${manualBlockId === null && displayHoldBlockId === null && displayReplayState === null && followClockDay ? 'on' : 'off'}`}
                    disabled={showSidebarControlsDisabled}
                    onClick={toggleLiveDisplay}
                    aria-label={manualBlockId === null && displayHoldBlockId === null && displayReplayState === null && followClockDay ? 'Return to last state' : 'Go live'}
                    data-tooltip={manualBlockId === null && displayHoldBlockId === null && displayReplayState === null && followClockDay ? 'Return to last state' : 'Go live'}
                    type="button"
                  >
                    <span aria-hidden="true" className="display-sidebar-live-toggle-sizer">LIVE</span>
                    <span className="display-sidebar-live-toggle-content">
                      <svg aria-hidden="true" className="display-sidebar-glyph-sample-icon" viewBox="0 0 24 24">
                        {manualBlockId === null && displayHoldBlockId === null && displayReplayState === null && followClockDay ? (
                          <>
                            <circle cx="12" cy="12" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
                            <path d="M12 2.8v2.7M5.6 5.6l1.9 1.9M18.4 5.6l-1.9 1.9M2.8 12h2.7M18.5 12h2.7M5.6 18.4l1.9-1.9M18.4 18.4l-1.9-1.9M12 18.5v2.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" opacity="0.6" />
                          </>
                        ) : (
                          <circle cx="12" cy="12" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
                        )}
                      </svg>
                      <span className="display-sidebar-glyph-sample-label">LIVE</span>
                    </span>
                  </button>
                  <button
                    className={`display-sidebar-live-toggle-button display-sidebar-live-toggle-${displayHoldBlockId === null ? 'on' : 'off'}`}
                    disabled={!showSidebarCanHold}
                    onClick={togglePausePlayDisplay}
                    aria-label={displayHoldBlockId === null ? 'Hold current block' : 'Resume live'}
                    data-tooltip={displayHoldBlockId === null ? 'Hold current block' : 'Resume live'}
                    type="button"
                  >
                    <span className="display-sidebar-live-toggle-content">
                      <svg aria-hidden="true" className="display-sidebar-live-toggle-icon" viewBox="0 0 24 24">
                        {displayHoldBlockId === null ? (
                          <>
                            <path d="M7 6.5h4.2v11H7zM12.8 6.5H17v11h-4.2z" fill="currentColor" />
                          </>
                        ) : (
                          <path d="M8 6.5l9 5.5-9 5.5z" fill="currentColor" />
                        )}
                      </svg>
                    </span>
                  </button>
                </div>
                <div className="display-sidebar-action-group display-sidebar-action-group-edit">
                  <button
                    className="display-sidebar-compact-action-button"
                    disabled={showSidebarControlsDisabled}
                    onClick={openCurrentForEditingFromDisplay}
                    aria-label={activeBlockIsGap ? 'Edit open time in Plan' : 'Edit current slide'}
                    data-tooltip={activeBlockIsGap ? 'Edit open time in Plan' : 'Edit current slide in Design'}
                    type="button"
                  >
                    <span aria-hidden="true" className="display-sidebar-edit-glyph">{renderPrimaryNavGlyph(activeBlockIsGap ? 'day-flow' : 'builder')}</span>
                  </button>
                </div>
                </div>
              </div>

                <div className="day-switcher weekday-chip-grid" role="tablist" aria-label="Choose weekday">
                  {weekdayOrder.map((dayId) => (
                    <button
                      key={dayId}
                      className={dayId === displayDay ? 'chip weekday-chip chip-active' : 'chip weekday-chip'}
                      disabled={displayLocked}
                      onClick={() => previewDay(dayId)}
                      type="button"
                    >
                      {schedule[dayId].label.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {daySchedule.blocks.length === 0 ? (
              renderDisplayNoBlocksSidebarHelper()
            ) : (
              <div
                className="timeline-shell"
                onDoubleClick={() => {
                  if (displaySidebarBlockClickTimeoutRef.current !== null) {
                    window.clearTimeout(displaySidebarBlockClickTimeoutRef.current)
                    displaySidebarBlockClickTimeoutRef.current = null
                  }
                  toggleSidebarMinMaxMode()
                }}
              >
                <div className="timeline-now" style={{ top: `${Math.round(dayProgress * 100)}%` }}>
                  <span className="timeline-now-dot" />
                </div>
                <div className="timeline-legend" aria-hidden="true">
                  {displayTimeTickMinutes.map((minute) => {
                    const dayRange = Math.max(displayDayEndMinutes - displayDayStartMinutes, 1)
                    const tickOffset = ((minute - displayDayStartMinutes) / dayRange) * 100
                    const hourTick = minute % 60 === 0
                    const hour24 = Math.floor(minute / 60) % 24
                    const meridiem = hour24 >= 12 ? 'PM' : 'AM'
                    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
                    return (
                      <span
                        key={`tick-${minute}`}
                        className={hourTick ? 'timeline-legend-tick timeline-legend-tick-hour' : 'timeline-legend-tick'}
                        style={{ top: `${Math.max(0, Math.min(100, tickOffset))}%` }}
                      >
                        {hourTick ? <span className="timeline-legend-label">{`${hour12}${meridiem}`}</span> : null}
                      </span>
                    )
                  })}
                </div>

                <div className="timeline-list sidebar-list">
                {displayBlocks.map((block, index) => {
                  const state =
                    index < displaySidebarFocusIndex
                      ? 'done'
                      : index === displaySidebarFocusIndex
                        ? 'current'
                        : index === displaySidebarFocusIndex + 1
                          ? 'next'
                          : 'upcoming'

                  return (
                    <button
                      key={block.id}
                      className={`timeline-item sidebar-item sidebar-${state}`}
                      aria-label={`${getDisplayBlockTitle(block)}, ${formatRange(block.startTime, block.endTime)}`}
                      disabled={displayLocked}
                      onClick={() => {
                        if (displaySidebarBlockClickTimeoutRef.current !== null) {
                          window.clearTimeout(displaySidebarBlockClickTimeoutRef.current)
                        }
                        displaySidebarBlockClickTimeoutRef.current = window.setTimeout(() => {
                          openManualMode(index)
                          displaySidebarBlockClickTimeoutRef.current = null
                        }, 220)
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        if (displaySidebarBlockClickTimeoutRef.current !== null) {
                          window.clearTimeout(displaySidebarBlockClickTimeoutRef.current)
                          displaySidebarBlockClickTimeoutRef.current = null
                        }
                        toggleSidebarMinMaxMode()
                      }}
                      style={{
                        flexGrow: displaySidebarBlockDurations[index] ?? 1,
                        flexShrink: 1,
                        flexBasis: 0,
                        minHeight: 0,
                      }}
                      type="button"
                    >
                      <span className={`timeline-item-fill sidebar-block color-${block.color}`} aria-hidden="true" />
                      <span className="sidebar-block-label">
                        <span className="sidebar-block-time">
                          <span>{`${formatClock(block.startTime)} -`}</span>
                          <span>{formatClock(block.endTime)}</span>
                        </span>
                        <strong>{getDisplayBlockTitle(block)}</strong>
                      </span>
                    </button>
                  )
                })}
                </div>
              </div>
            )}
          </aside>

          <section className="display-stage">
              <article
                className={`stage-card ${
                  displayNoBlocks
                    ? 'stage-card-empty'
                    : `${(displayStageBlock?.gentleBackground ?? activeBlock?.gentleBackground ?? false) ? '' : 'stage-gentle '}stage-${displayStageBlock?.color ?? activeBlock?.color ?? 'sunrise'}`
                }`}
              >
              {!displayNoBlocks && !displayShowsDisabledBlock && (
                <div className="stage-header">
                  <div>
                    <p className="eyebrow">
                      {displayReplayState
                        ? 'Replay in progress'
                        : displayHoldBlockId
                          ? 'Display paused'
                          : mode === 'manual'
                            ? 'Manual override active'
                            : followClockDay
                              ? 'Live schedule'
                              : 'Day preview'}
                    </p>
                    {(displayStageBlock?.showTitle ?? activeBlock?.showTitle ?? true) && (
                      <h2
                        className="stage-title"
                        style={displayStageBlock ? getStageElementTextStyle(displayStageBlock, 'title', 'display') : undefined}
                      >
                        {displayStageBlock ? displayStageBlock.title : activeBlock ? activeBlock.title : 'No block scheduled yet'}
                      </h2>
                    )}
                    {(displayStageBlock?.showTimeRange ?? activeBlock?.showTimeRange ?? false) && (
                      <>
                        <p
                          className="stage-range"
                          style={displayStageBlock ? getStageElementTextStyle(displayStageBlock, 'timeRange', 'display') : undefined}
                        >
                          {formatRange(displayStageBlock?.startTime ?? activeBlock?.startTime ?? '00:00', displayStageBlock?.endTime ?? activeBlock?.endTime ?? '00:00')}
                        </p>
                        {displayStageLiveEndClock && (
                          <p className="stage-live-range">
                            Ends at{' '}
                            <em>
                              {formatClock(
                                `${String(displayStageLiveEndClock.getHours()).padStart(2, '0')}:${String(displayStageLiveEndClock.getMinutes()).padStart(2, '0')}`,
                              )}
                            </em>
                          </p>
                        )}
                      </>
                    )}
                    <div className="stage-meta">
                      <span className="meta-pill">{daySchedule.label}</span>
                      <span className="meta-pill">
                        {displayReplayState
                          ? 'Replaying from start'
                          : displayHoldBlockId
                            ? 'Display held'
                            : mode === 'manual'
                              ? 'Teacher controls on'
                              : followClockDay
                                ? 'Following real time'
                                : 'Previewing selected day'}
                      </span>
                      <span className="meta-pill">{displayLocked ? 'Show locked' : 'Show unlocked'}</span>
                    </div>
                  </div>
                </div>
              )}

                  {activeBlock ? (
                <div className="stage-body">
                  {displayShowsDisabledBlock ? (
                    <div className="stage-gap-shell">{renderGapCard(activeBlock, nextBlock, 'display')}</div>
                  ) : displayShowsOpenTimeGap ? (
                    activeBlock.openTimeMode === 'blank' ? (
                      <div className="stage-gap-shell">
                        <div className="stage-gap-card stage-gap-card-display stage-gap-card-blank">
                          <span className="stage-gap-kicker">Open</span>
                        </div>
                      </div>
                    ) : activeBlock.openTimeMode === 'default' || activeBlock.openTimeMode === 'countdown' ? (
                      <div className="stage-gap-shell">{renderGapCard(activeBlock, activeGapNextBlock, 'display')}</div>
                    ) : displayStageBlock ? (
                      <div className="stage-layout-canvas" ref={displayStageCanvasRef}>
                        {visibleDisplayStageElements.filter((element) => element.id !== 'activity').map((element) => {
                          const layout = displayStageBlock.stageLayout[element.id]
                          return (
                            <div
                              className={element.className}
                              key={element.id}
                              onPointerDown={(event) => onDisplayStageElementPointerDown(event, displayStageBlock, element.id)}
                              style={{
                                cursor: 'default',
                                left: `${element.id === 'activity' ? Math.max(0, 100 - layout.width) : layout.x}%`,
                                top: `${layout.y}%`,
                                width: `${layout.width}%`,
                                height: `${layout.height}%`,
                              }}
                            >
                              {element.content}
                            </div>
                          )
                        })}
                        {visibleDisplayStageObjects.map((object) => (
                          <div
                            className={object.type === 'youtube' ? 'stage-object stage-object-video' : 'stage-object'}
                            key={object.id}
                            onPointerDown={(event) => onDisplayStageObjectPointerDown(event, displayStageBlock, object)}
                            style={getRenderedStageObjectFrameStyle(
                              object,
                              object.type === 'youtube' ? 40 : object.zIndex + 10,
                              !displayLocked && object.displayMovable ? 'grab' : 'default',
                            )}
                          >
                            {object.type === 'checklist' ? (
                              <ChecklistWidget
                                items={parseChecklistWidgetData(object.widgetData)}
                                onToggle={object.displayMovable ? undefined : (itemId) => toggleChecklistWidgetItem(displayDay, displayStageBlock.id, object.id, itemId)}
                                textStyle={getTextObjectStyle(object, 'display')}
                              />
                            ) : (
                              renderStageObject(object, 'display', {
                                displayPlaybackActive: Boolean(displayPlayingYouTubeIds[object.id]),
                                startDisplayPlayback: object.type === 'youtube'
                                  ? () => setDisplayPlayingYouTubeIds((current) => ({ ...current, [object.id]: true }))
                                  : undefined,
                              })
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="stage-gap-shell">{renderGapCard(activeBlock, activeGapNextBlock, 'display')}</div>
                    )
                  ) : (
                    <div className="stage-layout-canvas" ref={displayStageCanvasRef}>
                      {visibleDisplayStageElements.filter((element) => element.id !== 'activity').map((element) => {
                        const layout = displayStageBlock!.stageLayout[element.id]
                        return (
                          <div
                            className={element.className}
                            key={element.id}
                            onPointerDown={(event) => onDisplayStageElementPointerDown(event, displayStageBlock!, element.id)}
                          style={{
                            cursor: 'default',
                            left: `${element.id === 'activity' ? Math.max(0, 100 - layout.width) : layout.x}%`,
                            top: `${layout.y}%`,
                            width: `${layout.width}%`,
                            height: `${layout.height}%`,
                          }}
                          >
                            {element.content}
                          </div>
                        )
                      })}
                      {visibleDisplayStageObjects.map((object) => (
                        <div
                          className={object.type === 'youtube' ? 'stage-object stage-object-video' : 'stage-object'}
                          key={object.id}
                          onPointerDown={(event) => onDisplayStageObjectPointerDown(event, displayStageBlock!, object)}
                          style={getRenderedStageObjectFrameStyle(
                            object,
                            object.type === 'youtube' ? 40 : object.zIndex + 10,
                            !displayLocked && object.displayMovable ? 'grab' : 'default',
                          )}
                        >
                          {object.type === 'checklist' ? (
                            <ChecklistWidget
                              items={parseChecklistWidgetData(object.widgetData)}
                              onToggle={object.displayMovable ? undefined : (itemId) => toggleChecklistWidgetItem(displayDay, displayStageBlock!.id, object.id, itemId)}
                              textStyle={getTextObjectStyle(object, 'display')}
                            />
                          ) : (
                            renderStageObject(object, 'display', {
                              displayPlaybackActive: Boolean(displayPlayingYouTubeIds[object.id]),
                              startDisplayPlayback: object.type === 'youtube'
                                ? () => setDisplayPlayingYouTubeIds((current) => ({ ...current, [object.id]: true }))
                                : undefined,
                            })
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                displayNoBlocks ? renderDisplayNoBlocksClockState() : renderDisplayEmptyState()
              )}

              {!displayNoBlocks && !(mode === 'manual' && displayShowsDisabledBlock) && (
                <div className="control-row display-control-row">
                {!activeBlock ? (
                  <>
                    <button className="primary-button" disabled={displayLocked} onClick={() => setView('day-flow')} type="button">
                      Set up active blocks
                    </button>
                    <button className="secondary-button" disabled={displayLocked} onClick={() => setView('builder')} type="button">
                      Open Design
                    </button>
                  </>
                ) : (
                  <>
                    {!displayShowsDisabledBlock && (
                      <>
                        <button
                          className="primary-button"
                          disabled={displayLocked}
                          onClick={() => updateManualTimer(manualTimer?.pausedRemainingSeconds === null ? 'pause' : 'resume')}
                          type="button"
                        >
                          {manualTimer?.pausedRemainingSeconds === null ? 'Pause timer' : 'Resume timer'}
                        </button>
                        <button className="secondary-button" disabled={displayLocked} onClick={() => updateManualTimer('add1')} type="button">
                          +1 min
                        </button>
                        <button className="secondary-button" disabled={displayLocked} onClick={() => updateManualTimer('add5')} type="button">
                          +5 min
                        </button>
                        <button className="secondary-button" disabled={displayLocked} onClick={() => updateManualTimer('reset')} type="button">
                          Reset timer
                        </button>
                      </>
                    )}
                  </>
                )}
                </div>
              )}
            </article>
            {displayShowsActivityOverlay && displayStageBlock ? renderDisplayActivityOverlay(displayStageBlock, displayDay) : null}
          </section>
        </section>
      )}

      {view === 'builder' && (
        <section className="builder-workbench">
          <article className="panel builder-leftbar">
            <div className="builder-rail-scroll">
              <div className="builder-day-selector">
                <h2>Choose day</h2>
                <div className="day-switcher weekday-chip-grid" role="tablist" aria-label="Choose day to edit">
                  {weekdayOrder.map((dayId) => (
                    <button
                      key={dayId}
                      className={builderDay === dayId ? 'chip weekday-chip chip-active' : 'chip weekday-chip'}
                      onClick={() => setBuilderDay(dayId)}
                      type="button"
                    >
                      {weekdayShortLabels[dayId]}
                    </button>
                  ))}
                </div>
              </div>

            {selectedBuilderBlock && (
              <>
                <div className={selectedBuilderBlock.enabled ? 'builder-visible-toggle builder-visible-toggle-active' : 'builder-visible-toggle'}>
                  <div className="builder-visible-toggle-row">
                    <div className="builder-visible-toggle-copy">
                      <span className="builder-visible-toggle-kicker">Slide state</span>
                      <span className="builder-core-object-label">Visible</span>
                    </div>
                    <button
                      aria-label={`Visible ${selectedBuilderBlock.enabled ? 'on' : 'off'}`}
                      aria-pressed={selectedBuilderBlock.enabled}
                      className={selectedBuilderBlock.enabled ? 'builder-core-object-switch builder-core-object-switch-active' : 'builder-core-object-switch'}
                      onClick={() => updateBlock(builderDay, selectedBuilderBlock.id, 'enabled', !selectedBuilderBlock.enabled)}
                      type="button"
                    >
                      <span className="builder-core-object-switch-thumb" />
                    </button>
                  </div>
                </div>
                {selectedBuilderBlock.rowType === 'activity' ? (
                  <>
                <div className="builder-section-join">
                  {renderBuilderSectionToggleRow({
                    collapsed: builderCoreObjectsCollapsed,
                    label: 'Core objects',
                    onToggle: () => setBuilderCoreObjectsCollapsed((current) => !current),
                  })}
                  {renderBuilderSectionBody(
                    <div className="builder-core-object-list" aria-label={`Show or hide core objects for ${selectedBuilderBlock.title}`}>
                    <div className={selectedCoreTitle ? 'builder-core-object-row builder-core-object-row-active' : 'builder-core-object-row'}>
                      <span className="builder-core-object-label">Block name</span>
                      <button
                        aria-label={`Block name ${selectedCoreTitle ? 'on' : 'off'}`}
                        aria-pressed={selectedCoreTitle}
                        className={selectedCoreTitle ? 'builder-core-object-switch builder-core-object-switch-active' : 'builder-core-object-switch'}
                        onClick={() => updateBlock(builderDay, selectedBuilderBlock.id, 'showTitle', !selectedBuilderBlock.showTitle)}
                        type="button"
                      >
                        <span className="builder-core-object-switch-thumb" />
                      </button>
                    </div>
                    <div className={selectedCoreRange ? 'builder-core-object-row builder-core-object-row-active' : 'builder-core-object-row'}>
                      <span className="builder-core-object-label">Time range</span>
                      <button
                        aria-label={`Time range ${selectedCoreRange ? 'on' : 'off'}`}
                        aria-pressed={selectedCoreRange}
                        className={selectedCoreRange ? 'builder-core-object-switch builder-core-object-switch-active' : 'builder-core-object-switch'}
                        onClick={() => updateBlock(builderDay, selectedBuilderBlock.id, 'showTimeRange', !selectedBuilderBlock.showTimeRange)}
                        type="button"
                      >
                        <span className="builder-core-object-switch-thumb" />
                      </button>
                    </div>
                    <div className={selectedBuilderBlock.showNext ? 'builder-core-object-row builder-core-object-row-active' : 'builder-core-object-row'}>
                      <span className="builder-core-object-label">Next up</span>
                      <button
                        aria-label={`Next up ${selectedBuilderBlock.showNext ? 'on' : 'off'}`}
                        aria-pressed={selectedBuilderBlock.showNext}
                        className={selectedBuilderBlock.showNext ? 'builder-core-object-switch builder-core-object-switch-active' : 'builder-core-object-switch'}
                        onClick={() => updateBlock(builderDay, selectedBuilderBlock.id, 'showNext', !selectedBuilderBlock.showNext)}
                        type="button"
                      >
                        <span className="builder-core-object-switch-thumb" />
                      </button>
                    </div>
                    <div className={selectedBuilderBlock.showTimer ? 'builder-core-object-row builder-core-object-row-active' : 'builder-core-object-row'}>
                      <span className="builder-core-object-label">Time remaining</span>
                      <button
                        aria-label={`Time remaining ${selectedBuilderBlock.showTimer ? 'on' : 'off'}`}
                        aria-pressed={selectedBuilderBlock.showTimer}
                        className={selectedBuilderBlock.showTimer ? 'builder-core-object-switch builder-core-object-switch-active' : 'builder-core-object-switch'}
                        onClick={() => updateBlock(builderDay, selectedBuilderBlock.id, 'showTimer', !selectedBuilderBlock.showTimer)}
                        type="button"
                      >
                        <span className="builder-core-object-switch-thumb" />
                      </button>
                    </div>
                    <div className={selectedCoreClock ? 'builder-core-object-row builder-core-object-row-active' : 'builder-core-object-row'}>
                      <span className="builder-core-object-label">Clock</span>
                      <button
                        aria-label={`Clock ${selectedCoreClock ? 'on' : 'off'}`}
                        aria-pressed={selectedCoreClock}
                        className={selectedCoreClock ? 'builder-core-object-switch builder-core-object-switch-active' : 'builder-core-object-switch'}
                        onClick={() => updateBlock(builderDay, selectedBuilderBlock.id, 'showClock', !selectedBuilderBlock.showClock)}
                        type="button"
                      >
                        <span className="builder-core-object-switch-thumb" />
                      </button>
                    </div>
                    </div>,
                    builderCoreObjectsCollapsed,
                    undefined,
                    `Show or hide core objects for ${selectedBuilderBlock.title}`,
                  )}
                </div>
                <div className="builder-section-join">
                  {renderBuilderSectionToggleRow({
                    collapsed: builderContentObjectsCollapsed,
                    label: 'Content objects',
                    onToggle: () => setBuilderContentObjectsCollapsed((current) => !current),
                  })}
                  {renderBuilderSectionBody(
                    <>
                <div className="builder-add-stack">
                  <div className="image-picker-row">
                    <button
                      className="builder-palette-card builder-palette-card-action"
                      onClick={() => importBlockImageFromUrl(builderDay, selectedBuilderBlock.id)}
                      type="button"
                    >
                      <span aria-hidden="true" className="builder-palette-card-icon">{renderBuilderPaletteIcon('image-url')}</span>
                      <span className="builder-palette-card-label">Picture URL</span>
                    </button>
                    <button
                      className="builder-palette-card builder-palette-card-action"
                      onClick={() => blockImageFileInputRef.current?.click()}
                      type="button"
                    >
                      <span aria-hidden="true" className="builder-palette-card-icon">{renderBuilderPaletteIcon('image-file')}</span>
                      <span className="builder-palette-card-label">Picture file</span>
                    </button>
                  </div>
                  <input
                    accept="image/*"
                    className="builder-hidden-file-input"
                    ref={blockImageFileInputRef}
                    type="file"
                    onChange={(event) => handleImageSelection(builderDay, selectedBuilderBlock.id, event.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="builder-palette builder-palette-compact">
                  <button
                    className="builder-palette-card"
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('text/stage-object-type', 'note-card')}
                    onClick={() => addStageObject(builderDay, selectedBuilderBlock.id, 'note-card', 24, 24)}
                    type="button"
                  >
                    <span aria-hidden="true" className="builder-palette-card-icon">{renderBuilderPaletteIcon('note-card')}</span>
                    <span className="builder-palette-card-label">Note card</span>
                  </button>
                  {(['text'] as StageObjectType[]).map((type) => (
                    <button
                      className="builder-palette-card"
                      draggable
                      key={type}
                      onDragStart={(event) => event.dataTransfer.setData('text/stage-object-type', type)}
                      onClick={() => addStageObject(builderDay, selectedBuilderBlock.id, type, 24, 24)}
                      type="button"
                    >
                      <span aria-hidden="true" className="builder-palette-card-icon">{renderBuilderPaletteIcon(type)}</span>
                      <span className="builder-palette-card-label">{getStageObjectDisplayName(type)}</span>
                    </button>
                  ))}
                </div>
                    </>,
                    builderContentObjectsCollapsed,
                  )}
                </div>
                <div className="builder-section-join">
                  {renderBuilderSectionToggleRow({
                    collapsed: builderWidgetsCollapsed,
                    label: 'Widgets',
                    onToggle: () => setBuilderWidgetsCollapsed((current) => !current),
                  })}
                  {renderBuilderSectionBody(
                    <div className="builder-palette builder-palette-compact">
                  {(['youtube', 'date', 'calendar', 'weather-live', 'checklist'] as StageObjectType[]).map((type) => (
                    <button
                      className="builder-palette-card"
                      draggable
                      key={type}
                      onDragStart={(event) => event.dataTransfer.setData('text/stage-object-type', type)}
                      onClick={() => addStageObject(builderDay, selectedBuilderBlock.id, type, 24, 24)}
                      type="button"
                    >
                      <span aria-hidden="true" className="builder-palette-card-icon">{renderBuilderPaletteIcon(type)}</span>
                      <span className="builder-palette-card-label">{getStageObjectDisplayName(type)}</span>
                    </button>
                  ))}
                    </div>,
                    builderWidgetsCollapsed,
                  )}
                </div>
                  </>
                ) : (
                  <p className="builder-helper-copy">Gap rows show a generated “what’s next” card with a countdown. Use Plan if you want to remove the gap by changing the surrounding blocks.</p>
                )}
              </>
            )}
            </div>
          </article>

          <section
            className="builder-main"
            onPointerDownCapture={(event) => {
              if (selectedStageElementId === null && selectedStageObjectId === null && editingStageObjectId === null) {
                return
              }

              const target = event.target as HTMLElement | null
              if (!target) {
                return
              }

              if (target.closest('.builder-layout-editor')) {
                return
              }

              setEditingStageObjectId(null)
              setBuilderTitleEditingBlockId(null)
              setSelectedStageObjectId(null)
              setSelectedStageElementId(null)
            }}
          >
            <article className="panel builder-topbar builder-topbar-hoverstrip">
              <div
                className="builder-block-strip"
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return
                  }

                  const strip = builderBlockStripRef.current
                  if (!strip) {
                    return
                  }

                  builderBlockStripDragRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startScrollLeft: strip.scrollLeft,
                    dragged: false,
                  }
                }}
                onPointerMove={(event) => {
                  const strip = builderBlockStripRef.current
                  const dragState = builderBlockStripDragRef.current
                  if (!strip || !dragState || dragState.pointerId !== event.pointerId) {
                    return
                  }

                  const deltaX = event.clientX - dragState.startX
                  if (Math.abs(deltaX) > 4) {
                    if (!dragState.dragged) {
                      strip.setPointerCapture(event.pointerId)
                    }
                    dragState.dragged = true
                  }

                  if (dragState.dragged) {
                    strip.scrollLeft = dragState.startScrollLeft - deltaX
                  }
                }}
                onPointerUp={(event) => {
                  const strip = builderBlockStripRef.current
                  const dragState = builderBlockStripDragRef.current
                  if (!strip || !dragState || dragState.pointerId !== event.pointerId) {
                    return
                  }

                  if (dragState.dragged) {
                    builderBlockStripSuppressClickRef.current = true
                    window.setTimeout(() => {
                      builderBlockStripSuppressClickRef.current = false
                    }, 0)
                  }

                  if (strip.hasPointerCapture(event.pointerId)) {
                    strip.releasePointerCapture(event.pointerId)
                  }
                  builderBlockStripDragRef.current = null
                }}
                onPointerCancel={() => {
                  const strip = builderBlockStripRef.current
                  const dragState = builderBlockStripDragRef.current
                  if (strip && dragState && strip.hasPointerCapture(dragState.pointerId)) {
                    strip.releasePointerCapture(dragState.pointerId)
                  }
                  builderBlockStripDragRef.current = null
                }}
                onWheel={(event) => {
                  const strip = builderBlockStripRef.current
                  if (!strip) {
                    return
                  }

                  event.preventDefault()
                  strip.scrollLeft += event.deltaY !== 0 ? event.deltaY : event.deltaX
                  refreshBuilderStripIndicator()
                }}
                onScroll={() => refreshBuilderStripIndicator()}
                ref={builderBlockStripRef}
                role="list"
                aria-label="Choose a block to edit"
              >
                {builderBlocks.map((block, index) => {
                  const previewSnapshot = builderBlockPreviewSnapshots[block.id] ?? createBlockThumbnailSnapshot(block, builderBlocks[index + 1] ?? null)
                  const isSelected = selectedBuilderBlockIds.includes(block.id)
                  const isPrimarySelected = block.id === selectedBuilderBlockId
                  return (
                    <button
                      key={block.id}
                      className={[
                        'builder-block-thumb',
                        'builder-block-thumb-compact',
                        block.rowType === 'gap' ? 'builder-block-thumb-gap' : '',
                        isSelected ? 'builder-block-thumb-selected' : '',
                        isPrimarySelected ? 'builder-block-thumb-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={(event) => {
                        if (builderBlockStripSuppressClickRef.current) {
                          event.preventDefault()
                          return
                        }
                        if (block.rowType === 'gap') {
                          openGapInPlan(builderDay, block.id)
                          return
                        }
                        handleBlockSelectionFromMouse(builderDay, block.id, {
                          ctrlKey: event.ctrlKey,
                          metaKey: event.metaKey,
                          shiftKey: event.shiftKey,
                        })
                      }}
                      type="button"
                    >
                      {renderBlockThumbnailSnapshot(previewSnapshot)}
                    </button>
                  )
                })}
              </div>
              <div
                aria-hidden="true"
                className={builderStripIndicator.visible ? 'builder-strip-indicator builder-strip-indicator-visible' : 'builder-strip-indicator'}
              >
                <span
                  className="builder-strip-indicator-thumb"
                  style={{
                    width: `${builderStripIndicator.width}px`,
                    transform: `translateX(${builderStripIndicator.left}px)`,
                  }}
                />
              </div>
            </article>
            {selectedBuilderBlock && (
              <article className="builder-layout-editor">
                <div className="builder-stage-shell" ref={builderStageShellRef}>
                  <div
                    className={builderStageFitMode === 'width' ? 'builder-stage-frame builder-stage-frame-fit-width' : 'builder-stage-frame builder-stage-frame-fit-height'}
                    ref={builderStageFrameRef}
                  >
                    <article
                      className={
                        selectedStageElementId === 'background' && selectedStageObjectId === null
                          ? `stage-card builder-stage-preview builder-stage-preview-selected ${selectedBuilderBlock.gentleBackground ? '' : 'stage-gentle '}stage-${selectedBuilderBlock.color}`
                          : `stage-card builder-stage-preview ${selectedBuilderBlock.gentleBackground ? '' : 'stage-gentle '}stage-${selectedBuilderBlock.color}`
                      }
                    >
                      <div className="stage-header builder-stage-header">
                        <div className="builder-stage-header-main">
                          {selectedBuilderBlock.showTitle && builderTitleEditingBlockId === selectedBuilderBlock.id ? (
                            <div
                              className={
                                selectedStageElementId === 'title' && selectedStageObjectId === null
                                  ? 'builder-stage-text-surface builder-stage-text-surface-plain builder-stage-header-text-surface builder-stage-header-text-surface-selected'
                                  : 'builder-stage-text-surface builder-stage-text-surface-plain builder-stage-header-text-surface'
                              }
                              style={{ borderRadius: getStageElementTextStyle(selectedBuilderBlock, 'title', 'builder').borderRadius as string }}
                            >
                              <input
                                aria-label="Block name"
                                className="builder-stage-title-input"
                                onBlur={() => setBuilderTitleEditingBlockId(null)}
                                onChange={(event) => updateBlock(builderDay, selectedBuilderBlock.id, 'title', event.target.value)}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setSelectedStageObjectId(null)
                                  setSelectedStageElementId('title')
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === 'Escape') {
                                    event.preventDefault()
                                    setBuilderTitleEditingBlockId(null)
                                  }
                                }}
                                onPointerDown={(event) => event.stopPropagation()}
                                ref={builderTitleInputRef}
                                style={getStageElementTextStyle(selectedBuilderBlock, 'title', 'builder')}
                                value={selectedBuilderBlock.title}
                              />
                            </div>
                          ) : selectedBuilderBlock.showTitle ? (
                            <div
                              className={
                                selectedStageElementId === 'title' && selectedStageObjectId === null
                                  ? 'builder-stage-text-surface builder-stage-text-surface-plain builder-stage-header-text-surface builder-stage-header-text-surface-selected'
                                  : 'builder-stage-text-surface builder-stage-text-surface-plain builder-stage-header-text-surface'
                              }
                              style={{ borderRadius: getStageElementTextStyle(selectedBuilderBlock, 'title', 'builder').borderRadius as string }}
                            >
                              <button
                                className="builder-stage-title-button"
                                onClick={() => {
                                  setSelectedStageObjectId(null)
                                  if (selectedStageElementId === 'title') {
                                    setBuilderTitleEditingBlockId(selectedBuilderBlock.id)
                                  } else {
                                    setSelectedStageElementId('title')
                                  }
                                }}
                                style={getStageElementTextStyle(selectedBuilderBlock, 'title', 'builder')}
                                type="button"
                              >
                                {selectedBuilderBlock.title}
                              </button>
                            </div>
                          ) : null}
                          {selectedBuilderBlock.showTimeRange && (
                            <div
                              className={
                                selectedStageElementId === 'timeRange' && selectedStageObjectId === null
                                  ? 'builder-stage-text-surface builder-stage-text-surface-plain builder-stage-header-text-surface builder-stage-header-text-surface-selected'
                                  : 'builder-stage-text-surface builder-stage-text-surface-plain builder-stage-header-text-surface'
                              }
                              style={{ borderRadius: getStageElementTextStyle(selectedBuilderBlock, 'timeRange', 'builder').borderRadius as string }}
                            >
                              <button
                                className="builder-stage-range-button"
                                onClick={() => {
                                  setSelectedStageObjectId(null)
                                  setSelectedStageElementId('timeRange')
                                }}
                                style={getStageElementTextStyle(selectedBuilderBlock, 'timeRange', 'builder')}
                                type="button"
                              >
                                {formatRange(selectedBuilderBlock.startTime, selectedBuilderBlock.endTime)}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div
                        className="stage-body builder-stage-canvas"
                        onClick={() => {
                          setEditingStageObjectId(null)
                          setSelectedStageObjectId(null)
                          setSelectedStageElementId('background')
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          void handleCanvasDrop(event, selectedBuilderBlock)
                        }}
                      >
                        {builderTransferMessage && (
                          <div className="builder-transfer-overlay">
                            <span>{builderTransferMessage}</span>
                          </div>
                        )}
                        {builderInteractionMessage && (
                          <div className="builder-interaction-overlay">
                            <span>{builderInteractionMessage}</span>
                          </div>
                        )}
                        {selectedBuilderBlock.rowType === 'gap' ? (
                          <div className="stage-gap-shell">{renderGapCard(selectedBuilderBlock, selectedBuilderNextBlock, 'builder')}</div>
                        ) : (
                          <>
                            {!selectedBuilderBlock.enabled && (
                              <div className="builder-disabled-notice builder-stage-disabled-notice" aria-hidden="true">
                                <strong>Hidden in Show</strong>
                                <span>This slide is still editable here.</span>
                              </div>
                            )}
                            {selectedStageElements.filter((element) => element.id !== 'activity').map((element) => {
                          const layout = selectedBuilderBlock.stageLayout[element.id]
                          return (
                            <div
                              key={`layout-${element.id}`}
                              role="button"
                              tabIndex={0}
                              className={
                                selectedStageElementId === element.id && !selectedStageObjectId
                                  ? `builder-stage-item builder-stage-item-selected ${element.className}`
                                  : `builder-stage-item ${element.className}`
                              }
                              onClick={(event) => {
                                event.stopPropagation()
                                setEditingStageObjectId(null)
                                setSelectedStageElementId(element.id)
                                setSelectedStageObjectId(null)
                              }}
                              onPointerDown={(event) => onBuilderStageElementPointerDown(event, selectedBuilderBlock, element.id)}
                              onPointerLeave={(event) => {
                                event.currentTarget.style.cursor = 'grab'
                              }}
                              onPointerMove={(event) => {
                                event.currentTarget.style.cursor = getObjectPointerCursor(event)
                              }}
                              style={{
                                left: `${element.id === 'activity' ? Math.max(0, 100 - layout.width) : layout.x}%`,
                                top: `${layout.y}%`,
                                width: `${layout.width}%`,
                                height: `${layout.height}%`,
                              }}
                            >
                              <span className="builder-stage-item-frame" />
                              <span className="builder-stage-item-content">{renderBuilderStageElement(selectedBuilderBlock, selectedBuilderNextBlock, element.id)}</span>
                            </div>
                          )
                            })}
                            {selectedBuilderStageObjects.map((object) => (
                          <div
                            key={object.id}
                            className={[
                              'builder-stage-object',
                              selectedStageObjectId === object.id ? 'builder-stage-object-selected' : '',
                              object.type === 'text' ? 'builder-stage-object-textlike' : '',
                              object.type === 'note-card' ? 'builder-stage-object-notecard' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={(event) => {
                              const target = event.target as HTMLElement | null
                              if (target?.closest('.builder-stage-object-text-editor')) {
                                return
                              }
                              event.stopPropagation()
                              if (object.type === 'text' || object.type === 'note-card') {
                                if (selectedStageObjectId === object.id && editingStageObjectId !== object.id) {
                                  setSelectedStageObjectId(object.id)
                                  setSelectedStageElementId('background')
                                  setEditingStageObjectId(object.id)
                                  return
                                }
                              }
                              setEditingStageObjectId(null)
                              setSelectedStageObjectId(object.id)
                              setSelectedStageElementId('background')
                            }}
                            onPointerDown={(event) => onBuilderStageObjectPointerDown(event, selectedBuilderBlock, object)}
                            onPointerLeave={(event) => {
                              event.currentTarget.style.cursor = 'grab'
                            }}
                            onPointerMove={(event) => {
                              event.currentTarget.style.cursor = getObjectPointerCursor(event, object.type)
                            }}
                            style={{
                              ...getRenderedStageObjectFrameStyle(object, object.zIndex + 10),
                            }}
                          >
                            <span className="builder-stage-item-frame" />
                            {isLinkedStageObject(object) && <span className="builder-stage-link-badge" aria-label={getStageObjectScopeLabel(object)}>Link</span>}
                            <span className="builder-stage-item-content">{renderBuilderStageObject(selectedBuilderBlock.id, object)}</span>
                          </div>
                            ))}
                          </>
                        )}
                      </div>
                    </article>
                  </div>
                </div>
              </article>
            )}
            {!selectedBuilderBlock && builderBlocks.length === 0 && (
              <article className="builder-layout-editor builder-layout-editor-empty">
                <div className="builder-stage-shell">
                  <div className="builder-stage-frame">
                    <div className="display-empty-state builder-empty-state">
                      <div className="display-empty-card builder-empty-card">
                        <span className="display-empty-kicker">No blocks yet</span>
                        <h3>{schedule[builderDay].label} is blank.</h3>
                        <p>Add blocks in Plan to start building this day.</p>
                        <div className="display-empty-actions">
                          <button className="secondary-button" onClick={() => setView('day-flow')} type="button">
                            Open Plan
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            )}
          </section>
          <aside className="panel builder-rightbar">
            <div className="builder-rail-scroll">
            {selectedStageElementId !== null ? (
              <div className="section-heading">
                <h2>{`Settings: ${builderSettingsTargetLabel}`}</h2>
                {builderSettingsHelperText ? <p className="builder-settings-helper">{builderSettingsHelperText}</p> : null}
              </div>
            ) : null}
            {selectedBuilderBlock && selectedStageObject ? (
              <div className="builder-object-inspector">
                {isLinkedStageObject(selectedStageObject) && (
                  <div className="builder-linked-badge-row">
                    <span className="builder-linked-badge">{getStageObjectScopeLabel(selectedStageObject)}</span>
                  </div>
                )}
                <div className="builder-section-join">
                  {renderBuilderSectionToggleRow({
                    collapsed: builderDisplayBehaviorCollapsed,
                    label: 'Display behavior',
                    onToggle: () => setBuilderDisplayBehaviorCollapsed((current) => !current),
                  })}
                  {renderBuilderSectionBody(
                    <>
                  <div className="toggle-group" role="group" aria-label={`Choose display behavior for ${getStageObjectDisplayName(selectedStageObject.type)}`}>
                    <button
                      className={!selectedStageObject.displayMovable ? 'toggle-chip toggle-chip-active' : 'toggle-chip'}
                      onClick={() => updateStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'displayMovable', false)}
                      onBlur={() => setBuilderSettingsHelperPreview(null)}
                      onFocus={() => setBuilderSettingsHelperPreview('Background items stay fixed on the display and do not move during presentation.')}
                      onMouseEnter={() => setBuilderSettingsHelperPreview('Background items stay fixed on the display and do not move during presentation.')}
                      onMouseLeave={() => setBuilderSettingsHelperPreview(null)}
                      type="button"
                    >
                      Background
                    </button>
                    <button
                      className={selectedStageObject.displayMovable ? 'toggle-chip toggle-chip-active' : 'toggle-chip'}
                      onClick={() => updateStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'displayMovable', true)}
                      onBlur={() => setBuilderSettingsHelperPreview(null)}
                      onFocus={() => setBuilderSettingsHelperPreview('Movable items can be repositioned live on the display if needed.')}
                      onMouseEnter={() => setBuilderSettingsHelperPreview('Movable items can be repositioned live on the display if needed.')}
                      onMouseLeave={() => setBuilderSettingsHelperPreview(null)}
                      type="button"
                    >
                      Movable
                    </button>
                  </div>
                  <p className="builder-helper-copy">Movable lets this object be repositioned on the display. Background keeps it fixed.</p>
                    </>,
                    builderDisplayBehaviorCollapsed,
                  )}
                </div>
                <div className="builder-section-join">
                  {renderBuilderSectionToggleRow({
                    collapsed: builderArrangeCollapsed,
                    label: 'Arrange',
                    onToggle: () => setBuilderArrangeCollapsed((current) => !current),
                  })}
                  {renderBuilderSectionBody(
                    <div className="builder-arrange-row">
                  <button
                    className="secondary-button"
                    onClick={() => arrangeStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'back')}
                    onBlur={() => setBuilderSettingsHelperPreview(null)}
                    onFocus={() => setBuilderSettingsHelperPreview('Move this item behind every other item on the slide.')}
                    onMouseEnter={() => setBuilderSettingsHelperPreview('Move this item behind every other item on the slide.')}
                    onMouseLeave={() => setBuilderSettingsHelperPreview(null)}
                    type="button"
                  >
                    Back
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => arrangeStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'backward')}
                    onBlur={() => setBuilderSettingsHelperPreview(null)}
                    onFocus={() => setBuilderSettingsHelperPreview('Move this item back by one layer.')}
                    onMouseEnter={() => setBuilderSettingsHelperPreview('Move this item back by one layer.')}
                    onMouseLeave={() => setBuilderSettingsHelperPreview(null)}
                    type="button"
                  >
                    Back 1
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => arrangeStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'forward')}
                    onBlur={() => setBuilderSettingsHelperPreview(null)}
                    onFocus={() => setBuilderSettingsHelperPreview('Move this item forward by one layer.')}
                    onMouseEnter={() => setBuilderSettingsHelperPreview('Move this item forward by one layer.')}
                    onMouseLeave={() => setBuilderSettingsHelperPreview(null)}
                    type="button"
                  >
                    Forward 1
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => arrangeStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'front')}
                    onBlur={() => setBuilderSettingsHelperPreview(null)}
                    onFocus={() => setBuilderSettingsHelperPreview('Move this item in front of every other item on the slide.')}
                    onMouseEnter={() => setBuilderSettingsHelperPreview('Move this item in front of every other item on the slide.')}
                    onMouseLeave={() => setBuilderSettingsHelperPreview(null)}
                    type="button"
                  >
                    Front
                  </button>
                    </div>,
                    builderArrangeCollapsed,
                  )}
                </div>
                <div className="builder-section-join">
                  {renderBuilderSectionToggleRow({
                    collapsed: builderActionsCollapsed,
                    label: 'Actions',
                    onToggle: () => setBuilderActionsCollapsed((current) => !current),
                  })}
                  {renderBuilderSectionBody(
                    isLinkedStageObject(selectedStageObject) ? (
                  <div className="builder-linked-actions">
                    <button
                      className="secondary-button"
                      onClick={() => unlinkStageObjectFromCurrentBlock(builderDay, selectedBuilderBlock.id, selectedStageObject.id)}
                      onBlur={() => setBuilderSettingsHelperPreview(null)}
                      onFocus={() => setBuilderSettingsHelperPreview('Keep this item on the current slide only and remove its link to other slides.')}
                      onMouseEnter={() => setBuilderSettingsHelperPreview('Keep this item on the current slide only and remove its link to other slides.')}
                      onMouseLeave={() => setBuilderSettingsHelperPreview(null)}
                      type="button"
                    >
                      Unlink this slide
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => removeStageObjectFromCurrentBlock(builderDay, selectedBuilderBlock.id, selectedStageObject.id)}
                      onBlur={() => setBuilderSettingsHelperPreview(null)}
                      onFocus={() => setBuilderSettingsHelperPreview('Remove this linked item from the current slide only.')}
                      onMouseEnter={() => setBuilderSettingsHelperPreview('Remove this linked item from the current slide only.')}
                      onMouseLeave={() => setBuilderSettingsHelperPreview(null)}
                      type="button"
                    >
                      Remove from this slide
                    </button>
                    <button
                      className="secondary-button icon-danger"
                      onClick={() => requestRemoveAllLinkedCopies(builderDay, selectedBuilderBlock.id, selectedStageObject.id)}
                      onBlur={() => setBuilderSettingsHelperPreview(null)}
                      onFocus={() => setBuilderSettingsHelperPreview('Remove this linked item from every slide that shares it.')}
                      onMouseEnter={() => setBuilderSettingsHelperPreview('Remove this linked item from every slide that shares it.')}
                      onMouseLeave={() => setBuilderSettingsHelperPreview(null)}
                      type="button"
                    >
                      Remove all linked copies
                    </button>
                  </div>
                ) : (
                  <button
                    className="secondary-button icon-danger"
                    onClick={() => removeStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id)}
                    onBlur={() => setBuilderSettingsHelperPreview(null)}
                    onFocus={() => setBuilderSettingsHelperPreview(`Remove this ${getStageObjectCategoryLabel(selectedStageObject.type).toLowerCase()} from the current slide.`)}
                    onMouseEnter={() => setBuilderSettingsHelperPreview(`Remove this ${getStageObjectCategoryLabel(selectedStageObject.type).toLowerCase()} from the current slide.`)}
                    onMouseLeave={() => setBuilderSettingsHelperPreview(null)}
                    type="button"
                  >
                    Remove this {getStageObjectCategoryLabel(selectedStageObject.type).toLowerCase()}
                  </button>
                    ),
                    builderActionsCollapsed,
                  )}
                </div>
                {selectedStageObject.type === 'date' && (
                  <>
                    <div className="builder-section-join">
                      {renderBuilderSectionToggleRow({
                        collapsed: builderObjectContentCollapsed,
                        label: 'Content',
                        onToggle: () => setBuilderObjectContentCollapsed((current) => !current),
                      })}
                      {renderBuilderSectionBody(
                        <div className="field">
                          <span>Layout</span>
                          {renderWidgetTemplateCards<string>(
                            selectedStageObject.widgetLayoutPreset || 'auto',
                            [
                              { id: 'auto', label: 'Auto', previewClass: 'builder-widget-template-date-auto' },
                              { id: 'row', label: 'Wide', previewClass: 'builder-widget-template-date-row' },
                              { id: 'stack', label: 'Stack', previewClass: 'builder-widget-template-date-stack' },
                            ],
                            (preset) => updateStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'widgetLayoutPreset', preset),
                          )}
                        </div>,
                        builderObjectContentCollapsed,
                      )}
                    </div>
                    <TextStyleControls
                      onChange={(field, value) => updateStageObjectTextStyle(builderDay, selectedBuilderBlock.id, selectedStageObject.id, field, value)}
                      style={selectedStageObject.textStyle}
                    />
                  </>
                )}
                {selectedStageObject.type === 'calendar' && (
                  <>
                    <div className="builder-section-join">
                      {renderBuilderSectionToggleRow({
                        collapsed: builderObjectContentCollapsed,
                        label: 'Content',
                        onToggle: () => setBuilderObjectContentCollapsed((current) => !current),
                      })}
                      {renderBuilderSectionBody(
                        <>
                          <label className="field">
                            <span>Timespan</span>
                            <select
                              value={parseCalendarWidgetData(selectedStageObject.widgetData).mode}
                              onChange={(event) => updateCalendarObjectMode(builderDay, selectedBuilderBlock.id, selectedStageObject.id, event.target.value as CalendarWidgetMode)}
                            >
                              <option value="month">Current month</option>
                              <option value="week">Current week</option>
                            </select>
                          </label>
                          <div className="field">
                            <span>Layout</span>
                            {renderWidgetTemplateCards<string>(
                              selectedStageObject.widgetLayoutPreset || 'auto',
                              [
                                { id: 'auto', label: 'Auto', previewClass: 'builder-widget-template-calendar-auto' },
                                { id: 'row', label: 'Wide', previewClass: 'builder-widget-template-calendar-row' },
                                { id: 'stack', label: 'Stack', previewClass: 'builder-widget-template-calendar-stack' },
                              ],
                              (preset) => updateStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'widgetLayoutPreset', preset),
                            )}
                          </div>
                        </>,
                        builderObjectContentCollapsed,
                      )}
                    </div>
                    <TextStyleControls
                      onChange={(field, value) => updateStageObjectTextStyle(builderDay, selectedBuilderBlock.id, selectedStageObject.id, field, value)}
                      style={selectedStageObject.textStyle}
                    />
                  </>
                )}
                {selectedStageObject.type === 'weather' && (
                  <>
                    <div className="builder-section-join">
                      {renderBuilderSectionToggleRow({
                        collapsed: builderObjectContentCollapsed,
                        label: 'Content',
                        onToggle: () => setBuilderObjectContentCollapsed((current) => !current),
                      })}
                      {renderBuilderSectionBody(
                        <>
                          <label className="field">
                            <span>Location</span>
                            <input
                              value={parseWeatherWidgetData(selectedStageObject.widgetData).location}
                              onChange={(event) =>
                                updateStageObject(
                                  builderDay,
                                  selectedBuilderBlock.id,
                                  selectedStageObject.id,
                                  'widgetData',
                                  JSON.stringify({ ...parseWeatherWidgetData(selectedStageObject.widgetData), location: event.target.value }),
                                )}
                            />
                          </label>
                          <label className="field">
                            <span>Condition</span>
                            <select
                              value={parseWeatherWidgetData(selectedStageObject.widgetData).condition}
                              onChange={(event) =>
                                updateStageObject(
                                  builderDay,
                                  selectedBuilderBlock.id,
                                  selectedStageObject.id,
                                  'widgetData',
                                  JSON.stringify({ ...parseWeatherWidgetData(selectedStageObject.widgetData), condition: event.target.value }),
                                )}
                            >
                              <option value="Sunny">Sunny</option>
                              <option value="Cloudy">Cloudy</option>
                              <option value="Rainy">Rainy</option>
                              <option value="Snowy">Snowy</option>
                              <option value="Windy">Windy</option>
                            </select>
                          </label>
                          <label className="field">
                            <span>Temperature</span>
                            <input
                              value={parseWeatherWidgetData(selectedStageObject.widgetData).temperature}
                              onChange={(event) =>
                                updateStageObject(
                                  builderDay,
                                  selectedBuilderBlock.id,
                                  selectedStageObject.id,
                                  'widgetData',
                                  JSON.stringify({ ...parseWeatherWidgetData(selectedStageObject.widgetData), temperature: event.target.value }),
                                )}
                            />
                          </label>
                          <label className="field">
                            <span>Detail</span>
                            <input
                              value={parseWeatherWidgetData(selectedStageObject.widgetData).detail}
                              onChange={(event) =>
                                updateStageObject(
                                  builderDay,
                                  selectedBuilderBlock.id,
                                  selectedStageObject.id,
                                  'widgetData',
                                  JSON.stringify({ ...parseWeatherWidgetData(selectedStageObject.widgetData), detail: event.target.value }),
                                )}
                            />
                          </label>
                          <div className="field">
                            <span>Layout</span>
                            {renderWidgetTemplateCards<string>(
                              selectedStageObject.widgetLayoutPreset || 'auto',
                              [
                                { id: 'auto', label: 'Auto', previewClass: 'builder-widget-template-weather-auto' },
                                { id: 'row', label: 'Wide', previewClass: 'builder-widget-template-weather-row' },
                                { id: 'stack', label: 'Stack', previewClass: 'builder-widget-template-weather-stack' },
                              ],
                              (preset) => updateStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'widgetLayoutPreset', preset),
                            )}
                          </div>
                        </>,
                        builderObjectContentCollapsed,
                      )}
                    </div>
                    <TextStyleControls
                      onChange={(field, value) => updateStageObjectTextStyle(builderDay, selectedBuilderBlock.id, selectedStageObject.id, field, value)}
                      style={selectedStageObject.textStyle}
                    />
                  </>
                )}
                {selectedStageObject.type === 'weather-live' && (
                  <>
                    <div className="builder-section-join">
                      {renderBuilderSectionToggleRow({
                        collapsed: builderObjectContentCollapsed,
                        label: 'Content',
                        onToggle: () => setBuilderObjectContentCollapsed((current) => !current),
                      })}
                      {renderBuilderSectionBody(
                        <>
                          <label className="field">
                            <span>Location</span>
                            <input
                              maxLength={64}
                              placeholder="ZIP or City, ST"
                              value={parseWeatherLiveWidgetData(selectedStageObject.widgetData).locationInput}
                              onChange={(event) =>
                                updateStageObject(
                                  builderDay,
                                  selectedBuilderBlock.id,
                                  selectedStageObject.id,
                                  'widgetData',
                                  JSON.stringify({
                                    ...parseWeatherLiveWidgetData(selectedStageObject.widgetData),
                                    locationInput: event.target.value.slice(0, 64),
                                  }),
                                )}
                            />
                          </label>
                          <label className="field">
                            <span>Forecast</span>
                            <select
                              value={parseWeatherLiveWidgetData(selectedStageObject.widgetData).forecastMode}
                              onChange={(event) =>
                                updateStageObject(
                                  builderDay,
                                  selectedBuilderBlock.id,
                                  selectedStageObject.id,
                                  'widgetData',
                                  JSON.stringify({
                                    ...parseWeatherLiveWidgetData(selectedStageObject.widgetData),
                                    forecastMode: event.target.value as WeatherLiveForecastMode,
                                  }),
                                )}
                            >
                              <option value="current">Current only</option>
                              <option value="today-tomorrow">Current + today/tomorrow</option>
                            </select>
                          </label>
                          <label className="field">
                            <span>Detail</span>
                            <select
                              value={parseWeatherLiveWidgetData(selectedStageObject.widgetData).detailLevel}
                              onChange={(event) =>
                                updateStageObject(
                                  builderDay,
                                  selectedBuilderBlock.id,
                                  selectedStageObject.id,
                                  'widgetData',
                                  JSON.stringify({
                                    ...parseWeatherLiveWidgetData(selectedStageObject.widgetData),
                                    detailLevel: event.target.value as WeatherLiveDetailLevel,
                                  }),
                                )}
                            >
                              <option value="simple">Simple</option>
                              <option value="standard">Standard</option>
                              <option value="detailed">Detailed</option>
                            </select>
                          </label>
                          <label className="field">
                            <span>Refresh</span>
                            <select
                              value={String(parseWeatherLiveWidgetData(selectedStageObject.widgetData).refreshMinutes)}
                              onChange={(event) =>
                                updateStageObject(
                                  builderDay,
                                  selectedBuilderBlock.id,
                                  selectedStageObject.id,
                                  'widgetData',
                                  JSON.stringify({
                                    ...parseWeatherLiveWidgetData(selectedStageObject.widgetData),
                                    refreshMinutes: Number(event.target.value),
                                  }),
                                )}
                            >
                              {weatherLiveRefreshOptions.map((minutes) => (
                                <option key={minutes} value={minutes}>
                                  {minutes === 60 ? 'Every hour' : minutes === 180 ? 'Every 3 hours' : `Every ${minutes} min`}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button className="secondary-button" onClick={() => void refreshWeatherLiveObject(selectedStageObject)} type="button">
                            Refresh now
                          </button>
                          <div className="field">
                            <span>Layout</span>
                            {renderWidgetTemplateCards<string>(
                              selectedStageObject.widgetLayoutPreset || 'auto',
                              [
                                { id: 'auto', label: 'Auto', previewClass: 'builder-widget-template-weather-auto' },
                                { id: 'row', label: 'Wide', previewClass: 'builder-widget-template-weather-row' },
                                { id: 'stack', label: 'Stack', previewClass: 'builder-widget-template-weather-stack' },
                              ],
                              (preset) => updateStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'widgetLayoutPreset', preset),
                            )}
                          </div>
                        </>,
                        builderObjectContentCollapsed,
                      )}
                    </div>
                    <TextStyleControls
                      onChange={(field, value) => updateStageObjectTextStyle(builderDay, selectedBuilderBlock.id, selectedStageObject.id, field, value)}
                      style={selectedStageObject.textStyle}
                    />
                  </>
                )}
                {selectedStageObject.type === 'checklist' && (
                  <>
                    <div className="builder-section-join">
                      {renderBuilderSectionToggleRow({
                        collapsed: builderObjectContentCollapsed,
                        label: 'Content',
                        onToggle: () => setBuilderObjectContentCollapsed((current) => !current),
                      })}
                      {renderBuilderSectionBody(
                        <label className="field">
                          <span>Checklist items</span>
                          <textarea
                            onChange={(event) => updateStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'widgetData', updateChecklistWidgetFromEditorText(event.target.value))}
                            value={checklistItemsToEditorText(parseChecklistWidgetData(selectedStageObject.widgetData))}
                          />
                        </label>,
                        builderObjectContentCollapsed,
                      )}
                    </div>
                    <TextStyleControls
                      onChange={(field, value) => updateStageObjectTextStyle(builderDay, selectedBuilderBlock.id, selectedStageObject.id, field, value)}
                      style={selectedStageObject.textStyle}
                    />
                  </>
                )}
                {selectedStageObject.type === 'youtube' && (
                  <div className="builder-section-join">
                    {renderBuilderSectionToggleRow({
                      collapsed: builderObjectContentCollapsed,
                      label: 'Content',
                      onToggle: () => setBuilderObjectContentCollapsed((current) => !current),
                    })}
                    {renderBuilderSectionBody(
                      <label className="field">
                        <span>YouTube link</span>
                        <input
                          value={selectedStageObject.src}
                          onChange={(event) => updateStageObject(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'src', event.target.value)}
                        />
                      </label>,
                      builderObjectContentCollapsed,
                    )}
                  </div>
                )}
                {selectedStageObject.type === 'image' && (
                  <div className="builder-section-join">
                    {renderBuilderSectionToggleRow({
                      collapsed: builderAppearanceCollapsed,
                      label: 'Appearance',
                      onToggle: () => setBuilderAppearanceCollapsed((current) => !current),
                    })}
                    {renderBuilderSectionBody(
                      <>
                        <ColorPickerField
                          allowTransparent={true}
                          label="Picture background"
                          onChange={(value) => updateStageObjectTextStyle(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'backgroundColor', value)}
                          value={getEffectiveImageStyle(selectedStageObject.textStyle).backgroundColor}
                        />
                        <label className="field">
                          <span>Fill padding</span>
                          {renderNumericStepper({
                            ariaLabel: 'Fill padding',
                            min: 0,
                            max: 32,
                            value: selectedStageObject.textStyle.padding,
                            onChange: (value) => updateStageObjectTextStyle(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'padding', value),
                          })}
                        </label>
                        <label className="field">
                          <span>Fill corners</span>
                          {renderNumericStepper({
                            ariaLabel: 'Fill corners',
                            min: 0,
                            max: 36,
                            value: selectedStageObject.textStyle.borderRadius,
                            onChange: (value) => updateStageObjectTextStyle(builderDay, selectedBuilderBlock.id, selectedStageObject.id, 'borderRadius', value),
                          })}
                        </label>
                      </>,
                      builderAppearanceCollapsed,
                    )}
                  </div>
                )}
                {selectedStageObject.type === 'youtube' && selectedStageObject.src && (() => {
                  const availability = getYouTubeAvailability(selectedStageObject.src)
                  return (
                    <div className={`builder-youtube-notice builder-youtube-notice-${availability.reason}`}>
                      <strong>
                        {availability.reason === 'fallback'
                          ? 'Will open on YouTube'
                          : availability.reason === 'ready'
                            ? 'Will play here'
                            : availability.reason === 'unknown'
                              ? 'We will try here first'
                            : 'Checking video'}
                      </strong>
                      <span>
                        {availability.reason === 'fallback'
                          ? availability.errorCode
                            ? `YouTube returned error ${availability.errorCode}. The display will show a clear button to open it on YouTube.`
                            : 'The display will show a clear button to open it on YouTube.'
                          : availability.reason === 'ready'
                            ? 'This video should play right on the schedule screen.'
                            : availability.reason === 'unknown'
                              ? 'We could not confirm this ahead of time. Check the display if you want to be sure.'
                            : 'Checking whether this video can play on the schedule screen.'}
                      </span>
                    </div>
                  )
                })()}
                {(selectedStageObject.type === 'text' || selectedStageObject.type === 'note-card') && (
                  <TextStyleControls
                    onChange={(field, value) => updateStageObjectTextStyle(builderDay, selectedBuilderBlock.id, selectedStageObject.id, field, value)}
                    style={selectedStageObject.textStyle}
                  />
                )}
              </div>
            ) : selectedBuilderBlock && selectedStageElementId === 'background' ? (
              <div className="builder-object-inspector">
                <div className="builder-section-join">
                  {renderBuilderSectionToggleRow({
                    collapsed: builderBackgroundCollapsed,
                    label: 'Color',
                    onToggle: () => setBuilderBackgroundCollapsed((current) => !current),
                  })}
                  {renderBuilderSectionBody(
                      <>
                        <div className={selectedBuilderBlock.gentleBackground ? 'builder-core-object-row builder-core-object-row-active' : 'builder-core-object-row'}>
                          <span className="builder-core-object-label">Color boost</span>
                          <button
                            aria-label={`Color boost ${selectedBuilderBlock.gentleBackground ? 'on' : 'off'}`}
                            aria-pressed={selectedBuilderBlock.gentleBackground}
                            className={selectedBuilderBlock.gentleBackground ? 'builder-core-object-switch builder-core-object-switch-active' : 'builder-core-object-switch'}
                            onClick={() => updateBlock(builderDay, selectedBuilderBlock.id, 'gentleBackground', !selectedBuilderBlock.gentleBackground)}
                            onBlur={() => setBuilderSettingsHelperPreview(null)}
                            onFocus={() => setBuilderSettingsHelperPreview(selectedBuilderBlock.gentleBackground ? 'Turn off color boost for gentle stage colors.' : 'Turn on color boost for stronger stage colors.')}
                            onMouseEnter={() => setBuilderSettingsHelperPreview(selectedBuilderBlock.gentleBackground ? 'Turn off color boost for gentle stage colors.' : 'Turn on color boost for stronger stage colors.')}
                            onMouseLeave={() => setBuilderSettingsHelperPreview(null)}
                            type="button"
                          >
                            <span className="builder-core-object-switch-thumb" />
                          </button>
                        </div>
                        <div className="field">
                        <div className="color-family-row" role="group" aria-label="Choose block color family">
                        {[
                          ['sunrise', 'Sunrise'],
                          ['sky', 'Sky'],
                          ['meadow', 'Meadow'],
                          ['berry', 'Berry'],
                          ['lavender', 'Lavender'],
                          ['peach', 'Peach'],
                          ['slate', 'Slate'],
                          ['white', 'White'],
                          ['transparent', 'Transparent'],
                        ].map(([value, label]) => (
                          <button
                            className={selectedBuilderBlock.color === value ? `toggle-chip color-family-chip color-family-chip-${value} toggle-chip-active` : `toggle-chip color-family-chip color-family-chip-${value}`}
                            key={value}
                            onClick={() => updateBlock(builderDay, selectedBuilderBlock.id, 'color', value)}
                            onBlur={() => setBuilderSettingsHelperPreview(null)}
                            onFocus={() => setBuilderSettingsHelperPreview(`Set the slide background to ${label}.`)}
                            onMouseEnter={() => setBuilderSettingsHelperPreview(`Set the slide background to ${label}.`)}
                            onMouseLeave={() => setBuilderSettingsHelperPreview(null)}
                            type="button"
                          >
                            {label}
                          </button>
                        ))}
                        </div>
                        </div>
                      </>,
                    builderBackgroundCollapsed,
                  )}
                </div>
              </div>
            ) : selectedBuilderBlock && selectedClockElementId ? (
              <div className="builder-object-inspector">
                <div className="builder-section-join">
                  {renderBuilderSectionToggleRow({
                    collapsed: builderClockCollapsed,
                    label: 'Style & layout',
                    onToggle: () => setBuilderClockCollapsed((current) => !current),
                  })}
                  {renderBuilderSectionBody(
                    <>
                      <label className="field">
                        <span>Clock style</span>
                        <select value={selectedBuilderBlock.clockMode} onChange={(event) => updateBlock(builderDay, selectedBuilderBlock.id, 'clockMode', event.target.value)}>
                          <option value="digital">Digital</option>
                          <option value="analog">Analog</option>
                          <option value="both">Show both</option>
                        </select>
                      </label>
                      <div className="field">
                        <span>Layout</span>
                        {renderWidgetTemplateCards<ClockLayoutPreset>(selectedBuilderBlock.clockLayoutPreset, [
                          { id: 'auto', label: 'Auto', previewClass: 'builder-widget-template-clock-auto' },
                          { id: 'row', label: 'Wide', previewClass: 'builder-widget-template-clock-row' },
                          { id: 'stack', label: 'Stack', previewClass: 'builder-widget-template-clock-stack' },
                        ], (preset) => updateBlock(builderDay, selectedBuilderBlock.id, 'clockLayoutPreset', preset))}
                      </div>
                    </>,
                    builderClockCollapsed,
                  )}
                </div>
                {renderStageElementTemplateSection(selectedClockElementId, selectedBuilderBlock)}
              </div>
            ) : selectedBuilderBlock && selectedTimerElementId ? (
              <div className="builder-object-inspector">
                <div className="builder-section-join">
                  {renderBuilderSectionToggleRow({
                    collapsed: builderTimerCollapsed,
                    label: 'Layout',
                    onToggle: () => setBuilderTimerCollapsed((current) => !current),
                  })}
                  {renderBuilderSectionBody(
                    <div className="field">
                      {renderWidgetTemplateCards<TimerLayoutPreset>(selectedBuilderBlock.timerLayoutPreset, [
                        { id: 'auto', label: 'Auto', previewClass: 'builder-widget-template-timer-auto' },
                        { id: 'row', label: 'Wide', previewClass: 'builder-widget-template-timer-row' },
                        { id: 'stack', label: 'Stack', previewClass: 'builder-widget-template-timer-stack' },
                        { id: 'compact', label: 'Compact', previewClass: 'builder-widget-template-timer-compact' },
                      ], (preset) => updateBlock(builderDay, selectedBuilderBlock.id, 'timerLayoutPreset', preset))}
                    </div>,
                    builderTimerCollapsed,
                  )}
                </div>
                {renderStageElementTemplateSection(selectedTimerElementId, selectedBuilderBlock)}
              </div>
            ) : selectedBuilderBlock && selectedTextElementId ? (
              <div className="builder-object-inspector">
                {selectedTemplateElementId ? renderStageElementTemplateSection(selectedTemplateElementId, selectedBuilderBlock) : null}
                <TextStyleControls
                  onChange={(field, value) => updateStageElementTextStyle(builderDay, selectedBuilderBlock.id, selectedTextElementId, field, value)}
                  style={selectedBuilderBlock.stageElementTextStyles[selectedTextElementId]}
                />
              </div>
            ) : selectedBuilderBlock && selectedTemplateElementId ? (
              <div className="builder-object-inspector">
                {renderStageElementTemplateSection(selectedTemplateElementId, selectedBuilderBlock)}
              </div>
            ) : (
              <div className="builder-empty-state">
                <p>Pick something on the screen to adjust it.</p>
              </div>
            )}
            </div>
          </aside>
        </section>
      )}

      {saveSetupPromptOpen && (
        <div className="builder-modal-backdrop" role="presentation">
          <div className="builder-modal" role="dialog" aria-modal="true" aria-label="Set up quick save">
            <h2>Set up Quick Save now</h2>
            <p>
              Changes are unsaved to file. Set up Quick Save once so future saves are one click and won’t interrupt your flow.
            </p>
            <div className="builder-modal-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  setSaveSetupPromptOpen(false)
                  setSaveSetupPromptDismissedDigest(scheduleDigest)
                }}
                type="button"
              >
                Not now
              </button>
              <button className="primary-button" onClick={() => void handleQuickSaveSetupNow()} type="button">
                Set up Quick Save
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingLinkedDelete && (
        <div className="builder-modal-backdrop" role="presentation">
          <div className="builder-modal" role="dialog" aria-modal="true" aria-label="Remove linked copies">
            <h2>Remove all linked copies?</h2>
            <p>This will remove this item from every linked slide.</p>
            <label className="field field-checkbox builder-modal-checkbox">
              <input
                checked={dontShowLinkedDeleteAgain}
                onChange={(event) => setDontShowLinkedDeleteAgain(event.target.checked)}
                type="checkbox"
              />
              <span>I understand. Don’t show this again.</span>
            </label>
            <div className="builder-modal-actions">
              <button className="secondary-button" onClick={() => setPendingLinkedDelete(null)} type="button">
                Cancel
              </button>
              <button className="secondary-button icon-danger" onClick={confirmRemoveAllLinkedCopies} type="button">
                Remove all linked copies
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  )
}

export default App

