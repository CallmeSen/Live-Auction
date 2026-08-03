import { describe, expect, it, vi } from 'vitest';
import { createCognitoAccountService } from './account';

function createDependencies() {
  return {
    signUp: vi.fn().mockResolvedValue({
      nextStep: { signUpStep: 'CONFIRM_SIGN_UP' },
    }),
    confirmSignUp: vi.fn().mockResolvedValue({
      nextStep: { signUpStep: 'DONE' },
    }),
    resetPassword: vi.fn().mockResolvedValue({
      nextStep: { resetPasswordStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE' },
    }),
    confirmResetPassword: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Cognito account service', () => {
  it('registers a USER with Cognito attributes', async () => {
    const dependencies = createDependencies();
    const service = createCognitoAccountService(dependencies);

    await expect(service.signUp({
      email: ' Member@example.test ',
      password: 'Strong-password-123!',
      fullName: 'Member Example',
      phone: '+84123456789',
    })).resolves.toEqual({
      needsConfirmation: true,
      destination: undefined,
    });

    expect(dependencies.signUp).toHaveBeenCalledWith({
      username: 'member@example.test',
      password: 'Strong-password-123!',
      options: {
        userAttributes: {
          email: 'member@example.test',
          name: 'Member Example',
          phone_number: '+84123456789',
        },
      },
    });
  });

  it('confirms a sign-up code for the normalized username', async () => {
    const dependencies = createDependencies();
    const service = createCognitoAccountService(dependencies);

    await service.confirmSignUp(' Member@example.test ', '123456');

    expect(dependencies.confirmSignUp).toHaveBeenCalledWith({
      username: 'member@example.test',
      confirmationCode: '123456',
    });
  });

  it('starts and completes the Cognito password reset flow', async () => {
    const dependencies = createDependencies();
    const service = createCognitoAccountService(dependencies);

    await service.resetPassword(' Member@example.test ');
    await service.confirmResetPassword(
      ' Member@example.test ',
      '123456',
      'New-strong-password-123!',
    );

    expect(dependencies.resetPassword).toHaveBeenCalledWith({
      username: 'member@example.test',
    });
    expect(dependencies.confirmResetPassword).toHaveBeenCalledWith({
      username: 'member@example.test',
      confirmationCode: '123456',
      newPassword: 'New-strong-password-123!',
    });
  });
});
