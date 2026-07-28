export type AuthRole = 'ADMIN' | 'SELLER' | 'BIDDER';

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
