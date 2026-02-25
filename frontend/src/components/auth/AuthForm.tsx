import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../../stores/authStore';
import styles from './AuthForm.module.css';

export function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const { login, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await login(email, password);
    } catch {
      // Error is already set in the store
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/pulse.svg" alt="Pulse" className={styles.logoIcon} />
          <span className={styles.logoText}>Pulse</span>
        </div>
        <h1 className={styles.title}>Welcome back!</h1>
        <p className={styles.subtitle}>We're so excited to see you again!</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">Email</label>
            <input
              id="email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Password</label>
            <input
              id="password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              minLength={8}
            />
          </div>

          <button className={styles.button} type="submit" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <div className={styles.footer}>
          Need an account?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); onSwitch(); }}>
            Register
          </a>
        </div>
      </div>
    </div>
  );
}

export function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const { register, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError('');

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    try {
      await register(email, username, displayName || username, password);
    } catch {
      // Error is already set in the store
    }
  };

  const displayError = localError || error;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/pulse.svg" alt="Pulse" className={styles.logoIcon} />
          <span className={styles.logoText}>Pulse</span>
        </div>
        <h1 className={styles.title}>Create an account</h1>
        <p className={styles.subtitle}>Join Pulse and start chatting</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {displayError && <div className={styles.error}>{displayError}</div>}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="reg-username">Username</label>
            <input
              id="reg-username"
              className={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="Choose a username"
              required
              autoComplete="username"
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9_]{3,32}"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="reg-display">Display Name</label>
            <input
              id="reg-display"
              className={styles.input}
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should others see you?"
              maxLength={64}
              autoComplete="name"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              required
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="reg-confirm">Confirm Password</label>
            <input
              id="reg-confirm"
              className={styles.input}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>

          <button className={styles.button} type="submit" disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className={styles.footer}>
          Already have an account?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); onSwitch(); }}>
            Log in
          </a>
        </div>
      </div>
    </div>
  );
}
