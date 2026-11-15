/**
 * services/safetyGuardrailService.js
 * BEPMC AI 안전 법규 & 제도 챗봇 - 질문 도메인 적합성 검증 가드레일 (Topic Guardrail)
 * 
 * - 허용 분야:
 *     1) 산업 / 철도 / 건설 현장 안전 법규 (산안법, 중처법, 철도안전법 등) 및 안전 관리 기술
 *     2) 안전 관련 최신 뉴스, 개정 고시, 정부(고용부/국토부) 정책 동향
 *     3) 4대 중대재해(추락/협착/감전/충돌/질식/화재 등) 예방 및 재해 사례
 *     4) BEPMC 서비스 안내 (회원가입, 로그인, 유료 등급 혜택, 영상 분석 관제 등)
 *     5) 일상 인사말 및 사용 안내
 * 
 * - 제한 분야 (차단 대상):
 *     연예 뉴스, 아이돌, 스포츠 경기, 게임, 주식/코인 투자, 부동산 시세, 일반 잡담 등 안전 무관 분야
 */

// 1. 강한 안전/법령 키워드 (질문에 포함되어 있으면 연예/영화 단어가 있더라도 현장 안전 질문으로 우선 허용)
const STRONG_SAFETY_KEYWORDS = [
  '안전', '재해', '사고', '사망', '부상', '추락', '낙하', '협착', '끼임', '감전',
  '화재', '폭발', '질식', '산소', '유해가스', '붕괴', '전도', '철도', '선로', '궤도',
  '전차선', '이격거리', '보호구', '안전모', '안전대', '안전화', '방호', '비계', '난간',
  '개구부', '작업발판', '크레인', '중장비', '지게차', '위험성평가', 'tbm', '안전관리자',
  '안전보건', '중대재해', '산안법', '산업안전보건법', '철도안전법', '근로기준법', '노동부',
  '국토부', '안전공단', 'kosha', '과태료', '벌칙', '처벌', '법규', '법령', '시행령',
  '시행규칙', '기준', '지침', '매뉴얼', '체크리스트', '사례', '공사', '건설', '현장',
  '작업', '점검', '교육', '보건', '방재', '소방', '대피', '유해', '밀폐', '누전',
  '특고압', '열차', '교행', '압착', '도상', '차량', '철도보호지구'
];

// 2. 명백히 무관한 금지 도메인 정규식 패턴 (연예, 스포츠, 주식, 오락 등)
const DISALLOWED_PATTERNS = [
  // 연예 / 대중문화 / 방송 / 엔터테인먼트
  /연예/i, /아이돌/i, /걸그룹/i, /보이그룹/i, /열애/i, /결혼설/i, /결별/i, /디스패치/i,
  /케이팝/i, /kpop/i, /음원차트/i, /멜론/i, /빌보드/i, /뮤직비디오/i, /콘서트/i, /팬미팅/i,
  /드라마/i, /예능/i, /시청률/i, /영화추천/i, /넷플릭스/i, /연예인/i, /방탄소년단/i, /bts/i,
  /블랙핑크/i, /뉴진스/i, /아이브/i, /르세라핌/i, /에스파/i, /임영웅/i, /가요/i, /노래추천/i,
  
  // 스포츠 / 게임
  /스포츠/i, /축구/i, /야구/i, /농구/i, /배구/i, /골프/i, /손흥민/i, /이강인/i, /김민재/i,
  /류현진/i, /오타니/i, /epl/i, /프리미어리그/i, /kbo/i, /월드컵/i, /올림픽/i, /경기결과/i, /스코어/i,
  /온라인게임/i, /롤/i, /리그오브레전드/i, /배틀그라운드/i, /오버워치/i, /메이플/i, /로스트아크/i, /게임공략/i,
  
  // 주식 / 코인 / 부동산 / 재테크 / 운세
  /주식/i, /코인/i, /비트코인/i, /이더리움/i, /가상화폐/i, /암호화폐/i, /상한가/i, /테마주/i, /종목추천/i,
  /급등주/i, /부동산투자/i, /아파트시세/i, /청약경쟁률/i, /로또/i, /복권/i, /운세/i, /사주/i, /타로/i,
  
  // 기타 일반 잡담 및 오락
  /맛집/i, /식당추천/i, /요리레시피/i, /관광지/i, /여행코스/i, /호텔예약/i, /소개팅/i, /연애상담/i,
  /쇼핑추천/i, /패션스타일/i, /메이크업/i, /화장품추천/i
];

// 3. BEPMC 서비스 및 시스템 안내 허용 키워드
const SERVICE_KEYWORDS = [
  'bepmc', '회원', '가입', '로그인', '유료', '결제', '구독', '멤버십', '요금', '서비스',
  '체험', '트라이얼', '기능', '관제', '동영상', '영상', '분석', '대시보드', '가격', '비용',
  '문의', '연락처', '회사', '도움말', '사용법', '이용안내'
];

// 4. 기본 인사 및 시스템 안내 키워드
const GREETING_KEYWORDS = [
  '안녕', '반갑', '반가워', '수고', '고마워', '감사', '누구', '소개', 'hello', 'hi'
];

// 표준 거절 안내 메시지
const STANDARD_REFUSAL_MESSAGE = `### ⚠️ 본 챗봇이 제공하지 않는 서비스입니다.

**BEPMC AI 컨설턴트**는 **산업·철도·건설 현장 안전 법규 및 최신 정책 뉴스, 안전 관리 전문 기술 정보, 그리고 BEPMC 회원 서비스 안내**를 전담하는 전문 지식 챗봇입니다.

문의하신 내용(연예, 스포츠, 주식/투자, 일반 오락 및 상식 등)은 본 챗봇의 전문 서비스 범위에 해당하지 않아 답변 제공 및 검색이 제한됩니다.

---
💡 **다음과 같은 안전 전문 사항을 질문해 주시면 정확히 답변해 드립니다:**
- **철도안전법, 산업안전보건법, 중대재해처벌법** 및 최신 법령·고시 개정사항
- **가공전차선(25kV) 안전 이격거리, 추락·협착·감전·질식** 등 4대 위험작업 예방 수칙
- **현장 위험성평가 기준 및 국토안전관리원 안전사고 사례**
- **BEPMC 회원 가입 절차 및 유료 회원 제공 서비스(동영상 AI 안전 관제 등)** 안내`;

/**
 * 질문의 도메인 적합성을 검증합니다.
 * @param {string} query 사용자 입력 질문
 * @returns {{ isAllowed: boolean, reason: string, refusalMessage?: string }}
 */
function validateSafetyTopic(query) {
  if (!query || typeof query !== 'string') {
    return { isAllowed: false, reason: 'empty_query', refusalMessage: STANDARD_REFUSAL_MESSAGE };
  }

  const cleanQuery = query.toLowerCase().trim();

  // 1. 강한 안전/법령 키워드가 포함되어 있으면 최우선 허용 (예: "영화 세트장 비계 추락 방지")
  const hasStrongSafety = STRONG_SAFETY_KEYWORDS.some(kw => cleanQuery.includes(kw));
  if (hasStrongSafety) {
    return { isAllowed: true, reason: 'safety_domain' };
  }

  // 2. 명백히 안전과 무관한 금지 키워드(연예, 스포츠, 주식, 오락 등) 매칭 시 즉시 차단
  const matchedPattern = DISALLOWED_PATTERNS.find(pattern => pattern.test(cleanQuery));
  if (matchedPattern) {
    return {
      isAllowed: false,
      reason: 'disallowed_domain',
      refusalMessage: STANDARD_REFUSAL_MESSAGE
    };
  }

  // 3. BEPMC 서비스 안내 및 회원 관련 질문 허용
  const hasServiceKeyword = SERVICE_KEYWORDS.some(kw => cleanQuery.includes(kw));
  if (hasServiceKeyword) {
    return { isAllowed: true, reason: 'service_domain' };
  }

  // 4. 일상 인사말 허용
  const hasGreeting = GREETING_KEYWORDS.some(kw => cleanQuery.includes(kw));
  if (hasGreeting) {
    return { isAllowed: true, reason: 'greeting' };
  }

  // 5. 안전/법규/BEPMC 서비스와 전혀 관련 없는 일반 비도메인 질의 (예: "프랑스의 수도는?", "달까지의 거리는?")
  return {
    isAllowed: false,
    reason: 'out_of_scope',
    refusalMessage: STANDARD_REFUSAL_MESSAGE
  };
}

module.exports = {
  validateSafetyTopic,
  STANDARD_REFUSAL_MESSAGE
};
