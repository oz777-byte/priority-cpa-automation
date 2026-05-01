import { randomBytes } from 'node:crypto';

const MIN_LENGTH = 12;

/**
 * Validates a password meets minimum strength rules.
 * - At least 12 characters
 * - At least one lowercase letter
 * - At least one uppercase letter
 * - At least one digit
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_LENGTH) {
    return `סיסמה חייבת להיות באורך ${MIN_LENGTH} תווים לפחות`;
  }
  if (!/[a-z]/.test(password)) return 'הסיסמה חייבת לכלול אות לועזית קטנה';
  if (!/[A-Z]/.test(password)) return 'הסיסמה חייבת לכלול אות לועזית גדולה';
  if (!/\d/.test(password)) return 'הסיסמה חייבת לכלול ספרה';
  return null;
}

/**
 * Generates a cryptographically random, strong temporary password
 * suitable for admin-driven user provisioning.
 */
export function generateTemporaryPassword(): string {
  // 16 bytes → 22 base64 chars; force at least one of each required class.
  const random = randomBytes(16).toString('base64url').slice(0, 16);
  // Ensure all classes are present:
  return `${random}A1a`;
}
