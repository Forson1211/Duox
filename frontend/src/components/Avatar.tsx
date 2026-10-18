import { useId } from "react";
import type { Player } from "@duo-clash/shared";
const characters = {
  sparkles: {
    skin: "#b87550",
    hair: "#302032",
    shirt: "#7d55e6",
    bg: "#e2d6ff",
    style: 0,
  },
  heart: {
    skin: "#f1ba99",
    hair: "#6b3544",
    shirt: "#e97a95",
    bg: "#fbdfe8",
    style: 1,
  },
  bolt: {
    skin: "#e9a875",
    hair: "#302e41",
    shirt: "#edaa46",
    bg: "#fff0c9",
    style: 2,
  },
  brain: {
    skin: "#9b6147",
    hair: "#271d31",
    shirt: "#4eb0ad",
    bg: "#d8f2ed",
    style: 3,
  },
  crown: {
    skin: "#eac0a1",
    hair: "#8d552f",
    shirt: "#8f79da",
    bg: "#e7e0fc",
    style: 4,
  },
  moon: {
    skin: "#c79073",
    hair: "#322d45",
    shirt: "#6397d8",
    bg: "#dcecff",
    style: 5,
  },
};
export function Avatar({
  player,
  large = false,
}: {
  player: Pick<Player, "avatar" | "displayName">;
  large?: boolean;
}) {
  const prefix = useId().replace(/:/g, "");
  const c =
    characters[player.avatar as keyof typeof characters] ?? characters.sparkles;
  const seed = [...player.displayName].reduce((n, x) => n + x.charCodeAt(0), 0);
  const tilt = seed % 2 ? -3 : 3;
  return (
    <span
      className={
        large
          ? "profile-avatar character-avatar"
          : "avatar-small character-avatar"
      }
      aria-label={`${player.displayName}'s avatar`}
      style={{ background: c.bg }}
    >
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <defs>
          <linearGradient
            id={prefix + "face"}
            x1="30"
            y1="29"
            x2="73"
            y2="79"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={c.skin} />
            <stop offset="1" stopColor={c.skin} stopOpacity=".83" />
          </linearGradient>
          <linearGradient
            id={prefix + "shirt"}
            x1="24"
            y1="77"
            x2="81"
            y2="111"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={c.shirt} />
            <stop offset="1" stopColor={c.hair} />
          </linearGradient>
        </defs>
        <path
          d="M14 103c0-21 12-33 36-33s36 12 36 33"
          fill={`url(#${prefix}shirt)`}
        />
        <path d="M41 68h18v13c-5 6-13 6-18 0V68Z" fill={c.skin} />
        <path
          d="M42 73c5 4 11 4 16 0"
          stroke={c.hair}
          strokeOpacity=".12"
          strokeWidth="4"
        />
        <g transform={`rotate(${tilt} 50 48)`}>
          <ellipse cx="27" cy="50" rx="5" ry="8" fill={c.skin} />
          <ellipse cx="73" cy="50" rx="5" ry="8" fill={c.skin} />
          <path
            d="M27 38c0-17 10-25 24-25s23 9 23 25v12c0 18-10 27-24 27S27 66 27 50V38Z"
            fill={`url(#${prefix}face)`}
          />
          {c.style === 1 || c.style === 4 ? (
            <>
              <path
                d="M25 47C13 25 31 9 49 10c25-2 35 18 26 38l-5-15c-16 5-27-7-30-10-3 12-8 18-15 24Z"
                fill={c.hair}
              />
              <path
                d="M26 38c-9 23-7 32-3 42l10-6V44M74 38c10 21 7 32 3 42l-9-6V44"
                fill={c.hair}
              />
            </>
          ) : (
            <path
              d={
                c.style === 3
                  ? "M25 43C17 28 24 8 40 11c3-8 18-7 23 0 17-1 22 15 13 32l-6-12-39 3-6 9Z"
                  : "M25 43c-8-17 1-31 18-31 22-9 37 7 34 24l-6 10-3-16c-15 9-27 3-33 0l-6 15-4-2Z"
              }
              fill={c.hair}
            />
          )}
          <path
            d="M35 45l7-1M58 44l7 1"
            stroke={c.hair}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <ellipse cx="40" cy="50" rx="2" ry="2.6" fill="#29202c" />
          <ellipse cx="61" cy="50" rx="2" ry="2.6" fill="#29202c" />
          <path
            d="M50 52l-2 7h4"
            stroke={c.hair}
            strokeOpacity=".25"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M43 64q7 6 14-1"
            stroke="#743f3a"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {c.style === 2 && (
            <>
              <path d="M24 29c1-18 45-22 52 0v5H24v-5Z" fill={c.shirt} />
              <path d="M26 32h54c7 0 8 6 0 6H26v-6Z" fill="#d88a27" />
            </>
          )}
          {c.style === 5 && (
            <>
              <rect
                x="30"
                y="44"
                width="18"
                height="13"
                rx="5"
                stroke={c.hair}
                strokeWidth="2.5"
              />
              <rect
                x="53"
                y="44"
                width="18"
                height="13"
                rx="5"
                stroke={c.hair}
                strokeWidth="2.5"
              />
              <path d="M48 48h5" stroke={c.hair} strokeWidth="2" />
            </>
          )}
        </g>
        <path
          d="M34 85l6 15M66 85l-6 15"
          stroke="white"
          strokeOpacity=".12"
          strokeWidth="3"
        />
      </svg>
    </span>
  );
}
