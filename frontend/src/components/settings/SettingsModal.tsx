import { useState, useRef } from 'react';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { Avatar } from '@/components/common/Avatar';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { users as usersApi } from '@/utils/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = 'profile' | 'account' | 'appearance';

export function SettingsModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('profile');
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [customStatus, setCustomStatus] = useState(user?.custom_status ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  const currentTheme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const updated = await usersApi.updateMe({
        display_name: displayName || undefined,
        bio: bio || undefined,
        custom_status: customStatus || undefined,
      });
      updateUser(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (file: File) => {
    try {
      const updated = await usersApi.uploadAvatar(file);
      updateUser(updated);
    } catch { /* ignore */ }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwLoading(true);
    setPwError('');
    setPwSuccess(false);
    try {
      await usersApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 2000);
    } catch (err) {
      setPwError((err as Error).message);
    } finally {
      setPwLoading(false);
    }
  };

  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: 'profile', icon: 'person', label: 'Профиль' },
    { key: 'account', icon: 'manage_accounts', label: 'Аккаунт' },
    { key: 'appearance', icon: 'palette', label: 'Внешний вид' },
  ];

  return (
    <Modal open={open} onClose={onClose} width={600}>
      <div style={{ display: 'flex', gap: 20, minHeight: 400 }}>
        {/* Sidebar */}
        <div style={{ width: 140, flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Настройки</div>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 12,
                border: 'none',
                background: tab === t.key ? 'var(--primary-container)' : 'transparent',
                color: tab === t.key ? 'var(--primary)' : 'var(--outline)',
                fontSize: 13,
                fontWeight: tab === t.key ? 700 : 400,
                cursor: 'pointer',
                width: '100%',
                marginBottom: 4,
                textAlign: 'left',
              }}
            >
              <span className="icon" style={{ fontSize: 18 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}

          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '12px 0' }} />

          <button
            onClick={() => void logout()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 12,
              border: 'none',
              background: 'transparent',
              color: 'var(--error)',
              fontSize: 13,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <span className="icon" style={{ fontSize: 18 }}>logout</span>
            Выйти
          </button>
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'profile' && (
            <form onSubmit={(e) => void handleSaveProfile(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Профиль</div>

              {/* Avatar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ position: 'relative' }}>
                  <Avatar
                    src={user?.avatar_url}
                    name={user?.display_name ?? user?.username}
                    size={72}
                    radius={20}
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 20,
                      background: 'rgba(0,0,0,0.5)',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0,
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
                  >
                    <span className="icon">photo_camera</span>
                  </button>
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{user?.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--outline)' }}>{user?.email}</div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    style={{
                      marginTop: 6,
                      background: 'rgba(255,255,255,0.05)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '4px 10px',
                      color: 'var(--outline)',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Изменить аватар
                  </button>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleAvatarChange(file);
                    e.target.value = '';
                  }}
                />
              </div>

              <Input
                label="Отображаемое имя"
                placeholder={user?.username ?? 'Имя'}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  Обо мне
                </div>
                <textarea
                  placeholder="Расскажи о себе..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 14,
                    padding: '10px 14px',
                    color: '#E6E1E5',
                    outline: 'none',
                    resize: 'vertical',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    minHeight: 80,
                  }}
                />
              </div>
              <Input
                label="Статус"
                placeholder="Что сейчас делаешь?"
                value={customStatus}
                onChange={(e) => setCustomStatus(e.target.value)}
              />

              {saveError && (
                <div style={{ background: 'rgba(242,184,181,0.1)', border: '1px solid var(--error)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--error)' }}>
                  {saveError}
                </div>
              )}

              {saveSuccess && (
                <div style={{ background: 'rgba(129,199,132,0.1)', border: '1px solid var(--success)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--success)' }}>
                  Сохранено!
                </div>
              )}

              <Button type="submit" variant="primary" loading={isSaving}>Сохранить</Button>
            </form>
          )}

          {tab === 'account' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Аккаунт</div>

              <form onSubmit={(e) => void handleChangePassword(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Изменить пароль</div>
                <Input
                  label="Текущий пароль"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                <Input
                  label="Новый пароль"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                {pwError && (
                  <div style={{ background: 'rgba(242,184,181,0.1)', border: '1px solid var(--error)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--error)' }}>
                    {pwError}
                  </div>
                )}
                {pwSuccess && (
                  <div style={{ background: 'rgba(129,199,132,0.1)', border: '1px solid var(--success)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--success)' }}>
                    Пароль изменён!
                  </div>
                )}
                <Button type="submit" variant="primary" loading={pwLoading}>Изменить пароль</Button>
              </form>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />

              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Опасная зона</div>
                <Button
                  variant="danger"
                  onClick={() => void logout()}
                  icon="logout"
                >
                  Выйти из аккаунта
                </Button>
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Внешний вид</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--outline)' }}>
                Выберите основной цвет интерфейса
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {([
                  { key: 'purple', primary: '#D0BCFF', label: 'Фиолетовый' },
                  { key: 'green',  primary: '#B4E197', label: 'Зелёный' },
                  { key: 'blue',   primary: '#A1CFFF', label: 'Синий' },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTheme(t.key)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                      padding: 12,
                      borderRadius: 16,
                      border: `2px solid ${currentTheme === t.key ? t.primary : 'rgba(255,255,255,0.08)'}`,
                      background: currentTheme === t.key ? `${t.primary}20` : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      color: currentTheme === t.key ? t.primary : 'var(--outline)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: t.primary }} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
