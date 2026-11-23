import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { useRateSetup, pathAfterProfile } from './useRateSetup';

vi.mock('axios');
const get = vi.mocked(axios.get);

const answer = (transporter: object, zoneRates: object = {}) => get.mockImplementation(((url: string) =>
  String(url).includes('/price/me/config') ? Promise.resolve({ data: { data: { zoneRates } } }) : Promise.resolve({ data: { transporter } })) as never);

beforeEach(() => get.mockReset());

describe('useRateSetup', () => {
  it('a Google transporter with no rates is sent to set them up', async () => {
    answer({ googleId: 'g1', orgType: 'transporter' });
    const { result } = renderHook(() => useRateSetup());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.needsSetup).toBe(true);
    expect(result.current.isAggregator).toBe(false);
  });

  it('an aggregator is NOT asked for rates of its own: its couriers have them', async () => {
    answer({ googleId: 'g1', orgType: 'aggregator' });
    const { result } = renderHook(() => useRateSetup());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.isAggregator).toBe(true);
    expect(result.current.needsSetup).toBe(false);
  });

  it('a courier line (it has a parent) is not an aggregator either', async () => {
    answer({ googleId: 'g1', orgType: 'transporter', parentId: 'org1' });
    const { result } = renderHook(() => useRateSetup());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.isAggregator).toBe(false);
  });
});

describe('where the Google profile step sends you next', () => {
  it('a business transporter goes to its rates, an owner-operator to its lanes, an aggregator to its courier lines', () => {
    expect(pathAfterProfile('business', 'transporter')).toBe('/addprice');
    expect(pathAfterProfile('individual', 'transporter')).toBe('/setup/lanes');
    expect(pathAfterProfile('business', 'aggregator')).toBe('/lines');
    expect(pathAfterProfile('individual', 'aggregator')).toBe('/setup/lanes'); // an owner-operator is never an aggregator
  });
});
