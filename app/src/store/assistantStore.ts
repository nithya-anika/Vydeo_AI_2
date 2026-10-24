import { create } from "zustand";

export interface AssistantState {
  name: string;
  customized: boolean;
  isLoading: boolean;
  setName: (name: string, customized?: boolean) => void;
  fetchPreferences: () => Promise<void>;
}

export const useAssistantStore = create<AssistantState>((set, get) => ({
  name: "Rumi",
  customized: false,
  isLoading: true,
  setName: (name, customized = true) => set({ name, customized }),
  fetchPreferences: async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          set({
            name: data.user.assistantName || "Rumi",
            customized: data.user.assistantNameCustomized ?? false,
            isLoading: false,
          });
        }
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  }
}));
