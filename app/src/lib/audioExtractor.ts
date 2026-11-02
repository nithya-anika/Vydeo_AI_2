/**
 * Browser-side audio extractor: converts any video File (.mp4, .mov, .webm)
 * into a lightweight 16kHz mono WAV Blob using Web Audio API in milliseconds.
 * This avoids uploading multi-hundred-megabyte video files just to transcribe speech.
 */

function encodeWav16Bit(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + samples.length * 2, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  /* format chunk identifier */
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // chunk length = 16
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, 1, true); // mono = 1
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate = sampleRate * 1 channel * 2 bytes
  view.setUint16(32, 2, true); // block align = 2
  view.setUint16(34, 16, true); // bits per sample = 16
  /* data chunk identifier */
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, samples.length * 2, true);

  // Write samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export async function extractAudioTrackAsWav(file: File): Promise<Blob | null> {
  if (typeof window === "undefined") return null;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return null;

    const audioCtx = new AudioCtxClass();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();

    const targetRate = 16000;
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0);
    const resampled = await offlineCtx.startRendering();

    const channelData = resampled.getChannelData(0);
    
    // --- Audio Gain Normalization (Pre-Boost) ---
    // Calculate the peak amplitude to find the loudest sound
    let maxAbs = 0;
    for (let i = 0; i < channelData.length; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > maxAbs) maxAbs = abs;
    }
    
    // If the audio is extremely quiet, aggressively boost it to a peak of 0.9.
    // We cap the multiplier at 10.0 (+20dB) to avoid blowing out mic hiss/static in pure silence.
    if (maxAbs > 0.001 && maxAbs < 0.9) {
      const multiplier = Math.min(0.9 / maxAbs, 10.0);
      console.log(`[AudioExtractor] Quiet audio detected (peak ${maxAbs.toFixed(3)}). Boosting gain by ${multiplier.toFixed(2)}x for AI transcription.`);
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] *= multiplier;
      }
    }

    const wavBuffer = encodeWav16Bit(channelData, targetRate);
    return new Blob([wavBuffer], { type: "audio/wav" });
  } catch (err) {
    console.warn("[AudioExtractor] Browser audio extraction skipped or unsupported for file:", file.name, err);
    return null;
  }
}
