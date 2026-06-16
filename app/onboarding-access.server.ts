export function canAccessBeforeOnboarding(pathname: string) {
  return pathname.endsWith("/app/onboarding") || pathname.endsWith("/app/help");
}
