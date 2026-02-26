import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(username, email, password);
      }
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        padding: 24,
      }}
    >
      {/* Background decoration */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(ellipse at 20% 50%, rgba(208,188,255,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(208,188,255,0.05) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      <div
        className="animate-scale-in"
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'rgba(28,27,33,0.9)',
          backdropFilter: 'blur(40px)',
          borderRadius: 32,
          padding: 40,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <span className="icon" style={{ fontSize: 32, color: 'var(--primary)' }}>bolt</span>
          <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--primary)' }}>pulse</span>
          <span style={{ fontSize: 12, color: 'var(--outline)', marginTop: 6 }}>(beta)</span>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 16,
            padding: 4,
            marginBottom: 28,
          }}
        >
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 12,
                border: 'none',
                background: mode === m ? 'var(--primary)' : 'transparent',
                color: mode === m ? 'var(--on-primary)' : 'var(--outline)',
                fontWeight: mode === m ? 700 : 400,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {m === 'login' ? 'Войти' : 'Регистрация'}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {mode === 'register' && (
            <Input
              label="Имя пользователя"
              placeholder="python4k"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          )}
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            label="Пароль"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {error && (
            <div
              style={{
                background: 'rgba(242,184,181,0.1)',
                border: '1px solid var(--error)',
                borderRadius: 12,
                padding: '10px 14px',
                fontSize: 13,
                color: 'var(--error)',
              }}
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={isLoading}
            style={{ marginTop: 4 }}
          >
            {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </Button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--outline)', marginTop: 20 }}>
          {mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--primary)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </p>
      </div>
    </div>
  );
}
