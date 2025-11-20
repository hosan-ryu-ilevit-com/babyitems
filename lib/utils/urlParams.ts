/**
 * URL 파라미터에서 phone 추적 ID 추출
 */
export function getPhoneFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('phone');
}

/**
 * URL에서 모든 UTM 및 추적 파라미터 추출
 */
export function getTrackingParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const urlParams = new URLSearchParams(window.location.search);
  const trackingParams: Record<string, string> = {};

  // phone 파라미터
  const phone = urlParams.get('phone');
  if (phone) {
    trackingParams.phone = phone;
  }

  // 표준 UTM 파라미터들도 지원
  const utmParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  utmParams.forEach(param => {
    const value = urlParams.get(param);
    if (value) {
      trackingParams[param] = value;
    }
  });

  return trackingParams;
}
