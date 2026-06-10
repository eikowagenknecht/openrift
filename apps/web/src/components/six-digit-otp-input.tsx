import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface SixDigitOtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired when all six digits are entered. */
  onComplete?: (value: string) => void;
  /** Focus the first slot on mount. The OTP input is the primary action on the
   * steps that opt in (login 2FA, password reset, email verification). */
  autoFocusOnMount?: boolean;
}

/**
 * Six-slot one-time-code input shared by the login (2FA), password-reset,
 * email-verification, and change-email flows. The caller owns the surrounding
 * layout and the error text.
 * @returns The OTP input.
 */
export function SixDigitOtpInput({
  value,
  onChange,
  onComplete,
  autoFocusOnMount,
}: SixDigitOtpInputProps) {
  return (
    <InputOTP
      maxLength={6}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- caller opts in; OTP input is the primary action on the step that renders it
      autoFocus={autoFocusOnMount}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  );
}
