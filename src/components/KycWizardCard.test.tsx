import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import axios from 'axios';
import KycWizardCard from './KycWizardCard';

vi.mock('axios');
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./LiveSelfieCapture', () => ({
  default: ({ onCapture }: { onCapture: (f: File) => void }) => (
    <button type="button" onClick={() => onCapture(new File(['x'], 'selfie.jpg', { type: 'image/jpeg' }))}>Capture selfie</button>
  ),
}));
const get = vi.mocked(axios.get);
const post = vi.mocked(axios.post);

const doc = (status: string, reason = '') => ({ fileName: 'f.png', uploadedAt: '2026-09-29T10:00:00Z', status, rejectionReason: reason });
const photos = (status: string, reason = '') => ({ fileCount: 3, uploadedAt: '2026-09-29T10:00:00Z', status, rejectionReason: reason });
const reply = (documents: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  get.mockResolvedValue({ data: { success: true, kycStatus: 'rejected', vehicle: null, driver: null, documents: { aadhaar: null, selfie: null, businessPhotos: null, vehicleRc: null, driverDl: null, ...documents }, ...extra } } as any);
const png = () => new File(['x'], 'new-aadhaar.png', { type: 'image/png' });
const pick = (file: File) => fireEvent.change(document.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [file] } });

beforeEach(() => { get.mockReset(); post.mockReset(); post.mockResolvedValue({ data: { success: true } } as any); });
afterEach(() => cleanup());

describe('KycWizardCard — which steps are shown', () => {
  it('a brand-new account still goes through all 5 steps', async () => {
    reply({}, { kycStatus: 'not_started' });
    render(<KycWizardCard onComplete={() => {}} />);
    expect(await screen.findByText('Step 1 of 5')).toBeTruthy();
    expect(screen.getByText('Complete Your KYC')).toBeTruthy();
  });

  it('only the rejected document is asked for again, as a single step', async () => {
    reply({ aadhaar: doc('rejected', 'Wrong photo'), selfie: doc('verified'), businessPhotos: photos('verified'), vehicleRc: doc('verified'), driverDl: doc('verified') });
    render(<KycWizardCard onComplete={() => {}} />);
    expect(await screen.findByText('Step 1 of 1')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Aadhaar Card' })).toBeTruthy();
    expect(screen.getByText(/Wrong photo/)).toBeTruthy();
    expect(screen.queryByText('Live Selfie')).toBeNull();
    expect(screen.queryByText('Vehicle RC')).toBeNull();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();       // nothing after it, so no Next
    expect(document.querySelectorAll('.h-1\\.5.flex-1').length).toBe(1);        // one progress segment
  });

  it('documents still under review (pending) are left alone too', async () => {
    reply({ aadhaar: doc('rejected', 'Blurry'), selfie: doc('pending'), businessPhotos: photos('pending'), vehicleRc: doc('verified'), driverDl: doc('verified') });
    render(<KycWizardCard onComplete={() => {}} />);
    expect(await screen.findByText('Step 1 of 1')).toBeTruthy();
  });

  it('several rejected documents become that many steps, in order, and skip the good ones', async () => {
    reply({ aadhaar: doc('rejected', 'A'), selfie: doc('verified'), businessPhotos: photos('verified'), vehicleRc: doc('rejected', 'B'), driverDl: doc('verified') },
      { vehicle: { vehicleNumber: 'GJ11Z7777', vehicleType: 'Open Truck' } });
    render(<KycWizardCard onComplete={() => {}} />);
    expect(await screen.findByText('Step 1 of 2')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Aadhaar Card' })).toBeTruthy();
    pick(png());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 2 of 2')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vehicle RC' })).toBeTruthy();
  });

  it('a document that was never uploaded is asked for along with the rejected one', async () => {
    reply({ aadhaar: doc('verified'), selfie: doc('verified'), businessPhotos: photos('verified'), vehicleRc: null, driverDl: doc('rejected', 'C') });
    render(<KycWizardCard onComplete={() => {}} />);
    expect(await screen.findByText('Step 1 of 2')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vehicle RC' })).toBeTruthy();
  });

  it('the heading says what is going on when only some documents are needed', async () => {
    reply({ aadhaar: doc('rejected', 'x'), selfie: doc('verified'), businessPhotos: photos('verified'), vehicleRc: doc('verified'), driverDl: doc('verified') });
    render(<KycWizardCard onComplete={() => {}} />);
    expect(await screen.findByText('Re-upload Your Documents')).toBeTruthy();
    expect(screen.getByText(/1 document/i)).toBeTruthy();
  });
});

describe('KycWizardCard — no blank fields on a re-upload', () => {
  it('re-uploading a rejected RC starts with the vehicle number and type already on file', async () => {
    reply({ aadhaar: doc('verified'), selfie: doc('verified'), businessPhotos: photos('verified'), vehicleRc: doc('rejected', 'Blurry'), driverDl: doc('verified') },
      { vehicle: { vehicleNumber: 'GJ11Z7777', vehicleType: 'Open Truck' } });
    render(<KycWizardCard onComplete={() => {}} />);
    await screen.findByRole('heading', { name: 'Vehicle RC' });
    expect((screen.getByPlaceholderText(/GJ 11 Z 7777/i) as HTMLInputElement).value).toBe('GJ 11 Z 7777');
    expect((screen.getByPlaceholderText(/vehicle type/i) as HTMLInputElement).value).toBe('Open Truck');
  });

  it('re-uploading a rejected DL starts with the driver name and phone already on file', async () => {
    reply({ aadhaar: doc('verified'), selfie: doc('verified'), businessPhotos: photos('verified'), vehicleRc: doc('verified'), driverDl: doc('rejected', 'Blurry') },
      { driver: { name: 'Rahul', phone: '9354675979' } });
    render(<KycWizardCard onComplete={() => {}} />);
    await screen.findByRole('heading', { name: 'Driver DL' });
    expect((screen.getByPlaceholderText(/driver name/i) as HTMLInputElement).value).toBe('Rahul');
    expect((screen.getByPlaceholderText(/driver phone/i) as HTMLInputElement).value).toBe('9354675979');
  });
});

describe('KycWizardCard — what is submitted', () => {
  it('sends only the re-uploaded file; no vehicle or driver fields for documents that were not touched', async () => {
    reply({ aadhaar: doc('rejected', 'Wrong photo'), selfie: doc('verified'), businessPhotos: photos('verified'), vehicleRc: doc('verified'), driverDl: doc('verified') });
    const onComplete = vi.fn();
    render(<KycWizardCard onComplete={onComplete} />);
    await screen.findByText('Step 1 of 1');
    pick(png());
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const fd = post.mock.calls[0][1] as FormData;
    expect(fd.get('aadhaar')).toBeInstanceOf(File);
    for (const k of ['selfie', 'businessPhotos', 'vehicleRc', 'driverDl', 'vehicleNumber', 'vehicleType', 'driverName', 'driverPhone']) expect(fd.has(k)).toBe(false);
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it('a rejected RC is submitted together with its vehicle number', async () => {
    reply({ aadhaar: doc('verified'), selfie: doc('verified'), businessPhotos: photos('verified'), vehicleRc: doc('rejected', 'Blurry'), driverDl: doc('verified') },
      { vehicle: { vehicleNumber: 'GJ11Z7777', vehicleType: '' } });
    render(<KycWizardCard onComplete={() => {}} />);
    await screen.findByRole('heading', { name: 'Vehicle RC' });
    pick(png());
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const fd = post.mock.calls[0][1] as FormData;
    expect(fd.get('vehicleRc')).toBeInstanceOf(File);
    expect(fd.get('vehicleNumber')).toBe('GJ11Z7777');
    expect(fd.has('driverName')).toBe(false);
  });

  it('the live selfie step still captures a selfie when only the selfie was rejected', async () => {
    reply({ aadhaar: doc('verified'), selfie: doc('rejected', 'Face not visible'), businessPhotos: photos('verified'), vehicleRc: doc('verified'), driverDl: doc('verified') });
    render(<KycWizardCard onComplete={() => {}} />);
    await screen.findByText('Step 1 of 1');
    fireEvent.click(screen.getByRole('button', { name: 'Capture selfie' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect((post.mock.calls[0][1] as FormData).get('selfie')).toBeInstanceOf(File);
  });
});
