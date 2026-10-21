/** 0 means return every source received; native tool-web requires a positive integer. */
export function nativeSearchLimit(value = 0) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000) throw new TypeError('Search source limit must be an integer between 0 and 1000')
  return value === 0 ? Number.MAX_SAFE_INTEGER : value
}
