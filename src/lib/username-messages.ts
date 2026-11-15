/**
 * Username cooldown messaging — pure helpers shared by the settings page and the
 * action that enforces it. Kept out of service.ts so it can be imported by
 * server components without pulling in the service's database dependency.
 */
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

export function usernameCooldownMessage(changedAt: Date | null, cooldownDays: number): string | null {
  if (!changedAt) return null;
  const elapsed = Date.now() - changedAt.getTime();
  const remainingMs = cooldownDays * 86_400_000 - elapsed;
  if (remainingMs <= 0) return null;
  const days = Math.ceil(remainingMs / 86_400_000);
  return `You can change your username again in ${days} day${days === 1 ? "" : "s"}.`;
}
