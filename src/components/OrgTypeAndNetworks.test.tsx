import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import OrgTypeAndNetworks from './OrgTypeAndNetworks';

afterEach(cleanup);

describe('OrgTypeAndNetworks (asked on the Google profile step, like the e-mail sign-up)', () => {
  it('asks Transporter or Aggregator and reports the choice', () => {
    const onOrgType = vi.fn();
    render(<OrgTypeAndNetworks orgType="transporter" networks={[]} onOrgType={onOrgType} onNetworks={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Transporter' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Aggregator' }));
    expect(onOrgType).toHaveBeenCalledWith('aggregator');
  });

  it('an aggregator picks the couriers it sells; a transporter picks its (optional) logistics network', () => {
    const { rerender } = render(<OrgTypeAndNetworks orgType="aggregator" networks={['Delhivery']} onOrgType={() => {}} onNetworks={() => {}} />);
    expect(screen.getByText(/couriers you sell/i)).toBeTruthy();
    rerender(<OrgTypeAndNetworks orgType="transporter" networks={[]} onOrgType={() => {}} onNetworks={() => {}} />);
    expect(screen.getByText(/logistics network/i)).toBeTruthy();
  });

  it('ticks and unticks couriers; "Independent" is not offered as a courier', () => {
    const onNetworks = vi.fn();
    render(<OrgTypeAndNetworks orgType="aggregator" networks={['Delhivery']} onOrgType={() => {}} onNetworks={onNetworks} />);
    expect(screen.queryByText(/independent/i)).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Blue Dart' }));
    expect(onNetworks).toHaveBeenLastCalledWith(['Delhivery', 'Blue Dart']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Delhivery' }));
    expect(onNetworks).toHaveBeenLastCalledWith([]);
  });
});
