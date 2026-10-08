import type { PublicBanner } from "@/lib/public/structure";

/** The quiz's banner image, sized so the page doesn't jump while it loads. */
export function Banner({ banner }: { banner: PublicBanner | null }) {
  if (!banner) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- stored images, served with immutable caching
    <img
      src={banner.url}
      alt={banner.alt}
      width={banner.width}
      height={banner.height}
      fetchPriority="high"
      className="pltq-banner block h-auto w-full rounded-lg"
    />
  );
}
