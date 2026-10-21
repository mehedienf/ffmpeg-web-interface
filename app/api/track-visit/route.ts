/**
 * app/api/track-visit/route.ts
 *
 * POST /api/track-visit
 * Records a page visit, increments today's visits and unique visitors in data/visitors.json.
 *
 * GET /api/track-visit
 * Returns current visitor stats (today's visits, all-time visits, daily history, recent visits).
 */

import { NextRequest, NextResponse } from "next/server";
import { recordVisit, getVisitorStats } from "@/lib/analytics";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { referrer?: string };
    const stats = await recordVisit(req, body.referrer);
    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const stats = getVisitorStats();
    return NextResponse.json(stats, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

