import { redirect } from "next/navigation";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { EmployeeDashboard } from "@/components/employee-dashboard";
import { usesEmployeePortal } from "@/lib/roles";
import { getEmployeeProfileWithManagerDisplay } from "@/lib/user-repo";

export default async function EmployeeDashboardPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect("/login");
  }
  if (!usesEmployeePortal(user.role)) {
    redirect("/admin/dashboard");
  }

  const { profile, managerDisplay } = await getEmployeeProfileWithManagerDisplay(user.id);
  return <EmployeeDashboard user={user} profile={profile} managerDisplay={managerDisplay} />;
}
