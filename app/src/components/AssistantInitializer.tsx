"use client";
import { useEffect } from "react";
import { useAssistantStore } from "@/store/assistantStore";

export function AssistantInitializer({ name, customized }: { name: string; customized: boolean }) {
  const setName = useAssistantStore(s => s.setName);
  useEffect(() => {
    setName(name, customized);
    useAssistantStore.setState({ isLoading: false });
  }, [name, customized, setName]);
  return null;
}
