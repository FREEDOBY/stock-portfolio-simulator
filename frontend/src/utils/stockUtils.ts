/**
 * 한국 종목 관련 유틸리티 함수
 */

/**
 * 한국 종목 심볼인지 확인
 */
export function isKoreanSymbol(symbol: string): boolean {
  return symbol.endsWith('.KS') || symbol.endsWith('.KQ');
}

/**
 * 종목 표시명 반환 (한국 종목은 name, 해외 종목은 symbol)
 */
export function getDisplayName(symbol: string, name?: string): string {
  if (isKoreanSymbol(symbol) && name) {
    return name;
  }
  return symbol;
}

/**
 * 종목 표시명과 심볼 코드 반환
 * 한국 종목: { display: "삼성전자", code: "005930.KS" }
 * 해외 종목: { display: "SPY", code: null }
 */
export function getDisplayInfo(symbol: string, name?: string): { display: string; code: string | null } {
  if (isKoreanSymbol(symbol)) {
    return {
      display: name || symbol,
      code: symbol,
    };
  }
  return {
    display: symbol,
    code: null,
  };
}
