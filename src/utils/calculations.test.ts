import { describe, it, expect } from 'vitest';
import { calculateVolumetricWeight, formatCurrency } from './calculations';

describe('calculateVolumetricWeight', () => {
  it('uses the Road divisor (3500) for a Road shipment', () => {
    // 100x50x50 cm box, Road mode -> 250000 / 3500
    expect(calculateVolumetricWeight(100, 50, 50, 'Road')).toBeCloseTo(71.43, 1);
  });

  it('uses the Air divisor (5000), which is stricter than Road for the same box', () => {
    const air = calculateVolumetricWeight(100, 50, 50, 'Air');
    const road = calculateVolumetricWeight(100, 50, 50, 'Road');
    expect(air).toBeLessThan(road);
  });

  it('falls back to the Ship divisor (6000) for an unrecognized mode', () => {
    expect(calculateVolumetricWeight(100, 50, 50, 'Sea')).toBeCloseTo(250000 / 6000, 5);
  });
});

describe('formatCurrency', () => {
  it('formats a number as Indian Rupees', () => {
    expect(formatCurrency(1234.5)).toBe('₹1,234.50');
  });
});
