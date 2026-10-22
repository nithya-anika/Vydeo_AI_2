import { v4 as uuidv4 } from "uuid";

// Polyfill window.crypto.randomUUID for non-secure HTTP contexts (e.g. direct EC2 IP)
if (typeof window !== "undefined") {
  try {
    if (!window.crypto) {
      (window as any).crypto = {};
    }
    if (typeof window.crypto.randomUUID !== "function") {
      window.crypto.randomUUID = (() => uuidv4()) as any;
    }
  } catch {
    // Ignore polyfill error if object is frozen
  }
}

export function safeUUID(): string {
  try {
    if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
  } catch {}
  return uuidv4();
}

export { uuidv4 };
