import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { isMarketplaceAdmin } from "@/lib/marketplace/admin";
import { MarketplaceScreen } from "@/components/marketplace/screen";

export const instant = false;

export default async function Page() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Finfluencer-marketing%2Fadmin");
  if (!isMarketplaceAdmin(session.user.email)) notFound();
  return <MarketplaceScreen view="admin" basePath="/influencer-marketing" />;
}
