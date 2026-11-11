import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ className = "", priority = false }: BrandLogoProps) {
  return (
    <Image
      src="/seo-studio-mark.png"
      alt=""
      aria-hidden="true"
      width={660}
      height={690}
      priority={priority}
      unoptimized
      className={"brand-logo-image " + className}
    />
  );
}
