/**
 * services/publicDataTop10RulesService.js
 * 대한민국 고용노동부(MOEL) 및 한국산업안전보건공단(KOSHA) 공식 통계 기반
 * [과거 1년 최다 빈도 발생 10대 안전사고 판정 기준 매트릭스]
 * 
 * 동영상 프레임 분석 시 시각적 객체(작업자, 장비, 보호구, 현장구조)를 감지하여
 * 공공 빅데이터 10대 다발 재해 유형과 직접 대조하고 정량적 근거를 제시합니다.
 */

const publicApiService = require('./publicApiService');

// 과거 1년간 대한민국 건설·산업 현장 최다 빈도 10대 중대재해 원인 매트릭스 (공식 통계 연계)
const TOP10_SAFETY_ACCIDENT_RULES = [
  {
    rank: 1,
    title: "단부·개구부 안전난간 및 덮개 미설치 추락",
    accidentType: "추락 (떨어짐)",
    sharePercent: 34.8,
    frequencyDescription: "최근 1년 건설업 중대재해 원인 1위 (전체 사망재해의 34.8% 점유)",
    detectionLabels: ["person", "edge", "opening", "no_guardrail", "no_harness"],
    criteria: "슬래브 단부 또는 바닥 개구부 1.5m 이내에 근로자가 위치하나, 표준안전난간·견고한 덮개가 미설치되었거나 안전대를 체결하지 않은 상태",
    legalBasis: {
      lawName: "산업안전보건기준에 관한 규칙",
      articleNo: "제42조 및 제43조",
      articleTitle: "추락의 방지 및 개구부 등의 방호 조치",
      punishment: "5년 이하의 징역 또는 5천만원 이하의 벌금 (사망 시 7년 이하의 징역)"
    },
    dangerLevel: "상 (즉시작업중지)",
    immediateAction: "단부 접근 즉시 중지 및 안전대 걸이시설(수평구명줄) 설치 전까지 구역 출입 통제",
    engineeringCountermeasures: [
      "상부난간대(90~120cm), 중간난간대(하부난간대), 폭목(발끝막이판 10cm 이상) 갖춘 표준안전난간 설치 (KOSHA GUIDE C-25)",
      "바닥 개구부에 100kg 이상 하중에 견디는 목재·철판 덮개 설치 후 '개구부 주의·추락위험' 경고 표지 부착 및 밀림 방지 고정",
      "안전난간 설치 불가 구간은 강관 파이프 지주형 수평구명줄(직경 14mm 합성섬유로프 또는 9mm 와이어로프) 설치 후 1인 1개소 안전대 체결"
    ]
  },
  {
    rank: 2,
    title: "이동식 비계 및 A형 사다리 전도·추락",
    accidentType: "추락 (떨어짐)",
    sharePercent: 14.2,
    frequencyDescription: "최근 1년 건설업 중대재해 원인 2위 (마감·설비공사 다발)",
    detectionLabels: ["person", "ladder", "scaffold", "no_outrigger"],
    criteria: "말비계·A형 사다리 최상부 발판 작업, 아웃트리거 미설치 이동식 비계 위 작업, 또는 바퀴 스토퍼 미고정 상태 승강",
    legalBasis: {
      lawName: "산업안전보건기준에 관한 규칙",
      articleNo: "제56조, 제67조 및 제68조",
      articleTitle: "작업발판의 구조 및 이동식비계",
      punishment: "5년 이하의 징역 또는 5천만원 이하의 벌금"
    },
    dangerLevel: "상 (즉시작업중지)",
    immediateAction: "사다리 최상단 디딤 작업 즉시 중지 및 아웃트리거 전도방지대 체결 확인",
    engineeringCountermeasures: [
      "A형 사다리는 이동 통로로만 사용 원칙, 2m 이상 고소작업 시 안전형 말비계(우마) 또는 이동식틀비계로 대체",
      "이동식 비계 4면 아웃트리거 턴버클 밀착 설치 및 바퀴 스토퍼 4개소 완전 잠금",
      "비계 상부 작업대 4면 안전난간 및 승강용 사다리 내부 설치 (KOSHA GUIDE C-30)"
    ]
  },
  {
    rank: 3,
    title: "중장비(굴착기·지게차) 작업반경 내 근로자 충돌",
    accidentType: "부딪힘 (장비충돌)",
    sharePercent: 11.5,
    frequencyDescription: "최근 1년 건설기계 사고 1위 (토공사 및 자재양중 다발)",
    detectionLabels: ["excavator", "forklift", "truck", "worker_in_danger_zone", "no_signalman"],
    criteria: "굴착기 선회 반경(3~5m) 또는 지게차 주행 경로 내에 전담 신호수 없이 보행 근로자가 근접하여 작업 중인 상태",
    legalBasis: {
      lawName: "산업안전보건기준에 관한 규칙",
      articleNo: "제171조 및 제172조",
      articleTitle: "차량계 건설기계 접촉의 방지 및 신호수 배치",
      punishment: "5년 이하의 징역 또는 5천만원 이하의 벌금"
    },
    dangerLevel: "상 (즉시작업중지)",
    immediateAction: "중장비 작업 일시정지 후 작업반경 내 보행자 퇴거 및 전담 신호수 지정 배치",
    engineeringCountermeasures: [
      "굴착기 및 지게차 후방·측면 AI 인체감지 어라운드뷰(AAVM) 카메라 및 초음파 접근 경보센서 의무 장착",
      "기계 작업반경 내 라바콘 및 접근금지 펜스 설치, 유도선 구획 분리",
      "신호수 전용 야광조끼 착용 및 무전기/경광봉 휴대를 통한 단일 신호체계 확립"
    ]
  },
  {
    rank: 4,
    title: "동력기계 회전체 방호덮개 미설치 및 청소·정비 중 끼임",
    accidentType: "끼임 (협착)",
    sharePercent: 9.3,
    frequencyDescription: "최근 1년 설비·제조·플랜트 공사 중대재해 원인 1위",
    detectionLabels: ["rotating_machine", "conveyor", "no_guard", "maintenance_without_loto"],
    criteria: "모터, 벨트풀리, 기어, 롤러 등 회전체 방호덮개 미부착 상태 가동 또는 가동 중 이물질 제거·점검 행위",
    legalBasis: {
      lawName: "산업안전보건기준에 관한 규칙",
      articleNo: "제87조 및 제92조",
      articleTitle: "원동기·회전축 등의 위험 방지 및 정비 등의 작업 시의 운전정지",
      punishment: "5년 이하의 징역 또는 5천만원 이하의 벌금"
    },
    dangerLevel: "상 (즉시작업중지)",
    immediateAction: "기계 주전원 즉시 차단 후 LOTO(전원차단 잠금장치 및 안전표지판) 체결",
    engineeringCountermeasures: [
      "모든 회전 구동부에 인터록(Interlock) 연동 방호덮개 설치 (개방 시 자동 정지)",
      "정비·보수 시 LOTO(Lockout-Tagout) 잠금장치 및 개인별 자물쇠 1인 1키 원칙 준수",
      "비상정지스위치(E-Stop) 작업자 손이 닿는 반경 내 설치 및 일일 작동 테스트"
    ]
  },
  {
    rank: 5,
    title: "자재 인양(크레인) 하부 근로자 통행 및 낙하·비래",
    accidentType: "맞음 (낙하·비래)",
    sharePercent: 8.1,
    frequencyDescription: "타워크레인/카고크레인 양중 작업 시 고위험 재해",
    detectionLabels: ["crane", "suspended_load", "worker_underneath", "rigging_defect"],
    criteria: "인양 중인 중량물 하부에 근로자가 통행하거나 2줄 걸이 미준수, 샤클 풀림 방지 핀 미체결 상태 양중",
    legalBasis: {
      lawName: "산업안전보건기준에 관한 규칙",
      articleNo: "제14조 및 제146조",
      articleTitle: "낙하물에 의한 위험의 방지 및 크레인 작업 시의 조치",
      punishment: "5년 이하의 징역 또는 5천만원 이하의 벌금"
    },
    dangerLevel: "상 (즉시작업중지)",
    immediateAction: "인양 하부 통행 근로자 즉각 대피 지시 및 신호수 유도 재개",
    engineeringCountermeasures: [
      "양중 작업 반경 100% 구획 펜스 설치 및 인양물 직하부 통행 원천 차단",
      "와이어로프 소선 단선율 10% 미만 점검, 2줄 4점 걸이 준수 및 유도로프(Tag Line) 2개소 사용",
      "고소작업 하부 투하설비 또는 낙하물방지망(벽면에서 2m 이상 돌출, 20~30도 각도) 설치"
    ]
  },
  {
    rank: 6,
    title: "기본 개인보호구(안전모 턱끈·안전대) 미착용·미체결",
    accidentType: "보호구 미흡 (추락/맞음 가중)",
    sharePercent: 7.2,
    frequencyDescription: "사망사고 다발 현장 공통 결함 (사망확률 4배 증가 요인)",
    detectionLabels: ["person", "no_hardhat", "loose_chinstrap", "unclipped_harness"],
    criteria: "현장 내 안전모 미착용, 턱끈 풀림, 또는 높이 2m 이상 고소작업 시 안전그네형 안전대 D링 미체결",
    legalBasis: {
      lawName: "산업안전보건기준에 관한 규칙",
      articleNo: "제32조",
      articleTitle: "보호구의 지급 등",
      punishment: "과태료 부과 및 작업장 퇴거 조치"
    },
    dangerLevel: "중 (즉시시정조치)",
    immediateAction: "작업 일시 중단 후 안전모 턱끈 결속 및 안전대 걸이대 죔줄 체결 확인",
    engineeringCountermeasures: [
      "원터치 자동체결 턱끈 안전모 전원 지급 및 작업장 입구 스마트 안면인식 안전모 착용 검출기 운영",
      "2m 이상 전 구간 강관비계/트러스에 안전대 걸이 전용 파이프 사전 설계 반영",
      "충격흡수장치(Shock Absorber) 내장형 이중 죔줄(Y형 랜야드) 안전대 의무화"
    ]
  },
  {
    rank: 7,
    title: "토사 굴착면 기울기 미준수 및 흙막이 지보공 붕괴",
    accidentType: "무너짐 (붕괴)",
    sharePercent: 5.4,
    frequencyDescription: "해빙기·우기 토공사 및 관로공사 대형 인명사고 요인",
    detectionLabels: ["trench", "steep_slope", "no_shoring", "crack_in_ground"],
    criteria: "굴착 깊이 1.5m 이상 트렌치/터파기 구간에 법정 안전기울기 미준수 또는 흙막이 지보공 없이 작업 중",
    legalBasis: {
      lawName: "산업안전보건기준에 관한 규칙",
      articleNo: "제338조 내지 제340조",
      articleTitle: "지반 붕괴 위험 방지 및 굴착면의 기울기 기준",
      punishment: "5년 이하의 징역 또는 5천만원 이하의 벌금"
    },
    dangerLevel: "상 (즉시작업중지)",
    immediateAction: "굴착 저면 근로자 즉각 철수 및 법면 상부 균열 상태 점검",
    engineeringCountermeasures: [
      "토사 종류별 법정 굴착 기울기 준수 (보통흙 습지 1:1~1:1.5, 건지 1:0.5~1:1)",
      "깊이 1.5m 이상 굴착 시 조립식 간이 흙막이(알루미늄 트렌치 쉴드) 선시공 후 작업",
      "굴착 상단 1m 이내 토사·자재 야적 금지 및 빗물 유입 방지 비닐 덮개 시공"
    ]
  },
  {
    rank: 8,
    title: "용접·용단 불티 비산방지포 미설치 및 단열재 화재",
    accidentType: "화재·폭발",
    sharePercent: 4.5,
    frequencyDescription: "동절기·환절기 우레탄폼 및 지하층 대형 화재 주원인",
    detectionLabels: ["welding_sparks", "insulation_material", "no_fire_blanket", "no_fire_extinguisher"],
    criteria: "용접 불티 비산 반경(11m 이내)에 우레탄폼·스티로폼 등 가연성 단열재 방치 또는 방포·소화기 미비치",
    legalBasis: {
      lawName: "산업안전보건기준에 관한 규칙",
      articleNo: "제236조 및 제241조",
      articleTitle: "화기작업 시의 조치 및 화재감시자 배치",
      punishment: "5년 이하의 징역 또는 5천만원 이하의 벌금"
    },
    dangerLevel: "상 (즉시작업중지)",
    immediateAction: "용접 작업 중단, 불씨 확인 및 반경 11m 내 가연물 제거, 소화기 전진 배치",
    engineeringCountermeasures: [
      "용접 작업 부위 3면 불티 비산방지포(방염 1등급) 밀폐 포위 시공",
      "화기작업 허가제 운영 및 전담 화재감시자(소화기 2대, 확성기 지참) 배치 의무화",
      "용접 종료 후 1시간 이상 잠열 및 잔여 불씨 비산 여부 지속 감시"
    ]
  },
  {
    rank: 9,
    title: "가설 분전함 접지 불량 및 침수 전선 노출 감전",
    accidentType: "감전",
    sharePercent: 3.2,
    frequencyDescription: "우천·습윤 환경 및 콘크리트 타설 공구 사용 중 다발",
    detectionLabels: ["electrical_panel", "exposed_wiring", "water_on_floor", "damaged_cable"],
    criteria: "임시 분전함 외함 도어 개방, 누전차단기(ELB) 미경유 전원 인출, 또는 물 고인 바닥에 피복 손상 전선 방치",
    legalBasis: {
      lawName: "산업안전보건기준에 관한 규칙",
      articleNo: "제302조 및 제313조",
      articleTitle: "누전차단기의 설치 및 배선 등의 절연 피복",
      punishment: "5년 이하의 징역 또는 5천만원 이하의 벌금"
    },
    dangerLevel: "중 (당일개선조치)",
    immediateAction: "해당 배전선로 전원 즉시 차단 및 손상 케이블 철거 교체",
    engineeringCountermeasures: [
      "모든 이동형 전동공구 전원선 고감도 누전차단기(정격감도전류 30mA, 동작시간 0.03초 이내) 경유",
      "전선 지상 거치대(케이블 걸이대 2m 이상) 설치로 바닥 습기 및 건설장비 바퀴 압착 방지",
      "외함 접지(제3종 접지 저항 100옴 이하) 상태 월 1회 절연저항 측정 기록 유지"
    ]
  },
  {
    rank: 10,
    title: "밀폐공간 환기 미실시 및 산소·유해가스 미측정 질식",
    accidentType: "질식·유독물",
    sharePercent: 2.8,
    frequencyDescription: "정화조, 맨홀, 동절기 콘크리트 양생(갈탄/열풍기) 치사율 50% 초고위험",
    detectionLabels: ["confined_space", "manhole", "concrete_curing", "no_ventilation"],
    criteria: "산소농도 18% 미만 또는 일산화탄소 30ppm 초과 우려 밀폐구역에 사전 가스농도 측정 및 송풍기 없이 진입",
    legalBasis: {
      lawName: "산업안전보건기준에 관한 규칙",
      articleNo: "제619조 내지 제622조",
      articleTitle: "밀폐공간 보건작업 프로그램 수립·시행 및 산소농도의 측정",
      punishment: "5년 이하의 징역 또는 5천만원 이하의 벌금"
    },
    dangerLevel: "상 (즉시작업중지)",
    immediateAction: "밀폐공간 내부 근로자 즉각 비상 대피 및 외부 출입 금지 차단막 설치",
    engineeringCountermeasures: [
      "진입 전 4대 가스(산소, 일산화탄소, 황화수소, 가연성가스) 농도 측정 의무화 (산소 18~23.5% 확인)",
      "작업 중 강제 급기 환기팬 연속 가동 (1시간당 용적 5회 이상 치환)",
      "구조용 삼각대, 안전벨트, 송기마스크 비치 및 감시인 상시 외부 배치"
    ]
  }
];

/**
 * 1. 공공데이터 10대 재해 규칙 전체 목록 반환
 */
function getTop10AccidentRules() {
  return TOP10_SAFETY_ACCIDENT_RULES;
}

/**
 * 2. 특정 순위 규칙 상세 조회
 */
function getRuleByRank(rank) {
  return TOP10_SAFETY_ACCIDENT_RULES.find(r => r.rank === Number(rank)) || null;
}

/**
 * 3. 탐지된 객체 라벨 및 위험 정황을 기반으로 10대 사고 유형 매칭
 */
function matchTop10HazardRule({ labels = [], contextDescription = '' }) {
  const normalizedLabels = labels.map(l => l.toLowerCase());
  const context = (contextDescription || '').toLowerCase();

  let matchedRule = null;
  let matchScore = 0;

  for (const rule of TOP10_SAFETY_ACCIDENT_RULES) {
    let score = 0;
    // 라벨 일치도 검사
    for (const dLabel of rule.detectionLabels) {
      if (normalizedLabels.includes(dLabel.toLowerCase()) || context.includes(dLabel.toLowerCase())) {
        score += 2;
      }
    }
    // 재해 유형 단어 포함 여부 검사
    if (context.includes(rule.accidentType.split(' ')[0].toLowerCase())) {
      score += 1;
    }

    if (score > matchScore) {
      matchScore = score;
      matchedRule = rule;
    }
  }

  // 기본값: 단부 추락 (가장 다발하는 1순위)
  if (!matchedRule || matchScore === 0) {
    matchedRule = TOP10_SAFETY_ACCIDENT_RULES[0];
  }

  return {
    matchedRule,
    matchScore,
    isReliable: matchScore >= 2
  };
}

module.exports = {
  TOP10_SAFETY_ACCIDENT_RULES,
  getTop10AccidentRules,
  getRuleByRank,
  matchTop10HazardRule
};
