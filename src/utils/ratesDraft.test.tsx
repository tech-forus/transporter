import { describe, it, expect, beforeEach } from 'vitest';
import { clearRatesDraft, hasRatesDraft, loadRatesDraft, ratesDraftKey, saveRatesDraft } from './ratesDraft';
import { timeLeft } from '../components/lines/ManagingBanner';
import { missingFor } from '../components/lines/LinesTable';
import { render, screen, cleanup } from '@testing-library/react';
import SetupChecklist from '../components/lines/SetupChecklist';

beforeEach(() => localStorage.clear());

describe('rates draft', () => {
  it('keeps unsaved rates per account and editor, and clears them once saved', () => {
    const k = ratesDraftKey('line1');
    expect(loadRatesDraft(k)).toBeNull();
    saveRatesDraft(k, { priceRate: { gstPct: 18 }, zoneRates: { N1: { N2: 8.6 } }, service: [{ pincode: 110001, zone: 'N1', isOda: false }] });
    expect(hasRatesDraft('line1')).toBe(true);
    expect(loadRatesDraft(k)?.zoneRates?.N1.N2).toBe(8.6);
    expect(loadRatesDraft(ratesDraftKey('line1', 'link9'))).toBeNull();
    expect(loadRatesDraft(ratesDraftKey('line2'))).toBeNull();
    clearRatesDraft(k);
    expect(hasRatesDraft('line1')).toBe(false);
  });
  it('ignores a corrupt draft', () => {
    localStorage.setItem(ratesDraftKey('x'), '{nope');
    expect(loadRatesDraft(ratesDraftKey('x'))).toBeNull();
  });
});

describe('Manage rates countdown and live status', () => {
  it('says how long is left', () => {
    expect(timeLeft(0)).toBe('ended');
    expect(timeLeft(90 * 60000)).toBe('1 h 30 min');
    expect(timeLeft(5 * 60000)).toBe('5 min');
  });
  it('a courier is live only with pincodes and rates', () => {
    const l: any = { coverage: { pincodes: 0, zones: [] }, ratesStatus: 'none' };
    expect(missingFor(l)).toEqual(['pincodes', 'rates']);
    expect(missingFor({ ...l, coverage: { pincodes: 5, zones: ['N1'] } })).toEqual(['rates']);
    expect(missingFor({ ...l, coverage: { pincodes: 5, zones: ['N1'] }, ratesStatus: 'stale' })).toEqual([]);
  });
});

describe('setup checklist of a new courier', () => {
  const line: any = { _id: 'l1', companyName: 'Delhivery (Shipshopy)', coverage: { pincodes: 0, zones: [] }, ratesStatus: 'none', trackingLink: '', team: [] };
  it('lists the steps with what is missing and offers Manage rates', () => {
    render(<SetupChecklist line={line} onManageRates={() => undefined} />);
    expect(screen.getByText(/0 of 2 required steps done/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Manage rates' })).toBeTruthy();
    expect(screen.getByText(/will not see this courier until the required steps are done/)).toBeTruthy();
    cleanup();
  });
  it('disappears once the required steps are done (the row badge and cells say the rest)', () => {
    const { container } = render(<SetupChecklist line={{ ...line, coverage: { pincodes: 5, zones: ['N1'] }, ratesStatus: 'ok' }} onManageRates={() => undefined} />);
    expect(container.innerHTML).toBe('');
  });
});