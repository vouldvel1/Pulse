import { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { useCommunityStore } from '@/stores/communityStore';
import { channels as channelsApi } from '@/utils/api';
import type { ChannelType } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CHANNEL_TYPES: { type: ChannelType; icon: string; label: string; desc: string }[] = [
  { type: 'text', icon: 'tag', label: 'Текстовый', desc: 'Отправляйте сообщения и файлы' },
  { type: 'announcement', icon: 'campaign', label: 'Анонсы', desc: 'Объявления для участников' },
  { type: 'voice', icon: 'volume_up', label: 'Голосовой', desc: 'Общайтесь голосом' },
];

export function CreateChannelModal({ open, onClose }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('text');
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const activeCommunityId = useCommunityStore((s) => s.activeCommunityId);
  const addChannel = useCommunityStore((s) => s.addChannel);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !activeCommunityId) return;
    setIsLoading(true);
    setError('');
    try {
      const channel = await channelsApi.create(activeCommunityId, {
        name: name.trim(),
        type,
        topic: topic.trim() || undefined,
      });
      addChannel(activeCommunityId, channel);
      onClose();
      setName('');
      setTopic('');
      setType('text');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Создать канал" width={440}>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Channel type selector */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Тип канала
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CHANNEL_TYPES.map((ct) => (
              <button
                key={ct.type}
                type="button"
                onClick={() => setType(ct.type)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 14,
                  border: `1px solid ${type === ct.type ? 'var(--primary)' : 'rgba(255,255,255,0.08)'}`,
                  background: type === ct.type ? 'var(--primary-container)' : 'rgba(255,255,255,0.03)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: type === ct.type ? 'var(--primary)' : '#E6E1E5',
                  transition: 'all 0.15s ease',
                  fontFamily: 'inherit',
                }}
              >
                <span className="icon" style={{ fontSize: 22 }}>{ct.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{ct.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{ct.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Название канала"
          placeholder={type === 'voice' ? 'общий' : 'основной'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        {type !== 'voice' && (
          <Input
            label="Тема (необязательно)"
            placeholder="О чём этот канал?"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        )}

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
