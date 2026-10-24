import type { PromptCategory } from "@/components/dashboard/data";

export interface TemplateConfig {
  id: string;
  version: number;
  name: string;
  description: string;
  category: PromptCategory | "ugc" | "ads" | "brand" | "travel";
  platform: "TikTok" | "Instagram" | "YouTube" | "LinkedIn" | "Snapchat" | "Shorts";
  
  // Editorial and narrative rules
  editorialPrompt: string;
  pacing: "fast-cuts" | "medium-paced" | "cinematic-slow";
  targetDurationMin: number;
  targetDurationMax: number;
  sceneCountRange: [number, number];

  // Creative direction
  hookStrategy: string;
  endingStrategy: string;

  // Visuals and transitions
  supportedTransitions: string[];
  defaultColorGrade: string | null;

  // Audio and music
  musicStyle: string;
  musicEnergy: "low" | "medium" | "high";
  duckMusicDuringSpeech: boolean;
  musicVolume: number;

  // Captions
  captionStyle: "minimal" | "bold" | "cinematic" | "professional" | "dynamic";
  captionAnimation: "fade" | "scale" | "typewriter" | "none";
  captionAlign: "left" | "center" | "right";
  
  // Platform export defaults
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
}