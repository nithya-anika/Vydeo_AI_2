export interface ReferenceMedia {
  id: string;
  name: string;
  type: "image" | "video";
  url: string;
  mimeType: string;
  size: number;
  thumbnailUrl?: string;
}

export interface ReferenceStyleProfile {
  visualMood: string;
  colorPalette: string[];
  lightingStyle: string;
  pacingPreference: "fast-cuts" | "medium-paced" | "cinematic-slow" | string;
  transitionStyle: string;
  captionPlacement?: string;
  captionTypography?: string;
  musicEnergy?: "low" | "medium" | "high";
  creativeDirectives: string[];
  summary: string;
}

export interface TemplateCustomizationPayload {
  templateId: number | string;
  templateName: string;
  customPrompt: string;
  references: ReferenceMedia[];
  referenceProfile?: ReferenceStyleProfile;
  updatedAt: number;
}
