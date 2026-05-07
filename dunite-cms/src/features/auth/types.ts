import type { Session, User } from '@supabase/supabase-js';

export type Role = 'admin' | 'editor' | 'viewer';

export const DEFAULT_ROLE: Role = 'viewer';

export type AuthResult = { error: string | null };

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}
