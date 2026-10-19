import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import CopyableAddress from './CopyableAddress';

const LONG = 'Gujrat Colony, Kothrud, Pune, Maharashtra, India, Near Chandni Chowk Signal, Opposite City Mall, Building B, 3rd Floor, Flat 302, Pune 411038';

const writeText = vi.fn();
beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => cleanup());

describe('CopyableAddress', () => {
  it('★ shows the full address as wrapped, selectable text (not a clipped single-line input)', () => {
    render(<CopyableAddress label="Pickup Address" value={LONG} />);
    const text = screen.getByText(LONG);
    expect(text.tagName).not.toBe('INPUT');
    expect(text.className).toMatch(/break-words|whitespace-pre-wrap/);
    expect(text.className).not.toMatch(/truncate|overflow-hidden|whitespace-nowrap/);
  });

  it('★ copies the complete address to the clipboard and confirms it', async () => {
    render(<CopyableAddress label="Pickup Address" value={LONG} />);
    fireEvent.click(screen.getByRole('button', { name: /copy pickup address/i }));
    expect(writeText).toHaveBeenCalledWith(LONG);
    await waitFor(() => expect(screen.getByText(/copied/i)).toBeTruthy());
  });

  it('★ empty address: "Not provided" and no copy button', () => {
    render(<CopyableAddress label="Drop Address" value="   " />);
    expect(screen.getByText('Not provided')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
  });

  it('falls back gracefully when the clipboard API is unavailable or fails', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;
    render(<CopyableAddress label="Drop Address" value="Chandigarh, India" />);
    fireEvent.click(screen.getByRole('button', { name: /copy drop address/i }));
    await waitFor(() => expect(exec).toHaveBeenCalledWith('copy'));
    await waitFor(() => expect(screen.getByText(/copied/i)).toBeTruthy());
  });
});
