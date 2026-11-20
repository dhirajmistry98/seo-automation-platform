import { connection } from "next/server";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getWorkspaceData } from "@/lib/workspace-data";
import { RedirectManagerClient } from "./redirect-manager-client";

export const instant = false;

export default async function RedirectManagerPage() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const workspace = await getWorkspaceData(session.user.id);
  const websites = workspace.websites.map((w) => ({ domain: w.domain, name: w.name ?? w.domain }));
  return <RedirectManagerClient websites={websites} />;
}
