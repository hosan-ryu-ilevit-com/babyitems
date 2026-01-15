'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkle, ArrowRight, TrendUp, MagnifyingGlass, ChatTeardropText, Question, CaretRight } from '@phosphor-icons/react';
import {
  logKnowledgeAgentSearchRequest,
  logKnowledgeAgentSearchConfirm,
  logKnowledgeAgentSearchCancel,
  logKnowledgeAgentCategorySelect,
  logKnowledgeAgentSubCategorySelect,
  logKAPageView
} from '@/lib/logging/clientLogger';
import { KnowledgeAgentStepIndicator } from '@/components/knowledge-agent/KnowledgeAgentStepIndicator';


// --- Category Images (Pre-fetched) ---
const CATEGORY_IMAGES: Record<string, string> = {
  "신생아용 카시트": "https://img.danawa.com/prod_img/500000/282/926/img/39926282_1.jpg?shrink=130:130&_v=20250415141734",
  "트라이크 유모차": "https://img.danawa.com/prod_img/500000/387/834/img/20834387_1.jpg?shrink=130:130&_v=20250415142027",
  "휴대용 유모차": "https://img.danawa.com/prod_img/500000/044/799/img/20799044_1.jpg?shrink=130:130&_v=20250415141934",
  "절충형 유모차": "https://img.danawa.com/prod_img/500000/594/489/img/26489594_1.jpg?shrink=130:130&_v=20250415141657",
  "디럭스 유모차": "https://img1a.coupangcdn.com/image/vendor_inventory/dc76/a433e6339b16653dc26947c912bc8e9d45a6c6a6a29ff28f9facf5f0035b.png",
  "주니어용 카시트": "https://img.danawa.com/prod_img/500000/362/111/img/39111362_1.jpg?shrink=130:130&_v=20251121055050",
  "힙시트": "https://img.danawa.com/prod_img/500000/051/810/img/20810051_1.jpg?shrink=130:130&_v=20250415141647",
  "유아용 카시트": "https://img.danawa.com/prod_img/500000/731/832/img/20832731_1.jpg?shrink=130:130&_v=20250415141853",
  "젖병": "https://img.danawa.com/prod_img/500000/190/565/img/51565190_1.jpg?shrink=130:130&_v=20250415105129",
  "아기띠": "https://img.danawa.com/prod_img/500000/051/810/img/20810051_1.jpg?shrink=130:130&_v=20250415141647",
  "분유제조기": "https://img.danawa.com/prod_img/500000/612/271/img/13271612_1.jpg?shrink=130:130&_v=20251120100707",
  "젖병소독기": "https://img.danawa.com/prod_img/500000/626/523/img/26523626_1.jpg?shrink=130:130&_v=20250830051322",
  "보틀워머": "https://img.danawa.com/prod_img/500000/338/041/img/28041338_1.jpg?shrink=130:130&_v=20250415110746",
  "쪽쪽이": "https://img.danawa.com/prod_img/500000/155/625/img/29625155_1.jpg?shrink=130:130&_v=20250529045545",
  "분유포트": "https://img.danawa.com/prod_img/500000/527/805/img/74805527_1.jpg?shrink=130:130&_v=20251113130120",
  "수유패드": "https://img.danawa.com/prod_img/500000/319/452/img/26452319_1.jpg?shrink=130:130&_v=20250729045138",
  "젖병솔": "https://img.danawa.com/prod_img/500000/626/523/img/26523626_1.jpg?shrink=130:130&_v=20250830051322",
  "유축기": "https://img.danawa.com/prod_img/500000/309/837/img/20837309_1.jpg?shrink=130:130&_v=20250415110759",
  "기저귀": "https://img.danawa.com/prod_img/500000/661/011/img/71011661_1.jpg?shrink=130:130&_v=20250415142121",
  "아기물티슈": "https://img.danawa.com/prod_img/500000/768/148/img/1148768_1.jpg?shrink=130:130&_v=20230308174831",
  "빨대컵": "https://img.danawa.com/prod_img/500000/037/999/img/94999037_1.jpg?shrink=130:130&_v=20251213054338",
  "분유": "https://img.danawa.com/prod_img/500000/191/998/img/22998191_1.jpg?shrink=130:130&_v=20250415104241",
  "유아간식": "https://img.danawa.com/prod_img/500000/873/135/img/29135873_1.jpg?shrink=130:130&_v=20231024112725",
  "이유식": "https://img.danawa.com/prod_img/500000/060/344/img/30344060_1.jpg?shrink=130:130&_v=20250611045356",
  "이유식기": "https://img.danawa.com/prod_img/500000/889/818/img/20818889_1.jpg?shrink=130:130&_v=20250415105556",
  "이유식조리기": "https://img.danawa.com/prod_img/500000/333/476/img/21476333_1.jpg?shrink=130:130&_v=20250415105716",
  "치발기": "https://img.danawa.com/prod_img/500000/991/497/img/26497991_1.jpg?shrink=130:130&_v=20250415110126",
  "하이체어": "https://img.danawa.com/prod_img/500000/535/126/img/3126535_1.jpg?shrink=130:130&_v=20220322164005",
  "유아수저세트": "https://img.danawa.com/prod_img/500000/911/823/img/20823911_1.jpg?shrink=130:130&_v=20250415105844",
  "턱받이": "https://img.danawa.com/prod_img/500000/532/524/img/26524532_1.jpg?shrink=130:130&_v=20250415105747",
  "유아칫솔": "https://img.danawa.com/prod_img/500000/958/889/img/15889958_1.jpg?shrink=130:130&_v=20250708170506",
  "콧물흡입기": "https://img.danawa.com/prod_img/500000/019/458/img/26458019_1.jpg?shrink=130:130&_v=20250412052049",
  "체온계": "https://img.danawa.com/prod_img/500000/436/308/img/3308436_1.jpg?shrink=130:130&_v=20250822045336",
  "유아치약": "https://img.danawa.com/prod_img/500000/296/962/img/5962296_1.jpg?shrink=130:130&_v=20250929084340",
  "아기욕조": "https://img.danawa.com/prod_img/500000/785/853/img/20853785_1.jpg?shrink=130:130&_v=20250415105049",
  "유아침대": "https://img.danawa.com/prod_img/500000/604/354/img/11354604_1.jpg?shrink=130:130&_v=20200521144737",
  "유아의자": "https://img.danawa.com/prod_img/500000/535/126/img/3126535_1.jpg?shrink=130:130&_v=20220322164005",
  "유아세제": "https://img.danawa.com/prod_img/500000/409/884/img/14884409_1.jpg?shrink=130:130&_v=20251130053930",
  "손톱깎이": "https://img.danawa.com/prod_img/500000/432/702/img/9702432_1.jpg?shrink=130:130&_v=20191018092024",
  "유아변기": "https://img.danawa.com/prod_img/500000/496/946/img/42946496_1.jpg?shrink=130:130&_v=20250830051449",
  "점퍼루": "https://img.danawa.com/prod_img/500000/462/659/img/21659462_1.jpg?shrink=130:130&_v=20250415110424",
  "아기체육관": "https://img.danawa.com/prod_img/500000/402/476/img/21476402_1.jpg?shrink=130:130&_v=20250415110849",
  "바운서": "https://img.danawa.com/prod_img/500000/729/609/img/26609729_1.jpg?shrink=130:130&_v=20250415111018",
  "유아소파": "https://img.danawa.com/prod_img/500000/260/198/img/10198260_1.jpg?shrink=130:130&_v=20191220101654",
  "유아책상": "https://img.danawa.com/prod_img/500000/548/660/img/5660548_1.jpg?shrink=130:130&_v=20250903141206",
  "보행기": "https://img.danawa.com/prod_img/500000/511/818/img/20818511_1.jpg?shrink=130:130&_v=20250415110512",
  "모빌": "https://img.danawa.com/prod_img/500000/204/654/img/26654204_1.jpg?shrink=130:130&_v=20250415111121",
  "소꿉놀이": "https://img.danawa.com/prod_img/500000/571/174/img/49174571_1.jpg?shrink=130:130&_v=20250415122808",
  "블록장난감": "https://img.danawa.com/prod_img/500000/952/417/img/97417952_1.jpg?shrink=130:130&_v=20250911045654",
  "로봇장난감": "https://img.danawa.com/prod_img/500000/952/417/img/97417952_1.jpg?shrink=130:130&_v=20250911045654",
  "킥보드": "https://img.danawa.com/prod_img/500000/786/997/img/19997786_1.jpg?shrink=130:130&_v=20240508152900",
  "4K모니터": "https://img.danawa.com/prod_img/500000/281/875/img/70875281_1.jpg?shrink=130:130&_v=20251112151913",
  "인형": "https://img.danawa.com/prod_img/500000/968/843/img/99843968_1.jpg?shrink=130:130&_v=20251101045844",
  "놀이방매트": "https://img.danawa.com/prod_img/500000/050/973/img/92973050_1.jpg?shrink=130:130&_v=20250830051831",
  "모니터": "https://img.danawa.com/prod_img/500000/976/676/img/72676976_1.jpg?shrink=130:130&_v=20251014145752",
  "웹캠": "https://img.danawa.com/prod_img/500000/966/016/img/19016966_1.jpg?shrink=130:130&_v=20230214093741",
  "노트북거치대": "https://img.danawa.com/prod_img/500000/792/061/img/52061792_1.jpg?shrink=130:130&_v=20250430084650",
  "기계식키보드": "https://img.danawa.com/prod_img/500000/601/003/img/70003601_1.jpg?shrink=130:130&_v=20260107152356",
  "무선마우스": "https://img.danawa.com/prod_img/500000/953/770/img/91770953_1.jpg?shrink=130:130&_v=20260107152447",
  "에어프라이어": "https://img.danawa.com/prod_img/500000/731/816/img/72816731_1.jpg?shrink=130:130&_v=20251226114519",
  "전기포트": "https://img.danawa.com/prod_img/500000/703/356/img/6356703_1.jpg?shrink=130:130&_v=20231227111813",
  "음식물처리기": "https://img.danawa.com/prod_img/500000/457/071/img/101071457_1.jpg?shrink=130:130&_v=20260105175956",
  "전기밥솥": "https://img.danawa.com/prod_img/500000/061/107/img/17107061_1.jpg?shrink=130:130&_v=20250523114134",
  "식기세척기": "https://img.danawa.com/prod_img/500000/797/919/img/98919797_1.jpg?shrink=130:130&_v=20251028192555",
  "전자레인지": "https://img.danawa.com/prod_img/500000/655/627/img/4627655_1.jpg?shrink=130:130&_v=20250702184756",
  "커피머신": "https://img.danawa.com/prod_img/500000/445/665/img/20665445_1.jpg?shrink=130:130&_v=20230703081146",
  "공기청정기": "https://img.danawa.com/prod_img/500000/270/160/img/76160270_1.jpg?shrink=130:130&_v=20251210082555",
  "제습기": "https://img.danawa.com/prod_img/500000/020/016/img/77016020_1.jpg?shrink=130:130&_v=20250702172731",
  "믹서기": "https://img.danawa.com/prod_img/500000/965/911/img/91911965_1.jpg?shrink=130:130&_v=20251208134411",
  "가습기": "https://img.danawa.com/prod_img/500000/885/777/img/98777885_1.jpg?shrink=130:130&_v=20251208134656",
  "무선청소기": "https://img.danawa.com/prod_img/500000/069/742/img/49742069_1.jpg?shrink=130:130&_v=20250728165605",
  "선풍기": "https://img.danawa.com/prod_img/500000/599/361/img/92361599_1.jpg?shrink=130:130&_v=20250616164809",
  "로봇청소기": "https://img.danawa.com/prod_img/500000/341/061/img/56061341_1.jpg?shrink=130:130&_v=20251219145601",
  "전기히터": "https://img.danawa.com/prod_img/500000/122/735/img/99735122_1.jpg?shrink=130:130&_v=20251208105721",
  "에어컨": "https://img.danawa.com/prod_img/500000/662/961/img/77961662_1.jpg?shrink=130:130&_v=20250714171418",
  "물걸레청소기": "https://img.danawa.com/prod_img/500000/359/839/img/97839359_1.jpg?shrink=130:130&_v=20250917143903",
  "침구청소기": "https://img.danawa.com/prod_img/500000/069/811/img/34811069_1.jpg?shrink=130:130&_v=20240206093915",
  "건조기": "https://img.danawa.com/prod_img/500000/933/550/img/19550933_1.jpg?shrink=130:130&_v=20250804151601",
  "세탁기": "https://img.danawa.com/prod_img/500000/636/186/img/92186636_1.jpg?shrink=130:130&_v=20251117162944",
  "올인원 세탁건조기": "https://img.danawa.com/prod_img/500000/636/186/img/92186636_1.jpg?shrink=130:130&_v=20251117162944",
  "전동칫솔": "https://img.danawa.com/prod_img/500000/953/885/img/15885953_1.jpg?shrink=130:130&_v=20250925161548",
  "스팀다리미": "https://img.danawa.com/prod_img/500000/511/713/img/5713511_1.jpg?shrink=130:130&_v=20241002104937",
  "고데기": "https://img.danawa.com/prod_img/500000/694/310/img/72310694_1.jpg?shrink=130:130&_v=20241204103822",
  "의류관리기": "https://img.danawa.com/prod_img/500000/948/389/img/78389948_1.jpg?shrink=130:130&_v=20251120095600",
  "헤어드라이어": "https://img.danawa.com/prod_img/500000/495/938/img/75938495_1.jpg?shrink=130:130&_v=20250826151934",
  "안마의자": "https://img.danawa.com/prod_img/500000/756/540/img/14540756_1.jpg?shrink=130:130&_v=20251213055950",
  "전기면도기": "https://img.danawa.com/prod_img/500000/470/769/img/11769470_1.jpg?shrink=130:130&_v=20240715144118",
  "체중계": "https://img.danawa.com/prod_img/500000/807/783/img/98783807_1.jpg?shrink=130:130&_v=20251015045128"
};

const BABY_CATEGORY_ICONS: Record<string, string> = {
  '기저귀': '/images/카테고리 아이콘/기저귀.png',
  '아기물티슈': '/images/카테고리 아이콘/아기물티슈.png',
  '분유': '/images/카테고리 아이콘/분유.png',
  '이유식': '/images/카테고리 아이콘/이유식.png',
  '유아간식': '/images/카테고리 아이콘/유아간식.png',
  '젖병': '/images/카테고리 아이콘/젖병.png',
  '젖병소독기': '/images/카테고리 아이콘/젖병 소독기.png',
  '쪽쪽이': '/images/카테고리 아이콘/쪽쪽이노리개.png',
  '분유포트': '/images/카테고리 아이콘/분유포트.png',
  '분유제조기': '/images/카테고리 아이콘/분유제조기.png',
  '보틀워머': '/images/카테고리 아이콘/보틀워머.png',
  '젖병솔': '/images/카테고리 아이콘/젖병솔.png',
  '유축기': '/images/카테고리 아이콘/유축기.png',
  '수유패드': '/images/카테고리 아이콘/수유패드.png',
  '휴대용 유모차': '/images/카테고리 아이콘/휴대용 유모차.png',
  '디럭스 유모차': '/images/카테고리 아이콘/디럭스 유모차.png',
  '절충형 유모차': '/images/카테고리 아이콘/절충형 유모차.png',
  '트라이크 유모차': '/images/카테고리 아이콘/트라이크 유모차.png',
  '신생아용 카시트': '/images/카테고리 아이콘/신생아용 카시트.png',
  '유아용 카시트': '/images/카테고리 아이콘/유아용 카시트.png',
  '주니어용 카시트': '/images/카테고리 아이콘/주니어용 카시트.png',
  '아기띠': '/images/카테고리 아이콘/아기띠.png',
  '힙시트': '/images/카테고리 아이콘/힙시트.png',
  '유아침대': '/images/카테고리 아이콘/유아침대.png',
  '유아의자': '/images/카테고리 아이콘/유아의자.png',
  '유아소파': '/images/카테고리 아이콘/유아소파.png',
  '유아책상': '/images/카테고리 아이콘/유아책상.png',
  '빨대컵': '/images/카테고리 아이콘/빨대컵.png',
  '이유식기': '/images/카테고리 아이콘/이유식기.png',
  '유아수저세트': '/images/카테고리 아이콘/유아수저세트.png',
  '턱받이': '/images/카테고리 아이콘/턱받이.png',
  '치발기': '/images/카테고리 아이콘/치발기.png',
  '이유식조리기': '/images/카테고리 아이콘/이유식조리기.png',
  '하이체어': '/images/카테고리 아이콘/하이체어.png',
  '아기욕조': '/images/카테고리 아이콘/아기욕조.png',
  '콧물흡입기': '/images/카테고리 아이콘/콧물흡입기.png',
  '체온계': '/images/카테고리 아이콘/체온계.png',
  '유아치약': '/images/카테고리 아이콘/유아치약.png',
  '유아칫솔': '/images/카테고리 아이콘/유아칫솔.png',
  '유아변기': '/images/카테고리 아이콘/유아변기.png',
  '손톱깎이': '/images/카테고리 아이콘/손톱깎이.png',
  '유아세제': '/images/카테고리 아이콘/유아세제.png',
  '아기체육관': '/images/카테고리 아이콘/아기체육관.png',
  '바운서': '/images/카테고리 아이콘/바운서.png',
  '점퍼루': '/images/카테고리 아이콘/점퍼루.png',
  '보행기': '/images/카테고리 아이콘/보행기.png',
  '모빌': '/images/카테고리 아이콘/모빌.png',
  '블록장난감': '/images/카테고리 아이콘/블록장난감.png',
  '로봇장난감': '/images/카테고리 아이콘/로봇장난감.png',
  '소꿉놀이': '/images/카테고리 아이콘/소꿉놀이.png',
  '인형': '/images/카테고리 아이콘/인형.png',
  '킥보드': '/images/카테고리 아이콘/킥보드.png',
  '놀이방매트': '/images/카테고리 아이콘/놀이방매트.png',
};

// --- Data Configuration ---

export const CATEGORIES_DATA: Record<string, any> = {
  "출산/육아용품": {
    "기저귀/위생": {
      "code": "BABY_006",
      "emoji": "👶",
      "children": [
        "기저귀", "아기물티슈", "분유", "이유식", "유아간식"
      ]
    },
    "젖병/수유용품": {
      "code": "BABY_003",
      "emoji": "🍼",
      "children": [
        "젖병", "젖병소독기", "쪽쪽이", "분유포트", "분유제조기", "보틀워머", "젖병솔", "유축기", "수유패드"
      ]
    },
    "외출용품": {
      "code": "BABY_008",
      "emoji": "🛒",
      "children": [
        "휴대용 유모차", "디럭스 유모차", "절충형 유모차", "트라이크 유모차",
        "신생아용 카시트", "유아용 카시트", "주니어용 카시트",
        "아기띠", "힙시트"
      ]
    },
    "유아 가구": {
      "code": "BABY_001",
      "emoji": "🛌",
      "children": [
        "유아침대", "유아의자", "유아소파", "유아책상"
      ]
    },
    "이유식용품": {
      "code": "BABY_004",
      "emoji": "🥣",
      "children": [
        "빨대컵", "이유식기", "유아수저세트", "턱받이", "치발기", "이유식조리기", "하이체어"
      ]
    },
    "건강/목욕용품": {
      "code": "BABY_005",
      "emoji": "🧼",
      "children": [
        "아기욕조", "콧물흡입기", "체온계", "유아치약", "유아칫솔", "유아변기", "손톱깎이", "유아세제"
      ]
    },
    "신생아/영유아 완구": {
      "code": "BABY_002",
      "emoji": "🧸",
      "children": [
        "아기체육관", "바운서", "점퍼루", "보행기", "모빌"
      ]
    },
    "인기 완구/교구": {
      "code": "BABY_007",
      "emoji": "🎨",
      "children": [
        "블록장난감", "로봇장난감", "소꿉놀이", "인형", "킥보드", "놀이방매트"
      ]
    }
  },
  "생활/주방가전": {
    "PC/주변기기": {
      "code": "APP_006",
      "emoji": "🖥️",
      "children": [
        "모니터", "4K모니터", "무선마우스", "기계식키보드", "노트북거치대", "웹캠"
      ]
    },
    "주방가전": {
      "code": "APP_004",
      "emoji": "🍳",
      "children": [
        "에어프라이어", "전기밥솥", "전자레인지", "식기세척기", "음식물처리기", "전기포트", "커피머신", "믹서기"
      ]
    },
    "계절/환경가전": {
      "code": "APP_003",
      "emoji": "🌡️",
      "children": [
        "가습기", "공기청정기", "제습기", "에어컨", "선풍기", "전기히터"
      ]
    },
    "청소가전": {
      "code": "APP_002",
      "emoji": "🧹",
      "children": [
        "로봇청소기", "무선청소기", "물걸레청소기", "침구청소기"
      ]
    },
    "세탁/건조가전": {
      "code": "APP_001",
      "emoji": "👕",
      "children": [
        "세탁기", "건조기", "올인원 세탁건조기", "의류관리기", "스팀다리미"
      ]
    },
    "미용/건강가전": {
      "code": "APP_005",
      "emoji": "💇",
      "children": [
        "헤어드라이어", "고데기", "전동칫솔", "체중계", "전기면도기", "안마의자"
      ]
    }
  }
};

// URL path와 카테고리 매핑
export const TAB_PATH_MAP: Record<string, string> = {
  'baby': '출산/육아용품',
  'living': '생활/주방가전'
};

export const CATEGORY_PATH_MAP: Record<string, string> = {
  '출산/육아용품': 'baby',
  '생활/주방가전': 'living'
};

// --- Confirmation Modal ---
interface ConfirmModalProps {
  isOpen: boolean;
  keyword: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  isBaby: boolean;
}

function ConfirmModal({ isOpen, keyword, onConfirm, onCancel, isLoading, isBaby }: ConfirmModalProps) {
  // Theme colors
  const themeColor = isBaby ? 'rose' : 'teal';
  const buttonBg = isBaby ? 'bg-rose-500 hover:bg-rose-600' : 'bg-teal-600 hover:bg-teal-700';
  const iconColor = isBaby ? 'text-rose-500' : 'text-teal-600';
  const lightBg = isBaby ? 'bg-rose-50' : 'bg-teal-50';
  
  const steps = [
    { icon: TrendUp, label: '실시간\n인기상품 분석' },
    { icon: MagnifyingGlass, label: '웹 트렌드\n검색' },
    { icon: ChatTeardropText, label: '실사용 리뷰\n정밀 분석' },
    { icon: Question, label: '맞춤 구매질문\n생성' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50"
            onClick={onCancel}
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 10 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
            className="relative w-full max-w-[340px] bg-white rounded-[32px] overflow-hidden shadow-2xl ring-1 ring-black/5"
          >
            <div className="p-6 pt-8 pb-7">
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                   <span className={`inline-block text-[11px] font-bold tracking-wider uppercase mb-1.5 ${isBaby ? 'text-rose-400' : 'text-teal-500'}`}>
                     AI 쇼핑 비서
                   </span>
                   <h3 className="text-[22px] font-bold text-gray-900 leading-tight">
                     맞춤 추천 시작
                   </h3>
                </div>
                <button 
                  onClick={onCancel} 
                  className="p-2 -mr-2 -mt-2 text-gray-300 hover:text-gray-500 transition-colors rounded-full hover:bg-gray-50"
                >
                  <X size={20} weight="bold" />
                </button>
              </div>

              <p className="text-[15px] text-gray-500 mb-8 leading-relaxed font-medium">
                 <span className="text-gray-900 font-bold decoration-2 underline-offset-2 decoration-gray-200 underline">{keyword}</span>에 대해 상세히 분석하고 <br/>
                 추천에 필요한 맞춤 질문을 드릴게요.
              </p>

              {/* Steps Visualization */}
              <div className="relative mb-9 px-1">
                 
                 <div className="flex justify-between items-start relative z-10">
                   {steps.map((step, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-2.5 relative group flex-1">
                         <div className={`
                            w-10 h-10 rounded-2xl ${lightBg} flex items-center justify-center 
                            ${iconColor}
                            group-hover:scale-110 transition-transform duration-300 z-10
                         `}>
                            <step.icon weight="fill" size={18} />
                         </div>
                         
                         {/* Arrow for Flow (except last item) */}
                         {idx < steps.length - 1 && (
                           <div className="absolute top-[18px] -right-[10px] text-gray-300 z-0">
                             <CaretRight weight="bold" size={12} />
                           </div>
                         )}

                         <span className="text-[11px] font-bold text-gray-400 text-center leading-tight whitespace-pre-line group-hover:text-gray-600 transition-colors">
                            {step.label}
                         </span>
                      </div>
                   ))}
                 </div>
              </div>

              {/* Action Button */}
              <button
                  onClick={onConfirm}
                  disabled={isLoading}
                  className={`
                    w-full py-4 rounded-[22px] font-bold text-[16px] text-white
                    transform active:scale-[0.98] transition-all duration-300
                    flex items-center justify-center gap-2
                    ${buttonBg}
                    ${isLoading ? 'opacity-80 cursor-wait' : ''}
                  `}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>분석 시작하기</span>
                    </>
                  )}
                </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface KnowledgeAgentLandingProps {
  defaultTab: 'baby' | 'living';
}

export default function KnowledgeAgentLanding({ defaultTab }: KnowledgeAgentLandingProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSearchItem, setActiveSearchItem] = useState<string | null>(null);

  // 해당 탭의 카테고리만 사용
  const selectedMainCategory = TAB_PATH_MAP[defaultTab];
  const subCategories = Object.keys(CATEGORIES_DATA[selectedMainCategory]);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [extractedKeyword, setExtractedKeyword] = useState('');

  // Theme Colors
  const isBaby = defaultTab === 'baby';

  useEffect(() => {
    logKAPageView();
  }, []);

  const displayCategories = useMemo(() => {
    if (selectedSubCategory === null) {
      return Object.entries(CATEGORIES_DATA[selectedMainCategory]);
    }
    const data = CATEGORIES_DATA[selectedMainCategory][selectedSubCategory];
    return data ? [[selectedSubCategory, data]] : [];
  }, [selectedMainCategory, selectedSubCategory]);

  const handleSearchRequest = async (query?: string) => {
    const searchQuery = query || inputValue.trim();
    if (!searchQuery || isProcessing) return;

    // 카테고리 버튼 클릭 시에는 이미 키워드가 명확하므로 별도 추출 없이 바로 모달 오픈
    if (query) {
      logKnowledgeAgentSearchRequest(query, 'button_click', selectedMainCategory, selectedSubCategory || undefined);
      setActiveSearchItem(query);
      setExtractedKeyword(query);
      setShowConfirmModal(true);
      return;
    }

    // 입력창 검색 시에만 추출 로직 실행
    setIsProcessing(true);
    logKnowledgeAgentSearchRequest(searchQuery, 'search_input');
    try {
      const res = await fetch('/api/knowledge-agent/extract-keyword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: searchQuery })
      });
      const data = await res.json();
      const finalKeyword = data.success && data.keyword ? data.keyword : searchQuery;
      // 키워드 추출 성공 시에는 confirm 로깅을 따로 하므로 여기서는 skip하거나 보조 정보로 남김
      setExtractedKeyword(finalKeyword);
      setShowConfirmModal(true);
    } catch (error) {
      console.error('[Landing] Search failed:', error);
      setExtractedKeyword(searchQuery);
      setShowConfirmModal(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmSearch = () => {
    if (!extractedKeyword) return;
    logKnowledgeAgentSearchConfirm(extractedKeyword, inputValue);
    setIsProcessing(true);
    router.push(`/knowledge-agent/${encodeURIComponent(extractedKeyword)}`);
  };

  const handleCancelSearch = () => {
    logKnowledgeAgentSearchCancel(extractedKeyword);
    setShowConfirmModal(false);
    setExtractedKeyword('');
    setActiveSearchItem(null);
  };

  return (
    <div className="min-h-screen bg-white">

      <ConfirmModal
        isOpen={showConfirmModal}
        keyword={extractedKeyword}
        onConfirm={handleConfirmSearch}
        onCancel={handleCancelSearch}
        isLoading={isProcessing}
        isBaby={isBaby}
      />

      <div className="max-w-[480px] mx-auto min-h-screen flex flex-col">
        {/* Header Bar */}
        <header className="sticky top-0 z-50 bg-[#FBFBFD] h-[54px] flex items-center px-5">
          <button onClick={() => router.push('/knowledge-agent')} className="p-2 -ml-2">
            <img src="/icons/back.png" alt="뒤로가기" className="w-5 h-5" />
          </button>
        </header>

        <KnowledgeAgentStepIndicator currentStep={1} className="top-[54px]" />

        <motion.div
          initial="hidden"
          animate="visible"
          className="flex-1 flex flex-col pt-0"
        >
          <div className="px-4 pt-0 pb-12">
            {/* Title */}
            <motion.div className="mt-[11px] mb-[16px]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[15px] text-gray-400 font-semibold">
                  카테고리 설정
                </span>
              </div>
              <h3 className="text-[18px] font-semibold text-gray-900 leading-snug break-keep">
                찾으시는 상품을 선택하세요
                <span className="text-blue-500"> *</span>
              </h3>
            </motion.div>

            {/* Sub Tabs */}
            <div className="-mx-4 px-4 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    logKnowledgeAgentSubCategorySelect(selectedMainCategory, null);
                    setSelectedSubCategory(null);
                  }}
                  className={`px-4 py-1.5 rounded-full text-[14px] font-medium border ${selectedSubCategory === null
                    ? 'bg-gray-800 border-gray-800 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-500'
                    }`}
                >
                  모두보기
                </motion.button>
                {subCategories.map((sub) => (
                  <motion.button
                    key={sub}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      logKnowledgeAgentSubCategorySelect(selectedMainCategory, sub);
                      setSelectedSubCategory(sub);
                    }}
                    className={`px-4 py-1.5 rounded-full text-[14px] font-medium border ${selectedSubCategory === sub
                      ? 'bg-gray-800 border-gray-800 text-white shadow-sm'
                      : 'bg-white border-gray-200 text-gray-500'
                      }`}
                  >
                    {sub}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Category List */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${selectedMainCategory}-${selectedSubCategory}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {(displayCategories as [string, any][]).map(([subTitle, data]) => {
                  return (
                    <div key={subTitle} className="mb-8">
                      <div className="flex items-center py-[10px]">
                        <h3 className="text-[16px] font-semibold text-gray-800">{subTitle}</h3>
                      </div>
                      <div className="grid grid-cols-3 gap-y-4 gap-x-1.5 sm:gap-x-2">
                        {data.children.map((child: string) => {
                          const isLoading = activeSearchItem === child && !showConfirmModal;
                          const imageUrl = isBaby ? BABY_CATEGORY_ICONS[child] : CATEGORY_IMAGES[child];
                          const imageSrc = imageUrl ? encodeURI(imageUrl) : undefined;

                          return (
                            <div key={child} className="flex flex-col items-center w-full min-w-0">
                              <motion.button
                                onClick={() => handleSearchRequest(child)}
                                disabled={isLoading || isProcessing}
                                whileTap={isLoading ? undefined : { scale: 0.98 }}
                                className={`relative w-full aspect-square rounded-2xl border flex flex-col items-center pt-3 pb-2 gap-1 bg-white border-gray-100 hover:border-gray-200 ${isBaby ? '' : 'shadow-xs'}`}
                              >
                                {isLoading ? (
                                  <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin my-auto" />
                                ) : (
                                  <>
                                    <span className={`font-medium text-gray-600 px-1 truncate w-full text-center ${isBaby ? 'text-[14px]' : 'text-[13px] sm:text-[14px]'}`}>
                                      {child}
                                    </span>
                                    <div className={`relative mt-auto mb-1 flex items-center justify-center ${isBaby ? 'w-[62%] h-[62%]' : 'w-[55%] h-[55%]'}`}>
                                      {imageSrc ? (
                                        <img
                                          src={imageSrc}
                                          alt={child}
                                          className="w-full h-full object-contain"
                                        />
                                      ) : (
                                        <span className="text-2xl opacity-40">{data.emoji || '📦'}</span>
                                      )}
                                    </div>
                                  </>
                                )}
                              </motion.button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
