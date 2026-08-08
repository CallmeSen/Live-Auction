import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  completeNewPassword: vi.fn(),
}));

vi.mock('../../../hooks/useAuth', () => ({
  default: () => auth,
}));

import LoginPage from './LoginPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('admin login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers first-login password completion after Cognito challenge', async () => {
    auth.login.mockRejectedValue({ code: 'NEW_PASSWORD_REQUIRED' });
    auth.completeNewPassword.mockResolvedValue(undefined);
    renderPage();

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'admin@example.test' },
    });
    fireEvent.change(screen.getByDisplayValue(''), {
      target: { value: 'temporary-password' },
    });
    fireEvent.submit(screen.getByRole('textbox', { name: 'Email' }).closest('form')!);

    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'permanent-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'permanent-password' },
    });
    fireEvent.submit(screen.getByRole('textbox', { name: 'Email' }).closest('form')!);

    expect(auth.completeNewPassword).toHaveBeenCalledWith('permanent-password');
  });
});
