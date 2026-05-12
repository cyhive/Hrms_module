import { redirect } from "next/navigation";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
import { usesAdminPortal, usesEmployeePortal } from "@/lib/roles";

export default async function LoginPage() {
  const user = await getCurrentUserFromCookies();
  if (user && usesAdminPortal(user.role)) {
    redirect("/admin/dashboard");
  }
  if (user && usesEmployeePortal(user.role)) {
    redirect("/employee/dashboard");
  }

  return (
    <main className="dashboard-shell mx-auto min-h-screen w-full max-w-[1600px] bg-[#f2f4f8] text-zinc-900">
      <div className="h-1 w-full bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-500" />
      <div className="mx-auto flex min-h-[calc(100vh-4px)] w-full max-w-6xl items-center justify-center px-6 py-10">
        <LoginForm />
      </div>
    </main>
  );
}
