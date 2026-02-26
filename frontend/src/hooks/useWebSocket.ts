import { useEffect } from 'react';
import { wsClient } from '@/utils/wsClient';
import { useMessageStore } from '@/stores/messageStore';
import { useDMStore } from '@/stores/dmStore';
import { useVoiceStore } from '@/stores/voiceStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useUIStore } from '@/stores/uiStore';
import type { Message, DMMessage, DMChannel, VoiceParticipant, Community, Channel, Embed } from '@/types';

export function useWebSocket() {
  const addMessage = useMessageStore((s) => s.addMessage);
  const updateMessage = useMessageStore((s) => s.updateMessage);
  const removeMessage = useMessageStore((s) => s.removeMessage);
  const updateEmbeds = useMessageStore((s) => s.updateEmbeds);
  const addReaction = useMessageStore((s) => s.addReaction);
  const removeReaction = useMessageStore((s) => s.removeReaction);

  const addDMMessage = useDMStore((s) => s.addMessage);
  const updateDMMessage = useDMStore((s) => s.updateMessage);
  const removeDMMessage = useDMStore((s) => s.removeMessage);
  const addDMChannel = useDMStore((s) => s.addChannel);

  const addVoiceParticipant = useVoiceStore((s) => s.addParticipant);
  const removeVoiceParticipant = useVoiceStore((s) => s.removeParticipant);
  const updateVoiceParticipant = useVoiceStore((s) => s.updateParticipant);
  const setSpeaking = useVoiceStore((s) => s.setSpeaking);

  const updateCommunity = useCommunityStore((s) => s.updateCommunity);
  const updateChannel = useCommunityStore((s) => s.updateChannel);

  const addTypingUser = useUIStore((s) => s.addTypingUser);

  useEffect(() => {
    const unsubs = [
      wsClient.on('message', (p) => addMessage(p as unknown as Message)),
      wsClient.on('message_edit', (p) => updateMessage(p as unknown as Message)),
      wsClient.on('message_delete', (p) => {
        const { id, channel_id } = p as { id: string; channel_id: string };
        removeMessage(channel_id, id);
      }),
      wsClient.on('message_embeds', (p) => {
        const { message_id, channel_id, embeds } = p as { message_id: string; channel_id: string; embeds: Embed[] };
        updateEmbeds(channel_id, message_id, embeds);
      }),
      wsClient.on('reaction', (p) => {
        const { message_id, channel_id, emoji, user_id } = p as { message_id: string; channel_id: string; emoji: string; user_id: string };
        addReaction(channel_id, message_id, emoji, user_id);
      }),
      wsClient.on('reaction_remove', (p) => {
        const { message_id, channel_id, emoji, user_id } = p as { message_id: string; channel_id: string; emoji: string; user_id: string };
        removeReaction(channel_id, message_id, emoji, user_id);
      }),

      wsClient.on('dm_message', (p) => addDMMessage(p as unknown as DMMessage)),
      wsClient.on('dm_message_edit', (p) => updateDMMessage(p as unknown as DMMessage)),
      wsClient.on('dm_message_delete', (p) => {
        const { id, channel_id } = p as { id: string; channel_id: string };
        removeDMMessage(channel_id, id);
      }),
      wsClient.on('dm_channel_create', (p) => addDMChannel(p as unknown as DMChannel)),

      wsClient.on('voice_join', (p) => {
        const participant = p as unknown as VoiceParticipant & { channel_id: string };
        const voiceStore = useVoiceStore.getState();
        if (voiceStore.channelId === participant.channel_id) {
          addVoiceParticipant(participant);
        }
      }),
      wsClient.on('voice_leave', (p) => {
        const { user_id } = p as { user_id: string };
        removeVoiceParticipant(user_id);
      }),
      wsClient.on('voice_state', (p) => {
        const { user_id, self_mute, self_deaf } = p as { user_id: string; self_mute: boolean; self_deaf: boolean };
        updateVoiceParticipant(user_id, { self_mute, self_deaf });
      }),
      wsClient.on('voice:speaking', (p) => {
        const { user_id, is_speaking } = p as { user_id: string; is_speaking: boolean };
        setSpeaking(user_id, is_speaking);
      }),

      wsClient.on('typing', (p) => {
        const { channel_id, user_id, username } = p as { channel_id: string; user_id: string; username: string };
        addTypingUser(channel_id, user_id, username);
      }),

      wsClient.on('community_update', (p) => updateCommunity(p as unknown as Community)),
      wsClient.on('channel_update', (p) => updateChannel(p as unknown as Channel)),
    ];

    return () => unsubs.forEach((fn) => fn());
  }, [
    addMessage, updateMessage, removeMessage, updateEmbeds, addReaction, removeReaction,
    addDMMessage, updateDMMessage, removeDMMessage, addDMChannel,
    addVoiceParticipant, removeVoiceParticipant, updateVoiceParticipant, setSpeaking,
    updateCommunity, updateChannel, addTypingUser,
  ]);
}
