// Regression: a KYC-blocked account got "Something went wrong" (in the website's iframe: a blank strip) because KycGate used
// IS_WEB without importing it. An aggregator organisation must see the wizard with the vehicle and driver steps optional.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import axios from 'axios';
import KycGate from './KycGate';

vi.mock('axios');
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { _id: 'o1' } }) }));
(globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
afterEach(cleanup);

const status = (extra: object) => vi.mocked(axios.get).mockResolvedValue({ data: { success: true, kycStatus: 'not_started', documents: {}, ...extra } });

describe('KycGate', () => {
  it('shows the KYC wizard over a blocked account instead of crashing', async () => {
    status({});
    render(<KycGate><p>page</p></KycGate>);
    await waitFor(() => expect(screen.getByText('Complete Your KYC')).toBeTruthy());
    expect(screen.getByText('Aadhaar Card')).toBeTruthy();
  });
  it('asks an aggregator for Aadhaar or PAN, and lets it skip the vehicle and driver papers', async () => {
    status({ aggregator: true });
    render(<KycGate><p>page</p></KycGate>);
    await waitFor(() => expect(screen.getByText('Aadhaar or PAN card')).toBeTruthy());
    expect(screen.getByText(/of 5/)).toBeTruthy();
  });
  it('lets a verified account through to the page', async () => {
    status({ kycStatus: 'verified' });
    render(<KycGate><p>page</p></KycGate>);
    await waitFor(() => expect(screen.getByText('page')).toBeTruthy());
  });
});
