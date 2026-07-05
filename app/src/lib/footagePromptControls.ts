export const FOOTAGE_TRANSITION_TYPES = [
  "cut", "fade", "dissolve", "wipe-left", "wipe-right", "zoom-in", "zoom-out",
  "cross-zoom", "slide-left", "slide-right", "cinematic-fade", "glitch",
  "blur", "whip", "light-leak", "flash",
] as const;

export type FootageTransitionType = typeof FOOTAGE_TRANSITION_TYPES[number];

export const FOOTAGE_COLOR_GRADES = [
  "Cinematic Grade",
  "Vintage Film",
  "Teal & Orange",
  "Black & White",
  "Warm Sunset",
  "Cool Mist",
  "Neon Glow",
  "Desaturated",
] as const;

export type FootageColorGrade = typeof FOOTAGE_COLOR_GRADES[number];

export interface PromptColorAdjustments {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
}

export const DEFAULT_PROMPT_COLOR: PromptColorAdjustments = {
  exposure: 0, contrast: 0, saturation: 0, temperature: 0,
  tint: 0, highlights: 0, shadows: 0,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const signedNumber = "([+-]?\\d{1,3})\\s*%?";

const adjustmentKeys: Array<[keyof PromptColorAdjustments, string[]]> = [
  ["exposure", ["brightness", "exposure"]],
  ["contrast", ["contrast"]],
  ["saturation", ["saturation", "saturate"]],
  ["temperature", ["temperature", "warmth"]],
  ["tint", ["tint"]],
  ["highlights", ["highlights", "highlight"]],
  ["shadows", ["shadows", "shadow"]],
];

export function inferRequestedTransition(prompt: string): FootageTransitionType | null {
  const normalized = prompt.toLowerCase().replace(/[_-]+/g, " ");
  const checks: Array<[RegExp, FootageTransitionType]> = [
    [/\bcross\s*zoom\b|\bcrosszoom\b/, "cross-zoom"],
    [/\bzoom\s*out\b|\bzoomout\b/, "zoom-out"],
    [/\bzoom\s*in\b|\bzoomin\b/, "zoom-in"],
    [/\blight\s*leak\b|\blightleak\b|\bfilm\s*burn\b/, "light-leak"],
    [/\bcinematic\s*fade\b|\bpremium\s*fade\b|\bluxury\s*fade\b/, "cinematic-fade"],
    [/\bwipe\s*left\b|\bwipeleft\b/, "wipe-left"],
    [/\bwipe\s*right\b|\bwiperight\b/, "wipe-right"],
    [/\bslide\s*left\b|\bslideleft\b/, "slide-left"],
    [/\bslide\s*right\b|\bslideright\b/, "slide-right"],
    [/\bwhip(?:\s*pan)?\b|\bwhippan\b/, "whip"],
    [/\bglitch\b/, "glitch"],
    [/\bblur\b/, "blur"],
    [/\bflash\b/, "flash"],
    [/\bdissolve\b|\bcross\s*dissolve\b/, "dissolve"],
    [/\bfade\b/, "fade"],
    [/\bhard\s*cut\b|\bcut\s*transition\b|\bjump\s*cut\b|\bcuts?\s+between\b/, "cut"],
  ];
  for (const [pattern, type] of checks) if (pattern.test(normalized)) return type;
  if (/\btrans(?:i|a)?tions?\b|\btrsations?\b|\btrsition\b|\btransation\b|\btransaction\b/.test(normalized)) {
    return "zoom-in";
  }
  return null;
}

export function inferRequestedColorAdjustments(prompt: string): PromptColorAdjustments | null {
  const normalized = prompt.toLowerCase();
  const adjustments = { ...DEFAULT_PROMPT_COLOR };
  let touched = false;
  const exposurePercent = (value: string) => clamp(Number(value) / 100, -1, 1);
  const sliderValue = (value: string) => clamp(Number(value), -100, 100);

  for (const [key, names] of adjustmentKeys) {
    const labelPattern = names.join("|");
    const direct = normalized.match(new RegExp(`\\b(?:${labelPattern})\\s*(?:up|increase|boost)?\\s*(?:by|to|at)?\\s*${signedNumber}(?=\\s|$|[,.!?])`));
    const increase = normalized.match(new RegExp(`\\b(?:increase|boost|raise|add|more)\\s+(?:the\\s+)?(?:${labelPattern})\\s*(?:by|to)?\\s*${signedNumber}(?=\\s|$|[,.!?])`));
    const decrease = normalized.match(new RegExp(`\\b(?:decrease|reduce|lower|drop|less)\\s+(?:the\\s+)?(?:${labelPattern})\\s*(?:by|to)?\\s*${signedNumber}(?=\\s|$|[,.!?])`));
    const numberFirstIncrease = normalized.match(new RegExp(`\\b(?:increase|boost|raise|add|more)\\s+(?:the\\s+)?${signedNumber}\\s*(?:to|of|for)?\\s*(?:${labelPattern})\\b`));
    const numberFirstDecrease = normalized.match(new RegExp(`\\b(?:decrease|reduce|lower|drop|less)\\s+(?:the\\s+)?${signedNumber}\\s*(?:to|of|for)?\\s*(?:${labelPattern})\\b`));
    const numberFirstDirect = normalized.match(new RegExp(`\\b${signedNumber}\\s*(?:to|of|for)?\\s*(?:${labelPattern})\\b`));
    const match = increase ?? decrease ?? direct ?? numberFirstIncrease ?? numberFirstDecrease ?? numberFirstDirect;
    if (!match) continue;

    const raw = key === "exposure" ? exposurePercent(match[1]) : sliderValue(match[1]);
    adjustments[key] = decrease || numberFirstDecrease ? -Math.abs(raw) : raw;
    touched = true;
  }

  const increase = normalized.match(/\b(?:increase|boost|raise|add|brighten|more)\s+(?:the\s+)?(?:brightness|exposure)\s*(?:by|to)?\s*(\d{1,3})\s*%/);
  const decrease = normalized.match(/\b(?:decrease|reduce|lower|drop|less)\s+(?:the\s+)?(?:brightness|exposure)\s*(?:by|to)?\s*(\d{1,3})\s*%/);
  const direct = normalized.match(/\b(?:brightness|exposure)\s*(?:up|increase|boost)?\s*(?:by|to)?\s*(\d{1,3})\s*%/);
  const numberFirstIncrease = normalized.match(/\b(?:increase|boost|raise|add|brighten|more)\s+(?:the\s+)?(\d{1,3})\s*%\s*(?:to|of|for)?\s*(?:brightness|exposure)\b/);
  const numberFirstDecrease = normalized.match(/\b(?:decrease|reduce|lower|drop|less)\s+(?:the\s+)?(\d{1,3})\s*%\s*(?:to|of|for)?\s*(?:brightness|exposure)\b/);

  if (increase) { adjustments.exposure = exposurePercent(increase[1]); touched = true; }
  else if (decrease) { adjustments.exposure = -exposurePercent(decrease[1]); touched = true; }
  else if (direct) { adjustments.exposure = exposurePercent(direct[1]); touched = true; }
  else if (numberFirstIncrease) { adjustments.exposure = exposurePercent(numberFirstIncrease[1]); touched = true; }
  else if (numberFirstDecrease) { adjustments.exposure = -exposurePercent(numberFirstDecrease[1]); touched = true; }
  else if (/\bbrighter\b|\bbrighten\b|\bmore\s*light\b/.test(normalized)) { adjustments.exposure = 0.2; touched = true; }
  else if (/\bdarker\b|\bdarken\b|\bless\s*bright\b|\blow\s*light\b/.test(normalized)) { adjustments.exposure = -0.2; touched = true; }

  if (/\bhigh\s*contrast\b|\bmore\s*contrast\b|\bincrease\s*contrast\b/.test(normalized)) { adjustments.contrast = 20; touched = true; }
  if (/\blow\s*contrast\b|\breduce\s*contrast\b|\bsoft\s*contrast\b/.test(normalized)) { adjustments.contrast = -15; touched = true; }
  if (/\bwarm\b|\bgolden\b|\bsunset\b/.test(normalized)) { adjustments.temperature = 18; adjustments.saturation = Math.max(adjustments.saturation, 8); touched = true; }
  if (/\bcool\b|\bblue\s*tone\b|\bcold\b/.test(normalized)) { adjustments.temperature = -18; touched = true; }
  if (/\bvibrant\b|\bmore\s*saturation\b|\bincrease\s*saturation\b|\bcolorful\b/.test(normalized)) { adjustments.saturation = 20; touched = true; }
  if (/\bdesaturat(?:e|ed)|\bless\s*saturation\b|\bmuted\s*colors\b/.test(normalized)) { adjustments.saturation = -30; touched = true; }
  if (/\blift\s*shadows\b|\bbrighter\s*shadows\b/.test(normalized)) { adjustments.shadows = 20; touched = true; }
  if (/\breduce\s*highlights\b|\blower\s*highlights\b/.test(normalized)) { adjustments.highlights = -20; touched = true; }
  return touched ? adjustments : null;
}

export function inferRequestedColorGrade(prompt: string): FootageColorGrade | null {
  const normalized = prompt.toLowerCase().replace(/[_-]+/g, " ");
  const checks: Array<[RegExp, FootageColorGrade]> = [
    [/\bcinematic\s*grade\b|\bcinematic\s*lut\b|\bcinematic\s*look\b/, "Cinematic Grade"],
    [/\bvintage\s*film\b|\bvintage\s*grade\b|\bfilm\s*look\b/, "Vintage Film"],
    [/\bteal\s*(?:and|&)?\s*orange\b|\btealorange\b/, "Teal & Orange"],
    [/\bblack\s*(?:and|&)?\s*white\b|\bblackwhite\b|\bmonochrome\b|\bgrayscale\b/, "Black & White"],
    [/\bwarm\s*sunset\b|\bsunset\s*grade\b/, "Warm Sunset"],
    [/\bcool\s*mist\b|\bcool\s*grade\b/, "Cool Mist"],
    [/\bneon\s*glow\b|\bneon\s*grade\b/, "Neon Glow"],
    [/\bdesaturated\b|\bdesaturate\b|\bmuted\s*grade\b/, "Desaturated"],
  ];
  for (const [pattern, grade] of checks) if (pattern.test(normalized)) return grade;
  return null;
}

export function stripDirectEditorControls(prompt: string): string {
  const transitionNames = "cross[ -]?zoom|crosszoom|zoom[ -]?in|zoomin|zoom[ -]?out|zoomout|light[ -]?leak|lightleak|cinematic[ -]?fade|wipe[ -]?(?:left|right)|wipe(?:left|right)|slide[ -]?(?:left|right)|slide(?:left|right)|whip(?:[ -]?pan)?|whippan|glitch|blur|flash|dissolve|fade|hard[ -]?cut|jump[ -]?cut";
  const transitionWord = "trans(?:i|a)?tions?|trsations?|trsition|transation|transactions?";
  const adjustmentNames = "brightness|exposure|contrast|saturation|saturate|temperature|warmth|tint|highlights?|shadows?";
  const colorGradeNames = "cinematic[ -]?grade|cinematic[ -]?lut|cinematic[ -]?look|vintage[ -]?film|vintage[ -]?grade|film[ -]?look|teal\\s*(?:and|&)?\\s*orange|tealorange|black\\s*(?:and|&)?\\s*white|blackwhite|monochrome|grayscale|warm[ -]?sunset|sunset[ -]?grade|cool[ -]?mist|cool[ -]?grade|neon[ -]?glow|neon[ -]?grade|desaturated|desaturate|muted[ -]?grade";
  const adjustment = new RegExp(`\\b(?:(?:(?:increase|boost|raise|add|more|decrease|reduce|lower|drop|less)\\s+(?:the\\s+)?)?(?:${adjustmentNames})(?:\\s+(?:up|increase|boost))?\\s*(?:by|to|at)?\\s*[+-]?\\d{1,3}\\s*%?|(?:increase|boost|raise|add|more|decrease|reduce|lower|drop|less)?\\s*(?:the\\s+)?[+-]?\\d{1,3}\\s*%?\\s*(?:to|of|for)?\\s*(?:${adjustmentNames}))`, "gi");
  const colorGrade = new RegExp(`\\b(?:use|add|apply|with)?\\s*(?:${colorGradeNames})(?:\\s+(?:lut|preset|grade|look))?`, "gi");
  const transition = new RegExp(`\\b(?:and\\s+)?(?:use|add|apply|with)?\\s*(?:${transitionNames})\\s*(?:${transitionWord})?(?:\\s+(?:after|between)\\s+(?:each|every|all|the)?\\s*clips?)?`, "gi");

  return prompt
    .replace(adjustment, " ")
    .replace(colorGrade, " ")
    .replace(transition, " ")
    .replace(/\s*[,;]\s*([,;.])/g, "$1")
    .replace(/([.?!])\s*[,;]+/g, "$1")
    .replace(/[,;]{2,}/g, ",")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\b(?:and|with)\s*([,.;!?]|$)/gi, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}
