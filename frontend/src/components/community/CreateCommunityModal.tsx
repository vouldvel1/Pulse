import { useState } from 'react';
import { useCommunityStore } from '../../stores/communityStore';
import { useChannelStore } from '../../stores/channelStore';
import styles from './CreateCommunityModal.module.css';

interface Props {
  onClose: () => void;
}

export function CreateCommunityModal({ onClose }: Props) {
  const { createCommunity, setActiveCommunity } = useCommunityStore();
  const { fetchChannels } = useChannelStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const community = await createCommunity(name.trim(), description.trim() || undefined);
      setActiveCommunity(community.id);
      fetchChannels(community.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create community');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Create a Community</h2>
        <p className={styles.subtitle}>Give your community a name and an optional description.</p>

        <form onSubmit={handleSubmit}>
          <label className={styles.label}>
            Community Name
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Community"
              maxLength={100}
              autoFocus
            />
          </label>

          <label className={styles.label}>
            Description (optional)
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this community about?"
              rows={3}
            />
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submitBtn} disabled={isLoading || !name.trim()}>
              {isLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
