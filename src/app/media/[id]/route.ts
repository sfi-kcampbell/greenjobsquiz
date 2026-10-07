import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { getMedia } from "@/lib/media/media";

export const dynamic = "force-dynamic";

/**
 * Serves an uploaded image. An id's bytes never change, so browsers and the
 * CDN may keep it for a year. The type comes from the stored allow-list
 * (never the upload's claim), nosniff stops reinterpretation, and the CSP
 * neuters anything that's opened directly.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/media/[id]">) {
  const { id } = await ctx.params;
  const row = await getMedia(db, id);
  if (!row) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  return new NextResponse(new Uint8Array(row.bytes), {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.byteSize),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
