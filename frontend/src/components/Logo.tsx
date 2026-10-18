export function Logo({
  className = "",
  height = 36,
  alt = "DUO CLASH",
}: {
  className?: string;
  height?: number | string;
  alt?: string;
}) {
  return (
    <span className={`brand-logo-wrap ${className}`}>
      <img
        src="/logo-light.png"
        alt={alt}
        className="brand-logo-img logo-light"
        style={{ height, width: "auto" }}
      />
      <img
        src="/logo-dark.png"
        alt={alt}
        className="brand-logo-img logo-dark"
        style={{ height, width: "auto" }}
      />
    </span>
  );
}
