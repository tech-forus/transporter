import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import LineCard, { type Line } from './LineCard';

vi.mock('axios');
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
const loginWithToken = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ loginWithToken }) }));
const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));
vi.mock('../../lib/serviceabilitySheet', () => ({ parseServiceabilitySheet: vi.fn() }));
import { parseServiceabilitySheet } from '../../lib/serviceabilitySheet';
const post = vi.mocked(axios.post);
const patch = vi.mocked(axios.patch);
const put = vi.mocked(axios.put);

const line = (over: Partial<Line> = {}): Line => ({
  _id: 'L1', courier: 'Delhivery', companyName: 'Delhivery (Shipshopy)', email: 'd@s.in', kycStatus: 'verified', trackingLink: '',
  ratesStatus: 'ok', ratesUpdatedAt: '2026-11-20T10:00:00Z', ratesUpdatedBy: { name: 'Delhivery (Shipshopy)', kind: 'courier' },
  coverage: { pincodes: 1200, zones: ['N1', 'W1'] },
  team: [{ name: 'Deepak', phone: '919811111111', scope: 'line', lineRole: 'primary', hasLogin: true }, { name: 'Anita', phone: '919800000001', scope: 'all', lineRole: null, hasLogin: false }],
  ...over,
});
const show = (l: Line, onChanged = vi.fn(), onSecret = vi.fn()) => render(<MemoryRouter><LineCard line={l} onChanged={onChanged} onSecret={onSecret} /></MemoryRouter>);

beforeEach(() => { post.mockReset(); patch.mockReset(); loginWithToken.mockReset(); navigate.mockReset(); });
afterEach(cleanup);

describe('LineCard', () => {
  it('shows each person with their role, and who last saved the rates', () => {
    show(line());
    expect(screen.getByText('Deepak').closest('li')!.textContent).toMatch(/primary/i);
    expect(screen.getByText('Anita').closest('li')!.textContent).toMatch(/all couriers/i);
    expect(screen.getByText(/rates ok/i)).toBeTruthy();
    expect(screen.getByText(/updated by delhivery \(shipshopy\)/i)).toBeTruthy();
  });

  it('warns when a line has no rates or stale rates', () => {
    const { unmount } = show(line({ ratesStatus: 'none', ratesUpdatedAt: null, ratesUpdatedBy: null }));
    expect(screen.getByText(/no rates yet/i)).toBeTruthy();
    unmount();
    show(line({ ratesStatus: 'stale' }));
    expect(screen.getByText(/not updated for 90/i)).toBeTruthy();
  });

  it('adds an operator: OTP request carries role and consent, then verify', async () => {
    post.mockResolvedValue({ data: { success: true } });
    const onChanged = vi.fn();
    show(line(), onChanged);
    fireEvent.click(screen.getByRole('button', { name: /add person/i }));
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Backup Bina' } });
    fireEvent.change(screen.getByLabelText(/mobile/i), { target: { value: '9822222222' } });
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'backup' } });
    fireEvent.click(screen.getByLabelText(/agreed to receive/i));
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.stringContaining('/lines/L1/team/request-otp'), { name: 'Backup Bina', phone: '9822222222', lineRole: 'backup', consent: true }));
    fireEvent.change(await screen.findByLabelText(/otp/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify and add/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.stringContaining('/lines/L1/team/confirm-otp'), { phone: '9822222222', otp: '123456' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('"Manage rates" starts a 30-minute session as this courier and opens its rates', async () => {
    post.mockResolvedValue({ data: { token: 'line-token' } });
    show(line());
    fireEvent.click(screen.getByRole('button', { name: /manage rates/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.stringContaining('/lines/L1/manage-token')));
    await waitFor(() => expect(loginWithToken).toHaveBeenCalledWith('line-token'));
    expect(navigate).toHaveBeenCalledWith('/profile/rates');
  });

  it('shows how many pincodes the courier serves, and warns when it serves none (shippers would never see it)', () => {
    const { unmount } = show(line());
    expect(screen.getByText(/serves 1,200 pincodes/i)).toBeTruthy();
    unmount();
    show(line({ coverage: { pincodes: 0, zones: [] } }));
    expect(screen.getByText(/no pincodes yet/i)).toBeTruthy();
    expect(screen.getByText(/shippers will not see this courier/i)).toBeTruthy();
  });

  it('uploading a serviceability sheet saves its rows; a bad sheet shows why and saves nothing', async () => {
    put.mockResolvedValue({ data: { success: true, pincodes: 2, zones: ['N1'] } });
    const onChanged = vi.fn();
    show(line(), onChanged);
    vi.mocked(parseServiceabilitySheet).mockReturnValueOnce({ rows: [{ pincode: '110020', zone: 'N1', isOda: false }, { pincode: '201301', zone: 'N1', isOda: true }] });
    const file = new File([new Uint8Array([1, 2, 3])], 'serviceability.xlsx');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(3) });
    fireEvent.change(screen.getByLabelText(/serviceability sheet/i), { target: { files: [file] } });
    await waitFor(() => expect(put).toHaveBeenCalledWith(expect.stringContaining('/lines/L1/serviceability'), { service: [{ pincode: '110020', zone: 'N1', isOda: false }, { pincode: '201301', zone: 'N1', isOda: true }] }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    put.mockClear();
    vi.mocked(parseServiceabilitySheet).mockReturnValueOnce({ error: 'No pincodes found in the sheet.' });
    fireEvent.change(screen.getByLabelText(/serviceability sheet/i), { target: { files: [file] } });
    await waitFor(() => expect(vi.mocked(parseServiceabilitySheet)).toHaveBeenCalledTimes(2));
    expect(put).not.toHaveBeenCalled();
  });

  it('saves a tracking link once', async () => {
    patch.mockResolvedValue({ data: { success: true, trackingLink: 'https://t.example/{awb}' } });
    show(line());
    fireEvent.change(screen.getByLabelText(/tracking link/i), { target: { value: 'https://t.example/{awb}' } });
    fireEvent.click(screen.getByRole('button', { name: /save link/i }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(expect.stringContaining('/lines/L1'), { trackingLink: 'https://t.example/{awb}' }));
  });
});
