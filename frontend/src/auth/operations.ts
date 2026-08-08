import type { CognitoAccountDependencies } from './account';

type UserOperationDependencies = CognitoAccountDependencies;

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function createCognitoUserOperations(dependencies: UserOperationDependencies) {
  return {
    async signUp(input: {
      email: string;
      password: string;
      fullName: string;
      phone: string;
    }) {
      const result = await dependencies.signUp({
        username: normalizeUsername(input.email),
        password: input.password,
        options: {
          userAttributes: {
            email: normalizeUsername(input.email),
            name: input.fullName.trim(),
            phone_number: input.phone.trim(),
          },
        },
      });
      return {
        isSignUpComplete: result.nextStep?.signUpStep === 'DONE',
        nextStep: result.nextStep?.signUpStep,
      };
    },

    async confirmSignUp(username: string, confirmationCode: string) {
      const result = await dependencies.confirmSignUp({
        username: normalizeUsername(username),
        confirmationCode: confirmationCode.trim(),
      }) as { isSignUpComplete?: boolean; nextStep?: { signUpStep?: string } };
      return {
        isSignUpComplete: result.isSignUpComplete ?? true,
        nextStep: result.nextStep?.signUpStep,
      };
    },

    async resetPassword(username: string) {
      const result = await dependencies.resetPassword({ username: normalizeUsername(username) }) as {
        nextStep?: { resetPasswordStep?: string };
      };
      return { nextStep: result.nextStep?.resetPasswordStep };
    },

    async confirmResetPassword(username: string, confirmationCode: string, newPassword: string) {
      await dependencies.confirmResetPassword({
        username: normalizeUsername(username),
        confirmationCode: confirmationCode.trim(),
        newPassword,
      });
    },
  };
}
