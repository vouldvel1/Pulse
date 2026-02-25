import { useState, useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { LoginForm, RegisterForm } from './components/auth/AuthForm';
import { AppLayout } from './components/layout/AppLayout';
import './styles/global.css';

type AuthView = 'login' | 'register';

function App() {
  const { isAuthenticated, isLoading, fetchMe } = useAuthStore();
  const [authView, setAuthView] = useState<AuthView>('login');

  useEffect(() => {
    // Try to restore session from stored tokens
    if (isAuthenticated) {
      fetchMe().catch(() => {
        // Will set isAuthenticated to false on failure
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading && isAuthenticated) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
        fontSize: '1.125rem',
      }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return authView === 'login' ? (
      <LoginForm onSwitch={() => setAuthView('register')} />
    ) : (
      <RegisterForm onSwitch={() => setAuthView('login')} />
    );
  }

  return <AppLayout />;
}

export default App;
