import { handleUpload } from "@vercel/blob/client";
export const runtime = "nodejs";
export function GET() {
  return Response.json({ hosted: !!process.env.VERCEL });
}
export async function POST(request: Request) {
  try {
    if (!process.env.VERCEL)
      return Response.json({ error: "Use local uploads" }, { status: 400 });
    return Response.json(
      await handleUpload({
        request,
        body: await request.json(),
        onBeforeGenerateToken: async (pathname) => {
          if (!/^uploads\/[a-f0-9-]{36}\.xlsx$/.test(pathname))
            throw Error("Invalid upload path");
          return {
            maximumSizeInBytes: 30 * 1024 * 1024,
            allowedContentTypes: [
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "application/octet-stream",
            ],
            addRandomSuffix: false,
            allowOverwrite: false,
            validUntil: Date.now() + 10 * 60 * 1000,
          };
        },
      }),
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 400 },
    );
  }
}
