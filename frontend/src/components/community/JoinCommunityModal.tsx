import { useState } from 'react';
import { useCommunityStore } from '../../stores/communityStore';
import { useChannelStore } from '../../stores/channelStore';
import styles from './CreateCommunityModal.module.css';

interface Props {
  onClose: () => void;
}

export function JoinCommunityModal({ onClose }: Props) {
  const { joinCommunity, setActiveCommunity } = useCommunityStore();
  const { fetchChannels } = useChannelStore();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const community = await joinCommunity(code.trim());
      setActiveCommunity(community.id);
      fetchChannels(community.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join community');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Join a Community</h2>
        <p className={styles.subtitle}>Enter an invite code to join an existing community.</p>

        <form onSubmit={handleSubmit}>
          <label className={styles.label}>
            Invite Code
            <input
              className={styles.input}
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. a1b2c3d4e5f6"
              autoFocus
            />
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submitBtn} disabled={isLoading || !code.trim()}>
              {isLoading ? 'Joining...' : 'Join'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
