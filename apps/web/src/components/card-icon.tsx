import { cn } from "@/lib/utils";

interface CardIconProps {
  src: string;
  className?: string;
}

export function CardIcon({ src, className }: CardIconProps) {
  if (src.endsWith(".svg")) {
    return (
      <span
        className={cn("inline-block bg-current", className ?? "size-3.5")}
        style={{
          maskImage: `url(${src})`,
          maskSize: "contain",
          maskRepeat: "no-repeat",
          maskPosition: "center",
        }}
      />
    );
  }
  return <img src={src} alt="" width={28} height={28} className={className ?? "size-3.5"} />;
}
