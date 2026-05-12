import { redirect } from "next/navigation";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { AdminDashboard } from "@/components/admin-dashboard";
import { usesAdminPortal } from "@/lib/roles";

export default async function AdminDashboardPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect("/login");
  }
  if (!usesAdminPortal(user.role)) {
    redirect("/employee/dashboard");
  }

  return <AdminDashboard user={user} />;
}
