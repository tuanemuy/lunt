import { Photo } from "@/components/ui/Photo";
import type { DetailPhoto } from "@/presentation/detailView";

const HERO_RATIO = 348 / 290;

/**
 * The DetailHero photo and, after it, the rest in registration order
 * (「写真は、登録された順にすべて見られる」). The first is the cover. A place
 * without photos shows none (`spec/pages/index.md` 「公開中の対象の状態」).
 */
export function DetailPhotos({ photos }: { photos: readonly DetailPhoto[] }) {
  const [cover, ...rest] = photos;
  if (cover === undefined) return null;
  return (
    <div className="detail__media">
      <div className="hero__media">
        <Photo
          photo={cover.photo}
          alt={cover.alt}
          ratio={HERO_RATIO}
          className="hero__photo"
          priority
        />
      </div>
      {rest.length === 0 ? null : (
        <ul className="detail-gallery" aria-label="ほかの写真">
          {rest.map((item, index) => (
            <li key={item.photo?.src ?? `missing-${index}`}>
              <Photo
                photo={item.photo}
                alt={item.alt}
                ratio={1}
                className="detail-gallery__photo"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
