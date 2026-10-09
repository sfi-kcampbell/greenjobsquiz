import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { requestOrigin } from "@/lib/app-url";
import { getStaff } from "@/lib/auth/access";
import { idSchema } from "@/lib/content/action-result";
import { qrSvg } from "@/lib/content/qr";
import { db } from "@/lib/db/client";
import { quizCodes } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** The code's short link as a QR code (SVG download). Staff only. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/admin/quizzes/[id]/codes/[codeId]/qr.svg">) {
  if (!(await getStaff())) return new Response("Sign in first.", { status: 401 });
  const params = await ctx.params;
  const quizId = idSchema.safeParse(params.id);
  const codeId = idSchema.safeParse(params.codeId);
  if (!quizId.success || !codeId.success) return new Response("Not found", { status: 404 });
  const [row] = await db
    .select({ code: quizCodes.code })
    .from(quizCodes)
    .where(and(eq(quizCodes.id, codeId.data), eq(quizCodes.quizId, quizId.data)))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(await qrSvg(`${await requestOrigin()}/q/${row.code}`), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `attachment; filename="${row.code}-qr.svg"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
