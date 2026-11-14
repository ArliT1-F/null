/**
 * Password strength heuristic — pure and client-safe.
 *
 * Kept in its own module so the browser bundle never pulls in the native
 * Argon2 binding used by src/lib/password.ts. This is advisory UI only; the
 * server enforces the real policy in src/lib/validation.ts.
 */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; hint: string } {
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const hints = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  return { score: clamped, hint: hints[clamped] };
}
