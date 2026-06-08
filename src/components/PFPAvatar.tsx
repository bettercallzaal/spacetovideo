import { AnimatedImage, Img, staticFile } from "remotion";
import { theme } from "../theme";

type Props = {
  /** Either a `/pfps/foo.gif` path (will be resolved via staticFile) or a full URL. */
  src: string;
  size: number;
  fallbackInitial?: string;
};

const isAnimated = (src: string) => /\.(gif|webp)(?:[?#]|$)/i.test(src);

export const PFPAvatar: React.FC<Props> = ({ src, size, fallbackInitial }) => {
  const resolved = src.startsWith("/") ? staticFile(src.slice(1)) : src;
  const animated = isAnimated(resolved);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: theme.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: theme.textOnDarkSecondary,
        fontSize: size * 0.4,
        fontWeight: 700,
        fontFamily: theme.fontSans,
      }}
    >
      {animated ? (
        <AnimatedImage src={resolved} width={size} height={size} fit="cover" style={{ display: "block" }} />
      ) : src ? (
        <Img src={resolved} style={{ width: size, height: size, objectFit: "cover", display: "block" }} />
      ) : (
        <span>{(fallbackInitial ?? "?").slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
};
