export function formatDateWithOrdinal(dateStr) {
  const date = new Date(dateStr)
  if (isNaN(date)) return 'Invalid date'

  const day = date.getDate()
  const getOrdinal = n => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return s[(v - 20) % 10] || s[v] || s[0]
  }

  const month = date.toLocaleString('en-US', { month: 'long' })
  const year = date.getFullYear()

  return `${month} ${day}${getOrdinal(day)}, ${year}`
  // // Match parts: 2021-11-26 9:31 -0800
  // const match = dateStr.match(
  //   /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}) ([+-]\d{4})$/
  // )

  // if (!match) return 'Invalid date'

  // const [, year, month, day, hour, minute, tz] = match

  // // Reconstruct a valid ISO date: 2021-11-26T09:31:00-08:00
  // const tzFormatted = `${tz.slice(0, 3)}:${tz.slice(3)}`
  // const iso = `${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute}:00${tzFormatted}`

  // const date = new Date(iso)
  // if (isNaN(date)) return 'Invalid date'

  // const dayNum = date.getDate()
  // const getOrdinal = (n) => {
  //   const s = ['th', 'st', 'nd', 'rd']
  //   const v = n % 100
  //   return s[(v - 20) % 10] || s[v] || s[0]
  // }

  // const monthStr = date.toLocaleString('en-US', { month: 'long' })
  // const yearNum = date.getFullYear()

  // return `${monthStr} ${dayNum}${getOrdinal(dayNum)}, ${yearNum}`
}
