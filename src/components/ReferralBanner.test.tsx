import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import axios from 'axios';
import ReferralBanner from './ReferralBanner';

vi.mock('axios');
const get = vi.mocked(axios.get);

const renderOpen = async () => {
  get.mockResolvedValue({ data: { valid: true, inviterName: 'Forus Intelligence Labs' } });
  window.history.pushState({}, '', '/transporter-signup?ref=ABC12345');
  render(<ReferralBanner />);
  await screen.findByRole('dialog');
};
const selected = () => within(screen.getByRole('tablist', { name: /checklist sections/i })).getAllByRole('tab').findIndex((t) => t.getAttribute('aria-selected') === 'true');

beforeEach(() => { get.mockReset(); localStorage.clear(); });
afterEach(() => cleanup());

describe('ReferralBanner checklist slideshow', () => {
  it('starts on the first section and advances by itself when the dwell animation ends', async () => {
    await renderOpen();
    expect(selected()).toBe(0);
    const bar = document.querySelector('[style*="fc-dwell"]') as HTMLElement;
    // jsdom has no AnimationEvent, so React listens for the prefixed name there.
    fireEvent(bar, new Event('webkitAnimationEnd', { bubbles: true }));
    expect(selected()).toBe(1);
  });

  it('wraps from the last section back to the first', async () => {
    await renderOpen();
    fireEvent.click(screen.getByRole('button', { name: /next section/i }));
    fireEvent.click(screen.getByRole('button', { name: /next section/i }));
    expect(selected()).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: /next section/i }));
    expect(selected()).toBe(0);
  });

  it('stepping manually pauses auto-advance, and the play button resumes it', async () => {
    await renderOpen();
    fireEvent.click(screen.getByRole('button', { name: /next section/i }));
    expect(document.querySelector('[style*="fc-dwell"]')!.getAttribute('style')).toContain('paused');
    fireEvent.click(screen.getByRole('button', { name: /resume auto-advance/i }));
    expect(document.querySelector('[style*="fc-dwell"]')!.getAttribute('style')).toContain('running');
  });

  it('holds the timer while the pointer is over the checklist', async () => {
    await renderOpen();
    const tablist = screen.getByRole('tablist', { name: /checklist sections/i });
    fireEvent.mouseEnter(tablist.parentElement!.parentElement!);
    expect(document.querySelector('[style*="fc-dwell"]')!.getAttribute('style')).toContain('paused');
  });

  it('switching Business/Individual goes back to the first section', async () => {
    await renderOpen();
    fireEvent.click(screen.getByRole('button', { name: /next section/i }));
    fireEvent.click(screen.getByRole('tab', { name: 'Individual' }));
    expect(selected()).toBe(0);
  });
});
