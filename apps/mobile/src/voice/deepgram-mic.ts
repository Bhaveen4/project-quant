import { requestRecordingPermissionsAsync } from "expo-audio";
import AudioNative from "expo-audio/build/AudioModule";

const AUDIO_STREAM_BUFFER = "audioStreamBuffer";

export type MicPcmStream = {
  start: () => Promise<void>;
  stop: () => void;
};

export function createMicPcmStream(
  onPcm: (data: ArrayBuffer, sampleRate: number) => void,
): MicPcmStream {
  const stream = new AudioNative.AudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: "int16",
  });

  const subscription = stream.addListener(
    AUDIO_STREAM_BUFFER,
    (buffer: { data: ArrayBuffer; sampleRate: number }) => {
      onPcm(buffer.data, buffer.sampleRate);
    },
  );

  return {
    async start() {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Microphone permission required");
      }
      await stream.start();
    },
    stop() {
      try {
        stream.stop();
      } catch {
        // ignore
      }
      subscription.remove();
    },
  };
}
