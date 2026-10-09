import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import TransporterAssistant from './TransporterAssistant';

vi.mock('../utils/assistantApi', async () => {
  const actual = await vi.importActual<typeof import('../utils/assistantApi')>('../utils/assistantApi');
  return { ...actual, sendAssistantMessage: vi.fn() };
});
import { sendAssistantMessage } from '../utils/assistantApi';
const send = vi.mocked(sendAssistantMessage);

beforeEach(() => { send.mockReset(); });
afterEach(() => { cleanup(); });

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: /open fc ai assistant/i }));

describe('TransporterAssistant', () => {
  it('opens with the question input focused and labelled', () => {
    render(<TransporterAssistant />);
    openPanel();
    const input = screen.getByLabelText('Your question');
    expect(input).toBe(document.activeElement);
  });

  it('closes on Escape and returns focus to the launcher button', () => {
    render(<TransporterAssistant />);
    openPanel();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /open fc ai assistant/i })).toBe(document.activeElement);
  });

  it('announces replies through a live log region', () => {
    render(<TransporterAssistant />);
    openPanel();
    expect(screen.getByRole('log')).toBeTruthy();
  });

  it('a failed send shows an alert and does not leave an orphan question in the history', async () => {
    send.mockRejectedValueOnce(new Error('FC AI could not answer right now. Please try again in a moment.'));
    send.mockResolvedValueOnce('Your KYC is verified.');
    render(<TransporterAssistant />);
    openPanel();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'check my documents please' } });
    fireEvent.submit(screen.getByLabelText('Your question').closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not answer/i));
    // the failed question is put back in the box for a retry, not left dangling in the chat
    expect((screen.getByLabelText('Your question') as HTMLInputElement).value).toBe('check my documents please');
    // (the textarea's own text node also matches getByText — only chat bubbles count here)
    expect(screen.queryAllByText('check my documents please').filter((el) => el.tagName !== 'TEXTAREA').length).toBe(0);

    // retry succeeds and the history sent has no stale user turn
    fireEvent.submit(screen.getByLabelText('Your question').closest('form')!);
    await waitFor(() => expect(screen.getByText('Your KYC is verified.')).toBeTruthy());
    expect(send.mock.calls[1][1]).toEqual([]);
  });
});

describe('TransporterAssistant look and language', () => {
  it('★ starts in English with the shipper-style launcher tab and greeting', () => {
    render(<TransporterAssistant />);
    expect(screen.getByText('May I help you?')).toBeTruthy();
    openPanel();
    expect(screen.getByText(/Hi! I'm FC AI, your FreightCompare copilot/)).toBeTruthy();
    expect(screen.getByPlaceholderText('Ask FC AI')).toBeTruthy();
    expect(screen.getByText('Your FreightCompare copilot')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Namaste|sawal|Soch raha/i);
  });

  it('Minimize keeps the conversation, Close clears it', async () => {
    send.mockResolvedValueOnce('Your KYC is verified.');
    render(<TransporterAssistant />);
    openPanel();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'hello there' } });
    fireEvent.submit(screen.getByLabelText('Your question').closest('form')!);
    await waitFor(() => expect(screen.getByText('Your KYC is verified.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /minimize fc ai/i }));
    openPanel();
    expect(screen.getByText('Your KYC is verified.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /close fc ai/i }));
    openPanel();
    expect(screen.queryByText('Your KYC is verified.')).toBeNull();
  });
});
