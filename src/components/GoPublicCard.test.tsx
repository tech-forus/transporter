import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import GoPublicCard from './GoPublicCard';

vi.mock('axios');
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
const axiosGet = vi.mocked(axios.get);
const post = vi.mocked(axios.post);
// `get` answers the public-status calls; the card's rates check (/price/me/config) is answered by `rates`.
const get = vi.fn();
let rates: unknown;
// /auth/me → how the account was created; only Google/invite accounts get the "set up rates" lock.
let me: unknown;
const referralAccount = { data: { success: true, transporter: { origin: 'shipper_referral' } } };

const status = (visibility: string, extra: Record<string, unknown> = {}) => ({ data: { data: { eligible: true, accountType: 'business', visibility, rejectionReason: '', shipperCount: 29, kycStatus: 'verified', ...extra } } });
const withZoneRates = { data: { data: { priceRate: {}, zoneRates: { N1: { S1: 12 } } } } };
const renderCard = () => render(<MemoryRouter><GoPublicCard sidebar /></MemoryRouter>);

beforeEach(() => {
  get.mockReset(); post.mockReset(); axiosGet.mockReset();
  rates = withZoneRates;
  me = referralAccount;
  axiosGet.mockImplementation(((url: string) =>
    url.includes('/price/me/config') ? Promise.resolve(rates)
      : url.includes('/auth/me') ? Promise.resolve(me)
        : get(url)) as any);
});

describe('GoPublicCard — no rates yet', () => {
  it('★ hides Go public and points to rate setup (business → /addprice)', async () => {
    rates = { data: { data: { priceRate: {}, zoneRates: {} } } };
    get.mockResolvedValue(status('private'));
    renderCard();
    const link = await screen.findByRole('link', { name: /set up rates/i });
    expect(link.getAttribute('href')).toBe('/addprice');
    expect(screen.queryByRole('button', { name: /go public/i })).toBeNull();
  });

  it('★ owner-operator with no lanes → /setup/lanes', async () => {
    rates = { data: { data: { lanes: [] } } };
    get.mockResolvedValue(status('private', { accountType: 'individual' }));
    renderCard();
    expect((await screen.findByRole('link', { name: /set up rates/i })).getAttribute('href')).toBe('/setup/lanes');
  });

  it('★ never locks a legacy carrier (no Google/invite origin) even with no prices row', async () => {
    rates = { data: { data: { priceRate: {}, zoneRates: {} } } };
    me = { data: { success: true, transporter: { origin: null } } };
    get.mockResolvedValue(status('private'));
    renderCard();
    expect(await screen.findByRole('button', { name: /go public/i })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /set up rates/i })).toBeNull();
  });

  it('keeps Go public when the rates check fails (never blocks on a network error)', async () => {
    rates = undefined;
    axiosGet.mockImplementation(((url: string) => (url.includes('/price/me/config') ? Promise.reject(new Error('net')) : url.includes('/auth/me') ? Promise.resolve(me) : get(url))) as any);
    get.mockResolvedValue(status('private'));
    renderCard();
    expect(await screen.findByRole('button', { name: /go public/i })).toBeTruthy();
  });
});
afterEach(() => cleanup());

describe('GoPublicCard — awaiting approval', () => {
  it('★ offers a way to undo the request', async () => {
    get.mockResolvedValue(status('pending_public'));
    renderCard();
    expect(await screen.findByText(/Awaiting approval/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /withdraw request/i })).toBeTruthy();
  });

  it('★ withdrawing calls the cancel endpoint and returns the card to the private state', async () => {
    get.mockResolvedValueOnce(status('pending_public')).mockResolvedValueOnce(status('private'));
    post.mockResolvedValue({ data: { success: true, data: { visibility: 'private' } } });
    renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /withdraw request/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/api\/transporter\/public\/cancel$/)));
    // back to the normal "Go public" card
    expect(await screen.findByRole('button', { name: /go public/i })).toBeTruthy();
    expect(screen.queryByText(/Awaiting approval/i)).toBeNull();
  });

  it('other states do not show a withdraw button', async () => {
    get.mockResolvedValue(status('private'));
    renderCard();
    await screen.findByRole('button', { name: /go public/i });
    expect(screen.queryByRole('button', { name: /withdraw request/i })).toBeNull();
  });
});

describe('GoPublicCard — live updates', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('refetches when the window regains focus', async () => {
    get.mockResolvedValue(status('private'));
    renderCard();
    await screen.findByRole('button', { name: /go public/i });
    const before = get.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(get.mock.calls.length).toBeGreaterThan(before);
  });

  it('refetches when the dashboard Refresh button asks for it', async () => {
    get.mockResolvedValue(status('private'));
    renderCard();
    await screen.findByRole('button', { name: /go public/i });
    const before = get.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event('fc:public-status-refresh')); });
    expect(get.mock.calls.length).toBeGreaterThan(before);
  });

  it('polls while awaiting approval and shows the new state (with a toast) when the admin approves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValueOnce(status('pending_public')).mockResolvedValue(status('public'));
    renderCard();
    expect(await screen.findByText(/Awaiting approval/i)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(16000); });
    expect(await screen.findByText(/You're public/i)).toBeTruthy();
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(expect.stringMatching(/public/i));
  });

  it('shows the rejection reason (with a toast) when the admin rejects while waiting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValueOnce(status('pending_public')).mockResolvedValue(status('rejected', { rejectionReason: 'Photos unclear' }));
    renderCard();
    await screen.findByText(/Awaiting approval/i);
    await act(async () => { await vi.advanceTimersByTimeAsync(16000); });
    expect(await screen.findByText(/Photos unclear/)).toBeTruthy();
    expect(vi.mocked(toast.error)).toHaveBeenCalled();
  });

  it('does not poll when nothing is pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValue(status('private'));
    renderCard();
    await screen.findByRole('button', { name: /go public/i });
    const before = get.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(get.mock.calls.length).toBe(before);
  });
});

describe('GoPublicCard — what approval is waiting on', () => {
  it.each([
    ['not_started', /complete your kyc/i],
    ['submitted', /kyc.*under review/i],
    ['rejected', /document needs fixing/i],
    ['verified', /kyc is verified/i],
  ])('pending + kyc %s explains the wait', async (kycStatus, text) => {
    get.mockResolvedValue(status('pending_public', { kycStatus }));
    renderCard();
    expect(await screen.findByText(text)).toBeTruthy();
  });
});
