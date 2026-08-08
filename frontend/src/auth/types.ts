export type AuthRole = 'ADMIN' | 'USER';

export type AuthSession = {
  sub: string;
  email: string;
  role: AuthRole;
};

export interface CognitoAuthAdapter {
  signIn(username: string, password: string): Promise<AuthSession>;
  restore(): Promise<AuthSession | null>;
  idToken(): Promise<string>;
  signOut(): Promise<void>;
}
