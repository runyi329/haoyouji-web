import { MibanImage } from "./MibanImage";

type Props = {
  images: string[];
  title: string;
  background: string;
  connectorImage: string;
};

/** 独立竖版海报自然高度排列；一个透明图层跨相邻两张图，不裁切正文。 */
export function MibanConnectedPosters({ images, title, background, connectorImage }: Props) {
  return (
    <div data-testid="miban-connected-posters" className="relative isolate" style={{ background }}>
      {images.map((image, index) => {
        const left = index % 2 === 1;
        return (
          <figure key={image} className="relative m-0 p-0" style={{ background }}>
            <MibanImage
              src={image}
              variant="poster"
              alt={`${title}商品详情 ${index + 1}`}
              width={1080}
              height={1920}
              className="block h-auto w-full"
              style={{ aspectRatio: "9 / 16" }}
              loading="lazy"
            />
            {index < images.length - 1 && (
              <MibanImage
                src={connectorImage}
                variant="original"
                alt=""
                aria-hidden="true"
                width={1200}
                height={800}
                data-testid="miban-poster-seam"
                className="pointer-events-none absolute bottom-0 z-10 h-auto select-none"
                style={{
                  width: left ? "46%" : "54%",
                  ...(left ? { left: 0 } : { right: 0 }),
                  transform: left ? "translateY(50%) scaleX(-1)" : "translateY(50%)",
                }}
                loading="lazy"
              />
            )}
          </figure>
        );
      })}
    </div>
  );
}
