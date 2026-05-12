import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesAdminPortal } from "@/lib/roles";
import {
  createAsset,
  decideAssetRequest,
  deleteAssetCatalogItem,
  listAdminAssetRequests,
  listAdminAssets,
} from "@/lib/hr-repo";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const assets = await listAdminAssets();
  const requests = await listAdminAssetRequests();
  return NextResponse.json({ assets, requests });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    const isForm = contentType.toLowerCase().includes("multipart/form-data");
    let body: unknown = null;
    let form: FormData | null = null;
    if (isForm) {
      form = await req.formData();
    } else {
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
    }
    const kind = isForm
      ? String(form?.get("kind") ?? "").trim()
      : typeof body === "object" && body !== null && "kind" in body
        ? String((body as any).kind)
        : "";

    if (kind === "create") {
      const read = (key: string) =>
        isForm ? String(form?.get(key) ?? "").trim() : String((body as any)[key] ?? "").trim();
      const name = read("name");
      const category = read("category");
      const details = read("details");
      const value = Number(read("value") || 0);
      const totalQty = Number(read("totalQty") || 0);
      if (!name || !category || !Number.isFinite(value) || value < 0) {
        return NextResponse.json({ error: "Invalid asset fields" }, { status: 400 });
      }
      let imageUrl: string | undefined;
      const file = isForm ? form?.get("image") : null;
      if (file instanceof File && file.size > 0) {
        if (!file.type.startsWith("image/")) {
          return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
        }
        if (file.size > MAX_IMAGE_BYTES) {
          return NextResponse.json({ error: "Image too large (max 5MB)" }, { status: 400 });
        }
        const extRaw = path.extname(file.name || "").slice(1).toLowerCase();
        const ext = extRaw && extRaw.length <= 8 ? extRaw : "png";
        const fileName = `asset-${randomUUID()}.${ext}`;
        const relDir = path.posix.join("uploads", "assets");
        const relPath = path.posix.join(relDir, fileName);
        const absDir = path.join(process.cwd(), "public", relDir);
        const absPath = path.join(process.cwd(), "public", relPath);
        await mkdir(absDir, { recursive: true });
        const buf = Buffer.from(await file.arrayBuffer());
        await writeFile(absPath, buf);
        imageUrl = `/${relPath}`;
      }
      const asset = await createAsset({
        name,
        category,
        details: details || undefined,
        value,
        totalQty,
        imageUrl,
      });
      return NextResponse.json({ asset }, { status: 201 });
    }

    if (kind === "decide-request") {
      const requestId = String((body as any).requestId ?? "").trim();
      const decision = String((body as any).decision ?? "").trim();
      const decisionReason = String((body as any).decisionReason ?? "").trim();
      if (!requestId || !["approve", "reject"].includes(decision)) {
        return NextResponse.json({ error: "Invalid decision fields" }, { status: 400 });
      }
      const updated = await decideAssetRequest({
        requestId,
        decision: decision as "approve" | "reject",
        decisionReason: decisionReason || undefined,
      });
      return NextResponse.json({ request: updated });
    }

    if (kind === "delete") {
      const assetId = String((body as any).assetId ?? "").trim();
      if (!assetId) {
        return NextResponse.json({ error: "assetId is required" }, { status: 400 });
      }
      await deleteAssetCatalogItem(assetId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 400 },
    );
  }
}

