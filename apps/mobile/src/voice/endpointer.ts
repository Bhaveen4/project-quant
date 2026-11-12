/**
 * Lightweight on-device end-of-speech detector.
 *
 * Gemini's own voice activity detection waits for its silence window and then
 * finalizes; noticing the pause locally and sending `audioStreamEnd` straight
 * away takes several hundred milliseconds off every answer. If this detector
 * misjudges a noisy room it simply stays quiet and the server's detection
 * still finalizes the transcript, only later.
 */

export type EndpointEvent = "speech_start" | "speech_end";

export type EndpointerOptions = {
  /** Silence after speech before the utterance counts as finished. */
  endSilenceMs: number;
  /** Continuous voiced audio required before speech counts as started. */
  startSpeechMs: number;
  /** Int16 RMS level below which nothing counts as speech. */
  minSpeechRms: number;
  /** How far above the background level speech must be. */
  speechToNoiseRatio: number;
  /** Re-baseline if "speech" never ends (e.g. a loud fan switched on). */
  maxSpeechMs: number;
};

export const DEFAULT_ENDPOINTER_OPTIONS: EndpointerOptions = {
  endSilenceMs: 400,
  startSpeechMs: 60,
  minSpeechRms: 250,
  speechToNoiseRatio: 3,
  maxSpeechMs: 10000,
};

const FRAME_MS = 20;
/** Once speaking, stay "in speech" until the level drops below this share of the threshold. */
const RELEASE_RATIO = 0.6;

export type Endpointer = {
  /** Feed little-endian int16 mono PCM; returns any boundaries found in it, in order. */
  push: (pcm: ArrayBuffer, sampleRate: number) => EndpointEvent[];
};

export function createEndpointer(options: Partial<EndpointerOptions> = {}): Endpointer {
  const opts = { ...DEFAULT_ENDPOINTER_OPTIONS, ...options };
  let noise = -1;
  let inSpeech = false;
  let voicedMs = 0;
  let silentMs = 0;
  let speechMs = 0;

  const step = (rms: number, ms: number): EndpointEvent | null => {
    if (noise < 0) {
      noise = rms;
    }
    const threshold = Math.max(opts.minSpeechRms, noise * opts.speechToNoiseRatio);

    if (!inSpeech) {
      if (rms >= threshold) {
        voicedMs += ms;
        if (voicedMs >= opts.startSpeechMs) {
          inSpeech = true;
          voicedMs = 0;
          silentMs = 0;
          speechMs = 0;
          return "speech_start";
        }
      } else {
        voicedMs = 0;
        // Follow a quieter background quickly and a louder one slowly.
        noise += (rms - noise) * (rms < noise ? 0.3 : 0.05);
      }
      return null;
    }

    speechMs += ms;
    if (rms >= threshold * RELEASE_RATIO) {
      silentMs = 0;
    } else {
      silentMs += ms;
    }
    if (silentMs >= opts.endSilenceMs || speechMs >= opts.maxSpeechMs) {
      if (speechMs >= opts.maxSpeechMs) {
        noise = rms;
      }
      inSpeech = false;
      silentMs = 0;
      return "speech_end";
    }
    return null;
  };

  return {
    push(pcm, sampleRate) {
      const samples = new Int16Array(pcm, 0, Math.floor(pcm.byteLength / 2));
      const frame = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000));
      const events: EndpointEvent[] = [];
      for (let start = 0; start < samples.length; start += frame) {
        const end = Math.min(samples.length, start + frame);
        let sum = 0;
        for (let i = start; i < end; i += 1) {
          sum += samples[i] * samples[i];
        }
        const event = step(Math.sqrt(sum / (end - start)), ((end - start) / sampleRate) * 1000);
        if (event) {
          events.push(event);
        }
      }
      return events;
    },
  };
}
