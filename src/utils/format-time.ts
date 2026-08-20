import { i18n } from '@/i18n'

/**
 * Format an epoch timestamp as a localized relative time string (e.g. "5m ago" / "5分钟前").
 * @param timestamp - epoch timestamp; milliseconds by default, pass unit 's' for unix seconds
 */
export function formatTime(timestamp: number, unit: 'ms' | 's' = 'ms'): string {
  if (!timestamp) return ''
  const t = i18n.global.t
  const diff = Date.now() - (unit === 's' ? timestamp * 1000 : timestamp)
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t('common.justNow')
  if (minutes < 60) return t('common.minutesAgo', { minutes })
  if (hours < 24) return t('common.hoursAgo', { hours })
  return t('common.daysAgo', { days })
}
