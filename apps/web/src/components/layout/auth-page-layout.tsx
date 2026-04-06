import type { ReactNode } from "react";

/**
 * Centered layout wrapper for auth pages (login, signup, verify-email, reset-password).
 *
 * @returns The centered layout with children.
 */
export function AuthPageLayout({
  children,
  size = "md",
}: {
  children: ReactNode;
  size?: "md" | "2xl";
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-3">
      <div className={`w-full max-w-sm ${size === "2xl" ? "md:max-w-2xl" : "md:max-w-md"}`}>
        {children}
      </div>
    </div>
  );
}
