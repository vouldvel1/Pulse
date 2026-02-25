import { useState, useRef, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import styles from './ProfileModal.module.css';

type Tab = 'profile' | 'account' | 'danger';

interface Props {
  onClose: () => void;
}

export function ProfileModal({ onClose }: Props) {
  const { user, updateProfile, uploadAvatar, uploadBanner, changePassword, deleteAccount, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // Profile fields
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [customStatus, setCustomStatus] = useState(user?.custom_status ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Account fields
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMsg, setAccountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete account
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // File refs
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const getInitials = (name: string): string =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  // ─── Profile save ───
  const handleProfileSave = useCallback(async () => {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const fields: Record<string, string> = {};
      if (displayName !== user?.display_name) fields.display_name = displayName;
      if (bio !== (user?.bio ?? '')) fields.bio = bio;
      if (customStatus !== (user?.custom_status ?? '')) fields.custom_status = customStatus;

      if (Object.keys(fields).length === 0) {
        setProfileMsg({ type: 'success', text: 'No changes to save.' });
        setProfileSaving(false);
        return;
      }

      await updateProfile(fields);
      setProfileMsg({ type: 'success', text: 'Profile updated!' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update profile' });
    } finally {
      setProfileSaving(false);
    }
  }, [displayName, bio, customStatus, user, updateProfile]);

  // ─── Account save ───
  const handleAccountSave = useCallback(async () => {
    setAccountSaving(true);
    setAccountMsg(null);
    try {
      const fields: Record<string, string> = {};
      if (username !== user?.username) fields.username = username;
      if (email !== user?.email) fields.email = email;

      if (Object.keys(fields).length === 0) {
        setAccountMsg({ type: 'success', text: 'No changes to save.' });
        setAccountSaving(false);
        return;
      }

      await updateProfile(fields);
      setAccountMsg({ type: 'success', text: 'Account updated!' });
    } catch (err) {
      setAccountMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update account' });
    } finally {
      setAccountSaving(false);
    }
  }, [username, email, user, updateProfile]);

  // ─── Password change ───
  const handlePasswordChange = useCallback(async () => {
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'New password must be at least 8 characters' });
      return;
    }
    setPasswordSaving(true);
    setPasswordMsg(null);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordMsg({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to change password' });
    } finally {
      setPasswordSaving(false);
    }
  }, [currentPassword, newPassword, confirmPassword, changePassword]);

  // ─── Avatar upload ───
  const handleAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadAvatar(file);
    } catch (err) {
      setProfileMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to upload avatar' });
    }
    // Reset input so user can re-upload same file
    e.target.value = '';
  }, [uploadAvatar]);

  // ─── Banner upload ───
  const handleBannerChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadBanner(file);
    } catch (err) {
      setProfileMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to upload banner' });
    }
    e.target.value = '';
  }, [uploadBanner]);

  // ─── Delete account ───
  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirm !== user?.username) {
      setDeleteMsg({ type: 'error', text: 'Please type your username to confirm' });
      return;
    }
    if (!deletePassword) {
      setDeleteMsg({ type: 'error', text: 'Password is required' });
      return;
    }
    setDeleting(true);
    setDeleteMsg(null);
    try {
      await deleteAccount(deletePassword);
      await logout();
    } catch (err) {
      setDeleteMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete account' });
      setDeleting(false);
    }
  }, [deleteConfirm, deletePassword, user, deleteAccount, logout]);

  const profileDirty = displayName !== (user?.display_name ?? '') ||
    bio !== (user?.bio ?? '') ||
    customStatus !== (user?.custom_status ?? '');

  const accountDirty = username !== (user?.username ?? '') ||
    email !== (user?.email ?? '');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* ─── Sidebar nav ─── */}
        <div className={styles.sidebar}>
          <button
            className={activeTab === 'profile' ? styles.navItemActive : styles.navItem}
            onClick={() => setActiveTab('profile')}
          >
            My Profile
          </button>
          <button
            className={activeTab === 'account' ? styles.navItemActive : styles.navItem}
            onClick={() => setActiveTab('account')}
          >
            Account
          </button>
          <div className={styles.navDivider} />
          <button
            className={styles.navDanger}
            onClick={() => setActiveTab('danger')}
          >
            Delete Account
          </button>
        </div>

        {/* ─── Content ─── */}
        <div className={styles.content}>
          <div className={styles.contentHeader}>
            <h2 className={styles.contentTitle}>
              {activeTab === 'profile' && 'My Profile'}
              {activeTab === 'account' && 'Account Settings'}
              {activeTab === 'danger' && 'Delete Account'}
            </h2>
            <button className={styles.closeBtn} onClick={onClose} title="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* ─── Profile Tab ─── */}
          {activeTab === 'profile' && (
            <>
              {/* Banner + Avatar preview */}
              <div className={styles.profilePreview}>
                <div className={styles.bannerArea} onClick={() => bannerInputRef.current?.click()}>
                  {user?.banner_url ? (
                    <img className={styles.bannerImg} src={user.banner_url} alt="Banner" />
                  ) : null}
                  <div className={styles.bannerOverlay}>Change Banner</div>
                </div>
                <div className={styles.avatarWrapper}>
                  <div className={styles.avatarLarge} onClick={() => avatarInputRef.current?.click()}>
                    {user?.avatar_url ? (
                      <img className={styles.avatarLargeImg} src={user.avatar_url} alt={user.display_name} />
                    ) : (
                      getInitials(user?.display_name ?? '??')
                    )}
                    <div className={styles.avatarOverlay}>Edit</div>
                  </div>
                </div>
              </div>
              <div className={styles.avatarSpacer} />

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className={styles.hiddenInput}
                onChange={handleAvatarChange}
              />
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className={styles.hiddenInput}
                onChange={handleBannerChange}
              />

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Display Name</label>
                <input
                  className={styles.input}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={64}
                  placeholder="Your display name"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Bio</label>
                <textarea
                  className={styles.textarea}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={500}
                  placeholder="Tell us about yourself..."
                  rows={3}
                />
                <div className={styles.charCount}>{bio.length}/500</div>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Custom Status</label>
                <input
                  className={styles.input}
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
                  maxLength={128}
                  placeholder="What are you up to?"
                />
              </div>

              {profileMsg && (
                <div className={profileMsg.type === 'success' ? styles.success : styles.error}>
                  {profileMsg.text}
                </div>
              )}

              <div className={styles.btnRow}>
                <button
                  className={styles.cancelBtn}
                  onClick={() => {
                    setDisplayName(user?.display_name ?? '');
                    setBio(user?.bio ?? '');
                    setCustomStatus(user?.custom_status ?? '');
                    setProfileMsg(null);
                  }}
                  disabled={!profileDirty}
                >
                  Reset
                </button>
                <button
                  className={styles.saveBtn}
                  onClick={handleProfileSave}
                  disabled={profileSaving || !profileDirty}
                >
                  {profileSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </>
          )}

          {/* ─── Account Tab ─── */}
          {activeTab === 'account' && (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Username</label>
                <input
                  className={styles.input}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={32}
                  placeholder="username"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              {accountMsg && (
                <div className={accountMsg.type === 'success' ? styles.success : styles.error}>
                  {accountMsg.text}
                </div>
              )}

              <div className={styles.btnRow}>
                <button
                  className={styles.cancelBtn}
                  onClick={() => {
                    setUsername(user?.username ?? '');
                    setEmail(user?.email ?? '');
                    setAccountMsg(null);
                  }}
                  disabled={!accountDirty}
                >
                  Reset
                </button>
                <button
                  className={styles.saveBtn}
                  onClick={handleAccountSave}
                  disabled={accountSaving || !accountDirty}
                >
                  {accountSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>

              {/* Password section */}
              <div className={styles.navDivider} style={{ margin: '1.5rem 0' }} />

              <h3 className={styles.contentTitle} style={{ fontSize: '1rem', marginBottom: '1rem' }}>
                Change Password
              </h3>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Current Password</label>
                <input
                  className={styles.input}
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>New Password</label>
                <input
                  className={styles.input}
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Confirm New Password</label>
                <input
                  className={styles.input}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>

              {passwordMsg && (
                <div className={passwordMsg.type === 'success' ? styles.success : styles.error}>
                  {passwordMsg.text}
                </div>
              )}

              <div className={styles.btnRow}>
                <button
                  className={styles.saveBtn}
                  onClick={handlePasswordChange}
                  disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                >
                  {passwordSaving ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </>
          )}

          {/* ─── Danger Tab ─── */}
          {activeTab === 'danger' && (
            <div className={styles.dangerSection}>
              <div className={styles.dangerTitle}>Delete Your Account</div>
              <div className={styles.dangerText}>
                This action is permanent and cannot be undone. All your data, messages, and memberships will be removed.
                To confirm, type your username <strong>{user?.username}</strong> below.
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Confirm Username</label>
                <input
                  className={styles.input}
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={user?.username ?? 'your username'}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Password</label>
                <input
                  className={styles.input}
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </div>

              {deleteMsg && (
                <div className={deleteMsg.type === 'success' ? styles.success : styles.error}>
                  {deleteMsg.text}
                </div>
              )}

              <div className={styles.btnRow}>
                <button
                  className={styles.dangerBtn}
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteConfirm !== user?.username || !deletePassword}
                >
                  {deleting ? 'Deleting...' : 'Permanently Delete Account'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
