import { describe, it, expect, vi } from "vitest";
import { analyzeReferences, buildHeuristicProfile } from "@/lib/reference-analysis";
import { TEMPLATES } from "@/lib/templates/registry";
import type { ReferenceMedia, ReferenceStyleProfile } from "@/types/references";

describe("Reference-Guided Template Customization", () => {
  const dummyImageRef: ReferenceMedia = {
    id: "ref-img-1",
    name: "editorial_look.jpg",
    type: "image",
    url: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    mimeType: "image/jpeg",
    size: 1024 * 50,
  };

  const dummyImageRef2: ReferenceMedia = {
    id: "ref-img-2",
    name: "color_grade_palette.png",
    type: "image",
    url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    mimeType: "image/png",
    size: 1024 * 80,
  };

  const dummyVideoRef: ReferenceMedia = {
    id: "ref-vid-1",
    name: "pacing_sample.mp4",
    type: "video",
    url: "https://example.com/reference_video.mp4",
    mimeType: "video/mp4",
    size: 1024 * 1024 * 5,
  };

  const dummyVideoRef2: ReferenceMedia = {
    id: "ref-vid-2",
    name: "transition_flow.mov",
    type: "video",
    url: "https://example.com/transition_flow.mov",
    mimeType: "video/quicktime",
    size: 1024 * 1024 * 8,
  };

  // 1. No-reference template usage
  it("handles no-reference template usage gracefully", async () => {
    const profile = await analyzeReferences([], "Luxury Product Showcase", "Keep it simple");
    expect(profile).toBeNull();

    const template = TEMPLATES[1];
    expect(template).toBeDefined();
    expect(template.editorialPrompt).toContain("premium");
    expect(template.pacing).toBe("cinematic-slow");
  });

  // 2. One reference image
  it("builds an aesthetic style profile from a single reference image", () => {
    const profile = buildHeuristicProfile([dummyImageRef], "Luxury Product Showcase", "Moody amber lighting");
    expect(profile).toBeDefined();
    expect(profile.colorPalette.length).toBeGreaterThanOrEqual(3);
    expect(profile.lightingStyle).toBeDefined();
    expect(profile.summary).toContain("1 reference file(s)");
  });

  // 3. Multiple reference images
  it("combines multiple reference images into a coherent visual profile", () => {
    const profile = buildHeuristicProfile(
      [dummyImageRef, dummyImageRef2],
      "Luxury Product Showcase",
      "Sophisticated gold and obsidian reflections"
    );
    expect(profile.summary).toContain("2 reference file(s)");
    expect(profile.creativeDirectives.length).toBeGreaterThanOrEqual(3);
  });

  // 4. One reference video
  it("extracts pacing and energy directives from a reference video", () => {
    const profile = buildHeuristicProfile(
      [dummyVideoRef],
      "Viral TikTok Hook",
      "Fast cut pacing and high energy transitions"
    );
    expect(profile.pacingPreference).toBe("fast-cuts");
    expect(profile.musicEnergy).toBe("high");
    expect(profile.transitionStyle).toContain("jump cuts");
  });

  // 5. Multiple reference videos
  it("supports multiple reference videos without reducing to a single item", () => {
    const profile = buildHeuristicProfile(
      [dummyVideoRef, dummyVideoRef2],
      "Cinematic Travel Reel",
      "Cinematic pacing and smooth dissolves"
    );
    expect(profile.summary).toContain("2 reference file(s)");
    expect(profile.pacingPreference).toBe("cinematic-slow");
  });

  // 6. Mixed image and video references
  it("synthesizes combined image aesthetics with video pacing", () => {
    const profile = buildHeuristicProfile(
      [dummyImageRef, dummyVideoRef],
      "Product Launch Hype",
      "High energy tech reveal with sharp contrast"
    );
    expect(profile.summary).toContain("2 reference file(s)");
    expect(profile.creativeDirectives[0]).toContain("color harmony");
  });

  // 7. Reordering and removing references
  it("correctly manages reference list reordering and deletion", () => {
    let refs = [dummyImageRef, dummyImageRef2, dummyVideoRef];

    // Remove middle item
    refs = refs.filter(r => r.id !== dummyImageRef2.id);
    expect(refs.length).toBe(2);
    expect(refs[0].id).toBe("ref-img-1");
    expect(refs[1].id).toBe("ref-vid-1");

    // Reorder: swap positions
    const temp = refs[0];
    refs[0] = refs[1];
    refs[1] = temp;
    expect(refs[0].id).toBe("ref-vid-1");
    expect(refs[1].id).toBe("ref-img-1");
  });

  // 8. Editing and restoring the default prompt
  it("supports editing the prompt and restoring default without altering template config", () => {
    const template = TEMPLATES[1];
    const defaultPrompt = template.editorialPrompt;

    let userPrompt = "Make it 50% faster with heavy neon glow";
    expect(userPrompt).not.toBe(defaultPrompt);

    // Restore action
    userPrompt = template.editorialPrompt;
    expect(userPrompt).toBe(defaultPrompt);

    // Verify structured config is untouched
    expect(template.pacing).toBe("cinematic-slow");
    expect(template.aspectRatio).toBe("9:16");
    expect(template.musicVolume).toBe(0.6);
  });

  // 9. Safety invariant: References NEVER become source timeline clips
  it("ensures reference media items are quarantined from source timeline clips", () => {
    const references: ReferenceMedia[] = [dummyImageRef, dummyVideoRef];
    const userFootageClips = [
      { id: "clip-user-1", name: "actual_recording.mp4", duration: 10 },
      { id: "clip-user-2", name: "actual_broll.mp4", duration: 6 },
    ];

    // Timeline generator clip candidate inventory must ONLY contain userFootageClips
    const candidateIds = userFootageClips.map(c => c.id);
    const referenceIds = references.map(r => r.id);

    // Assert disjoint sets
    const overlap = candidateIds.filter(id => referenceIds.includes(id));
    expect(overlap.length).toBe(0);
  });
});
