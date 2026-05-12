import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesEmployeePortal } from "@/lib/roles";
import { updateOwnBasicProfile } from "@/lib/user-repo";

export async function PATCH(req: NextRequest) {
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

  const fullName =
    typeof body === "object" && body !== null && "fullName" in body
      ? String((body as { fullName: unknown }).fullName)
      : "";
  const phone =
    typeof body === "object" && body !== null && "phone" in body
      ? String((body as { phone: unknown }).phone)
      : "";

  try {
    const profile = await updateOwnBasicProfile(user.id, { fullName, phone });
    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Profile update failed" },
      { status: 400 },
    );
  }
}

