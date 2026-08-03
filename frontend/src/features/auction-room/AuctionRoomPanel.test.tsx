import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuctionRoomPanel from './AuctionRoomPanel';

const baseProps = {
  connectionState: 'joined' as const,
  currentPrice: '101.25',
  endTime: 110,
  highestBidderAlias: 'Bidder #21',
  bidderAlias: 'Bidder #12',
  extensionCount: 2,
  role: 'USER' as const,
  onRetry: vi.fn(),
  now: () => 100_000,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('AuctionRoomPanel', () => {
  it('exposes a named live connection status', () => {
    render(<AuctionRoomPanel {...baseProps} />);

    const status = screen.getByRole('status', { name: 'Live connection status' });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Đã kết nối');
  });

  it('renders stable live price, alias, extension and countdown regions', () => {
    render(<AuctionRoomPanel {...baseProps} />);

    expect(screen.getByLabelText('Giá hiện tại')).toHaveTextContent('101.25');
    expect(screen.getByLabelText('Người đang dẫn đầu')).toHaveTextContent('Bidder #21');
    expect(screen.getByLabelText('Thời gian còn lại')).toHaveTextContent('00:10');
    expect(screen.getByText(/2 lần gia hạn/i)).toBeVisible();
  });

  it('tracks elapsed time, accepts an end-time extension, and cleans its interval', () => {
    vi.useFakeTimers();
    let nowMs = 100_000;
    const now = () => nowMs;
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { rerender, unmount } = render(
      <AuctionRoomPanel {...baseProps} now={now} />,
    );

    nowMs = 105_000;
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByLabelText('Thời gian còn lại')).toHaveTextContent('00:05');

    rerender(<AuctionRoomPanel {...baseProps} now={now} endTime={120} />);
    expect(screen.getByLabelText('Thời gian còn lại')).toHaveTextContent('00:15');
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('shows loading, reconnecting, closed, and failed retry states', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <AuctionRoomPanel {...baseProps} connectionState="loading" onRetry={onRetry} />,
    );
    expect(screen.getByRole('status', { name: 'Live connection status' }))
      .toHaveTextContent(/đang tải/i);

    rerender(<AuctionRoomPanel {...baseProps} connectionState="reconnecting" onRetry={onRetry} />);
    expect(screen.getByRole('status', { name: 'Live connection status' }))
      .toHaveTextContent(/đang kết nối lại/i);

    rerender(<AuctionRoomPanel {...baseProps} connectionState="closed" endTime={100} onRetry={onRetry} />);
    expect(screen.getByRole('status', { name: 'Live connection status' }))
      .toHaveTextContent(/đã đóng/i);
    expect(screen.getByLabelText('Thời gian còn lại')).toHaveTextContent(/đã kết thúc/i);

    rerender(<AuctionRoomPanel {...baseProps} connectionState="failed" onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: /thử kết nối lại/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('updates aliases and shows bid controls only to users', () => {
    const bidControl = <button type="button">Trả giá</button>;
    const { rerender } = render(
      <AuctionRoomPanel {...baseProps} bidControl={bidControl} />,
    );
    expect(screen.getByRole('button', { name: 'Trả giá' })).toBeVisible();

    rerender(
      <AuctionRoomPanel
        {...baseProps}
        bidderAlias="Bidder #44"
        highestBidderAlias="Bidder #45"
        bidControl={bidControl}
      />,
    );
    expect(screen.getByText('Bidder #44')).toBeVisible();
    expect(screen.getByText('Bidder #45')).toBeVisible();

    rerender(<AuctionRoomPanel {...baseProps} role="ADMIN" bidControl={bidControl} />);
    expect(screen.queryByRole('button', { name: 'Trả giá' })).not.toBeInTheDocument();
  });
});
