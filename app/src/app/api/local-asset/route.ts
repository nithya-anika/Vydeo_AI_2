import { NextRequest, NextResponse } from "next/server";
import { statSync, createReadStream, existsSync } from "fs";

function streamFile(path: string, options?: { start: number; end: number }) {
  const fileStream = createReadStream(path, options);
  let isClosed = false;

  return new ReadableStream({
    start(controller) {
      fileStream.on("data", (chunk) => {
        if (isClosed) return;
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          isClosed = true;
          fileStream.destroy();
        }
      });
      fileStream.on("end", () => {
        if (isClosed) return;
        isClosed = true;
        try {
          controller.close();
        } catch {}
      });
      fileStream.on("error", (err) => {
        if (isClosed) return;
        isClosed = true;
        try {
          controller.error(err);
        } catch {}
      });
    },
    cancel() {
      isClosed = true;
      fileStream.destroy();
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const urlParam = req.nextUrl.searchParams.get("url");
    if (!urlParam) return new NextResponse("Missing url", { status: 400 });

    const localPath = urlParam.replace("local://", "");
    
    // Security check to ensure we only serve from our temp directory
    if (!localPath.startsWith("/var/tmp/ai-video-") && !localPath.startsWith("/tmp/")) {
      return new NextResponse("Unauthorized path", { status: 403 });
    }

    if (!existsSync(localPath)) {
      return new NextResponse("File not found", { status: 404 });
    }

    const stat = statSync(localPath);
    const fileSize = stat.size;
    const range = req.headers.get("range");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      const webStream = streamFile(localPath, { start, end });

      return new NextResponse(webStream as any, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize.toString(),
          "Content-Type": "video/mp4",
        },
      });
    } else {
      const webStream = streamFile(localPath);
      
      return new NextResponse(webStream as any, {
        status: 200,
        headers: {
          "Content-Length": fileSize.toString(),
          "Content-Type": "video/mp4",
        },
      });
    }
  } catch (err: any) {
    console.error("[local-asset] Error:", err);
    return new NextResponse("Internal error", { status: 500 });
  }
}
