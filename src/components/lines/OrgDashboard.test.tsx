import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import axios from 'axios';
import OrgDashboard from './OrgDashboard';

vi.mock('axios');
const get = vi.mocked(axios.get);
const H = 3600 * 1000;
const data = {
  success: true,
  counts: { pendingAccept: 2, awaitingLr: 1, inTransit: 4, awaitingPod: 1, done: 7, closed: 0 },
  stuck: [{ bookingId: 'b1', bookingCode: 'BK-ABC', line: 'Delhivery (Shipshopy)', stage: 'awaitingLr', sinceMs: 30 * H, operator: 'Deepak' }],
  byLine: [{ lineId: 'L1', courier: 'Delhivery', counts: {} }, { lineId: 'L2', courier: 'Blue Dart', counts: {} }],
  byPerson: [{ phone: '919811111111', name: 'Deepak', counts: {} }],
};
beforeEach(() => { get.mockReset(); get.mockResolvedValue({ data }); });
afterEach(cleanup);

describe('OrgDashboard', () => {
  it('shows a tile per stage with its count', async () => {
    render(<OrgDashboard />);
    await waitFor(() => expect(screen.getByText('Waiting to accept')).toBeTruthy());
    const tile = (label: string) => screen.getByText(label).closest('[data-tile]') as HTMLElement;
    expect(tile('Waiting to accept').textContent).toContain('2');
    expect(tile('In transit').textContent).toContain('4');
    expect(tile('Waiting for POD').textContent).toContain('1');
    expect(tile('Done').textContent).toContain('7');
  });

  it('lists what is stuck with how long and who has it', async () => {
    render(<OrgDashboard />);
    await waitFor(() => expect(screen.getByText('BK-ABC')).toBeTruthy());
    const row = screen.getByText('BK-ABC').closest('li') as HTMLElement;
    expect(row.textContent).toContain('Delhivery (Shipshopy)');
    expect(row.textContent).toContain('Waiting for AWB');
    expect(row.textContent).toContain('30 h');
    expect(row.textContent).toContain('Deepak');
  });

  it('filters by courier: asks the server again with ?line=', async () => {
    render(<OrgDashboard />);
    await waitFor(() => expect(screen.getByLabelText(/courier/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/courier/i), { target: { value: 'L2' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith(expect.stringContaining('line=L2')));
  });

  it('says so when nothing is stuck', async () => {
    get.mockResolvedValue({ data: { ...data, stuck: [] } });
    render(<OrgDashboard />);
    await waitFor(() => expect(screen.getByText(/nothing is stuck/i)).toBeTruthy());
  });
});
