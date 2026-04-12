export const weekdayOrder = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
] as const

export type WeekdayId = (typeof weekdayOrder)[number]

export type BlockLayout = 'standard' | 'focus' | 'rotation' | 'transition'
export type BlockMobility = 'movable' | 'locked'
export type BlockRowType = 'activity' | 'gap'
export type OpenTimeDisplayMode = 'default' | 'countdown' | 'blank' | 'previous-block' | 'next-block'
export type StageElementId = 'image' | 'note' | 'details' | 'rotations' | 'next' | 'clock' | 'timer' | 'activity'
export type StageObjectType = 'text' | 'note-card' | 'image' | 'youtube' | 'date' | 'calendar' | 'weather' | 'weather-live' | 'checklist'
export type StageObjectScope = 'block' | 'day' | 'all-days'
export type StageTextElementId = 'title' | 'timeRange' | 'note' | 'details' | 'rotations' | 'next' | 'activity'
export type StageTextAlign = 'left' | 'center' | 'right'
export type StageTextWeight = '400' | '600' | '700'
export type StageTextStyleMode = 'normal' | 'italic'
export type ClockDisplayMode = 'digital' | 'analog' | 'both'
export type ClockLayoutPreset = 'auto' | 'row' | 'stack'
export type TimerLayoutPreset = 'auto' | 'row' | 'stack' | 'compact'
export type ActivityDisplayMode = 'active' | 'upcoming' | 'both' | 'list'
export type ActivityStackMode = 'all' | 'primary'

export type BlockColor =
  | 'sunrise'
  | 'sky'
  | 'meadow'
  | 'berry'
  | 'lavender'
  | 'peach'
  | 'slate'
  | 'white'
  | 'transparent'

export interface ScheduleBlock {
  id: string
  title: string
  startTime: string
  endTime: string
  rowType: BlockRowType
  openTimeMode: OpenTimeDisplayMode
  enabled: boolean
  note: string
  imageSrc: string
  details: string[]
  rotationGroups: string[]
  color: BlockColor
  gentleBackground: boolean
  layout: BlockLayout
  mobility: BlockMobility
  stageLayout: Record<StageElementId, StageElementLayout>
  stageElementTextStyles: Record<StageTextElementId, StageTextStyle>
  stageObjects: StageObject[]
  showTitle: boolean
  showTimeRange: boolean
  showNote: boolean
  showTimer: boolean
  showNext: boolean
  showClock: boolean
  showActivity: boolean
  clockMode: ClockDisplayMode
  clockLayoutPreset: ClockLayoutPreset
  timerLayoutPreset: TimerLayoutPreset
  activityDisplayMode: ActivityDisplayMode
  activityStackMode: ActivityStackMode
  showActivityTitle: boolean
  showActivityTimeRange: boolean
  showActivityCountdown: boolean
  showActivityStartsIn: boolean
}

export interface DayActivity {
  id: string
  title: string
  startTime: string
  endTime: string
  color: BlockColor
  order: number
}

export interface StageElementLayout {
  x: number
  y: number
  width: number
  height: number
}

export interface StageObject {
  id: string
  type: StageObjectType
  scope: StageObjectScope
  syncKey: string
  displayMovable: boolean
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  locked: boolean
  text: string
  src: string
  widgetData: string
  widgetLayoutPreset: string
  textStyle: StageTextStyle
}

export interface StageTextStyle {
  fontSize: number
  fontWeight: StageTextWeight
  fontStyle: StageTextStyleMode
  textAlign: StageTextAlign
  underline: boolean
  strikethrough: boolean
  color: string
  backgroundColor: string
  padding: number
  borderRadius: number
  lineHeight: number
}

export interface StageElementDefaultState {
  layout: StageElementLayout
  textStyle?: StageTextStyle
}

export interface DaySchedule {
  id: WeekdayId
  label: string
  summary: string
  stageElementDefaults: Partial<Record<StageElementId, StageElementDefaultState>>
  activities: DayActivity[]
  blocks: ScheduleBlock[]
}

export type ScheduleState = Record<WeekdayId, DaySchedule>

export interface NavItem {
  id: 'home' | 'display' | 'builder' | 'day-flow'
  label: string
}

export const defaultStageTextStyle: StageTextStyle = {
  fontSize: 34,
  fontWeight: '600',
  fontStyle: 'normal',
  textAlign: 'left',
  underline: false,
  strikethrough: false,
  color: '#000000',
  backgroundColor: '#ffffff',
  padding: 16,
  borderRadius: 20,
  lineHeight: 1.2,
}

export function createDefaultStageElementTextStyles(): Record<StageTextElementId, StageTextStyle> {
  return {
    title: { ...defaultStageTextStyle, fontSize: 48, fontWeight: '700', backgroundColor: 'transparent', padding: 0, borderRadius: 0, lineHeight: 1.05 },
    timeRange: { ...defaultStageTextStyle, fontSize: 18, fontWeight: '600', backgroundColor: 'transparent', padding: 0, borderRadius: 0, lineHeight: 1.2 },
    note: { ...defaultStageTextStyle, fontSize: 42, fontWeight: '700', backgroundColor: 'transparent', padding: 0, borderRadius: 0 },
    details: { ...defaultStageTextStyle, fontSize: 20, fontWeight: '600', backgroundColor: 'rgba(255,255,255,0.72)', padding: 16, borderRadius: 18 },
    rotations: { ...defaultStageTextStyle, fontSize: 18, fontWeight: '700', backgroundColor: 'rgba(255,255,255,0.82)', padding: 14, borderRadius: 20, textAlign: 'center' },
    next: { ...defaultStageTextStyle, fontSize: 20, fontWeight: '600', backgroundColor: 'rgba(255,255,255,0.68)', padding: 14, borderRadius: 18 },
    activity: { ...defaultStageTextStyle, fontSize: 18, fontWeight: '700', backgroundColor: 'rgba(255,255,255,0.76)', padding: 14, borderRadius: 18, lineHeight: 1.15 },
  }
}
