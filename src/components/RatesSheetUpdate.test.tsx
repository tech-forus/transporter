import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import toast from 'react-hot-toast';
import RatesSheetUpdate from './RatesSheetUpdate';

const h = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../lib/readRateSheets', () => ({ readRateSheets: h.read }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const current = { priceRate: { docketCharges: { variable: 0, fixed: 50 } }, zoneRates: { N1: { N1: 12, W1: 18 }, W1: { N1: 18, W1: 12 } } };
const charge = { variable: 0, fixed: 0 };
const sheet = (zoneMatrix: number[][], docket = 0) => ({
  pricing: { minWeight: 0, docketCharges: docket, fuel: 0, rovCharges: charge, insuranceCharges: charge, odaCharges: charge, codCharges: charge, prepaidCharges: charge, topayCharges: charge, handlingCharges: { ...charge, thresholdWeight: 0 }, fmCharges: charge, appointmentCharges: charge, minCharges: 0, greenTax: 0, daccCharges: 0, miscellanousCharges: 0 },
  sourcedFields: [], hasPricingData: true, zoneLabels: ['N1', 'W1'], zoneMatrix, service: [], zoneCount: 2, totalPincodes: 0, companyName: '',
});
const pick = () => fireEvent.change(screen.getByLabelText(/upload new rate sheet/i), { target: { files: [new File(['x'], 'new-rates.xlsx')] } });

beforeEach(() => { h.read.mockReset(); vi.mocked(toast.error).mockReset(); vi.mocked(toast.success).mockReset(); });
afterEach(cleanup);

describe('RatesSheetUpdate: upload an updated sheet, preview the changes, apply (or discard)', () => {
  it('shows exactly the lanes and charges that change, and applies nothing until you say so', async () => {
    h.read.mockResolvedValue({ sheets: [sheet([[12, 20], [18, 12]], 60)], pincodePrices: [] });
    const onApply = vi.fn();
    render(<RatesSheetUpdate current={current} onApply={onApply} />);
    pick();
    await screen.findByText(/please check these changes/i);
    expect(screen.getByText('Rate from N1 to W1 (₹ per kg)')).toBeTruthy();
    expect(screen.getByText('Docket charges (₹)')).toBeTruthy();
    expect(screen.queryByText('Rate from N1 to N1 (₹ per kg)')).toBeNull(); // unchanged lanes are not listed
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /use these changes/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].zoneRates.N1.W1).toBe(20);
    expect(onApply.mock.calls[0][0].priceRate.docketCharges).toEqual({ variable: 0, fixed: 60 });
    expect(screen.queryByText(/please check these changes/i)).toBeNull();
  });

  it('Discard leaves everything as it was', async () => {
    h.read.mockResolvedValue({ sheets: [sheet([[12, 20], [18, 12]])], pincodePrices: [] });
    const onApply = vi.fn();
    render(<RatesSheetUpdate current={current} onApply={onApply} />);
    pick();
    await screen.findByText(/please check these changes/i);
    fireEvent.click(screen.getByRole('button', { name: /don't use/i }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByText(/please check these changes/i)).toBeNull();
  });

  it('tells you when the sheet changes nothing, and why a lane was left out', async () => {
    h.read.mockResolvedValue({ sheets: [{ ...sheet([[12, 18], [18, 12]]), zoneLabels: ['N1', 'W1', 'S1'], zoneMatrix: [[12, 18, 30], [18, 12, 30], [30, 30, 10]] }], pincodePrices: [] });
    render(<RatesSheetUpdate current={current} onApply={() => {}} />);
    pick();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(String(vi.mocked(toast).mock.calls[0][0])).toMatch(/same rates as now/i);
    expect(String(vi.mocked(toast).mock.calls[0][0])).toMatch(/S1/);
    expect(screen.queryByText(/please check these changes/i)).toBeNull();
  });

  it('while it reads, a pop-up tells the user in plain words what is happening and how long it can take, then goes away', async () => {
    let finish: (v: unknown) => void = () => {};
    h.read.mockReturnValue(new Promise((r) => { finish = r; }));
    render(<RatesSheetUpdate current={current} onApply={() => {}} />);
    pick();
    const box = await screen.findByRole('dialog', { name: /reading your sheet/i });
    expect(box.textContent).toMatch(/1 to 2 minutes/i);
    expect(box.textContent).toMatch(/keep this page open/i);
    expect(box.textContent).toMatch(/new-rates\.xlsx/);
    expect(box.textContent).toMatch(/check/i);
    expect(box.getAttribute('aria-busy')).toBe('true');
    finish({ sheets: [sheet([[12, 20], [18, 12]])], pincodePrices: [] });
    await screen.findByText(/please check these changes/i);
    expect(screen.queryByRole('dialog', { name: /reading your sheet/i })).toBeNull();
  });

  it('shows the reason when the file cannot be read', async () => {
    h.read.mockRejectedValue(new Error("We can't read .exe files."));
    render(<RatesSheetUpdate current={current} onApply={() => {}} />);
    pick();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We can't read .exe files."));
  });

  describe('a "delivery pincode + price" sheet', () => {
    const pp = { service: [{ pincode: 110001, zone: 'N1', isOda: false }, { pincode: 400001, zone: 'W1', isOda: true }, { pincode: 560001, zone: 'S1', isOda: false }], destinationPrices: { N1: 7.5, W1: 11.3, S1: 13 }, zones: ['N1', 'W1', 'S1'], originGuess: 'N1', mixedZones: [], skipped: 0 };

    it('shows the rate changes for the guessed origin zone, and the service area that comes with the sheet', async () => {
      h.read.mockResolvedValue({ sheets: [], pincodePrices: [pp] });
      render(<RatesSheetUpdate current={current} onApply={() => {}} />);
      pick();
      await screen.findByText(/please check these changes/i);
      expect(screen.getByText('Rate from N1 to W1 (₹ per kg)')).toBeTruthy();
      expect(screen.getByText('Rate from N1 to S1 (₹ per kg)')).toBeTruthy();
      expect(screen.getByText(/3 pincodes in 3 zones/i)).toBeTruthy();
      expect((screen.getByLabelText(/which zone do you send from/i) as HTMLSelectElement).value).toBe('N1');
    });

    it('changing the origin zone changes the preview, and "Use these changes" hands over the rates AND the service area', async () => {
      h.read.mockResolvedValue({ sheets: [], pincodePrices: [pp] });
      const onApply = vi.fn();
      render(<RatesSheetUpdate current={current} onApply={onApply} />);
      pick();
      await screen.findByText(/please check these changes/i);
      fireEvent.change(screen.getByLabelText(/which zone do you send from/i), { target: { value: 'W1' } });
      expect(screen.getByText('Rate from W1 to S1 (₹ per kg)')).toBeTruthy();
      expect(screen.queryByText('Rate from N1 to S1 (₹ per kg)')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /use these changes/i }));
      const next = onApply.mock.calls[0][0];
      expect(next.zoneRates.W1).toEqual({ N1: 7.5, W1: 11.3, S1: 13 });
      expect(next.service).toHaveLength(3);
    });

    it('a normal sheet (no pincodes) hands over no service area', async () => {
      h.read.mockResolvedValue({ sheets: [sheet([[12, 20], [18, 12]])], pincodePrices: [] });
      const onApply = vi.fn();
      render(<RatesSheetUpdate current={current} onApply={onApply} />);
      pick();
      await screen.findByText(/please check these changes/i);
      expect(screen.queryByLabelText(/which zone do you send from/i)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /use these changes/i }));
      expect(onApply.mock.calls[0][0].service).toBeUndefined();
    });
  });
});
