import { useEffect, useRef } from 'react';
import { useVoiceStore } from '../stores/voiceStore';
import { wsClient } from '../utils/websocket';

const PING_INTERVAL_MS = 3000;
const SAMPLE_COUNT = 5;

/**
 * useVoicePing sends application-level ping/pong messages every 3 seconds
 * while connected to a voice channel, computes a rolling 5-sample average
 * RTT, and stores it in the voice store.
 */
export function useVoicePing() {
  const isConnected = useVoiceStore((s) => s.isConnected);
  const setPing = useVoiceStore((s) => s.setPing);

  const samplesRef = useRef<number[]>([]);
  const sentAtRef = useRef<number>(0);

  useEffect(() => {
    if (!isConnected) {
      samplesRef.current = [];
      setPing(-1);
      return;
    }

    // Listen for pong responses
    const unsub = wsClient.on('pong', () => {
      if (sentAtRef.current === 0) return;
      const rtt = Date.now() - sentAtRef.current;
      sentAtRef.current = 0;

      const samples = samplesRef.current;
      samples.push(rtt);
      if (samples.length > SAMPLE_COUNT) {
        samples.shift();
      }

      // Calculate rolling average
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      setPing(avg);
    });

    // Send ping every PING_INTERVAL_MS
    const interval = window.setInterval(() => {
      sentAtRef.current = Date.now();
      wsClient.send('ping', {});
    }, PING_INTERVAL_MS);

    // Send first ping immediately
    sentAtRef.current = Date.now();
    wsClient.send('ping', {});

    return () => {
      unsub();
      clearInterval(interval);
      samplesRef.current = [];
    };
  }, [isConnected, setPing]);
}
