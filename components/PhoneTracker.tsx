'use client';

import { useEffect } from 'react';
import { getPhoneFromUrl } from '@/lib/utils/urlParams';
import type { SessionState } from '@/types';

/**
 * URL 파라미터에서 phone을 추출하여 세션에 저장하는 컴포넌트
 *
 * 사용법: app/layout.tsx에 추가
 * 예시 URL: https://babyitems.vercel.app/?phone=01088143142
 */
export default function PhoneTracker() {
  useEffect(() => {
    console.log('[PhoneTracker] 🚀 Component mounted');
    console.log('[PhoneTracker] 📍 Current URL:', window.location.href);

    // URL에서 phone 파라미터 추출
    const phone = getPhoneFromUrl();
    console.log('[PhoneTracker] 📱 Phone from URL:', phone);

    if (phone) {
      // sessionStorage에서 현재 세션 가져오기
      const sessionKey = 'babyitem_session';
      const sessionData = sessionStorage.getItem(sessionKey);
      console.log('[PhoneTracker] 💾 Existing session:', sessionData ? 'exists' : 'null');

      if (sessionData) {
        try {
          const session: SessionState = JSON.parse(sessionData);
          console.log('[PhoneTracker] 📱 Existing session phone:', session.phone);

          // phone이 이미 저장되어 있지 않으면 저장
          if (!session.phone) {
            session.phone = phone;
            sessionStorage.setItem(sessionKey, JSON.stringify(session));
            console.log('✅ [PhoneTracker] Phone number tracked:', phone);
          } else {
            console.log('ℹ️ [PhoneTracker] Phone already exists in session');
          }
        } catch (error) {
          console.error('❌ [PhoneTracker] Failed to parse session:', error);
        }
      } else {
        // 세션이 없으면 새로 생성 (phone만 포함)
        const newSession: Partial<SessionState> = {
          phone,
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
        console.log('✅ [PhoneTracker] New session created with phone:', phone);
      }

      // 저장 확인
      const savedSession = sessionStorage.getItem(sessionKey);
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        console.log('✅ [PhoneTracker] Verification - phone in storage:', parsed.phone);
      }

      // URL에서 phone 파라미터 제거 (브라우저 히스토리에 남지 않도록)
      const url = new URL(window.location.href);
      url.searchParams.delete('phone');
      window.history.replaceState({}, '', url.toString());
      console.log('[PhoneTracker] 🧹 URL cleaned:', url.toString());
    } else {
      console.log('[PhoneTracker] ℹ️ No phone parameter in URL');
    }
  }, []);

  return null; // UI 렌더링 없음
}
