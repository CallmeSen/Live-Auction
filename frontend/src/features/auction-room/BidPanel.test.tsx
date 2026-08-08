import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BidPanel from './BidPanel';

const baseProps = {
  connectionState: 'joined' as const,
  currentPrice: '100.00',
  minimumBidIncrement: '5.00',
  lastEvent: null,
  role: 'USER' as const,
  sendBid: vi.fn<(amount: string, requestId: string) => boolean>(() => true),
  timeoutMs: 5_000,
  now: () => 1_000,
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BidPanel', () => {
  it('validates decimal amounts without sending a floating-point artifact', async () => {
    const user = userEvent.setup();
    const sendBid = vi.fn<(amount: string, requestId: string) => boolean>(() => true);
    const randomUUID = vi.fn(() => 'request-uuid-123');
    vi.stubGlobal('crypto', { randomUUID });

    render(<BidPanel {...baseProps} sendBid={sendBid} />);
    const input = screen.getByRole('textbox', { name: 'Giá của bạn' });
    await user.clear(input);
    await user.type(input, '105.25');
    await user.click(screen.getByRole('button', { name: 'Xác nhận trả giá' }));

    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(sendBid).toHaveBeenCalledWith('105.25', 'request-uuid-123');
    expect(screen.getByRole('status')).toHaveTextContent(/đang gửi/i);
  });

  it('rejects an amount below the minimum and blocks duplicate submit', async () => {
    const user = userEvent.setup();
    const sendBid = vi.fn<(amount: string, requestId: string) => boolean>(() => true);
    render(<BidPanel {...baseProps} sendBid={sendBid} />);
    const input = screen.getByRole('textbox', { name: 'Giá của bạn' });

    await user.clear(input);
    await user.type(input, '104.99');
    await user.click(screen.getByRole('button', { name: 'Xác nhận trả giá' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/tối thiểu/i);
    expect(sendBid).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, '105.00');
    const submit = screen.getByRole('button', { name: 'Xác nhận trả giá' });
    await user.click(submit);
    await user.click(submit);
    expect(sendBid).toHaveBeenCalledTimes(1);
  });

  it('keeps a matching queued request pending until the accepted event', async () => {
    const user = userEvent.setup();
    const sendBid = vi.fn<(amount: string, requestId: string) => boolean>(() => true);
    const { rerender } = render(<BidPanel {...baseProps} sendBid={sendBid} />);
    await user.click(screen.getByRole('button', { name: 'Xác nhận trả giá' }));
    const requestId = sendBid.mock.calls[0][1];

    rerender(
      <BidPanel
        {...baseProps}
        sendBid={sendBid}
        lastEvent={{ type: 'bid_queued', item_id: 'item-1', request_id: requestId }}
      />,
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/đang chờ xác nhận/i));
    expect(screen.queryByText(/thành công/i)).not.toBeInTheDocument();

    rerender(
      <BidPanel
        {...baseProps}
        sendBid={sendBid}
        lastEvent={{
          type: 'price_update',
          item_id: 'item-1',
          status: 'ACCEPTED',
          request_id: requestId,
          current_price: '105.00',
        }}
      />,
    );
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/thành công/i));
  });

  it('ignores unrelated events and maps correlated rejection reasons', async () => {
    const user = userEvent.setup();
    const sendBid = vi.fn<(amount: string, requestId: string) => boolean>(() => true);
    const { rerender } = render(<BidPanel {...baseProps} sendBid={sendBid} />);
    await user.click(screen.getByRole('button', { name: 'Xác nhận trả giá' }));
    const requestId = sendBid.mock.calls[0][1];

    rerender(
      <BidPanel
        {...baseProps}
        sendBid={sendBid}
        lastEvent={{
          type: 'bid_result',
          item_id: 'item-1',
          status: 'REJECTED',
          request_id: 'other-request',
          reason: 'REJECTED_LOW_INCREMENT',
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/đang gửi/i);

    rerender(
      <BidPanel
        {...baseProps}
        sendBid={sendBid}
        lastEvent={{
          type: 'bid_result',
          item_id: 'item-1',
          status: 'REJECTED',
          request_id: requestId,
          reason: 'REJECTED_LOW_INCREMENT',
        }}
      />,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/thấp hơn bước giá tối thiểu/i));
  });

  it('times out a request and preserves it while reconnecting', async () => {
    vi.useFakeTimers();
    const sendBid = vi.fn<(amount: string, requestId: string) => boolean>(() => true);
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'request-timeout') });
    const { rerender } = render(<BidPanel {...baseProps} sendBid={sendBid} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả giá' }));

    rerender(<BidPanel {...baseProps} sendBid={sendBid} connectionState="reconnecting" />);
    expect(screen.getByRole('status')).toHaveTextContent(/đang gửi|đang chờ/i);
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByRole('alert')).toHaveTextContent(/hết thời gian/i);
  });

  it('does not replace a correlated final result with a stale timeout', async () => {
    vi.useFakeTimers();
    const sendBid = vi.fn<(amount: string, requestId: string) => boolean>(() => true);
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'request-final') });
    const { rerender } = render(<BidPanel {...baseProps} sendBid={sendBid} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận trả giá' }));
    const requestId = sendBid.mock.calls[0][1];

    rerender(
      <BidPanel
        {...baseProps}
        sendBid={sendBid}
        lastEvent={{
          type: 'price_update',
          item_id: 'item-1',
          status: 'ACCEPTED',
          request_id: requestId,
          current_price: '105.00',
        }}
      />,
    );
    await act(async () => await Promise.resolve());
    expect(screen.getByRole('status')).toHaveTextContent(/thành công/i);

    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/thành công/i);
  });

  it('does not render for admin role', () => {
    render(<BidPanel {...baseProps} role="ADMIN" />);
    expect(screen.queryByRole('textbox', { name: 'Giá của bạn' })).not.toBeInTheDocument();
  });

  it('syncs the suggested amount after price changes unless a higher edit is active', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BidPanel {...baseProps} />);
    const input = screen.getByRole('textbox', { name: 'Giá của bạn' });
    expect(input).toHaveValue('105.00');

    rerender(<BidPanel {...baseProps} currentPrice="120.00" />);
    expect(screen.getByRole('textbox', { name: 'Giá của bạn' })).toHaveValue('125.00');

    await user.clear(input);
    await user.type(input, '130.00');
    rerender(<BidPanel {...baseProps} currentPrice="120.00" />);
    expect(screen.getByRole('textbox', { name: 'Giá của bạn' })).toHaveValue('130.00');
  });

  it('normalizes fixed-point and exponent decimal values without floating point math', () => {
    const { rerender } = render(
      <BidPanel {...baseProps} currentPrice="99.90" minimumBidIncrement="0.05" />,
    );
    expect(screen.getByRole('textbox', { name: 'Giá của bạn' })).toHaveValue('99.95');

    rerender(
      <BidPanel {...baseProps} currentPrice="1e2" minimumBidIncrement="5e-1" />,
    );
    expect(screen.getByRole('textbox', { name: 'Giá của bạn' })).toHaveValue('100.5');
  });
});
