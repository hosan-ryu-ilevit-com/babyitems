'use client';

import { useEffect } from 'react';
import { getPhoneFromUrl } from '@/lib/utils/urlParams';
import type { SessionState } from '@/types';

/**
 * URL 파라미터에서 phone과 utm_campaign을 추출하여 세션에 저장하는 컴포넌트
 *
 * 사용법: app/layout.tsx에 추가
 * 예시 URL: https://babyitems.vercel.app/?phone=01088143142&utm_campaign=first
 */
export default function PhoneTracker() {
  useEffect(() => {
    console.log('[PhoneTracker] 🚀 Component mounted');
    console.log('[PhoneTracker] 📍 Current URL:', window.location.href);

    // URL에서 phone과 utm_campaign 파라미터 추출
    const urlParams = new URLSearchParams(window.location.search);
    const phone = getPhoneFromUrl();
    const utmCampaign = urlParams.get('utm_campaign');
    console.log('[PhoneTracker] 📱 Phone from URL:', phone);
    console.log('[PhoneTracker] 🏷️  UTM Campaign from URL:', utmCampaign);

    if (phone || utmCampaign) {
      // sessionStorage에서 현재 세션 가져오기
      const sessionKey = 'babyitem_session';
      const sessionData = sessionStorage.getItem(sessionKey);
      console.log('[PhoneTracker] 💾 Existing session:', sessionData ? 'exists' : 'null');

      if (sessionData) {
        try {
          const session: SessionState = JSON.parse(sessionData);
          console.log('[PhoneTracker] 📱 Existing session phone:', session.phone);
          console.log('[PhoneTracker] 🏷️  Existing session utm_campaign:', session.utmCampaign);

          let updated = false;

          // phone이 있고 저장되어 있지 않으면 저장
          if (phone && !session.phone) {
            session.phone = phone;
            updated = true;
            console.log('✅ [PhoneTracker] Phone number tracked:', phone);
          }

          // utm_campaign이 있고 저장되어 있지 않으면 저장
          if (utmCampaign && !session.utmCampaign) {
            session.utmCampaign = utmCampaign;
            updated = true;
            console.log('✅ [PhoneTracker] UTM Campaign tracked:', utmCampaign);
          }

          if (updated) {
            sessionStorage.setItem(sessionKey, JSON.stringify(session));
          } else {
            console.log('ℹ️ [PhoneTracker] Tracking params already exist in session');
          }
        } catch (error) {
          console.error('❌ [PhoneTracker] Failed to parse session:', error);
        }
      } else {
        // 세션이 없으면 새로 생성 (phone과 utmCampaign 포함)
        const newSession: Partial<SessionState> = {
          ...(phone && { phone }),
          ...(utmCampaign && { utmCampaign }),
          phase: 'home',
          messages: [],
          attributeAssessments: {
            temperatureControl: null,
            hygiene: null,
            material: null,
            usability: null,
            portability: null,
            priceValue: null,
            durability: null,
            additionalFeatures: null,
          },
          currentAttribute: 0,
          additionalContext: [],
          accuracy: 80,
        };
        sessionStorage.setItem(sessionKey, JSON.stringify(newSession));
        console.log('✅ [PhoneTracker] New session created with tracking params:', { phone, utmCampaign });
      }

      // 저장 확인
      const savedSession = sessionStorage.getItem(sessionKey);
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        console.log('✅ [PhoneTracker] Verification - tracking params in storage:', {
          phone: parsed.phone,
          utmCampaign: parsed.utmCampaign
        });
      }

      // URL에서 tracking 파라미터 제거 (브라우저 히스토리에 남지 않도록)
      const url = new URL(window.location.href);
      url.searchParams.delete('phone');
      url.searchParams.delete('utm_campaign');
      window.history.replaceState({}, '', url.toString());
      console.log('[PhoneTracker] 🧹 URL cleaned:', url.toString());
    } else {
      console.log('[PhoneTracker] ℹ️ No tracking parameters in URL');
    }
  }, []);

  return null; // UI 렌더링 없음
}
