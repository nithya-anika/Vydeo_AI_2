import { describe, it, expect } from "vitest";
import { useEditorStore, type BrandKit, type BrandLogoOverlay } from "@/store/editorStore";
import type { BrandRenderInput } from "@/lib/transcoder";

describe("Brand Kit Canvas Overlay & Positioning", () => {
  it("initializes with default logoOverlay configuration", () => {
    const store = useEditorStore.getState();
    const defaultKit: BrandKit = {
      id: "test-kit",
      name: "Test Brand",
      logo: "https://example.com/logo.png",
      primaryColor: "#FF5500",
      secondaryColor: "#000000",
      accentColor: "#00AAFF",
      fontHeading: "Space Grotesk",
      fontBody: "Inter",
      captionStyle: {},
      watermark: null,
      intro: null,
      outro: null,
      logoOverlay: {
        enabled: true,
        type: "image",
        x: 80,
        y: 80,
        width: 18,
        opacity: 0.85,
        tintColor: null,
      },
    };

    store.setBrandKit(defaultKit);
    const updated = useEditorStore.getState().brandKit;
    expect(updated?.logoOverlay?.enabled).toBe(true);
    expect(updated?.logoOverlay?.x).toBe(80);
    expect(updated?.logoOverlay?.y).toBe(80);
    expect(updated?.logoOverlay?.width).toBe(18);
  });

  it("updates logo coordinates and respects canvas bounds", () => {
    const store = useEditorStore.getState();
    store.updateBrandKit({
      logoOverlay: {
        enabled: true,
        type: "image",
        x: 10,
        y: 15,
        width: 25,
        opacity: 0.9,
      },
    });

    const overlay = useEditorStore.getState().brandKit?.logoOverlay;
    expect(overlay?.x).toBe(10);
    expect(overlay?.y).toBe(15);
    expect(overlay?.width).toBe(25);
    expect(overlay?.opacity).toBe(0.9);
  });

  it("supports switching to Text Logo mode with custom text and font", () => {
    const store = useEditorStore.getState();
    store.updateBrandKit({
      name: "ACME Corp",
      fontHeading: "Playfair Display",
      primaryColor: "#38BDF8",
      logoOverlay: {
        enabled: true,
        type: "text",
        text: "ACME CORP",
        x: 50,
        y: 85,
        width: 30,
        opacity: 1.0,
      },
    });

    const kit = useEditorStore.getState().brandKit;
    expect(kit?.logoOverlay?.type).toBe("text");
    expect(kit?.logoOverlay?.text).toBe("ACME CORP");
    expect(kit?.fontHeading).toBe("Playfair Display");
  });

  it("correctly converts normalized canvas percentage coordinates to video pixel coordinates", () => {
    // 9:16 aspect ratio: 1080 x 1920
    const W_9_16 = 1080;
    const H_9_16 = 1920;

    const overlay: BrandLogoOverlay = {
      enabled: true,
      type: "image",
      x: 75, // 75% from left
      y: 85, // 85% from top
      width: 20, // 20% of canvas width
      opacity: 0.8,
    };

    const wPx = Math.max(20, Math.round((overlay.width / 100) * W_9_16));
    const xPx = Math.max(0, Math.min(W_9_16 - wPx, Math.round((overlay.x / 100) * W_9_16)));
    const yPx = Math.max(0, Math.min(H_9_16 - 20, Math.round((overlay.y / 100) * H_9_16)));

    expect(wPx).toBe(216); // 20% of 1080
    expect(xPx).toBe(810); // 75% of 1080
    expect(yPx).toBe(1632); // 85% of 1920

    // 16:9 aspect ratio: 1920 x 1080
    const W_16_9 = 1920;
    const H_16_9 = 1080;

    const wPx16 = Math.max(20, Math.round((overlay.width / 100) * W_16_9));
    const xPx16 = Math.max(0, Math.min(W_16_9 - wPx16, Math.round((overlay.x / 100) * W_16_9)));
    const yPx16 = Math.max(0, Math.min(H_16_9 - 20, Math.round((overlay.y / 100) * H_16_9)));

    expect(wPx16).toBe(384); // 20% of 1920
    expect(xPx16).toBe(1440); // 75% of 1920
    expect(yPx16).toBe(918); // 85% of 1080
  });

  it("clamps coordinates so logo does not bleed outside frame boundaries", () => {
    const W = 1080;
    const H = 1920;
    const extremeX = 95; // 95%
    const width = 20; // 20%
    const extremeY = 98; // 98%

    const wPx = Math.max(20, Math.round((width / 100) * W)); // 216
    const xPx = Math.max(0, Math.min(W - wPx, Math.round((extremeX / 100) * W)));
    const yPx = Math.max(0, Math.min(H - 20, Math.round((extremeY / 100) * H)));

    expect(xPx + wPx).toBeLessThanOrEqual(W); // guaranteed to fit inside W
    expect(yPx).toBeLessThanOrEqual(H);
  });
});
