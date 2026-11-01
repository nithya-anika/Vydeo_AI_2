export async function uploadFileMultipart(
  file: File | Blob,
  filename?: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const safeFilename = filename || (file as File).name || `upload_${Date.now()}.mp4`;
  const safeContentType = file.type || "video/mp4";
  const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks
  
  if (file.size < CHUNK_SIZE) {
    // Fallback to standard upload
    const initRes = await fetch("/api/upload-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: safeFilename, contentType: safeContentType })
    });
    const initData = await initRes.json();
    if (!initRes.ok) throw new Error(initData.error || "Failed standard upload init");
    
    await fetch(initData.url, {
      method: "PUT",
      headers: { "Content-Type": safeContentType },
      body: file
    });
    
    if (onProgress) onProgress(100);
    return initData.publicUrl || initData.gcsPath;
  }

  // 1. Init Multipart
  const initRes = await fetch("/api/upload-media-multipart-init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: safeFilename, contentType: safeContentType })
  });
  const { uploadId, key } = await initRes.json();
  if (!uploadId) throw new Error("Failed to initialize multipart upload");

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const parts: { eTag: string, partNumber: number }[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const partNumber = i + 1;

    // 2. Sign Part
    const signRes = await fetch("/api/upload-media-multipart-sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId, key, partNumber })
    });
    const { url } = await signRes.json();

    // 3. Upload Part
    const uploadRes = await fetch(url, {
      method: "PUT",
      body: chunk
    });
    
    const eTag = uploadRes.headers.get("ETag");
    if (!eTag) throw new Error("Missing ETag from AWS after chunk upload");

    parts.push({ eTag, partNumber });
    if (onProgress) onProgress(Math.round(((i + 1) / totalChunks) * 100));
  }

  // 4. Complete
  const completeRes = await fetch("/api/upload-media-multipart-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, key, parts })
  });
  
  const { publicUrl } = await completeRes.json();
  return publicUrl;
}
