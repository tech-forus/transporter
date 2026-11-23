import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import axios from 'axios';
import TrackPage from './TrackPage';

vi.mock('axios');
const get = vi.mocked(axios.get);
const writeText = vi.fn().mockResolvedValue(undefined);
const open = vi.fn();

const answer = (track: object, lines: object | Error = new Error('403')) => get.mockImplementation(((url: string) => {
  if (url.includes('/lines/track')) return Promise.resolve({ data: { success: true, ...track } });
  if (lines instanceof Error) return Promise.reject(lines);
  return Promise.resolve({ data: lines });
}) as never);

beforeEach(() => {
  get.mockReset(); writeText.mockClear(); open.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  vi.stubGlobal('open', open);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const go = (awb: string) => {
  fireEvent.change(screen.getByLabelText(/awb/i), { target: { value: awb } });
  fireEvent.click(screen.getByRole('button', { name: /^track$/i }));
};

describe('TrackPage', () => {
  it('deep link: opens the courier page with the number in it', async () => {
    answer({ mode: 'deep', url: 'https://t.example/DT123456', courier: 'DTDC' });
    render(<TrackPage />);
    go('DT123456');
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://t.example/DT123456', '_blank', 'noopener'));
  });

  it('home page: copies the AWB first, so it can be pasted into the courier\'s box', async () => {
    answer({ mode: 'home', url: 'https://www.delhivery.com', courier: 'Delhivery' });
    render(<TrackPage />);
    go('12345678901');
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('12345678901'));
    expect(open).toHaveBeenCalledWith('https://www.delhivery.com', '_blank', 'noopener');
    expect(screen.getByText(/copied/i)).toBeTruthy();
  });

  it('no link known: says whom to ask and opens nothing', async () => {
    answer({ mode: 'none', url: '', courier: 'Regional' });
    render(<TrackPage />);
    go('RG99887766');
    await waitFor(() => expect(screen.getByText(/no tracking link/i)).toBeTruthy());
    expect(open).not.toHaveBeenCalled();
  });

  it('an organisation owner picks the courier first', async () => {
    answer({ mode: 'deep', url: 'https://t.example/x', courier: 'DTDC' }, { lines: [{ _id: 'L1', courier: 'Delhivery' }, { _id: 'L2', courier: 'DTDC' }] });
    render(<TrackPage />);
    await waitFor(() => expect(screen.getByLabelText(/courier/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/courier/i), { target: { value: 'L2' } });
    go('DT123456');
    await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining('line=L2')));
  });
});
