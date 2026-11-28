/**
 * Sign-up password rules, checked in the browser before the account is created. Supabase enforces its own minimum on
 * the server (Auth → Providers → Email: minimum length 8, letters and digits; see docs/PRODUCTION_SETUP.md), so these
 * rules only ever match or tighten it. Returns the first problem in plain words, or null when the password is fine.
 */
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "12345678", "123456789", "1234567890", "qwerty123",
  "qwertyuiop", "iloveyou", "abcd1234", "abc12345", "11111111", "00000000", "1q2w3e4r", "asdf1234", "welcome1",
  "jee12345", "jeemain2025", "jeemain2026", "jeemain2027", "neet2026", "tabbyprep", "tabbyprep1", "letmein1",
]);

export const PASSWORD_HINT = "At least 8 characters, with a letter and a number.";

export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 72) return "Use at most 72 characters.";
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return "Use at least one letter and one number.";
  if (COMMON.has(password.toLowerCase())) return "That password is too common. Pick another one.";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && password.toLowerCase().includes(local)) return "Don't use your email name in the password.";
  return null;
}
