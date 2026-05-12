import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { updateOwnPassword } from "@/lib/user-repo";

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const oldPassword = String(body.oldPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (!oldPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current password and new password are required" },
      { status: 400 },
    );
  }

  if (newPassword.length < 6) {
    return NextResponse.json(
      { error: "New password should be at least 6 characters" },
      { status: 400 },
    );
  }

  try {
    const updatedUser = await updateOwnPassword(user.id, oldPassword, newPassword);
    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not change password" },
      { status: 400 },
    );
  }
}
