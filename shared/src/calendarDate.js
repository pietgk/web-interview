const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** @param {number} year */
const isLeapYear = (year) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

/**
 * @param {number} year
 * @param {number} month
 */
const daysInMonth = (year, month) => {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  if ([4, 6, 9, 11].includes(month)) return 30
  return 31
}

/** @param {unknown} value */
export const isRealCalendarDate = (value) => {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  )
}
