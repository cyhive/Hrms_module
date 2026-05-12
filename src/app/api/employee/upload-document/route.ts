import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesEmployeePortal } from "@/lib/roles";
import { addOwnEmployeeDocument } from "@/lib/user-repo";
import { EmployeeDocumentType } from "@/lib/types";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

function isDocType(v: string): v is EmployeeDocumentType {
  return [
    "aadhaar",
    "pan",
    "sslc",
    "plus2",
    "degree",
    "experience",
    "certificate",
    "other",
  ].includes(v);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesEmployeePortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  const typeRaw = String(form.get("type") ?? "").trim();
  const label = String(form.get("label") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!typeRaw || !isDocType(typeRaw)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  const extRaw = path.extname(file.name || "").slice(1).toLowerCase();
  const ext = extRaw && extRaw.length <= 12 ? extRaw : "bin";
  const id = randomUUID();
  const safeType = typeRaw.replace(/[^a-z0-9-]/g, "");
  const fileName = `${safeType}-${id}.${ext}`;
  const relDir = path.posix.join("uploads", user.id, "documents");
  const relPath = path.posix.join(relDir, fileName);
  const absDir = path.join(process.cwd(), "public", relDir);
  const absPath = path.join(process.cwd(), "public", relPath);

  await mkdir(absDir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(absPath, buf);

  const url = `/${relPath}`;
  const doc = {
    id,
    type: typeRaw,
    label,
    url,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
  await addOwnEmployeeDocument(user.id, doc);

  return NextResponse.json({ document: doc }, { status: 201 });
}

