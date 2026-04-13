/**
 * コスト管理 API / Server Action 用の Bearer 検証。
 * COST_ADMIN_BEARER が未設定のときは検証失敗（本番・ローカルとも明示設定を推奨）。
 */
export function bearerMatchesExpected(authHeader: string | null): boolean {
  const expected = process.env.COST_ADMIN_BEARER?.trim();
  if (!expected) {
    return false;
  }
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 && token === expected;
}

export function isBearerConfigured(): boolean {
  return Boolean(process.env.COST_ADMIN_BEARER?.trim());
}
