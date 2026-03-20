import { describe, it, expect } from 'vitest'

// Replicate bucketByMonth for unit testing since it's not exported
function bucketByMonth(daily) {
  const months = {}
  for (const [date, count] of Object.entries(daily)) {
    const monthKey = date.slice(0, 7)
    months[monthKey] = (months[monthKey] || 0) + count
  }
  return months
}

describe('GitLab bucketByMonth logic', () => {
  it('buckets daily contributions into months', () => {
    const daily = {
      '2026-01-05': 3,
      '2026-01-20': 7,
      '2026-02-10': 5
    }
    const result = bucketByMonth(daily)

    expect(result['2026-01']).toBe(10)
    expect(result['2026-02']).toBe(5)
  })

  it('handles empty input', () => {
    expect(bucketByMonth({})).toEqual({})
  })

  it('handles single day', () => {
    const result = bucketByMonth({ '2026-03-15': 42 })
    expect(result).toEqual({ '2026-03': 42 })
  })

  it('handles multiple days in same month', () => {
    const daily = {
      '2026-06-01': 1,
      '2026-06-15': 2,
      '2026-06-30': 3
    }
    const result = bucketByMonth(daily)
    expect(result['2026-06']).toBe(6)
  })
})
