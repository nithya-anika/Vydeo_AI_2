import { describe, expect, it } from "vitest";
import {
  inferRequestedColorAdjustments,
  inferRequestedTransition,
} from "@/app/api/edit-footage/route";
import { inferRequestedColorGrade, stripDirectEditorControls } from "@/lib/footagePromptControls";

describe("footage prompt controls", () => {
  it("keeps an explicitly requested transition type", () => {
    expect(inferRequestedTransition("Use zoom-out transitions between every clip")).toBe("zoom-out");
    expect(inferRequestedTransition("Add a light leak transation")).toBe("light-leak");
    expect(inferRequestedTransition("brightness 20% and use zoomin transaction after clip")).toBe("zoom-in");
  });

  it("supports every named editor transition directly from the prompt", () => {
    expect(inferRequestedTransition("use cut transition after each clip")).toBe("cut");
    expect(inferRequestedTransition("use fade transition after each clip")).toBe("fade");
    expect(inferRequestedTransition("use dissolve transition after each clip")).toBe("dissolve");
    expect(inferRequestedTransition("use zoomout transaction after each clip")).toBe("zoom-out");
    expect(inferRequestedTransition("use crosszoom transition after each clip")).toBe("cross-zoom");
    expect(inferRequestedTransition("use slideleft transaction after each clip")).toBe("slide-left");
    expect(inferRequestedTransition("use slide right transition after each clip")).toBe("slide-right");
    expect(inferRequestedTransition("use wipeleft transition after each clip")).toBe("wipe-left");
    expect(inferRequestedTransition("use wipe right transition after each clip")).toBe("wipe-right");
    expect(inferRequestedTransition("use cinematic fade transition after each clip")).toBe("cinematic-fade");
    expect(inferRequestedTransition("use glitch transition after each clip")).toBe("glitch");
    expect(inferRequestedTransition("use whippan transition after each clip")).toBe("whip");
    expect(inferRequestedTransition("use lightleak transation after each clip")).toBe("light-leak");
    expect(inferRequestedTransition("use blur transition after each clip")).toBe("blur");
    expect(inferRequestedTransition("use flash transition after each clip")).toBe("flash");
  });

  it("uses zoom-in for a generic transition request", () => {
    expect(inferRequestedTransition("add smooth transations")).toBe("zoom-in");
  });

  it("maps brightness percentages to exposure", () => {
    expect(inferRequestedColorAdjustments("increase brightness 20%")?.exposure).toBe(0.2);
    expect(inferRequestedColorAdjustments("decrease brightness 30%")?.exposure).toBe(-0.3);
    expect(inferRequestedColorAdjustments("brightness 20% and use zoomin transaction after clip")?.exposure).toBe(0.2);
  });

  it("maps every visible adjustment slider from explicit prompt values", () => {
    expect(inferRequestedColorAdjustments("contrast 25%")).toMatchObject({ contrast: 25 });
    expect(inferRequestedColorAdjustments("reduce saturation 40%")).toMatchObject({ saturation: -40 });
    expect(inferRequestedColorAdjustments("add 30% brightness to all clips")).toMatchObject({ exposure: 0.3 });
    expect(inferRequestedColorAdjustments("saturation to 45%")).toMatchObject({ saturation: 45 });
    expect(inferRequestedColorAdjustments("temperature -15")).toMatchObject({ temperature: -15 });
    expect(inferRequestedColorAdjustments("tint 12")).toMatchObject({ tint: 12 });
    expect(inferRequestedColorAdjustments("highlights 30")).toMatchObject({ highlights: 30 });
    expect(inferRequestedColorAdjustments("lower shadows 20")).toMatchObject({ shadows: -20 });
  });

  it("maps the Choki Choki reel prompt adjustment wording", () => {
    const prompt = "Make a fun, fast-paced reel from these clips where the anchor asks people how they eat Choki Choki. Start with the girl speaking, include the other replies in between, and end with the guy in sunglasses. Keep each person’s answer complete. add 30% brightness to all clips and saturation to 45%.";
    expect(inferRequestedColorAdjustments(prompt)).toMatchObject({
      exposure: 0.3,
      saturation: 45,
    });
  });

  it("maps visible LUT presets from the prompt", () => {
    expect(inferRequestedColorGrade("apply cinematic grade")).toBe("Cinematic Grade");
    expect(inferRequestedColorGrade("use vintage film")).toBe("Vintage Film");
    expect(inferRequestedColorGrade("use teal orange preset")).toBe("Teal & Orange");
    expect(inferRequestedColorGrade("make it black and white")).toBe("Black & White");
    expect(inferRequestedColorGrade("apply warm sunset")).toBe("Warm Sunset");
    expect(inferRequestedColorGrade("use cool mist")).toBe("Cool Mist");
    expect(inferRequestedColorGrade("use neon glow")).toBe("Neon Glow");
    expect(inferRequestedColorGrade("make it desaturated")).toBe("Desaturated");
  });

  it("uses editor slider units for color grading", () => {
    expect(inferRequestedColorAdjustments("make it warm, vibrant and high contrast")).toMatchObject({
      temperature: 18,
      saturation: 20,
      contrast: 20,
    });
  });

  it("keeps direct controls out of the Gemini creative prompt", () => {
    const prompt = "Start with the girl and end with the guy in sunglasses. brightness 10%, contrast 20, use warm sunset and use zoom in transition after each clip";
    expect(stripDirectEditorControls(prompt)).toBe("Start with the girl and end with the guy in sunglasses.");
  });
});
