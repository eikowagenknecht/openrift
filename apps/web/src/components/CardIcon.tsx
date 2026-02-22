import { cn } from "@/lib/utils";

interface CardIconProps {
  src: string;
  className?: string;
}

export function CardIcon({ src, className = "size-3.5" }: CardIconProps) {
  if (src.endsWith(".svg")) {
    return (
      <span
        className={cn("inline-block bg-current", className)}
        style={{
          maskImage: `url(${src})`,
          maskSize: "contain",
          maskRepeat: "no-repeat",
          maskPosition: "center",
        }}
      />
    );
  }
  return <img src={src} alt="" className={className} />;
}
