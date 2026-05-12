import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesEmployeePortal } from "@/lib/roles";
import { setOwnProfilePhotoUrl } from "@/lib/user-repo";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  const extRaw = path.extname(file.name || "").slice(1).toLowerCase();
  const ext = extRaw && extRaw.length <= 8 ? extRaw : "png";
  const id = randomUUID();
  const fileName = `profile-${id}.${ext}`;
  const relDir = path.posix.join("uploads", user.id);
  const relPath = path.posix.join(relDir, fileName);
  const absDir = path.join(process.cwd(), "public", relDir);
  const absPath = path.join(process.cwd(), "public", relPath);

  await mkdir(absDir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(absPath, buf);

  const url = `/${relPath}`;
  await setOwnProfilePhotoUrl(user.id, url);

  return NextResponse.json({ url }, { status: 201 });
}

