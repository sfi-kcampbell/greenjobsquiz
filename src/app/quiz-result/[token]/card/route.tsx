import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { media, quizzes } from "@/lib/db/schema";
import { getResultByShareToken } from "@/lib/public/sessions";
import { CARD_IMAGE_TYPES, CARD_SIZE, cardContent, SITE_NAME } from "@/lib/public/share-card";
import { isToken } from "@/lib/public/tokens";

/**
 * A result's share card (1200×630 PNG) for link previews and "Download
 * image". The token is the credential, like the share page: unknown or
 * revoked → 404, and next.config.ts keeps it out of caches and search.
 */
export const dynamic = "force-dynamic";

const BRAND = "#2f5d3a";
/** Geist (SIL Open Font License: assets/fonts/Geist-LICENSE.txt). */
const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));
const geist = Promise.all([font("Geist-Regular.ttf"), font("Geist-Bold.ttf")]);

async function bannerDataUri(quizId: number): Promise<string | null> {
  const [row] = await db
    .select({ contentType: media.contentType, bytes: media.bytes })
    .from(quizzes)
    .innerJoin(media, eq(media.id, quizzes.bannerMediaId))
    .where(eq(quizzes.id, quizId))
    .limit(1);
  if (!row || !CARD_IMAGE_TYPES.includes(row.contentType)) return null;
  return `data:${row.contentType};base64,${Buffer.from(row.bytes).toString("base64")}`;
}

export async function GET(req: NextRequest, ctx: RouteContext<"/quiz-result/[token]/card">) {
  const { token } = await ctx.params;
  const result = isToken(token) ? await getResultByShareToken(db, token) : null;
  if (!result) return new Response("Not found", { status: 404 });

  const card = cardContent(result);
  const [regular, bold] = await geist;
  const banner = await bannerDataUri(result.quiz.id);
  const host = req.nextUrl.host;

  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f6f5f1", color: "#1d2a21", fontFamily: "Geist" }}>
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered to PNG, not HTML
          <img src={banner} alt="" width={1200} height={170} style={{ width: 1200, height: 170, objectFit: "cover" }} />
        ) : (
          <div style={{ height: 170, background: BRAND, display: "flex", alignItems: "center", padding: "0 60px", color: "white", fontSize: 48, fontWeight: 700 }}>
            {card.quizTitle}
          </div>
        )}
        <div style={{ flex: 1, display: "flex", padding: "36px 60px 0", gap: 48 }}>
          <div style={{ flex: 1.2, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {banner && <div style={{ fontSize: 28, color: "#5b6b60", marginBottom: 8 }}>{card.quizTitle}</div>}
            <div style={{ fontSize: 34, color: "#5b6b60", textTransform: "uppercase", letterSpacing: 2 }}>{card.lead}</div>
            <div style={{ fontSize: card.title.length > 28 ? 56 : 76, fontWeight: 700, lineHeight: 1.05, marginTop: 6 }}>{card.title}</div>
            {card.percent !== null && <div style={{ fontSize: 44, fontWeight: 700, color: BRAND, marginTop: 14 }}>{`${card.percent}% match`}</div>}
          </div>
          {card.categories.length > 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 22 }}>
              {card.categories.map((c) => (
                <div key={c.label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28 }}>
                    <span>{c.label}</span>
                    <span style={{ color: "#5b6b60" }}>{`${c.percent}%`}</span>
                  </div>
                  <div style={{ display: "flex", height: 20, borderRadius: 10, background: "#dcdcd4", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(2, c.percent)}%`, height: 20, background: c.color, borderRadius: 10 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 60px 30px", fontSize: 24, color: "#5b6b60" }}>
          <span style={{ fontWeight: 700, color: BRAND }}>{SITE_NAME}</span>
          <span>{host}</span>
        </div>
      </div>
    ),
    { ...CARD_SIZE, fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: bold, weight: 700, style: "normal" },
      ] },
  );

  const headers = new Headers(image.headers);
  headers.set("Cache-Control", "private, no-store");
  if (req.nextUrl.searchParams.get("download") === "1") {
    headers.set("Content-Disposition", `attachment; filename="${result.quiz.slug}-result.png"`);
  }
  return new Response(image.body, { status: 200, headers });
}
