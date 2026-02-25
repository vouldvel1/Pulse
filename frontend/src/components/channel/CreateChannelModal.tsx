import { useState } from 'react';
import { useChannelStore } from '../../stores/channelStore';
import type { ChannelType } from '../../types';
import styles from '../community/CreateCommunityModal.module.css';

interface Props {
  communityId: string;
  onClose: () => void;
}

export function CreateChannelModal({ communityId, onClose }: Props) {
  const { createChannel } = useChannelStore();
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('text');
  const [topic, setTopic] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      await createChannel(communityId, name.trim(), type, topic.trim() || undefined, isPrivate);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Create Channel</h2>
        <p className={styles.subtitle}>Add a new channel to your community.</p>

        <form onSubmit={handleSubmit}>
          <label className={styles.label}>
            Channel Name
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="general"
              maxLength={100}
              autoFocus
            />
          </label>

          <label className={styles.label}>
            Type
            <select
              className={styles.input}
              value={type}
              onChange={(e) => setType(e.target.value as ChannelType)}
            >
              <option value="text">Text</option>
              <option value="voice">Voice</option>
              <option value="announcement">Announcement</option>
              <option value="category">Category</option>
            </select>
          </label>

          {type !== 'category' && (
            <label className={styles.label}>
              Topic (optional)
              <input
                className={styles.input}
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What's this channel about?"
              />
            </label>
          )}

          {type !== 'category' && (
            <label className={styles.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'none', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              <span>Private channel</span>
            </label>
          )}

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isLoading || !name.trim()}
            >
              {isLoading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
