type PromptScene = {
  label: string;
  description: string;
  duration: number;
  mood?: string;
  captions?: Array<{ text?: string; startTime?: number; endTime?: number }>;
};

export function buildSceneVideoPrompt(scene: PromptScene, options: {
  originalBrief?: string;
  aspectRatio: string;
  sceneIndex?: number;
  totalScenes?: number;
}) {
  const captions = (scene.captions ?? [])
    .map((caption) => {
      const timing =
        typeof caption.startTime === "number" && typeof caption.endTime === "number"
          ? ` (${caption.startTime}-${caption.endTime}s)`
          : "";
      return caption.text ? `- ${caption.text}${timing}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const sceneNumber =
    typeof options.sceneIndex === "number" && typeof options.totalScenes === "number"
      ? `Scene ${options.sceneIndex + 1} of ${options.totalScenes}`
      : "Scene";

  return [
    options.originalBrief?.trim()
      ? `Original client brief for continuity:\n${options.originalBrief.trim()}`
      : null,
    `Generate only this ${scene.duration}-second ${options.aspectRatio} ad segment: ${sceneNumber}.`,
    `Scene title: ${scene.label}.`,
    scene.description ? `Scene action and visuals: ${scene.description}` : null,
    scene.mood ? `Mood: ${scene.mood}.` : null,
    captions ? `On-screen text to include, clean and minimal:\n${captions}` : null,
    [
      "Production requirements:",
      "- Ultra-realistic cinematic commercial footage, modern premium startup aesthetic, immediately impressive premium ad quality.",
      "- No gaps: every second must have purposeful action, continuous ambience, seamless pacing, no blank frames, no dead air, no awkward pauses.",
      "- Maintain smooth visual and audio continuity across the whole segment; transitions should feel intentional and polished.",
      "- Make the segment interactive and word-rich: use tasteful animated captions, UI labels, chat bubbles, score changes, buttons, feedback cards, and short callouts where useful.",
      "- Sync every transition to the beat, voiceover phrase, UI tap, facial reaction, or camera movement; no random or off-beat transitions.",
      "- Aim for a 10/10 premium ad: strong hook, useful text, polished product clarity, satisfying payoff, and no filler.",
      "- Natural office lighting, smooth gimbal movement, cinematic depth of field, professional color grade.",
      "- Realistic smartphone UI animations on the actual phone screen; no holograms or floating UI.",
      "- If a person speaks on camera, use natural human lip movement and synchronized speech.",
      "- Audio should feel real: warm Indian English voice, light office ambience, subtle keyboard sounds, low-volume soft upbeat electronic music.",
      "- Keep camera stable, editing clean, and screens readable without becoming text-heavy.",
    ].join("\n"),
    [
      "Avoid:",
      "- Robotic voice, exaggerated acting, cartoon effects, watermarks, jittery camera, distorted hands, fake app UI, unreadable text.",
      "- Do not show unrelated brands or generic placeholder logos.",
    ].join("\n"),
  ].filter(Boolean).join("\n\n");
}
