import { randomUUID } from "crypto";
import { Collection } from "mongodb";
import { getDb } from "./mongodb";
import {
  canBeReportingManager,
  CREATABLE_ROLES,
  DIRECTORY_ROLES,
  usesEmployeePortal,
} from "./roles";
import { SEED_ADMIN_PASSWORD, SEED_ADMIN_USERNAME } from "./seed-defaults";
import { EmployeeDocument, EmployeeProfile, Role, SafeUser, User } from "./types";

export { SEED_ADMIN_PASSWORD, SEED_ADMIN_USERNAME } from "./seed-defaults";

type UserRecord = Omit<User, "id"> & { _id: string };

interface OffboardingRequestRecord {
  _id: string;
  userId: string;
  type: "resignation" | "termination";
  lastWorkingDay: string; // YYYY-MM-DD
  status: "pending" | "approved" | "rejected";
}

async function usersCollection(): Promise<Collection<UserRecord>> {
  const db = await getDb();
  return db.collection<UserRecord>("users");
}

async function offboardingCollection(): Promise<Collection<OffboardingRequestRecord>> {
  const db = await getDb();
  return db.collection<OffboardingRequestRecord>("offboarding_requests");
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toSafeUser(user: UserRecord): SafeUser {
  return {
    id: user._id,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

export async function isLoginBlockedAfterOffboarding(userId: string): Promise<boolean> {
  const offboarding = await offboardingCollection();
  const latestApproved = await offboarding
    .find({ userId, status: "approved" })
    .sort({ decidedAt: -1, createdAt: -1 } as any)
    .limit(1)
    .next();
  if (!latestApproved) return false;
  const today = toLocalIsoDate(new Date());
  return today > latestApproved.lastWorkingDay;
}

export async function ensureSeedAdmin(): Promise<void> {
  const users = await usersCollection();
  const adminExists = await users.findOne({ username: SEED_ADMIN_USERNAME });
  if (adminExists) return;

  await users.insertOne({
    _id: randomUUID(),
    username: SEED_ADMIN_USERNAME,
    password: SEED_ADMIN_PASSWORD,
    role: "admin",
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  });
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const users = await usersCollection();
  return users.findOne({ username });
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const users = await usersCollection();
  return users.findOne({ _id: id });
}

export async function getEmployeeProfileByUserId(
  id: string,
): Promise<EmployeeProfile | null> {
  const user = await findUserById(id);
  if (!user || !usesEmployeePortal(user.role)) return null;
  return user.profile ?? null;
}

/** Profile plus resolved manager label for dashboards. */
export async function getEmployeeProfileWithManagerDisplay(userId: string): Promise<{
  profile: EmployeeProfile | null;
  managerDisplay: string | null;
}> {
  const profile = await getEmployeeProfileByUserId(userId);
  if (!profile?.managerId) {
    return { profile, managerDisplay: null };
  }
  const mgr = await findUserById(profile.managerId);
  if (!mgr || !canBeReportingManager(mgr.role)) {
    return { profile, managerDisplay: null };
  }
  const managerDisplay = mgr.profile?.fullName?.trim() || mgr.username;
  return { profile, managerDisplay };
}

export async function validateCredentials(
  username: string,
  password: string,
): Promise<SafeUser | null> {
  await ensureSeedAdmin();
  const user = await findUserByUsername(username);
  if (!user || user.password !== password) {
    return null;
  }
  if (usesEmployeePortal(user.role) && (await isLoginBlockedAfterOffboarding(user._id))) {
    return null;
  }
  return toSafeUser(user);
}

export async function createEmployee(input: {
  username: string;
  password: string;
  role: Role;
  profile: EmployeeProfile;
}): Promise<SafeUser> {
  if (!CREATABLE_ROLES.includes(input.role)) {
    throw new Error("Invalid role");
  }

  const users = await usersCollection();
  const existing = await users.findOne({ username: input.username });
  if (existing) {
    throw new Error("Username already exists");
  }

  const profile: EmployeeProfile = { ...input.profile };
  if (!usesEmployeePortal(input.role)) {
    delete profile.managerId;
    delete profile.projectId;
  } else {
    const mgrRaw = profile.managerId?.trim();
    if (mgrRaw) {
      const allowedManagerRoles: Role[] =
        input.role === "manager" ? ["hr", "admin"] : DIRECTORY_ROLES;
      const mgr = await users.findOne({ _id: mgrRaw, role: { $in: allowedManagerRoles } });
      if (!mgr) {
        if (input.role === "manager") {
          throw new Error("Manager role must report to HR or Admin");
        }
        throw new Error("Manager must be an existing staff member (employee, manager, HR, or admin)");
      }
      profile.managerId = mgr._id;
    } else {
      if (input.role === "manager") {
        throw new Error("Manager role requires reporting to HR or Admin");
      }
      delete profile.managerId;
    }
    const pid = profile.projectId?.trim();
    if (pid) profile.projectId = pid;
    else delete profile.projectId;
  }

  const record: UserRecord = {
    _id: randomUUID(),
    username: input.username,
    password: input.password,
    role: input.role,
    mustChangePassword: true,
    profile,
    createdAt: new Date().toISOString(),
  };

  await users.insertOne(record);
  return toSafeUser(record);
}

export async function listEmployees(): Promise<Array<SafeUser & { profile?: EmployeeProfile }>> {
  const users = await usersCollection();
  const data = await users
    .find({ role: { $in: DIRECTORY_ROLES } })
    .sort({ createdAt: -1 })
    .toArray();
  return data.map((u) => ({ ...toSafeUser(u), profile: u.profile }));
}

export async function updateEmployeeProject(input: {
  userId: string;
  projectId: string | null;
}): Promise<void> {
  const users = await usersCollection();
  const existing = await users.findOne({ _id: input.userId });
  if (!existing) throw new Error("User not found");
  if (!usesEmployeePortal(existing.role)) {
    throw new Error("Only employees and managers can be assigned to a project");
  }
  if (input.projectId === null || input.projectId === "") {
    await users.updateOne({ _id: input.userId }, { $unset: { "profile.projectId": "" } });
    return;
  }
  await users.updateOne(
    { _id: input.userId },
    { $set: { "profile.projectId": input.projectId } },
  );
}

/** Walk managerId chain upward; true if `needleUserId` appears (reporting cycle / report-as-manager). */
async function managerChainContainsUser(startManagerId: string, needleUserId: string): Promise<boolean> {
  let id: string | undefined = startManagerId;
  const seen = new Set<string>();
  for (let i = 0; i < 200 && id; i++) {
    if (id === needleUserId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const u = await findUserById(id);
    id = u?.profile?.managerId?.trim() || undefined;
  }
  return false;
}

export async function updateEmployeeManager(input: {
  userId: string;
  managerId: string | null;
}): Promise<void> {
  const users = await usersCollection();
  const existing = await users.findOne({ _id: input.userId });
  if (!existing) throw new Error("User not found");
  if (!usesEmployeePortal(existing.role)) {
    throw new Error("Only employees and managers have a reporting manager");
  }

  const mgrRaw = (input.managerId ?? "").trim();

  if (mgrRaw === input.userId) {
    throw new Error("A person cannot be their own manager");
  }

  if (existing.role === "manager") {
    if (!mgrRaw) {
      throw new Error("Manager role requires reporting to HR or Admin");
    }
    const mgr = await users.findOne({ _id: mgrRaw, role: { $in: ["hr", "admin"] } });
    if (!mgr) {
      throw new Error("Manager role must report to HR or Admin");
    }
    if (await managerChainContainsUser(mgrRaw, input.userId)) {
      throw new Error("Invalid reporting line");
    }
    await users.updateOne({ _id: input.userId }, { $set: { "profile.managerId": mgrRaw } });
    return;
  }

  if (existing.role === "employee") {
    if (!mgrRaw) {
      await users.updateOne({ _id: input.userId }, { $unset: { "profile.managerId": "" } });
      return;
    }
    const mgr = await users.findOne({ _id: mgrRaw, role: { $in: DIRECTORY_ROLES } });
    if (!mgr || !canBeReportingManager(mgr.role)) {
      throw new Error("Manager must be an existing staff member (employee, manager, HR, or admin)");
    }
    if (await managerChainContainsUser(mgrRaw, input.userId)) {
      throw new Error("Cannot assign a direct or indirect report as manager");
    }
    await users.updateOne({ _id: input.userId }, { $set: { "profile.managerId": mgrRaw } });
  }
}

export async function listReportingCandidates(): Promise<Array<SafeUser & { profile?: EmployeeProfile }>> {
  const users = await usersCollection();
  const data = await users
    .find({ role: { $in: ["employee", "manager", "hr", "admin"] } })
    .sort({ createdAt: -1 })
    .toArray();
  return data.map((u) => ({ ...toSafeUser(u), profile: u.profile }));
}

export async function updateOwnPassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<SafeUser> {
  const users = await usersCollection();
  const existing = await users.findOne({ _id: userId });
  if (!existing) {
    throw new Error("User not found");
  }
  if (existing.password !== oldPassword) {
    throw new Error("Current password is incorrect");
  }

  await users.updateOne(
    { _id: userId },
    {
      $set: {
        password: newPassword,
        mustChangePassword: false,
      },
    },
  );

  const updated = await users.findOne({ _id: userId });
  if (!updated) {
    throw new Error("User not found after update");
  }
  return toSafeUser(updated);
}

export async function setOwnProfilePhotoUrl(userId: string, url: string): Promise<void> {
  const users = await usersCollection();
  const existing = await users.findOne({ _id: userId });
  if (!existing) {
    throw new Error("User not found");
  }
  await users.updateOne(
    { _id: userId },
    {
      $set: {
        "profile.profilePhotoUrl": url,
      },
    },
  );
}

export async function addOwnEmployeeDocument(userId: string, doc: EmployeeDocument): Promise<void> {
  const users = await usersCollection();
  const existing = await users.findOne({ _id: userId });
  if (!existing) {
    throw new Error("User not found");
  }
  await users.updateOne(
    { _id: userId },
    {
      $push: {
        "profile.documents": doc,
      },
    },
  );
}

export async function removeOwnEmployeeDocument(userId: string, docId: string): Promise<void> {
  const users = await usersCollection();
  const existing = await users.findOne({ _id: userId });
  if (!existing) {
    throw new Error("User not found");
  }
  await users.updateOne(
    { _id: userId },
    {
      $pull: {
        "profile.documents": { id: docId },
      },
    },
  );
}

export async function updateOwnBasicProfile(
  userId: string,
  input: { fullName: string; phone: string },
): Promise<EmployeeProfile> {
  const users = await usersCollection();
  const existing = await users.findOne({ _id: userId });
  if (!existing) {
    throw new Error("User not found");
  }
  if (!usesEmployeePortal(existing.role)) {
    throw new Error("Only employees can update this profile");
  }
  if (!existing.profile) {
    throw new Error("Profile not found");
  }

  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  if (!fullName || !phone) {
    throw new Error("Name and phone are required");
  }

  await users.updateOne(
    { _id: userId },
    {
      $set: {
        "profile.fullName": fullName,
        "profile.phone": phone,
      },
    },
  );

  const updated = await users.findOne({ _id: userId });
  if (!updated?.profile) {
    throw new Error("Profile not found after update");
  }
  return updated.profile;
}

/** @deprecated Use updateOwnPassword */
export async function updateEmployeePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<SafeUser> {
  return updateOwnPassword(userId, oldPassword, newPassword);
}
