import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import React from 'react';
import ChargesEditor, { missingRequiredCharges } from './ChargesEditor';
import { readOda, writeOda, type OdaState } from './OdaPicker';

const off: OdaState = { enabled: false, type: 'per_kg', custom: false, rate: 0, amount: 0, minimum: 0, base: 0, limit: 0, extra: 0, matrix: [] };

const base = { docketCharges: 50, fuel: { variable: 10, fixed: 0 }, gstPct: { variable: 18, fixed: 0 }, handlingCharges: { fixed: 20, variable: 0, threshholdweight: 0 } };
const rowOf = (label: string) => screen.getByText(label, { selector: 'span' }).closest('tr')!;

describe('ChargesEditor', () => {
  afterEach(cleanup);

  it('lists the required charges that are still empty', () => {
    expect(missingRequiredCharges(base)).toEqual([]);
    expect(missingRequiredCharges({})).toEqual(['docketCharges', 'fuel', 'gstPct', 'handlingCharges']);
    expect(missingRequiredCharges({ ...base, gstPct: undefined, gst: 5 })).toEqual([]);
  });

  it('saves ₹/KG as perKg and clears the other columns', () => {
    const onChange = vi.fn();
    render(<ChargesEditor rate={{ ...base, rovCharges: { fixed: 100, variable: 0 } }} onChange={onChange} showErrors />);
    fireEvent.change(within(rowOf('ROV / FOV')).getByRole('combobox'), { target: { value: 'kg' } });
    expect(onChange).toHaveBeenLastCalledWith('rovCharges', { fixed: 0, variable: 0, perKg: 0 });
  });

  it('per-kg handling uses the engine per_kg_minimum mode', () => {
    const onChange = vi.fn();
    render(<ChargesEditor rate={{ ...base, handlingCharges: { type: 'per_kg_minimum', perKg: 1, fixed: 0, variable: 0 } }} onChange={onChange} showErrors />);
    fireEvent.change(within(rowOf('Handling')).getByRole('spinbutton'), { target: { value: '2.5' } });
    expect(onChange).toHaveBeenLastCalledWith('handlingCharges', expect.objectContaining({ type: 'per_kg_minimum', perKg: 2.5, fixed: 0, variable: 0, minimum: 0 }));
  });

  it('Variable saves a % of freight', () => {
    const onChange = vi.fn();
    render(<ChargesEditor rate={{ ...base, codCharges: { fixed: 0, variable: 2 } }} onChange={onChange} showErrors />);
    fireEvent.click(screen.getByText('Optional Charges'));
    fireEvent.change(within(rowOf('COD / DOD')).getByRole('spinbutton'), { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith('codCharges', { fixed: 0, variable: 3, perKg: 0 });
  });

  it('Fixed → Variable and ₹ → ₹/KG stay switched before a value is typed', () => {
    const Harness = () => {
      const [rate, setRate] = React.useState<Record<string, any>>({ ...base, hamaliCharges: { fixed: 0, variable: 0 } });
      return <ChargesEditor rate={rate} onChange={(k, v) => setRate((r) => ({ ...r, [k]: v }))} showErrors />;
    };
    render(<Harness />);
    fireEvent.click(within(rowOf('Hamali')).getByText('Variable'));
    expect(within(rowOf('Hamali')).getByText('%')).toBeTruthy();
    fireEvent.change(within(rowOf('Hamali')).getByRole('spinbutton'), { target: { value: '4' } });
    expect((within(rowOf('Hamali')).getByRole('spinbutton') as HTMLInputElement).value).toBe('4');
    fireEvent.click(within(rowOf('Hamali')).getByText('Fixed'));
    fireEvent.change(within(rowOf('Hamali')).getByRole('combobox'), { target: { value: 'kg' } });
    expect((within(rowOf('Hamali')).getByRole('combobox') as HTMLSelectElement).value).toBe('kg');
  });

  it("ODA: every Add Vendor type saves Add Vendor's shape", () => {
    const cases: [OdaState, Record<string, unknown>][] = [
      [{ ...off, enabled: true, type: 'per_kg', rate: 3 }, { billingType: 'per_kg', perKg: 3, variable: 3, fixed: 0 }],
      [{ ...off, enabled: true, type: 'per_shipment', amount: 250 }, { billingType: 'per_shipment', fixed: 250 }],
      [{ ...off, enabled: true, type: 'per_kg_minimum', rate: 2, minimum: 500 }, { type: 'per_kg_minimum', perKg: 2, minimum: 500 }],
      [{ ...off, enabled: true, type: 'per_kg_excess', base: 500, limit: 60, extra: 2 }, { billingType: 'per_kg_excess', fixedAmount: 500, thresholdWeight: 60, variableRange: 2 }],
      [{ ...off, enabled: true, type: 'negotiable' }, { billingType: 'negotiable' }],
    ];
    for (const [state, expected] of cases) {
      const { odaCharges } = writeOda(state);
      expect(odaCharges).toMatchObject(expected);
      expect(readOda(odaCharges, undefined)).toMatchObject({ enabled: true, type: state.type });
    }
    const matrix = [{ minDist: 0, maxDist: null, bands: [{ minKg: 0, maxKg: null, charge: 300 }] }];
    const w = writeOda({ ...off, enabled: true, type: 'matrix', matrix });
    expect(w.odaMatrix).toEqual({ type: 'distance_weight_matrix', matrix });
    expect(readOda(w.odaCharges, w.odaMatrix)).toMatchObject({ type: 'matrix', matrix });
    expect(readOda(writeOda(off).odaCharges, writeOda(off).odaMatrix).enabled).toBe(false);
  });

  it('ODA: older saved shapes read as what the engine bills; anything else stays custom', () => {
    expect(readOda({ fixed: 120, variable: 0, billingType: 'per_kg', mode: 'legacy' }, undefined)).toMatchObject({ type: 'per_shipment', amount: 120 });
    expect(readOda({ fixed: 0, variable: 4, billingType: 'per_kg', mode: 'legacy' }, undefined)).toMatchObject({ type: 'per_kg', rate: 4 });
    expect(readOda({ fixed: 100, variable: 2, mode: 'excess', thresholdWeight: 50 }, undefined).custom).toBe(true);
  });

  it("ODA picker opens Add Vendor's options when switched to Yes", () => {
    render(<ChargesEditor rate={{ ...base, odaCharges: { fixed: 0, variable: 0 } }} onChange={vi.fn()} showErrors />);
    fireEvent.change(screen.getByLabelText('ODA charged'), { target: { value: 'yes' } });
    for (const label of ['Per KG', 'Flat Fee', 'Per KG, with a Floor (+Min)', 'Base + Extra Beyond Limit (+Extra)', 'Weight / Distance Slabs (Matrix)', 'Negotiable']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('shows required errors', () => {
    render(<ChargesEditor rate={{}} onChange={vi.fn()} showErrors />);
    expect(screen.getByText('GST is required')).toBeTruthy();
    expect(screen.getByText('Handling is required')).toBeTruthy();
  });
});
