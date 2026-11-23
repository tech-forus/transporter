import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import ManagingBanner from './ManagingBanner';

vi.mock('axios');
const loginWithToken = vi.fn();
let user: any = null;
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user, loginWithToken }) }));
const post = vi.mocked(axios.post);

beforeEach(() => { post.mockReset(); loginWithToken.mockReset(); });
afterEach(cleanup);
const show = () => render(<MemoryRouter><ManagingBanner /></MemoryRouter>);

describe('ManagingBanner', () => {
  it('is invisible for everyone who is not managing a courier', () => {
    user = { companyName: 'Shipshopy' };
    expect(show().container.innerHTML).toBe('');
  });
  it('says which courier is being managed, and "Back" restores the owner session', async () => {
    user = { companyName: 'Delhivery (Shipshopy)', actingFor: 'org1' };
    post.mockResolvedValue({ data: { token: 'owner-token' } });
    show();
    expect(screen.getByText(/Delhivery \(Shipshopy\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /back to organisation/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.stringContaining('/api/transporter/lines/manage-exit')));
    await waitFor(() => expect(loginWithToken).toHaveBeenCalledWith('owner-token'));
  });
});
