/**
 * services/safetyKnowledgeBaseService.js
 * 건설안전기술사(PE) 수준 공학적 지식베이스(RAG), KOSHA GUIDE 엔지니어링 계산 기준
 * 및 독자 AI 모델 파인튜닝용 골든 데이터셋(Golden Dataset) 파이프라인
 */

const fs = require('fs');
const path = require('path');

const GOLDEN_DATASET_FILE = path.join(__dirname, '..', 'data', 'golden_dataset.jsonl');

// 1. KOSHA GUIDE & 건설안전기술사 공학적 지식베이스 (도메인 특화 데이터)
const PE_KNOWLEDGE_BASE = [
  {
    id: "KOSHA-C-01",
    guideNo: "KOSHA GUIDE C-26-2021",
    title: "강관비계 및 시스템비계 구조 안전설계 및 좌굴 안정성 지침",
    category: "추락 (떨어짐)",
    keywords: ["비계", "시스템비계", "강관비계", "좌굴", "벽이음", "수직하중", "작업발판", "난간"],
    engineeringStandard: {
      bucklingCheck: "수직재의 유효좌굴길이 le = 1.0~1.2L, 오일러 좌굴응력 σcr = π²E / (le/i)² 검토 필수",
      allowableLoad: "비계 기둥 1개당 최대 허용수직하중 P_all = 4.4 kN (단관비계) / 9.8 kN (시스템비계)",
      wallTie: "수직 5.0m 이하, 수평 5.0m 이하마다 견고한 벽이음 철물 체결(인장·압축 내력 10kN 이상)",
      handrailSpec: "상부난간대 바닥면 90~120cm, 중간난간대 45~60cm, 발끝막이판 폭 10cm 이상, 수평하중 100kgf(980N) 이상 지지"
    },
    peOpinionTemplate: "본 가설 비계 구조물은 연직하중에 대한 기둥재 좌굴안정성과 풍하중에 대한 수평 변위 검토가 요구됩니다. 벽이음 미체결 구간은 편심 하중 발생 시 연쇄 붕괴 위험이 크므로 시스템 비계 전용 벽이음 철물로 보강하고 안전난간대는 980N의 수평하중에 저항하도록 고정핀 결속을 확인하십시오.",
    alternativeMethod: "조립식 시스템비계 전면 적용 및 선행안전난간(Advanced Guardrail System) 공법 채택 권장"
  },
  {
    id: "KOSHA-C-02",
    guideNo: "KOSHA GUIDE C-08-2022",
    title: "개구부 및 슬래브 단부 추락방호시설 설계 및 구조기준",
    category: "추락 (떨어짐)",
    keywords: ["개구부", "덮개", "슬래브", "단부", "추락", "방호", "피트", "슬리브"],
    engineeringStandard: {
      loadCapacity: "등분포 활하중 최소 5.0 kN/㎡ 이상 또는 집중하중 1.0 kN(100kgf) 이상에 영구변형 없는 구조 강성 확보",
      fastener: "두께 12mm 이상 내수합판 또는 3.2mm 무늬강판 사용, 테두리에 L-40x40x3t 앵글 고정턱 설치하여 수평 밀림 원천 차단",
      warningSign: "고휘도 반사 시트의 '추락위험·개구부 임의해체금지' 표지(KOSHA 표준) 상부 및 테두리 부착"
    },
    peOpinionTemplate: "바닥 개구부는 근로자의 단순 실족뿐만 아니라 소운반 대차 통과 시 집중하중(Wheel Load)이 작용합니다. 따라서 임의 합판 거치는 하중 집중 시 파단/뒤집힘에 의한 즉시 추락으로 직결되므로, 콘크리트 앵커 볼트 고정식 표준 덮개와 테두리 턱을 즉시 시공해야 합니다.",
    alternativeMethod: "슬래브 타설 전 개구부 철근 배근 관통 매립(타설 후 배관 공사 시 절단) 공법 또는 기성 힌지형 일체형 개구부 덮개 시공"
  },
  {
    id: "KOSHA-C-03",
    guideNo: "KOSHA GUIDE C-37-2020",
    title: "지반 굴착사면 안전기울기 및 흙막이 지보공 붕괴 방지 지침",
    category: "무너짐 (붕괴)",
    keywords: ["굴착", "사면", "흙막이", "토사", "붕괴", "토압", "토공", "지보공"],
    engineeringStandard: {
      slopeRatio: "습지 1:1~1:1.5, 건지 1:0.5~1:1, 풍화암 1:1.0, 연암 1:0.5, 경암 1:0.3 이하",
      safetyFactor: "사면 안정 해석 시 건기 안전율 Fs ≥ 1.5, 우기 안전율 Fs ≥ 1.2 확보",
      crestSurcharge: "사면 어깨부(Crest) 1.5m 이내에 토사 적재, 굴착기 등 중장비 상차 작업 원천 금지"
    },
    peOpinionTemplate: "우수 침투 및 토질 연약화에 따른 점착력(c) 저하로 전단파괴(Rankine/Coulomb 주동토압 증가) 위험이 높습니다. 사면 상단부 장비 진입을 차단하고 법면 비닐 차수막 설치 및 사면 하단 토사 배수로를 즉시 정비하십시오.",
    alternativeMethod: "경사도 완화 계단식 굴착 또는 소일네일링(Soil Nailing) / 숏크리트 사면 보강공법 신속 도입"
  },
  {
    id: "KOSHA-C-04",
    guideNo: "KOSHA GUIDE C-42-2023",
    title: "양중기(크레인) 및 건설 중장비 작업반경 안전관리 지침",
    category: "끼임 (협착)",
    keywords: ["크레인", "양중기", "굴착기", "덤프", "중장비", "협착", "선회", "작업반경", "아웃트리거"],
    engineeringStandard: {
      outriggerSupport: "아웃트리거 최대 전폭 확장, 지반 지지력 q_allowable ≥ q_ground contact pressure (철판 22mm 이상 깔판 부설)",
      safetyFactor: "와이어로프 절단하중 안전율 양중용 5 이상, 근로자 탑승설비 10 이상",
      separationDistance: "선회 반경 내 유효 여유폭 50cm 이상 확보 또는 가상 펜스 5m 차단 구역 설정"
    },
    peOpinionTemplate: "중장비 선회 시 후방 사각지대(Blind Spot)로 인한 협착 사고는 치사율이 80%에 달합니다. 장비 전후방 AI 인체감지 카메라 및 초음파 접근 센서를 가동하고, 전담 유도원(신호수)의 수신호와 무전 통신 체계를 상시 유지해야 합니다.",
    alternativeMethod: "AI 어라운드뷰(AVM) 장착 의무화 및 무선 스마트 세이프티 태그(UWB 기반) 착용 출입 통제"
  },
  {
    id: "KOSHA-C-05",
    guideNo: "KOSHA GUIDE C-11-2021",
    title: "가설 전기 및 임시 분전반 감전재해 예방 기술지침",
    category: "감전",
    keywords: ["전기", "분전함", "누전", "접지", "케이블", "차단기", "가설전기"],
    engineeringStandard: {
      groundingResistance: "제3종 접지공사 접지저항 100Ω 이하(고감도 누전차단기 사용 시 500Ω 이하 허용)",
      elcbSpec: "정격감도전류 30mA 이하, 동작시간 0.03초 이내의 충격파 부동작형 고감도 고속형 누전차단기",
      cableProtection: "통로 횡단 가설 케이블은 매립 강관 또는 차량 통과용 케이블 프로텍터(Cable Protector) 시공"
    },
    peOpinionTemplate: "현장 습기 및 옥외 노출 환경에서 절연열화가 급속 진행됩니다. 분전반 외함 본딩 접지와 접지극 연속성을 측정기(Earth Tester)로 확인하고 일일 시험버튼 트립 점검을 의무화하십시오.",
    alternativeMethod: "옥외형 IP55 이상 방우방진 이동식 가설 분전반 표준 규격화 및 누전 상시 Iot 모니터링 시스템 구축"
  }
];

/**
 * 2. 건설안전기술사 수준 지식 매칭 및 공학적 의견 증강
 */
function enrichWithPEEngineeringKnowledge(hazardData) {
  const text = `${hazardData.hazard_title} ${hazardData.hazard_category} ${hazardData.legal_basis?.article_title || ''} ${(hazardData.defect_details || []).join(' ')}`.toLowerCase();

  // 가장 적합한 KOSHA GUIDE 매칭
  let matchedGuide = PE_KNOWLEDGE_BASE[0];
  let maxScore = 0;

  for (const item of PE_KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of item.keywords) {
      if (text.includes(kw.toLowerCase())) score += 2;
    }
    if (hazardData.hazard_category && hazardData.hazard_category.includes(item.category)) {
      score += 3;
    }
    if (score > maxScore) {
      maxScore = score;
      matchedGuide = item;
    }
  }

  // 건설안전기술사 공학적 진단 객체 생성
  const peEngineeringAnalysis = {
    pe_qualification: "건설안전기술사 (Professional Engineer)",
    kosha_guide_ref: `${matchedGuide.guideNo} (${matchedGuide.title})`,
    engineering_standards: matchedGuide.engineeringStandard,
    pe_professional_opinion: matchedGuide.peOpinionTemplate,
    alternative_construction_method: matchedGuide.alternativeMethod,
    structural_risk_factors: [
      `공학적 기준: ${Object.values(matchedGuide.engineeringStandard)[0]}`,
      "현장 작업 여건 및 계절적 환경(온도·습도·강우)에 따른 취약도 종합 평가 반영",
      "중대재해처벌법 제4조(안전보건관리체계 구축) 및 법정 안전관리 의무 연계"
    ]
  };

  return {
    ...hazardData,
    pe_analysis: peEngineeringAnalysis
  };
}

/**
 * 3. 지식베이스 검색
 */
function searchSafetyKnowledge(query = '', category = '') {
  const q = query.trim().toLowerCase();
  return PE_KNOWLEDGE_BASE.filter(item => {
    const matchCat = !category || item.category.includes(category);
    const matchText = !q || item.title.toLowerCase().includes(q) || 
      item.keywords.some(k => k.toLowerCase().includes(q)) || 
      item.guideNo.toLowerCase().includes(q);
    return matchCat && matchText;
  });
}

/**
 * 4. 골든 데이터셋(Golden Dataset) 자동 축적
 * 향후 독자 VLM/LLM 파인튜닝용 정형화 데이터(JSONL)
 */
function ensureDataDir() {
  const dir = path.dirname(GOLDEN_DATASET_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function appendGoldenDataset({ imageMeta, hazardData, siteName, inspectorName }) {
  ensureDataDir();

  const record = {
    timestamp: new Date().toISOString(),
    dataset_version: "BEPMC-SAFE-V1",
    site_name: siteName || "현장",
    inspector: inspectorName || "수석 건설안전기술지도원",
    image_meta: imageMeta || { format: "image/jpeg", width: 1024, height: 768 },
    training_prompt: {
      instruction: "건설 현장 사진을 분석하여 위험 요인, 산업안전보건기준에 관한 규칙 법 조항, 결함 원인, 즉시 조치 및 건설안전기술사 수준의 공학적 대안 대책을 도출하십시오.",
      context: `현장명: ${siteName || '일반현장'}`
    },
    training_target: hazardData
  };

  fs.appendFileSync(GOLDEN_DATASET_FILE, JSON.stringify(record) + '\n', 'utf8');
  return { success: true, recordCount: getGoldenDatasetStats().count };
}

function getGoldenDatasetStats() {
  ensureDataDir();
  if (!fs.existsSync(GOLDEN_DATASET_FILE)) {
    return { count: 0, lastUpdated: null, categories: {} };
  }

  const lines = fs.readFileSync(GOLDEN_DATASET_FILE, 'utf8').split('\n').filter(l => l.trim().length > 0);
  const categories = {};
  let lastUpdated = null;

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const cat = obj.training_target?.hazard_category || '미분류';
      categories[cat] = (categories[cat] || 0) + 1;
      lastUpdated = obj.timestamp;
    } catch (e) {}
  }

  return {
    count: lines.length,
    lastUpdated,
    categories,
    targetGoal: 5000,
    progressRate: `${((lines.length / 5000) * 100).toFixed(1)}%`
  };
}

module.exports = {
  PE_KNOWLEDGE_BASE,
  enrichWithPEEngineeringKnowledge,
  searchSafetyKnowledge,
  appendGoldenDataset,
  getGoldenDatasetStats
};
