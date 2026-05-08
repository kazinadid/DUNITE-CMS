export { AuthContext, AuthProvider } from './components/AuthProvider';
export { AuthBrand } from './components/AuthBrand';
export { AuthShell } from './components/AuthShell';
export {
  AuthErrorBanner,
  AuthInfoBanner,
  AuthSuccessBanner,
} from './components/AuthAlerts';
export { LoginForm } from './components/LoginForm';
export { LogoutButton } from './components/LogoutButton';
export { PasswordInput } from './components/PasswordInput';
export { SignupForm } from './components/SignupForm';
export { ForgotPasswordForm } from './components/ForgotPasswordForm';
export {
  getSession,
  getUser,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  requestPasswordReset,
  mapAuthError,
} from './services/authService';
export type {
  AuthContextValue,
  AuthResult,
  Role,
  SignUpInput,
  SignUpResult,
} from './types';
export { DEFAULT_ROLE, SIGNUP_PASSWORD_MIN_LENGTH } from './types';

// NOTE: server-only helpers live in `./server` and must NOT be re-exported
// here — pulling them into a client bundle would import `next/headers`
// and break the build.
