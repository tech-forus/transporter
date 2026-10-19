import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import axios from 'axios';
import TransporterInviteBanner from './TransporterInviteBanner';

vi.mock('axios');
const get = vi.mocked(axios.get);

beforeEach(() => { get.mockReset(); localStorage.clear(); });
afterEach(() => cleanup());

describe('TransporterInviteBanner', () => {
  it('opens a personal invitation naming the inviter when arriving through a ?tref= link', async () => {
    get.mockResolvedValue({ data: { valid: true, inviterName: 'Acme Logistics' } });
    window.history.pushState({}, '', '/transporter-signup?tref=ABC12345');
    render(<TransporterInviteBanner />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Acme Logistics');
    expect(dialog.textContent).toContain('Personal invitation');
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/api/transporter-referral/public/ABC12345'));
    fireEvent.click(screen.getByRole('button', { name: /accept invite/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/invited you to join FreightCompare/i)).toBeTruthy(); // slim bar stays, can reopen
  });

  it('does not auto-open on a later page that only has the stored code', async () => {
    localStorage.setItem('fc_transporter_referral_code', 'ABC12345');
    get.mockResolvedValue({ data: { valid: true, inviterName: 'Acme Logistics' } });
    window.history.pushState({}, '', '/transporter-signup');
    render(<TransporterInviteBanner />);
    await screen.findByRole('button', { name: /view invitation/i });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders nothing and forgets the code when it is invalid', async () => {
    get.mockResolvedValue({ data: { valid: false } });
    window.history.pushState({}, '', '/transporter-signup?tref=BAD00000');
    const { container } = render(<TransporterInviteBanner />);
    await vi.waitFor(() => expect(localStorage.getItem('fc_transporter_referral_code')).toBeNull());
    expect(container.textContent).toBe('');
  });
});
