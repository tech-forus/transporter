import axios from 'axios';
import { API_BASE_URL } from '../config/apiConfig';

axios.defaults.withCredentials = true;

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export const SUGGESTED_QUESTIONS = [
  'What is my KYC status?',
  'How do I change my rates?',
  'What does Go public mean?',
  'Summarise my bookings',
];

export function friendlyAssistantError(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { message?: string } } };
  const status = e?.response?.status;
  if (status === 429) return e.response?.data?.message || 'You have reached the FC AI limit for now. Please try again later.';
  if (status === 503) return 'FC AI is not available right now. Please try again later or use Contact Support.';
  if (status === 401) return 'Please log in again to use FC AI.';
  return 'FC AI could not answer right now. Please try again in a moment.';
}

export async function sendAssistantMessage(message: string, history: ChatTurn[]): Promise<string> {
  try {
    const res = await axios.post(`${API_BASE_URL}/api/transporter/assistant/chat`, {
      message,
      history: history.slice(-20),
    });
    const reply = res.data?.reply;
    if (typeof reply !== 'string' || !reply.trim()) throw new Error('empty');
    return reply;
  } catch (err) {
    throw new Error(friendlyAssistantError(err));
  }
}
