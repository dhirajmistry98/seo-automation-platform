import { CreatorMarketplaceProfile } from "@/components/marketplace/creator-marketplace-profile";

export default async function CreatorMarketplaceProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CreatorMarketplaceProfile creatorId={id} />;
}
