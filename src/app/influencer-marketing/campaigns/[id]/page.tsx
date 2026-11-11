import { MarketplaceScreen } from "@/components/marketplace/screen";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <MarketplaceScreen view="campaign" id={id} basePath="/influencer-marketing" />; }
