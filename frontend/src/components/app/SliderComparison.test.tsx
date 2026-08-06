import { describe, expect, it } from 'vitest'
import { calculateContainedFrameSize } from './SliderComparison'

describe('SliderComparison', () => {
  it('keeps the slider frame inside the contained image bounds', () => {
    expect(
      calculateContainedFrameSize(
        { width: 1600, height: 1200 },
        { width: 1000, height: 400 },
      ),
    ).toEqual({ width: 533, height: 400 })
  })
})
