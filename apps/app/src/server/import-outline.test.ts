import { describe, expect, it } from 'vitest'

import { outlineProblem } from './import-outline'

const chapter = (...sections: Array<[number, number]>) => ({
  title: 'A chapter',
  sections: sections.map(([from, to]) => ({ from, to })),
})

describe('outlineProblem (FR-3.2, phase 12 audit)', () => {
  it('accepts what the review screen sends: ranges in order, gaps allowed', () => {
    expect(outlineProblem([chapter([0, 4], [5, 9]), chapter([12, 20])], 21)).toBeNull()
  })

  it('refuses every section claiming the whole manuscript', () => {
    expect(outlineProblem([chapter([0, 20], [0, 20])], 21)).toMatch(/same part/u)
  })

  it('refuses ranges out of order, backwards, or past the end of the file', () => {
    expect(outlineProblem([chapter([5, 9]), chapter([0, 4])], 21)).toMatch(/same part/u)
    expect(outlineProblem([chapter([9, 5])], 21)).toMatch(/ends before/u)
    expect(outlineProblem([chapter([0, 999_999_999])], 21)).toMatch(/past the end/u)
  })
})
