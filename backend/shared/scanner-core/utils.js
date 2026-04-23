export function toNseTicker(symbol) {
  const value = String(symbol || '').trim().toUpperCase()
  if (!value) return ''
  return value.includes('.') ? value : `${value}.NS`
}

export function toFyersTicker(symbol) {
  const value = String(symbol || '').trim().toUpperCase()
  if (!value) return ''
  if (value.startsWith('NSE:')) return value
  const bare = value.replace('.NS', '')
  return `NSE:${bare}-EQ`
}

export function fromFyersTicker(symbol) {
  const value = String(symbol || '').trim().toUpperCase()
  if (!value) return ''
  return value.replace(/^NSE:/, '').replace(/-EQ$/, '')
}

export function pct(now, then) {
  if (then === 0 || now === null || now === undefined || then === null || then === undefined) {
    return null
  }
  return ((now / then) - 1) * 100
}

export function mean(values) {
  const valid = values.filter((value) => Number.isFinite(value))
  if (!valid.length) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function rollingMean(values, window, index) {
  if (index + 1 < window) return null
  let sum = 0
  for (let i = index - window + 1; i <= index; i += 1) {
    const value = values[i]
    if (!Number.isFinite(value)) return null
    sum += value
  }
  return sum / window
}

export function linearSlope(values) {
  const valid = values.filter((value) => Number.isFinite(value))
  if (valid.length !== values.length || values.length < 2 || values[0] === 0) return null
  const n = values.length
  const xMean = (n - 1) / 2
  const yMean = valid.reduce((sum, value) => sum + value, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i += 1) {
    num += (i - xMean) * (values[i] - yMean)
    den += (i - xMean) ** 2
  }
  if (den === 0) return null
  return num / den
}

export function minMaxNormalize(value, min, max) {
  if (!Number.isFinite(value)) return null
  if (max <= min) return 1
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

export function safeNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}