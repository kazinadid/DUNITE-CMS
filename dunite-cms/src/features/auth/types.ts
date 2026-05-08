import type { Session, User } from '@supabase/supabase-js';

export type Role = 'admin' | 'editor' | 'viewer';

export const DEFAULT_ROLE: Role = 'viewer';

/** Minimum password length enforced in signup UI (Supabase project may differ). */
export const SIGNUP_PASSWORD_MIN_LENGTH = 8;

export type AuthResult = { error: string | null };

export interface SignUpInput {
  email:     string;
  password:  string;
  fullName:  string;
}

export type SignUpResult = {
  error: string | null;
  /** True when Supabase returned a session (e.g. email confirmation disabled). */
  hasSession: boolean;
};

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}
