import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity-repo";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { isCreatableRole, usesAdminPortal } from "@/lib/roles";
import type { Role } from "@/lib/types";
import { findProjectById } from "@/lib/hr-repo";
import {
  createEmployee,
  findUserById,
  listEmployees,
  listReportingCandidates,
  updateEmployeeManager,
  updateEmployeeProject,
} from "@/lib/user-repo";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const scope = req.nextUrl.searchParams.get("scope");
  if (scope === "manager-options") {
    return NextResponse.json({ employees: await listReportingCandidates() });
  }
  return NextResponse.json({ employees: await listEmployees() });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !usesAdminPortal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const department = String(body.department ?? "").trim();
  const designation = String(body.designation ?? "").trim();
  const joiningDate = String(body.joiningDate ?? "").trim();
  const certificatesRaw = String(body.certificates ?? "").trim();
  const managerIdRaw = String(body.managerId ?? "").trim();
  const projectIdRaw = String(body.projectId ?? "").trim();
  const roleRaw = String(body.role ?? "employee").trim();

  if (
    !username ||
    !password ||
    !fullName ||
    !email ||
    !phone ||
    !department ||
    !designation ||
    !joiningDate
  ) {
    return NextResponse.json(
      { error: "All onboarding fields are required" },
      { status: 400 },
    );
  }

  if (!isCreatableRole(roleRaw)) {
    return NextResponse.json(
      { error: "Role must be one of: employee, manager, hr, admin" },
      { status: 400 },
    );
  }

  const role = roleRaw as Role;

  if (projectIdRaw) {
    const proj = await findProjectById(projectIdRaw);
    if (!proj) {
      return NextResponse.json({ error: "Invalid project" }, { status: 400 });
    }
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password should be at least 6 characters" },
      { status: 400 },
    );
  }

  try {
    const employee = await createEmployee({
      username,
      password,
      role,
      profile: {
        fullName,
        email,
        phone,
        department,
        designation,
        joiningDate,
        certificates: certificatesRaw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        ...(managerIdRaw ? { managerId: managerIdRaw } : {}),
        ...(projectIdRaw && (role === "employee" || role === "manager") ? { projectId: projectIdRaw } : {}),
      },
    });
    void recordActivity({
      actorUserId: user.id,
      actorUsername: user.username,
      kind: "employee.create",
      message: `Created ${role} account @${employee.username}`,
    });
    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create user" },
      { status: 400 },
    );
  }
}

export async function PATCH(req: NextRequest) {
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
  const userId =
    typeof body === "object" && body !== null && "userId" in body
      ? String((body as { userId: unknown }).userId).trim()
      : "";
  const hasProjectIdKey = typeof body === "object" && body !== null && "projectId" in body;
  const hasManagerIdKey = typeof body === "object" && body !== null && "managerId" in body;
  const projectIdVal = hasProjectIdKey ? (body as { projectId: unknown }).projectId : undefined;
  const managerIdVal = hasManagerIdKey ? (body as { managerId: unknown }).managerId : undefined;
  const projectIdNormalized =
    projectIdVal === null || projectIdVal === undefined ? "" : String(projectIdVal).trim();
  const managerIdNormalized =
    managerIdVal === null || managerIdVal === undefined ? "" : String(managerIdVal).trim();

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (!hasProjectIdKey && !hasManagerIdKey) {
    return NextResponse.json(
      { error: "Send projectId and/or managerId to update (use null or empty string to clear)" },
      { status: 400 },
    );
  }

  if (hasProjectIdKey && projectIdNormalized) {
    const proj = await findProjectById(projectIdNormalized);
    if (!proj) {
      return NextResponse.json({ error: "Invalid project" }, { status: 400 });
    }
  }

  try {
    if (hasManagerIdKey) {
      await updateEmployeeManager({
        userId,
        managerId: managerIdNormalized || null,
      });
    }
    if (hasProjectIdKey) {
      await updateEmployeeProject({
        userId,
        projectId: projectIdNormalized || null,
      });
    }
    const target = await findUserById(userId);
    const targetLabel = target?.username ?? userId;
    const parts: string[] = [];
    if (hasManagerIdKey) parts.push("reporting manager");
    if (hasProjectIdKey) parts.push("project");
    void recordActivity({
      actorUserId: user.id,
      actorUsername: user.username,
      kind: "employee.org",
      message: `Updated ${parts.join(" & ")} for @${targetLabel}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 400 },
    );
  }
}
