import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { sendAssistantMessage, friendlyAssistantError, SUGGESTED_QUESTIONS } from './assistantApi';

vi.mock('axios');
const post = vi.mocked(axios.post);
beforeEach(() => { post.mockReset(); });

describe('sendAssistantMessage', () => {
  it('posts message + trimmed history and returns the reply', async () => {
    post.mockResolvedValue({ data: { success: true, reply: 'Hello' } });
    const history = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `m${i}` }));
    const reply = await sendAssistantMessage('hi', history);
    expect(reply).toBe('Hello');
    const body = post.mock.calls[0][1] as { message: string; history: unknown[] };
    expect(body.message).toBe('hi');
    expect(body.history.length).toBeLessThanOrEqual(20);
  });
  it('throws the friendly text for a 429', async () => {
    post.mockRejectedValue({ response: { status: 429, data: { message: 'You have reached the hourly FC AI limit.' } } });
    await expect(sendAssistantMessage('hi', [])).rejects.toThrow(/limit/i);
  });
});

describe('friendlyAssistantError', () => {
  it('never leaks raw error objects', () => {
    expect(friendlyAssistantError(new Error('ECONNREFUSED 127.0.0.1'))).toMatch(/try again/i);
    expect(friendlyAssistantError({ response: { status: 503 } })).toMatch(/not available/i);
    expect(friendlyAssistantError({ response: { status: 401 } })).toMatch(/log in/i);
  });
});

describe('SUGGESTED_QUESTIONS', () => {
  it('has a few beginner-friendly starters', () => {
    expect(SUGGESTED_QUESTIONS.length).toBeGreaterThanOrEqual(3);
  });
});
