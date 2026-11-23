import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AggregatorBanner from './AggregatorBanner';

afterEach(cleanup);

describe('AggregatorBanner', () => {
  it('tells an aggregator where its work is: add couriers, then their rates, staff and pincodes', () => {
    render(<MemoryRouter><AggregatorBanner /></MemoryRouter>);
    expect(screen.getByText(/add your couriers/i)).toBeTruthy();
    const link = screen.getByRole('link', { name: /courier lines/i });
    expect(link.getAttribute('href')).toBe('/lines');
  });
});
