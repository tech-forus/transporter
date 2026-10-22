import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import ChargesEditor, { missingRequiredCharges } from './ChargesEditor';

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

  it('ODA per kg / per shipment / no', () => {
    const onChange = vi.fn();
    render(<ChargesEditor rate={{ ...base, odaCharges: { fixed: 0, variable: 0 } }} onChange={onChange} showErrors />);
    const select = within(rowOf('ODA Charges')).getByRole('combobox');
    fireEvent.change(select, { target: { value: 'per_kg' } });
    expect(onChange).toHaveBeenLastCalledWith('odaCharges', expect.objectContaining({ billingType: 'per_kg', mode: 'legacy', fixed: 0, variable: 0 }));
  });

  it('keeps a custom ODA setup untouched', () => {
    render(<ChargesEditor rate={{ ...base, odaCharges: { fixed: 100, variable: 2, mode: 'excess', thresholdWeight: 50 } }} onChange={vi.fn()} showErrors />);
    expect(screen.getByText(/Custom ODA setup/)).toBeTruthy();
    expect(within(rowOf('ODA Charges')).queryByRole('combobox')).toBeNull();
  });

  it('shows required errors', () => {
    render(<ChargesEditor rate={{}} onChange={vi.fn()} showErrors />);
    expect(screen.getByText('GST is required')).toBeTruthy();
    expect(screen.getByText('Handling is required')).toBeTruthy();
  });
});
