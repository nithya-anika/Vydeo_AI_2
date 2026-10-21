import http from "http";
import fs from "fs";
import path from "path";

const SESSION_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QHZ5ZGVvLmFpIiwiZmlyc3ROYW1lIjoiVGVzdGVyIiwicGxhbiI6InBybyIsImlhdCI6MTc5MjQxMTg2MCwiZXhwIjoxNzkzMDE2NjYwfQ.9TqFVDH96EjK_5blOhtbsEAJWgMzmlElPod5LySeG5I";
const SCREENSHOTS_DIR = path.resolve(process.cwd(), "screenshots");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async captureScreenshot(filename) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    const filePath = path.join(SCREENSHOTS_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(data, "base64"));
    console.log(`[Screenshot captured]: ${filePath}`);
    return filePath;
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || "Evaluation error");
    }
    return res.result?.value;
  }
}

async function run() {
  console.log("Connecting to Chrome DevTools Protocol...");
  const targets = await getJson("http://localhost:9222/json/list");
  const pageTarget = targets.find((t) => t.type === "page");
  if (!pageTarget) throw new Error("No open page target found in Chrome");

  const client = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();

  console.log("Enabling Page, Network, and Runtime domains...");
  await client.send("Page.enable");
  await client.send("Network.enable");
  await client.send("Runtime.enable");

  // Set 1440x900 viewport
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Set authentication session cookie
  console.log("Setting vydeo_session cookie...");
  await client.send("Network.setCookie", {
    name: "vydeo_session",
    value: SESSION_TOKEN,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    secure: false,
  });

  // Navigate to editor
  console.log("Navigating to http://localhost:3000/editor...");
  await client.send("Page.navigate", { url: "http://localhost:3000/editor" });

  // Wait for network and DOM to settle
  await new Promise((r) => setTimeout(r, 4000));

  // Verify page title and header
  const title = await client.eval("document.title");
  console.log(`Page title: "${title}"`);

  // 1. Normal Editor State
  console.log("Inspecting normal editor state...");
  await client.captureScreenshot("01_normal_editor_state.png");

  // 2. Empty panels inspection (Media, Timeline, Right AI panel)
  console.log("Verifying empty state indicators and layout...");
  const emptyInfo = await client.eval(`(() => {
    const dropzone = document.querySelector('.dropzone');
    const timeline = document.querySelector('.timeline-panel') || document.querySelector('[data-timeline]');
    const exportBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Export'));
    return {
      hasDropzone: !!dropzone,
      dropzoneTitle: dropzone?.querySelector('.dropzone-title')?.textContent,
      hasExportBtn: !!exportBtn,
      exportBtnText: exportBtn?.textContent,
    };
  })()`);
  console.log("Empty panel audit:", JSON.stringify(emptyInfo, null, 2));
  await client.captureScreenshot("02_empty_panels_state.png");

  // 3. Inspect Captions tab
  console.log("Switching to Captions panel...");
  await client.eval(`(() => {
    const leftButtons = Array.from(document.querySelectorAll('button'));
    const captionsBtn = leftButtons.find(b => b.getAttribute('title') === 'Captions' || b.getAttribute('title') === 'Subtitles');
    if (captionsBtn) captionsBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 1000));
  await client.captureScreenshot("03_captions_panel_empty.png");

  // 4. Test Save Feedback Transition
  console.log("Testing project save status feedback...");
  await client.eval(`(() => {
    const saveDot = document.querySelector('.save-dot') || document.querySelector('[title*="saved"]');
    return saveDot ? saveDot.getAttribute('title') : 'No dot found';
  })()`);
  await client.captureScreenshot("04_project_saved_state.png");

  // 5. Simulate AI First-Cut Generation loading state
  console.log("Triggering AI first-cut generation feedback state...");
  await client.eval(`(() => {
    // Open AI Tab
    const aiBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('AI') || b.getAttribute('title')?.includes('AI'));
    if (aiBtn) aiBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 800));

  await client.eval(`(() => {
    // Set isGenerating flag in Zustand store to test UI responsiveness
    if (window.__editorStore) {
      window.__editorStore.setState({ isGenerating: true });
    }
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  await client.captureScreenshot("05_ai_generating_state.png");

  // 6. Test Export Loading & Progress State
  console.log("Inspecting export button loading feedback and spinner...");
  // Click Export button without media to test error recovery
  await client.eval(`(() => {
    const exportButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().startsWith('Export'));
    const mainExport = exportButtons[exportButtons.length - 1];
    if (mainExport) mainExport.click();
  })()`);
  await new Promise((r) => setTimeout(r, 1200));
  await client.captureScreenshot("06_export_error_toast.png");

  // Check toast notification and recovery
  const toastMessage = await client.eval(`(() => {
    const toast = document.querySelector('.toast') || document.querySelector('[role="alert"]') || document.querySelector('.toast-content');
    return toast?.textContent || 'No toast found';
  })()`);
  console.log(`Export feedback toast: "${toastMessage}"`);

  // Verify controls recovered and are not disabled
  const exportRecovered = await client.eval(`(() => {
    const exportButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().startsWith('Export'));
    const mainExport = exportButtons[exportButtons.length - 1];
    return {
      disabled: mainExport?.disabled,
      ariaBusy: mainExport?.getAttribute('aria-busy'),
      text: mainExport?.textContent?.trim()
    };
  })()`);
  console.log("Export button recovered state:", JSON.stringify(exportRecovered, null, 2));

  console.log("=== BROWSER VERIFICATION COMPLETE ===");
  process.exit(0);
}

run().catch((err) => {
  console.error("Browser verification failed:", err);
  process.exit(1);
});
