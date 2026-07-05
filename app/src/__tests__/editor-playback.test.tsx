import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import EditorShell from "@/components/editor2/EditorShell";
import { ToastProvider } from "@/components/ui";
import { useEditorStore } from "@/store/editorStore";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

class ResizeObserverMock {
  constructor(private readonly callback?: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback?.([
      {
        target,
        contentRect: {
          width: 960,
          height: 540,
          x: 0,
          y: 0,
          top: 0,
          right: 960,
          bottom: 540,
          left: 0,
          toJSON() {
            return this;
          },
        } as DOMRectReadOnly,
      } as ResizeObserverEntry,
    ], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

describe("Editor playback transport", () => {
  const originalRAF = globalThis.requestAnimationFrame;
  const originalCancelRAF = globalThis.cancelAnimationFrame;
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  const originalFetch = globalThis.fetch;
  const originalPause = HTMLMediaElement.prototype.pause;
  let now = 0;
  let rafId = 0;
  let rafQueue = new Map<number, FrameRequestCallback>();

  beforeEach(() => {
    now = 0;
    rafId = 0;
    rafQueue = new Map();

    useEditorStore.setState({
      projectId: null,
      projectName: "Untitled Project",
      aspectRatio: "9:16",
      scenes: [],
      audioTracks: [],
      totalDuration: 12,
      clips: [],
      isPlaying: false,
      currentTime: 0,
      isMuted: false,
      volume: 0.8,
      activeSceneId: null,
      leftTab: "media",
      inspectorTarget: null,
      isGenerating: false,
      isDemoMode: false,
      isDirty: false,
      zoom: 2,
      snapEnabled: true,
      brandKit: null,
      past: [],
      future: [],
    });

    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafId += 1;
      rafQueue.set(rafId, cb);
      return rafId;
    });

    globalThis.cancelAnimationFrame = vi.fn((id: number) => {
      rafQueue.delete(id);
    });

    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = vi.fn();
    HTMLMediaElement.prototype.pause = vi.fn();
    globalThis.fetch = vi.fn();
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCancelRAF;
    globalThis.ResizeObserver = originalResizeObserver;
    Element.prototype.scrollIntoView = originalScrollIntoView;
    HTMLMediaElement.prototype.pause = originalPause;
    globalThis.fetch = originalFetch;
    sessionStorage.clear();
  });

  function flushFrame(deltaMs: number) {
    now += deltaMs;
    const callbacks = [...rafQueue.entries()];
    rafQueue.clear();
    for (const [, cb] of callbacks) cb(now);
  }

  it("toggles play and pause from the transport button", () => {
    render(
      <ToastProvider>
        <EditorShell />
      </ToastProvider>
    );

    const transportButton = screen.getByTitle("Play");

    fireEvent.mouseDown(transportButton, { button: 0 });
    expect(useEditorStore.getState().isPlaying).toBe(true);

    act(() => {
      flushFrame(100);
      flushFrame(100);
    });

    expect(useEditorStore.getState().currentTime).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByTitle("Pause"), { button: 0 });
    expect(useEditorStore.getState().isPlaying).toBe(false);
  });

  it("does not double-toggle when Space is pressed while the toolbar button is focused", () => {
    render(
      <ToastProvider>
        <EditorShell />
      </ToastProvider>
    );

    const transportButton = screen.getByTitle("Play");
    transportButton.focus();

    fireEvent.keyDown(transportButton, { key: " " });
    expect(useEditorStore.getState().isPlaying).toBe(true);
  });

  it("handles rapid spacebar toggles using the latest playback state", () => {
    render(
      <ToastProvider>
        <EditorShell />
      </ToastProvider>
    );

    fireEvent.keyDown(window, { code: "Space" });
    expect(useEditorStore.getState().isPlaying).toBe(true);

    fireEvent.keyDown(window, { code: "Space" });
    expect(useEditorStore.getState().isPlaying).toBe(false);
  });

  it("hydrates pending AI scenes and assigns generated clips into the main preview", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      json: async () => ({ url: "https://example.com/generated.mp4" }),
    } as Response);

    sessionStorage.setItem(
      "vydeoai_pending_video_gen",
      JSON.stringify({
        aspectRatio: "9:16",
        totalDuration: 5,
        scenes: [
          {
            id: "scene-1",
            order: 0,
            label: "Intro",
            description: "A person entering a meeting room",
            duration: 5,
            clipId: null,
            clipSrc: null,
            clipType: null,
            captions: [],
            transition: { type: "fade", duration: 0.5 },
            mood: "calm",
            colorGrade: null,
            colorAdjustments: {
              exposure: 0,
              contrast: 0,
              saturation: 0,
              temperature: 0,
              tint: 0,
              highlights: 0,
              shadows: 0,
            },
            effects: [],
          },
        ],
      })
    );

    render(
      <ToastProvider>
        <EditorShell />
      </ToastProvider>
    );

    await waitFor(() => {
      const scene = useEditorStore.getState().scenes.find((item) => item.id === "scene-1");
      expect(scene?.clipSrc).toBe("https://example.com/generated.mp4");
    });

    expect(useEditorStore.getState().activeSceneId).toBe("scene-1");
    expect(useEditorStore.getState().clips).toHaveLength(1);
  });

  it("recovers orphaned clips by assigning them into empty scenes", async () => {
    useEditorStore.setState({
      scenes: [
        {
          id: "scene-1",
          order: 0,
          label: "Intro",
          description: "",
          duration: 5,
          clipId: null,
          clipSrc: null,
          clipType: null,
          captions: [],
          transition: { type: "fade", duration: 0.5 },
          mood: "neutral",
          colorGrade: null,
          colorAdjustments: {
            exposure: 0,
            contrast: 0,
            saturation: 0,
            temperature: 0,
            tint: 0,
            highlights: 0,
            shadows: 0,
          },
          effects: [],
        },
      ],
      clips: [
        {
          id: "clip-1",
          name: "Generated clip",
          src: "https://example.com/clip.mp4",
          file: new File([], "Generated clip"),
          type: "video",
          duration: 5,
        },
      ],
      totalDuration: 5,
      activeSceneId: null,
    });

    render(
      <ToastProvider>
        <EditorShell />
      </ToastProvider>
    );

    await waitFor(() => {
      const scene = useEditorStore.getState().scenes.find((item) => item.id === "scene-1");
      expect(scene?.clipId).toBe("clip-1");
      expect(scene?.clipSrc).toBe("https://example.com/clip.mp4");
    });

    expect(useEditorStore.getState().activeSceneId).toBe("scene-1");
  });

  it("restores the footage handoff before the editor draft path can override it", async () => {
    sessionStorage.setItem(
      "vydeoai_pending_footage_editor",
      JSON.stringify({
        aspectRatio: "9:16",
        totalDuration: 8,
        scenes: [
          {
            id: "scene-1",
            order: 0,
            label: "IMG_3710",
            description: "IMG_3710",
            duration: 8,
            clipId: "clip-1",
            clipSrc: "blob:footage-clip-1",
            clipType: "video",
            captions: [],
            transition: { type: "cut", duration: 0.5 },
            mood: "neutral",
            colorGrade: null,
            colorAdjustments: {
              exposure: 0,
              contrast: 0,
              saturation: 0,
              temperature: 0,
              tint: 0,
              highlights: 0,
              shadows: 0,
            },
            effects: [],
          },
        ],
        clips: [
          {
            id: "clip-1",
            name: "IMG_3710",
            src: "blob:footage-clip-1",
            duration: 8,
            thumbnail: "data:image/jpeg;base64,abc",
          },
        ],
      })
    );

    render(
      <ToastProvider>
        <EditorShell projectId="footage" />
      </ToastProvider>
    );

    await waitFor(() => {
      const state = useEditorStore.getState();
      expect(state.activeSceneId).toBe("scene-1");
      expect(state.scenes[0]?.clipSrc).toBe("blob:footage-clip-1");
      expect(state.clips[0]?.src).toBe("blob:footage-clip-1");
    });
  });

  it("repairs a stale active scene so the preview video can mount", async () => {
    useEditorStore.setState({
      scenes: [
        {
          id: "scene-1",
          order: 0,
          label: "IMG_3710",
          description: "IMG_3710",
          duration: 8,
          clipId: "clip-1",
          clipSrc: "blob:footage-clip-1",
          clipType: "video",
          captions: [],
          transition: { type: "cut", duration: 0.5 },
          mood: "neutral",
          colorGrade: null,
          colorAdjustments: {
            exposure: 0,
            contrast: 0,
            saturation: 0,
            temperature: 0,
            tint: 0,
            highlights: 0,
            shadows: 0,
          },
          effects: [],
        },
      ],
      clips: [
        {
          id: "clip-1",
          name: "IMG_3710",
          src: "blob:footage-clip-1",
          file: new File([], "IMG_3710"),
          type: "video",
          duration: 8,
        },
      ],
      totalDuration: 8,
      activeSceneId: "missing-scene",
    });

    render(
      <ToastProvider>
        <EditorShell projectId="footage" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(useEditorStore.getState().activeSceneId).toBe("scene-1");
      expect(document.querySelector("video")?.getAttribute("src")).toBe("blob:footage-clip-1");
    });
  });

  it("unmutes generated video audio when the transport button starts playback", async () => {
    const originalPlay = HTMLMediaElement.prototype.play;
    const playMock = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.play = playMock;

    useEditorStore.setState({
      scenes: [
        {
          id: "scene-1",
          order: 0,
          label: "Intro",
          description: "",
          duration: 5,
          clipId: "clip-1",
          clipSrc: "https://example.com/clip.mp4",
          clipType: "video",
          captions: [],
          transition: { type: "fade", duration: 0.5 },
          mood: "neutral",
          colorGrade: null,
          colorAdjustments: {
            exposure: 0,
            contrast: 0,
            saturation: 0,
            temperature: 0,
            tint: 0,
            highlights: 0,
            shadows: 0,
          },
          effects: [],
          muteVideoAudio: false,
        },
      ],
      clips: [
        {
          id: "clip-1",
          name: "Generated clip",
          src: "https://example.com/clip.mp4",
          file: new File([], "Generated clip"),
          type: "video",
          duration: 5,
        },
      ],
      totalDuration: 5,
      activeSceneId: "scene-1",
      currentTime: 0,
      isPlaying: false,
    });

    render(
      <ToastProvider>
        <EditorShell />
      </ToastProvider>
    );

    const video = screen.getByTestId("editor-main-preview-video");
    expect(video).not.toBeNull();
    (video as HTMLVideoElement).muted = true;

    fireEvent.mouseDown(screen.getByTitle("Play"), { button: 0 });
    fireEvent.loadedData(video as HTMLVideoElement);

    await waitFor(() => {
      expect(useEditorStore.getState().isPlaying).toBe(true);
      expect(playMock).toHaveBeenCalled();
    });

    expect((video as HTMLVideoElement).muted).toBe(false);

    HTMLMediaElement.prototype.play = originalPlay;
  });
});
