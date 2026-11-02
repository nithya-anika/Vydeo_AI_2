import { spawn } from "child_process";
import { geminiRequest, type SpeechSegment, type TranscriptionStatus } from "@/lib/gemini";
import { getModel } from "@/lib/ai-router";

export type { TranscriptionStatus };

export interface SilenceWindow {
  startTime: number;
  endTime: number;
  duration: number;
  source?: "waveform_detected" | "transcript_derived";
}

export interface AudioAccuracyReport {
  clipIndex: number;
  clipId?: string;
  transcriptionStatus: TranscriptionStatus;
  hasAudibleSound: boolean;
  hasSpeech: boolean;
  waveformSilences: SilenceWindow[];    // True acoustic waveform silence from FFmpeg
  transcriptGaps: SilenceWindow[];      // Gaps between LLM-transcribed words/phrases
  speechSegments: SpeechSegment[];      // Timed speech segments
  confidence: "waveform_verified" | "transcript_approximate" | "silent" | "unverified";
  notes: string[];
  error?: string;
}

export interface ClipTranscription {
  clipIndex: number;
  clipId?: string;
  status: TranscriptionStatus;
  hasSpeech: boolean;
  segments: SpeechSegment[];
  silenceWindows: SilenceWindow[];
  fullTranscript: string;
  confidence?: "waveform_verified" | "transcript_approximate" | "silent" | "unverified";
  error?: string;
}

/**
 * Normalizes speech segments ensuring finite, sequential timestamps.
 */
export function normalizeSpeechSegments(value: unknown, duration: number): SpeechSegment[] {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((item): SpeechSegment | null => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const text = typeof rec.text === "string" ? rec.text.trim() : "";
      const startTime = Number(rec.startTime ?? rec.start);
      const endTime = Number(rec.endTime ?? rec.end);
      if (!text || !Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;

      const dur = Math.max(0.2, duration);
      const start = Math.max(0, Math.min(dur - 0.1, startTime));
      const end = Math.max(start + 0.1, Math.min(dur, endTime));
      return {
        text,
        startTime: parseFloat(start.toFixed(3)),
        endTime: parseFloat(end.toFixed(3)),
      };
    })
    .filter((item): item is SpeechSegment => item !== null)
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, 100);
}

/**
 * Detects silent gaps between spoken phrases in a clip (transcript-derived).
 * Note: Only generated when transcription successfully completed.
 */
export function detectSilenceWindows(
  segments: SpeechSegment[],
  clipDuration: number,
  minSilenceSec = 0.25
): SilenceWindow[] {
  const windows: SilenceWindow[] = [];
  if (clipDuration <= 0) return windows;

  if (segments.length === 0) {
    return [{ startTime: 0, endTime: clipDuration, duration: clipDuration, source: "transcript_derived" }];
  }

  // Pre-speech silence
  if (segments[0].startTime >= minSilenceSec) {
    windows.push({
      startTime: 0,
      endTime: segments[0].startTime,
      duration: parseFloat(segments[0].startTime.toFixed(3)),
      source: "transcript_derived",
    });
  }

  // Inter-speech silences
  for (let i = 0; i < segments.length - 1; i++) {
    const currentEnd = segments[i].endTime;
    const nextStart = segments[i + 1].startTime;
    const gap = nextStart - currentEnd;
    if (gap >= minSilenceSec) {
      windows.push({
        startTime: parseFloat(currentEnd.toFixed(3)),
        endTime: parseFloat(nextStart.toFixed(3)),
        duration: parseFloat(gap.toFixed(3)),
        source: "transcript_derived",
      });
    }
  }

  // Post-speech silence
  const lastEnd = segments[segments.length - 1].endTime;
  if (clipDuration - lastEnd >= minSilenceSec) {
    windows.push({
      startTime: parseFloat(lastEnd.toFixed(3)),
      endTime: parseFloat(clipDuration.toFixed(3)),
      duration: parseFloat((clipDuration - lastEnd).toFixed(3)),
      source: "transcript_derived",
    });
  }

  return windows;
}

/**
 * Runs FFmpeg silencedetect on a media file to detect true acoustic waveform silence.
 * Distinguishes true audio pauses from background music or speech.
 */
export async function detectWaveformSilence(
  filePath: string,
  noiseDb = -30,
  minDurationSec = 0.2
): Promise<SilenceWindow[]> {
  return new Promise((resolve) => {
    if (!filePath) return resolve([]);

    const args = [
      "-i", filePath,
      "-af", `silencedetect=noise=${noiseDb}dB:d=${minDurationSec}`,
      "-f", "null",
      "-",
    ];

    const proc = spawn("ffmpeg", args);
    let output = "";

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });
    proc.stderr.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", () => {
      const windows: SilenceWindow[] = [];
      const startRegex = /silence_start:\s*([0-9.]+)/g;
      const endRegex = /silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g;

      const starts: number[] = [];
      let startMatch: RegExpExecArray | null;
      while ((startMatch = startRegex.exec(output)) !== null) {
        starts.push(parseFloat(startMatch[1]));
      }

      let endMatch: RegExpExecArray | null;
      let i = 0;
      while ((endMatch = endRegex.exec(output)) !== null && i < starts.length) {
        const start = starts[i];
        const end = parseFloat(endMatch[1]);
        const dur = parseFloat(endMatch[2]);
        windows.push({
          startTime: parseFloat(start.toFixed(3)),
          endTime: parseFloat(end.toFixed(3)),
          duration: parseFloat(dur.toFixed(3)),
          source: "waveform_detected",
        });
        i++;
      }

      resolve(windows);
    });

    proc.on("error", () => {
      resolve([]);
    });
  });
}

/**
 * Snaps candidate trim points to natural speech and silence boundaries.
 * If transcription status is failed or unknown, avoids aggressive speech snapping
 * and returns confidence: "unverified".
 */
export function snapTrimToSpeechBoundaries(
  trimStart: number,
  trimEnd: number,
  segments: SpeechSegment[],
  clipDuration: number,
  snapThresholdSec = 0.35,
  waveformSilences: SilenceWindow[] = [],
  transcriptionStatus: TranscriptionStatus = "completed_with_speech"
): {
  trimStart: number;
  trimEnd: number;
  snappedStart: boolean;
  snappedEnd: boolean;
  confidence: "waveform_verified" | "transcript_approximate" | "silent" | "unverified";
} {
  // If transcription failed or was not attempted, do NOT treat as confirmed silence or snap to speech!
  if (transcriptionStatus === "failed" || transcriptionStatus === "not_attempted") {
    return {
      trimStart: Math.max(0, Math.min(clipDuration - 0.1, trimStart)),
      trimEnd: Math.max(trimStart + 0.1, Math.min(clipDuration, trimEnd)),
      snappedStart: false,
      snappedEnd: false,
      confidence: "unverified",
    };
  }

  if (segments.length === 0 && waveformSilences.length === 0) {
    return {
      trimStart: Math.max(0, Math.min(clipDuration - 0.1, trimStart)),
      trimEnd: Math.max(trimStart + 0.1, Math.min(clipDuration, trimEnd)),
      snappedStart: false,
      snappedEnd: false,
      confidence: transcriptionStatus === "completed_no_speech" ? "silent" : "unverified",
    };
  }

  let finalStart = trimStart;
  let finalEnd = trimEnd;
  let snappedStart = false;
  let snappedEnd = false;
  let confidence: "waveform_verified" | "transcript_approximate" | "silent" | "unverified" = "transcript_approximate";

  // 1. If real waveform silence windows exist, check if cut is already inside or near acoustic silence
  if (waveformSilences.length > 0) {
    for (const ws of waveformSilences) {
      if (trimStart >= ws.startTime && trimStart <= ws.endTime) {
        snappedStart = true;
        confidence = "waveform_verified";
        break;
      }
      if (Math.abs(trimStart - ws.startTime) <= snapThresholdSec) {
        finalStart = ws.startTime;
        snappedStart = true;
        confidence = "waveform_verified";
        break;
      }
    }

    for (const ws of waveformSilences) {
      if (trimEnd >= ws.startTime && trimEnd <= ws.endTime) {
        snappedEnd = true;
        confidence = "waveform_verified";
        break;
      }
      if (Math.abs(trimEnd - ws.endTime) <= snapThresholdSec) {
        finalEnd = ws.endTime;
        snappedEnd = true;
        confidence = "waveform_verified";
        break;
      }
    }
  }

  // 2. Transcript-based phrase boundary snapping (if not already verified by waveform)
  if (!snappedStart && segments.length > 0) {
    for (const seg of segments) {
      if (Math.abs(trimStart - seg.startTime) <= snapThresholdSec) {
        finalStart = seg.startTime;
        snappedStart = true;
        break;
      }
      // If the trim falls right in the middle of a speech segment, expand outward to the start of the phrase
      if (trimStart > seg.startTime && trimStart < seg.endTime) {
        finalStart = seg.startTime;
        snappedStart = true;
        break;
      }
    }
  }

  if (!snappedEnd && segments.length > 0) {
    for (const seg of segments) {
      if (Math.abs(trimEnd - seg.endTime) <= snapThresholdSec) {
        finalEnd = seg.endTime;
        snappedEnd = true;
        break;
      }
      // If the trim falls right in the middle of a speech segment, expand outward to the end of the phrase
      if (trimEnd > seg.startTime && trimEnd < seg.endTime) {
        finalEnd = Math.min(clipDuration, seg.endTime);
        snappedEnd = true;
        break;
      }
    }
  }

  // Final bounding safety
  finalStart = Math.max(0, Math.min(clipDuration - 0.1, finalStart));
  finalEnd = Math.max(finalStart + 0.1, Math.min(clipDuration, finalEnd));

  return {
    trimStart: parseFloat(finalStart.toFixed(3)),
    trimEnd: parseFloat(finalEnd.toFixed(3)),
    snappedStart,
    snappedEnd,
    confidence,
  };
}

/**
 * Transcribes a clip buffer or base64 payload using Gemini.
 * Explicitly distinguishes:
 * - "completed_with_speech": Verified dialogue present with timestamps
 * - "completed_no_speech": Successful transcription, no audible speech detected
 * - "failed": API error / timeout / parse error (speech presence unknown)
 */
export async function transcribeClipWithGemini(params: {
  base64Data: string;
  mimeType: string;
  duration: number;
  clipIndex?: number;
  clipId?: string;
  model?: string;
}): Promise<ClipTranscription> {
  const { base64Data, mimeType, duration, clipIndex = 0, clipId, model } = params;
  const targetModel = model || getModel("evaluate");

  try {
    const response = await geminiRequest(targetModel, {
      contents: [{
        role: "user",
        parts: [
          {
            text: `Transcribe only spoken words in this clip into timed speech captions.
Return JSON only:
{
  "captions": [
    { "text": "exact words spoken", "startTime": 0.0, "endTime": 1.8 }
  ]
}
Rules:
- Capture spoken sentences with exact second timestamps.
- If no speech is audible (e.g. background music only, noise, or silence), return { "captions": [] }.
- Clip duration is about ${duration.toFixed(2)} seconds.`,
          },
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    });

    const text = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      ?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const clean = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    let parsed: { captions?: unknown } = { captions: [] };
    try {
      parsed = JSON.parse(clean) as { captions?: unknown };
    } catch {
      try {
        const fixed = clean.replace(/,\s*([\]}])/g, "$1").replace(/[\u0000-\u001F]+/g, " ");
        parsed = JSON.parse(fixed) as { captions?: unknown };
      } catch {
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]) as { captions?: unknown };
          } catch {}
        }
      }
    }

    const segments = normalizeSpeechSegments(parsed.captions, duration);
    const hasSpeech = segments.length > 0;
    const silenceWindows = detectSilenceWindows(segments, duration);
    const fullTranscript = segments.map((s) => s.text).join(" ");

    return {
      clipIndex,
      clipId,
      status: hasSpeech ? "completed_with_speech" : "completed_no_speech",
      hasSpeech,
      segments,
      silenceWindows,
      fullTranscript,
      confidence: hasSpeech ? "transcript_approximate" : "silent",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[transcribe] Transcription API failed for clip ${clipIndex} (${clipId || "unassigned"}): ${errorMsg}. Marking status: "failed" (speech status unverified).`);
    return {
      clipIndex,
      clipId,
      status: "failed",
      hasSpeech: false, // legacy flag
      error: errorMsg,
      segments: [],
      silenceWindows: [], // Do NOT invent fake silence windows for failed transcriptions!
      fullTranscript: "",
      confidence: "unverified",
    };
  }
}
