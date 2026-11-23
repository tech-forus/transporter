import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import axios from 'axios';
import toast from 'react-hot-toast';
import BookingActions from './BookingActions';

vi.mock('axios');
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
const post = vi.mocked(axios.post);
const patch = vi.mocked(axios.patch);

const base = { _id: 'b1', transporterAckStatus: 'confirmed' as const };
beforeEach(() => { post.mockReset(); patch.mockReset(); vi.mocked(toast.error).mockReset(); post.mockResolvedValue({ data: { success: true } }); patch.mockResolvedValue({ data: { success: true } }); });
afterEach(cleanup);

describe('BookingActions', () => {
  it('an accepted booking with no AWB: type it, save, and the list refreshes', async () => {
    const onChanged = vi.fn();
    render(<BookingActions booking={base} onChanged={onChanged} />);
    fireEvent.change(screen.getByLabelText(/LR \/ AWB/i), { target: { value: 'dl12345678' } });
    fireEvent.click(screen.getByRole('button', { name: /save awb/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.stringContaining('/api/bookings/b1/portal/lr'), { lr: 'dl12345678' }));
    expect(onChanged).toHaveBeenCalled();
  });

  it('once an AWB is saved the button corrects it (PATCH) and "Mark delivered" appears', async () => {
    render(<BookingActions booking={{ ...base, shipmentStatus: 'picked_up', lrNumber: 'DL12345678' }} onChanged={() => {}} />);
    expect((screen.getByLabelText(/LR \/ AWB/i) as HTMLInputElement).value).toBe('DL12345678');
    fireEvent.change(screen.getByLabelText(/LR \/ AWB/i), { target: { value: 'DL99999999' } });
    fireEvent.click(screen.getByRole('button', { name: /correct awb/i }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(expect.stringContaining('/portal/lr'), { lr: 'DL99999999' }));
    fireEvent.click(screen.getByRole('button', { name: /mark delivered/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.stringContaining('/portal/delivered')));
  });

  it('delivered without a POD asks for the POD; with a POD there is nothing to do', () => {
    const { rerender, container } = render(<BookingActions booking={{ ...base, shipmentStatus: 'delivered', lrNumber: 'DL1' }} onChanged={() => {}} />);
    expect(screen.getByText(/upload pod/i)).toBeTruthy();
    rerender(<BookingActions booking={{ ...base, shipmentStatus: 'delivered', lrNumber: 'DL1', podAt: '2026-11-21' }} onChanged={() => {}} />);
    expect(container.textContent).not.toMatch(/save awb|mark delivered/i);
  });

  it('shows nothing to a view-only courier login, a pending, declined or cancelled booking', () => {
    const cases = [
      { booking: base, readOnly: true },
      { booking: { ...base, transporterAckStatus: 'pending' as const } },
      { booking: { ...base, transporterAckStatus: 'declined' as const } },
      { booking: { ...base, shipmentStatus: 'cancelled' as const } },
    ];
    for (const c of cases) {
      const { container, unmount } = render(<BookingActions onChanged={() => {}} {...c} />);
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });

  it("shows the server's message when another operator already took the booking", async () => {
    post.mockRejectedValueOnce({ response: { data: { message: 'Another team member accepted this booking.' } } });
    render(<BookingActions booking={base} onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText(/LR \/ AWB/i), { target: { value: 'DL12345678' } });
    fireEvent.click(screen.getByRole('button', { name: /save awb/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Another team member accepted this booking.'));
  });
});
