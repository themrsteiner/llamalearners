import { weekdayOrder, type ScheduleBlock, type WeekdayId } from './types'

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function formatClock(value: string): string {
  const [hourString, minuteString] = value.split(':')
  const hour = Number(hourString)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const normalizedHour = hour % 12 || 12
  return `${normalizedHour}:${minuteString} ${suffix}`
}

export function formatRange(startTime: string, endTime: string): string {
  return `${formatClock(startTime)} - ${formatClock(endTime)}`
}

export function minutesToTime(value: number): string {
  const clamped = Math.max(0, Math.min(Math.round(value), 23 * 60 + 59))
  const hours = Math.floor(clamped / 60)
  const minutes = clamped % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function getMinutesNow(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

export function getWeekdayFromDate(date: Date): WeekdayId {
  const jsDay = date.getDay()
  if (jsDay >= 1 && jsDay <= 5) {
    return weekdayOrder[jsDay - 1]
  }

  return 'monday'
}

export function getBlockProgress(block: ScheduleBlock, minutesNow: number): number {
  const start = timeToMinutes(block.startTime)
  const end = timeToMinutes(block.endTime)
  const total = Math.max(end - start, 1)
  const elapsed = Math.min(Math.max(minutesNow - start, 0), total)
  return elapsed / total
}

export function getActiveBlockIndices(blocks: ScheduleBlock[], minutesNow: number): number[] {
  return blocks.flatMap((block, index) => {
    const start = timeToMinutes(block.startTime)
    const end = timeToMinutes(block.endTime)
    return minutesNow >= start && minutesNow < end ? [index] : []
  })
}

export function getCurrentBlockIndex(blocks: ScheduleBlock[], minutesNow: number): number {
  const activeIndices = getActiveBlockIndices(blocks, minutesNow)

  if (activeIndices.length > 0) {
    return activeIndices[activeIndices.length - 1]
  }

  const allIndices = blocks.map((_, index) => index)

  if (allIndices.length === 0) {
    return -1
  }

  const firstIndex = allIndices[0]
  if (minutesNow < timeToMinutes(blocks[firstIndex].startTime)) {
    return firstIndex
  }

  const previousIndex = [...allIndices].reverse().find((index) => minutesNow >= timeToMinutes(blocks[index].endTime))
  if (previousIndex !== undefined) {
    return previousIndex
  }

  return allIndices[allIndices.length - 1]
}

export function getDayProgress(blocks: ScheduleBlock[], minutesNow: number): number {
  if (blocks.length === 0) {
    return 0
  }

  const first = timeToMinutes(blocks[0].startTime)
  const last = timeToMinutes(blocks[blocks.length - 1].endTime)
  const total = Math.max(last - first, 1)
  const elapsed = Math.min(Math.max(minutesNow - first, 0), total)
  return elapsed / total
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
