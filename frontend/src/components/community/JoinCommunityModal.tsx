import { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { invites } from '@/utils/api';
import { useCommunityStore } from '@/stores/communityStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function JoinCommunityModal({ open, onClose }: Props) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const addCommunity = useCommunityStore((s) => s.addCommunity);
  const setActiveCommunity = useCommunityStore((s) => s.setActiveCommunity);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode) return;
    setIsLoading(true);
    setError('');
    try {
      const community = await invites.join(trimmedCode);
      addCommunity(community);
      setActiveCommunity(community.id);
      onClose();
      setCode('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Присоединиться к серверу" width={400}>
      <form onSubmit={(e) => void handleJoin(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--outline)', lineHeight: 1.5 }}>
          Введите код приглашения, чтобы присоединиться к серверу.
        </p>
        <Input
          label="Код приглашения"
          placeholder="abc123"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        {error && (
          <div style={{ background: 'rgba(242,184,181,0.1)', border: '1px solid var(--error)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--error)' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} type="button">Отмена</Button>
          <Button variant="primary" type="submit" loading={isLoading}>Присоединиться</Button>
        </div>
      </form>
    </Modal>
  );
}
