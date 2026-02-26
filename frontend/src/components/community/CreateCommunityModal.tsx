import { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { useCommunityStore } from '@/stores/communityStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateCommunityModal({ open, onClose }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const createCommunity = useCommunityStore((s) => s.createCommunity);
  const setActiveCommunity = useCommunityStore((s) => s.setActiveCommunity);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsLoading(true);
    setError('');
    try {
      const community = await createCommunity(name.trim(), description.trim() || undefined);
      setActiveCommunity(community.id);
      onClose();
      setName('');
      setDescription('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Создать сервер" width={440}>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          label="Название сервера"
          placeholder="Мой крутой сервер"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Описание (необязательно)"
          placeholder="Расскажи о своём сервере..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* Visibility */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Видимость
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['private', 'public'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 14,
                  border: `1px solid ${visibility === v ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`,
                  background: visibility === v ? 'var(--primary-container)' : 'transparent',
                  color: visibility === v ? 'var(--primary)' : 'var(--outline)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: visibility === v ? 700 : 400,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span className="icon" style={{ fontSize: 20 }}>{v === 'public' ? 'public' : 'lock'}</span>
                {v === 'public' ? 'Публичный' : 'Приватный'}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(242,184,181,0.1)', border: '1px solid var(--error)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--error)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose} type="button">Отмена</Button>
          <Button variant="primary" type="submit" loading={isLoading}>Создать</Button>
        </div>
      </form>
    </Modal>
  );
}
