import { AccountView } from "@daveyplate/better-auth-ui";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/lib/auth";

export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ pathname: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/auth/sign-in");

  const { pathname } = await params;

  return (
    <div className="p-6 md:p-10">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <AccountView pathname={pathname} />
    </div>
  );
}
