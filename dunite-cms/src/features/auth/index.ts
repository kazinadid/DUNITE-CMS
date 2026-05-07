export { AuthContext, AuthProvider } from './components/AuthProvider';
export { LoginForm } from './components/LoginForm';
export { LogoutButton } from './components/LogoutButton';
export { PasswordInput } from './components/PasswordInput';
export { SignupForm } from './components/SignupForm';
export {
  getSession,
  getUser,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from './services/authService';
export type { AuthContextValue, AuthResult, Role } from './types';
export { DEFAULT_ROLE } from './types';

// NOTE: server-only helpers live in `./server` and must NOT be re-exported
// here — pulling them into a client bundle would import `next/headers`
// and break the build.
