import { createDefaultStageElementTextStyles, type BlockLayout, type DaySchedule, type ScheduleBlock, type ScheduleState } from './types'

export function createDefaultStageLayout(layout: BlockLayout): ScheduleBlock['stageLayout'] {
  const base: ScheduleBlock['stageLayout'] = {
    clock: { x: 76, y: 4, width: 18, height: 12 },
    timer: { x: 71, y: 84, width: 24, height: 10 },
    image: { x: 5, y: 6, width: 42, height: 36 },
    note: { x: 5, y: 46, width: 52, height: 22 },
    details: { x: 5, y: 70, width: 56, height: 18 },
    rotations: { x: 62, y: 18, width: 33, height: 52 },
    next: { x: 60, y: 76, width: 30, height: 12 },
    activity: { x: 58, y: 58, width: 34, height: 16 },
  }

  if (layout === 'rotation') {
    return {
      ...base,
      clock: { x: 74, y: 4, width: 20, height: 12 },
      timer: { x: 67, y: 86, width: 28, height: 8 },
      image: { x: 5, y: 6, width: 36, height: 28 },
      note: { x: 5, y: 37, width: 42, height: 16 },
      details: { x: 5, y: 56, width: 44, height: 16 },
      rotations: { x: 54, y: 10, width: 40, height: 60 },
      next: { x: 58, y: 74, width: 32, height: 10 },
      activity: { x: 56, y: 74, width: 36, height: 14 },
    }
  }

  if (layout === 'focus') {
    return {
      ...base,
      clock: { x: 72, y: 4, width: 22, height: 12 },
      timer: { x: 68, y: 86, width: 24, height: 8 },
      note: { x: 7, y: 36, width: 60, height: 26 },
      details: { x: 7, y: 66, width: 56, height: 16 },
      next: { x: 62, y: 80, width: 26, height: 10 },
      activity: { x: 57, y: 76, width: 33, height: 14 },
    }
  }

  return base
}

function blankDay(id: DaySchedule['id'], label: string): DaySchedule {
  const starterBlock: ScheduleBlock = {
    id: `${id}-starter`,
    title: 'Start Here',
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
    stageLayout: createDefaultStageLayout('standard'),
    stageElementTextStyles: createDefaultStageElementTextStyles(),
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

  return {
    id,
    label,
    summary: 'Starts with one 8:00 block you can edit or replace.',
    stageElementDefaults: {},
    activities: [],
    blocks: [starterBlock],
  }
}

export function createDefaultSchedule(): ScheduleState {
  // Site default state should be clean with only one simple starter block per day.
  return {
    monday: blankDay('monday', 'Monday'),
    tuesday: blankDay('tuesday', 'Tuesday'),
    wednesday: blankDay('wednesday', 'Wednesday'),
    thursday: blankDay('thursday', 'Thursday'),
    friday: blankDay('friday', 'Friday'),
  }
}
