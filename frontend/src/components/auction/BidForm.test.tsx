import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import BidForm from './BidForm';

describe('BidForm', () => {
  it('keeps decimal input as a string and emits controlled changes', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [amount, setAmount] = useState('105.00');
      return (
        <BidForm
          amount={amount}
          currentPrice="100.00"
          minimumAmount="105.00"
          onAmountChange={setAmount}
          onSubmit={vi.fn()}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByRole('textbox', { name: 'Giá của bạn' })).toHaveValue('105.00');
    expect(screen.getByText(/Giá hợp lệ từ 105.00/i)).toBeVisible();

    await user.clear(screen.getByRole('textbox', { name: 'Giá của bạn' }));
    await user.type(screen.getByRole('textbox', { name: 'Giá của bạn' }), '105.25');

    expect(screen.getByRole('textbox', { name: 'Giá của bạn' })).toHaveValue('105.25');
  });

  it('disables submission while the request is pending', () => {
    render(
      <BidForm
        amount="105.00"
        currentPrice="100.00"
        minimumAmount="105.00"
        disabled
        onAmountChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Đang xử lý...' })).toBeDisabled();
  });
});
