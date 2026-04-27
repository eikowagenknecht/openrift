import type { UseFormSetError } from "react-hook-form";

const CODE_TO_FIELD: Record<
  string,
  { field?: "email" | "password" | "name" | "currentPassword" | "otp" | "root"; message: string }
> = {
  INVALID_ORIGIN: {
    field: "root",
    message: "This site isn't allowed to sign up. Please use the main site.",
  },
  INVALID_EMAIL: { field: "email", message: "Please enter a valid email address." },
  PASSWORD_TOO_SHORT: { field: "password", message: "Password must be at least 8 characters." },
  PASSWORD_TOO_LONG: { field: "password", message: "Password is too long." },
  INVALID_PASSWORD: { field: "currentPassword", message: "Current password is incorrect." },
  INVALID_EMAIL_OR_PASSWORD: { field: "root", message: "Invalid email or password." },
  USER_ALREADY_EXISTS: { field: "email", message: "An account with this email already exists." },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    field: "email",
    message: "An account with this email already exists.",
  },
  EMAIL_NOT_VERIFIED: {
    field: "root",
    message: "Please verify your email address before signing in.",
  },
  NEW_EMAIL_SAME_AS_OLD: {
    field: "email",
    message: "New email is the same as your current email.",
  },
  INVALID_NAME: {
    field: "name",
    message:
      "Name may only contain letters, digits, spaces, periods, underscores, and hyphens (max 50).",
  },
  OTP_EXPIRED: { field: "otp", message: "Code expired. Please request a new one." },
  INVALID_OTP: { field: "otp", message: "Incorrect code. Please try again." },
  TOO_MANY_ATTEMPTS: { field: "otp", message: "Too many attempts. Please request a new code." },
};

const BODY_FIELD_RE = /^\[body\.(\w+)]\s*(.+)$/;

export function setServerError(
  // oxlint-disable-next-line no-explicit-any -- generic over any form shape
  form: { setError: UseFormSetError<any> },
  error: { code?: string; message?: string },
) {
  if (error.code && CODE_TO_FIELD[error.code]) {
    const mapped = CODE_TO_FIELD[error.code];
    form.setError(mapped.field ?? "root", { message: mapped.message });
    return;
  }

  // Schema validation errors use "[body.field] message" format
  if (error.message) {
    const match = BODY_FIELD_RE.exec(error.message);
    if (match) {
      const [, field, text] = match;
      if (
        field === "email" ||
        field === "password" ||
        field === "name" ||
        field === "currentPassword" ||
        field === "otp"
      ) {
        form.setError(field, { message: text });
        return;
      }
    }
  }

  form.setError("root", {
    message: error.message ?? "Something went wrong. Please try again.",
  });
}
