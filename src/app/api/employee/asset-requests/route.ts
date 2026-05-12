import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesEmployeePortal } from "@/lib/roles";
import { createAssetRequest, listAdminAssets, listMyAssetRequests } from "@/lib/hr-repo";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesEmployeePortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const catalog = await listAdminAssets();
  const myRequests = await listMyAssetRequests(user.id);
  return NextResponse.json({ catalog, myRequests });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesEmployeePortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const assetId =
    typeof body === "object" && body !== null && "assetId" in body
      ? String((body as { assetId: unknown }).assetId).trim()
      : "";
  const qtyRaw =
    typeof body === "object" && body !== null && "qty" in body
      ? Number((body as { qty: unknown }).qty)
      : 0;
  const reason =
    typeof body === "object" && body !== null && "reason" in body
      ? String((body as { reason: unknown }).reason).trim()
      : "";

  if (!assetId || !reason) {
    return NextResponse.json({ error: "assetId and reason are required" }, { status: 400 });
  }

  try {
    const request = await createAssetRequest({ userId: user.id, assetId, qty: qtyRaw || 1, reason });
    return NextResponse.json({ request }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 400 },
    );
  }
}

