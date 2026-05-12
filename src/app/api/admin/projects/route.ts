import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-repo";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { usesAdminPortal } from "@/lib/roles";
import {
  createProject,
  getProjectTeamDashboard,
  listProjectsWithMemberCounts,
} from "@/lib/hr-repo";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const projectId = req.nextUrl.searchParams.get("projectId")?.trim();
  if (projectId) {
    try {
      const dashboard = await getProjectTeamDashboard(projectId);
      return NextResponse.json(dashboard);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Not found";
      return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 400 });
    }
  }
  const projects = await listProjectsWithMemberCounts();
  return NextResponse.json({ projects });
}

/** POST create project: allowed for HR and Admin (`usesAdminPortal`). */
export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name =
    typeof body === "object" && body !== null && "name" in body
      ? String((body as { name: unknown }).name).trim()
      : "";
  const description =
    typeof body === "object" && body !== null && "description" in body
      ? String((body as { description: unknown }).description).trim()
      : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  try {
    const project = await createProject({ name, description: description || undefined });
    void recordActivity({
      actorUserId: user.id,
      actorUsername: user.username,
      kind: "project.create",
      message: `Created project "${project.name}"`,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Create failed" },
      { status: 400 },
    );
  }
}
