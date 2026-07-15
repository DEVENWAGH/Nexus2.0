"use client";

import { useEffect, useRef, useState } from "react";

const SPEAKING_THRESHOLD = 0.012;
const SPEAKING_HOLD_MS = 180;
const SILENCE_HOLD_MS = 320;

/**
 * Discord-style voice activity: green ring when the stream has speech energy.
 */
export function useVoiceActivity(
  stream: MediaStream | null | undefined,
  enabled = true,
): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingSinceRef = useRef(0);
  const silentSinceRef = useRef(0);
  const isSpeakingRef = useRef(false);

  useEffect(() => {
    if (!stream || !enabled) {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      return;
    }

    const audioTracks = stream.getAudioTracks().filter((t) => t.enabled && t.readyState === "live");
    if (audioTracks.length === 0) {
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      return;
    }

    let cancelled = false;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let rafId = 0;

    const start = async () => {
      try {
        audioContext = new AudioContext();
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        // Clone so Analyser's mute/suspend quirks don't affect playback tracks
        const monitorStream = new MediaStream(stream.getAudioTracks());
        source = audioContext.createMediaStreamSource(monitorStream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);

        const data = new Uint8Array(analyser.fftSize);

        const tick = () => {
          if (cancelled || !analyser) return;

          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i]! - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const now = performance.now();
          const hot = rms > SPEAKING_THRESHOLD;

          if (hot) {
            if (!speakingSinceRef.current) speakingSinceRef.current = now;
            silentSinceRef.current = 0;
            if (
              !isSpeakingRef.current &&
              now - speakingSinceRef.current >= SPEAKING_HOLD_MS
            ) {
              isSpeakingRef.current = true;
              setIsSpeaking(true);
            }
          } else {
            if (!silentSinceRef.current) silentSinceRef.current = now;
            speakingSinceRef.current = 0;
            if (
              isSpeakingRef.current &&
              now - silentSinceRef.current >= SILENCE_HOLD_MS
            ) {
              isSpeakingRef.current = false;
              setIsSpeaking(false);
            }
          }

          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      } catch (err) {
        console.warn("[VoiceActivity] analyser failed:", err);
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      try {
        source?.disconnect();
        analyser?.disconnect();
      } catch {
        /* ignore */
      }
      void audioContext?.close();
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      speakingSinceRef.current = 0;
      silentSinceRef.current = 0;
    };
  }, [stream, enabled]);

  return isSpeaking;
}
