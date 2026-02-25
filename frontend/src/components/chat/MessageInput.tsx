import { useState, useRef, useCallback, useEffect } from 'react';
import { useMessageStore } from '../../stores/messageStore';
import { useChannelStore } from '../../stores/channelStore';
import { wsClient } from '../../utils/websocket';
import styles from './MessageInput.module.css';

interface Props {
  channelId: string;
}

export function MessageInput({ channelId }: Props) {
  const { sendMessage, uploadFile, isSending } = useMessageStore();
  const { channels } = useChannelStore();
  const [content, setContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [wsConnected, setWsConnected] = useState(wsClient.connected);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const channel = channels.find((ch) => ch.id === channelId);

  // Track WebSocket connectivity
  useEffect(() => {
    const onConnected = () => setWsConnected(true);
    const onDisconnected = () => setWsConnected(false);
    const unsubs = [
      wsClient.on('connected', onConnected),
      wsClient.on('disconnected', onDisconnected),
    ];
    // Sync initial state
    setWsConnected(wsClient.connected);
    return () => { unsubs.forEach((u) => u()); };
  }, []);

  const handleTyping = useCallback(() => {
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    wsClient.send('typing', { channel_id: channelId });
    typingTimeout.current = setTimeout(() => {
      typingTimeout.current = null;
    }, 3000);
  }, [channelId]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedFile) {
      await uploadFile(channelId, selectedFile, content.trim() || undefined);
      setSelectedFile(null);
      setContent('');
      return;
    }

    if (!content.trim()) return;

    try {
      await sendMessage(channelId, content.trim());
      setContent('');
    } catch {
      // error is set in store
    }
  }, [channelId, content, selectedFile, sendMessage, uploadFile]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        alert('File size must be under 25MB');
        return;
      }
      setSelectedFile(file);
    }
  }, []);

  const removeFile = useCallback(() => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <form className={styles.container} onSubmit={handleSubmit}>
      {!wsConnected && (
        <div className={styles.connectingLabel}>
          Connecting...
        </div>
      )}
      {selectedFile && (
        <div className={styles.filePreview}>
          <span className={styles.filePreviewName}>{selectedFile.name}</span>
          <button type="button" className={styles.fileRemove} onClick={removeFile}>×</button>
        </div>
      )}
      <div className={styles.inputRow}>
        <button
          type="button"
          className={styles.uploadBtn}
          onClick={() => fileInputRef.current?.click()}
          title="Upload file"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className={styles.fileInput}
        />
        <textarea
          className={styles.input}
          placeholder={`Message #${channel?.name ?? 'channel'}`}
          value={content}
          onChange={(e) => { setContent(e.target.value); handleTyping(); }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isSending}
        />
        <button
          type="submit"
          className={styles.sendBtn}
          disabled={isSending || (!content.trim() && !selectedFile)}
          title="Send message"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22,2 15,22 11,13 2,9"/>
          </svg>
        </button>
      </div>
    </form>
  );
}
