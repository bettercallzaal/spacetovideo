import { theme } from "../theme";

type Props = {
  title: string;
  subtitle: string;
};

export const TitleCard: React.FC<Props> = ({ title, subtitle }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 32,
        left: 40,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontFamily: theme.fontSans,
      }}
    >
      <span
        style={{
          color: theme.orange,
          fontSize: 16,
          letterSpacing: 4,
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {subtitle}
      </span>
      <span
        style={{
          color: theme.textOnDark,
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: -0.5,
        }}
      >
        {title}
      </span>
    </div>
  );
};
