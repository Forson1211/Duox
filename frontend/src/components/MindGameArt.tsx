import { useId } from "react";
export function MindGameArt({
  kind,
  className = "",
}: {
  kind: "number-circuit" | "code-breaker";
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const code = kind === "code-breaker";
  return (
    <svg
      viewBox="0 0 512 512"
      width="512"
      height="512"
      className={`game-art ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id + "purple"} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ad83ff" />
          <stop offset="1" stopColor="#6032ce" />
        </linearGradient>
        <linearGradient id={id + "gold"} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ffe4a3" />
          <stop offset="1" stopColor="#f3b945" />
        </linearGradient>
        <linearGradient id={id + "silver"} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#ccc2e7" />
        </linearGradient>
        <filter id={id + "shadow"} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx="0"
            dy="18"
            stdDeviation="14"
            floodColor="#6b43aa"
            floodOpacity=".2"
          />
        </filter>
      </defs>
      <ellipse cx="260" cy="425" rx="146" ry="25" fill="#7240b0" opacity=".1" />
      <g
        filter={`url(#${id}shadow)`}
        transform={code ? "rotate(-8 256 256)" : "rotate(-10 256 256)"}
      >
        {code ? (
          <>
            <path
              d="M180 223v-58c0-108 153-108 153 0v58"
              fill="none"
              stroke={`url(#${id}silver)`}
              strokeWidth="39"
              strokeLinecap="round"
            />
            <rect
              x="122"
              y="196"
              width="274"
              height="221"
              rx="50"
              fill={`url(#${id}purple)`}
            />
            <rect
              x="144"
              y="218"
              width="230"
              height="61"
              rx="20"
              fill="#fff"
              opacity=".12"
            />
            <rect
              x="151"
              y="291"
              width="216"
              height="77"
              rx="20"
              fill="#faf5ff"
            />
            {["3", "1", "7"].map((digit, i) => (
              <g key={digit}>
                <rect
                  x={160 + i * 68}
                  y="299"
                  width="61"
                  height="61"
                  rx="13"
                  fill="#ede5ff"
                />
                <text
                  x={190 + i * 68}
                  y="344"
                  textAnchor="middle"
                  fill="#7445cc"
                  fontFamily="inherit"
                  fontWeight="800"
                  fontSize="43"
                >
                  {digit}
                </text>
              </g>
            ))}
          </>
        ) : (
          <>
            <path
              d="M96 155h55v69m260 92h-53v-70M128 382v-45h65m195-211v47h-65"
              fill="none"
              stroke="#c3b2f0"
              strokeWidth="18"
              strokeLinecap="round"
            />
            <rect
              x="139"
              y="161"
              width="231"
              height="231"
              rx="51"
              fill={`url(#${id}purple)`}
            />
            <rect
              x="160"
              y="180"
              width="185"
              height="55"
              rx="24"
              fill="#fff"
              opacity=".16"
            />
            <path
              d="M254 227v105m-53-52h106"
              stroke="#fff"
              strokeWidth="28"
              strokeLinecap="round"
            />
            <g transform="rotate(20 347 146)">
              <rect
                x="290"
                y="88"
                width="118"
                height="118"
                rx="29"
                fill={`url(#${id}gold)`}
              />
              <path
                d="m325 124 45 45m0-45-45 45"
                stroke="#fffdf3"
                strokeWidth="17"
                strokeLinecap="round"
              />
            </g>
            <circle cx="98" cy="156" r="18" fill="#ab8ce6" />
            <circle cx="411" cy="317" r="18" fill="#b898ed" />
          </>
        )}
      </g>
      <path d="m97 237 9 21 22 6-21 10-6 22-10-21-21-6 21-10z" fill="#f8c65d" />
      <circle cx="419" cy="218" r="10" fill="#c7b1ed" />
    </svg>
  );
}
