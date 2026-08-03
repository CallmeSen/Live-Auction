export type CognitoAccountDependencies = {
  signUp(input: {
    username: string;
    password: string;
    options: {
      userAttributes: Record<string, string>;
    };
  }): Promise<{
    nextStep?: {
      signUpStep?: string;
      codeDeliveryDetails?: { destination?: string };
    };
  }>;
  confirmSignUp(input: {
    username: string;
    confirmationCode: string;
  }): Promise<unknown>;
  resetPassword(input: { username: string }): Promise<unknown>;
  confirmResetPassword(input: {
    username: string;
    confirmationCode: string;
    newPassword: string;
  }): Promise<unknown>;
};

export type SignUpAccountInput = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
};

export type SignUpAccountResult = {
  needsConfirmation: boolean;
  destination?: string;
};

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function operationError(message: string): Error {
  return new Error(message);
}

export function createCognitoAccountService(
  dependencies: CognitoAccountDependencies,
) {
  return {
    async signUp(input: SignUpAccountInput): Promise<SignUpAccountResult> {
      const username = normalizeUsername(input.email);
      try {
        const result = await dependencies.signUp({
          username,
          password: input.password,
          options: {
            userAttributes: {
              email: username,
              name: input.fullName.trim(),
              phone_number: input.phone.trim(),
            },
          },
        });
        return {
          needsConfirmation: result.nextStep?.signUpStep !== 'DONE',
          destination: result.nextStep?.codeDeliveryDetails?.destination,
        };
      } catch {
        throw operationError('Unable to create account');
      }
    },

    async confirmSignUp(username: string, confirmationCode: string): Promise<void> {
      try {
        await dependencies.confirmSignUp({
          username: normalizeUsername(username),
          confirmationCode: confirmationCode.trim(),
        });
      } catch {
        throw operationError('Unable to confirm account');
      }
    },

    async resetPassword(username: string): Promise<void> {
      try {
        await dependencies.resetPassword({
          username: normalizeUsername(username),
        });
      } catch {
        throw operationError('Unable to send password reset code');
      }
    },

    async confirmResetPassword(
      username: string,
      confirmationCode: string,
      newPassword: string,
    ): Promise<void> {
      try {
        await dependencies.confirmResetPassword({
          username: normalizeUsername(username),
          confirmationCode: confirmationCode.trim(),
          newPassword,
        });
      } catch {
        throw operationError('Unable to reset password');
      }
    },
  };
}
