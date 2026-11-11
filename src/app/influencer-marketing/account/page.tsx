import { auth } from "@/auth";
import { InfluencerMarketingAccountScreen } from "@/components/marketplace/influencer-marketing-account-screen";

export default async function InfluencerMarketingAccountPage() {
  const session = await auth();
  return <InfluencerMarketingAccountScreen identity={{
    name: session?.user?.name || "Marketplace member",
    email: session?.user?.email || "",
  }} />;
}
