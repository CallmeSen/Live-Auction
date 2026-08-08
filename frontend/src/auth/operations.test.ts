import { describe, expect, it, vi } from 'vitest';
import { createCognitoUserOperations } from './operations';

describe('Cognito user operations', () => {
  it('starts a USER registration with profile attributes', async () => {
    const signUp = vi.fn().mockResolvedValue({
      isSignUpComplete: false,
      nextStep: { signUpStep: 'CONFIRM_SIGN_UP' },
    });
    const operations = createCognitoUserOperations({
      signUp,
      confirmSignUp: vi.fn(),
      resetPassword: vi.fn(),
      confirmResetPassword: vi.fn(),
    });

    await expect(operations.signUp({
      email: 'member@example.test',
      password: 'Strong-password-123!',
      fullName: 'Member Example',
      phone: '+84901234567',
    })).resolves.toEqual({
      isSignUpComplete: false,
      nextStep: 'CONFIRM_SIGN_UP',
    });
    expect(signUp).toHaveBeenCalledWith({
      username: 'member@example.test',
      password: 'Strong-password-123!',
      options: {
        userAttributes: {
          email: 'member@example.test',
          name: 'Member Example',
          phone_number: '+84901234567',
        },
      },
    });
  });

  it('confirms registration and delegates password reset flows', async () => {
    const confirmSignUp = vi.fn().mockResolvedValue({
      isSignUpComplete: true,
      nextStep: { signUpStep: 'DONE' },
    });
    const resetPassword = vi.fn().mockResolvedValue({
      nextStep: { resetPasswordStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE' },
    });
    const confirmResetPassword = vi.fn().mockResolvedValue(undefined);
    const operations = createCognitoUserOperations({
      signUp: vi.fn(),
      confirmSignUp,
      resetPassword,
      confirmResetPassword,
    });

    await expect(operations.confirmSignUp('member@example.test', '123456'))
      .resolves.toEqual({ isSignUpComplete: true, nextStep: 'DONE' });
    await expect(operations.resetPassword('member@example.test')).resolves.toEqual({
      nextStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE',
    });
    await expect(operations.confirmResetPassword(
      'member@example.test',
      '654321',
      'New-strong-password-123!',
    )).resolves.toBeUndefined();

    expect(confirmSignUp).toHaveBeenCalledWith({
      username: 'member@example.test',
      confirmationCode: '123456',
    });
    expect(resetPassword).toHaveBeenCalledWith({
      username: 'member@example.test',
    });
    expect(confirmResetPassword).toHaveBeenCalledWith({
      username: 'member@example.test',
      confirmationCode: '654321',
      newPassword: 'New-strong-password-123!',
    });
  });
});
