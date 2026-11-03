const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

// 초기 데이터
const defaultData = {
  siteSettings: {
    siteName: "BEPMC (Project Management Consultancy)",
    mainSlogan: "안전과 프로젝트 성공을 이끄는 신뢰의 파트너",
    subSlogan: "작업 전 10초 안전점검, 나와 가족과 동료를 지키는 가장 확실한 약속",
    emergencyPhone: "긴급구조 xxx-xxxx-xxxx | 산업안전보건 신고 xxx-xxxx-xxxx | 비상상황실 xxx-xxxx-xxxx",
    alertBanner: "★ [안전경보] 환절기 밀폐공간 질식 및 화재 예방 특별 안전점검 기간 운영 중",
    safetyNotice: "안전모, 안전화, 안전대 착용 미흡 시 작업장 출입이 엄격히 제한됩니다.",
    footerInfo: "BEPMC (Project Management Consultancy) | 주소: 서울특별시 강남구 테헤란로 152 | 대표: xxx-xxxx-xxxx"
  },
  users: [
    {
      id: 1,
      username: "admin",
      password: "admin1234",
      name: "최고관리자",
      email: "admin@safety.go.kr",
      role: "admin",
      status: "approved",
      createdAt: "2026-10-01 09:00:00"
    },
    {
      id: 2,
      username: "safeworker",
      password: "user1234",
      name: "김안전",
      email: "worker@safety.org",
      role: "paid_member",
      status: "approved",
      createdAt: "2026-10-10 14:20:00"
    },
    {
      id: 3,
      username: "newbie",
      password: "user1234",
      name: "이신청",
      email: "newbie@safety.org",
      role: "member",
      status: "pending",
      createdAt: "2026-10-22 17:45:00"
    }
  ],
  posts: [
    {
      id: 1,
      boardType: "general",
      category: "기본수칙",
      title: "산업현장 3대 핵심 안전조치 이행 가이드북",
      content: "산업재해 예방을 위한 3대 핵심 조치 안내입니다.\n\n1. 추락 예방 (안전난간 설치, 개구부 덮개, 안전대 체결)\n2. 끼임 예방 (회전체 방호덮개, 정비 시 LOTO-전원차단 잠금표지)\n3. 보호구 지급 및 착용 (안전모, 안전화, 보안경, 안전대)\n\n모든 사업장에서는 작업 개시 전 TBM(작업 전 안전점검회의)을 필히 실시하여 주시기 바랍니다.",
      authorId: 1,
      authorName: "최고관리자",
      authorRole: "admin",
      views: 142,
      createdAt: "2026-10-15 10:00:00",
      updatedAt: "2026-10-15 10:00:00",
      comments: [
        {
          id: 1,
          authorId: 2,
          authorName: "김안전",
          authorRole: "member",
          content: "현장 TBM 시 교육자료로 유용하게 활용하고 있습니다. 감사합니다.",
          createdAt: "2026-10-16 11:20:00"
        }
      ]
    },
    {
      id: 2,
      boardType: "general",
      category: "비상대응",
      title: "작업장 화재 발생 시 단계별 비상 대피 및 행동요령",
      content: "작업장 화재 발생 시 골든타임을 지키기 위한 행동요령입니다.\n\n[1단계] 화재 발견 즉시 '불이야' 외치고 비상벨을 눌러 주변에 알립니다.\n[2단계] 119에 정확한 위치와 상황을 신고합니다.\n[3단계] 초기 진화가 가능한 경우 소화기나 옥내소화전을 이용하고, 연기가 심하면 젖은 수건으로 코와 입을 막고 낮은 자세로 비상구를 통해 탈출합니다.\n[4단계] 엘리베이터는 절대 이용하지 말고 계단을 이용합니다.",
      authorId: 1,
      authorName: "최고관리자",
      authorRole: "admin",
      views: 98,
      createdAt: "2026-10-17 15:30:00",
      updatedAt: "2026-10-17 15:30:00",
      comments: []
    },
    {
      id: 3,
      boardType: "general",
      category: "안전보건",
      title: "밀폐공간 질식 재해 예방 3대 필수 수칙",
      content: "맨홀, 정화조, 탱크 등 밀폐공간 작업 시 산소결핍 및 유해가스로 인한 질식 위험이 매우 큽니다.\n\n1. 작업 전/중 산소 및 유해가스 농도 지속 측정 (산소농도 18% 이상 23.5% 미만 유지)\n2. 환기팬을 통한 충분한 급기 환기\n3. 감시인 배치 및 비상구조용 송기마스크/보호장비 상시 비치",
      authorId: 1,
      authorName: "최고관리자",
      authorRole: "admin",
      views: 75,
      createdAt: "2026-10-18 09:15:00",
      updatedAt: "2026-10-18 09:15:00",
      comments: []
    },
    {
      id: 4,
      boardType: "member",
      category: "현장제안",
      title: "[회원전용] A구역 자재 하역장 보행통로 안전펜스 설치 제안",
      content: "회원 여러분 안녕하십니까. 현장 관리 담당자입니다.\n\n최근 A구역 지게차 통행로와 작업자 보행로가 겹치는 구간에서 아차사고 위험이 관찰되었습니다.\n\n제안사항:\n- 노란색 안전규격 볼라드 및 분리 펜스 설치\n- 지게차 제한속도(10km/h) 노면 안전표시 도색\n\n회원님들의 현장 의견과 추가 보완점 댓글 부탁드립니다.",
      authorId: 2,
      authorName: "김안전",
      authorRole: "member",
      views: 45,
      createdAt: "2026-10-20 16:00:00",
      updatedAt: "2026-10-20 16:00:00",
      comments: [
        {
          id: 1,
          authorId: 1,
          authorName: "최고관리자",
          authorRole: "admin",
          content: "좋은 현장 안전 개선안입니다. 다음 주 시설팀과 협의하여 조속히 노면 도색 및 펜스 설치를 진행하겠습니다.",
          createdAt: "2026-10-21 09:30:00"
        }
      ]
    },
    {
      id: 5,
      boardType: "member",
      category: "안전토론",
      title: "[회원전용] 4분기 현장 위험성평가 체크리스트 공유 및 검토 요청",
      content: "각 공정별 위험성평가 양식을 최신화하여 공유합니다.\n\n기존 대비 개선된 점:\n- 근골격계 부담작업 체크리스트 추가\n- 화학물질 MSDS(물질안전보건자료) 비치 점검항목 구체화\n\n다운로드 후 실무에 적용해보시고 피드백 주시면 감사하겠습니다.",
      authorId: 1,
      authorName: "최고관리자",
      authorRole: "admin",
      views: 38,
      createdAt: "2026-10-21 14:10:00",
      updatedAt: "2026-10-21 14:10:00",
      comments: []
    }
  ],
  qna: [
    {
      id: 1,
      title: "안전관리자 법정 보수교육 일정 및 비용 문의드립니다",
      content: "올해 신규 선임된 안전관리자입니다. 하반기 직무 보수교육 신청 일정과 온라인 수강 가능 여부가 궁금하여 문의드립니다.",
      authorId: 2,
      authorName: "김안전",
      email: "worker@safety.org",
      isSecret: false,
      status: "answered",
      answer: "안녕하세요 김안전 회원님, 안전관리자 보수교육은 매 홀수달 1일부터 신청 가능하며, 총 34시간 중 16시간은 온라인 원격교육으로 이수 가능합니다. 상세 신청 가이드는 자료실 1번 게시판을 참고해주시기 바랍니다.",
      answeredAt: "2026-10-21 11:00:00",
      answeredBy: "최고관리자",
      createdAt: "2026-10-20 13:00:00"
    },
    {
      id: 2,
      title: "소규모 사업장 맞춤형 안전시설 개선지원금 신청 문의",
      content: "상시 근로자 20인 제조업체입니다. 노후 기계 방호장치와 안전난간 교체 비용 지원을 받고 싶은데 신청 절차를 안내받고 싶습니다.",
      authorId: null,
      authorName: "박민우",
      email: "park@company.co.kr",
      isSecret: true,
      status: "pending",
      answer: null,
      answeredAt: null,
      answeredBy: null,
      createdAt: "2026-10-22 15:40:00"
    }
  ],
  products: [
    // 1. 생활 안전용품 (일반인/가정/차량)
    {
      id: 1,
      targetType: "life", // 'life'(생활안전) | 'industry'(산업현장)
      category: "가정소방",
      name: "가정용 친환경 미니 강화액 소화기 (차량/주방 겸용)",
      price: 28500,
      stock: 120,
      certification: "KFI 소방산업기술원 형식승인",
      icon: "🧯",
      badge: "생활필수",
      description: "가정 주방의 식용유 화재(K급) 및 일반 화재(A/B급)를 질식·냉각 효과로 순식간에 진압하는 콤팩트형 강화액 소화기입니다."
    },
    {
      id: 2,
      targetType: "life",
      category: "화재대피",
      name: "골든타임 화재대피용 원터치 습식 방연마스크 (3회분 패키지)",
      price: 19800,
      stock: 250,
      certification: "한국안전인증 행안부 재난안전제품 인증",
      icon: "😷",
      badge: "가정·호텔 필수",
      description: "특수 3중 천연 허브 추출물 필터로 유독가스와 열기를 차단하고 15분 이상 호흡을 유지해주는 원터치 개봉형 방연마스크입니다."
    },
    {
      id: 3,
      targetType: "life",
      category: "교통안전",
      name: "차량 비상탈출 2in1 텅스텐 해머 (안전벨트 커터 겸용)",
      price: 12000,
      stock: 180,
      certification: "BEPMC 추천 차량안전품",
      icon: "🔨",
      badge: "차량필수",
      description: "차량 침수나 충돌 사고 시 수압 속에서도 원터치로 측면 강화유리를 파쇄하고 잠긴 안전벨트를 신속히 절단하는 휴대용 비상 탈출기구입니다."
    },
    {
      id: 4,
      targetType: "life",
      category: "응급처치",
      name: "가정 및 레저용 종합 프리미엄 구급함 세트 (32종)",
      price: 34000,
      stock: 85,
      certification: "식약처 의약외품 규격 준수",
      icon: "🩹",
      badge: "베스트셀러",
      description: "화상치료제, 지혈대, 멸균 소독거즈, 드레싱밴드, 부목 등 일상 및 야외 활동 시 응급조치가 가능한 방수 하드케이스 구급키트입니다."
    },
    {
      id: 5,
      targetType: "life",
      category: "실내안전",
      name: "욕실·현관 고밀도 미끄럼 방지 안전패드 (논슬립 매트)",
      price: 16500,
      stock: 150,
      certification: "KC 친환경 무독성 인증",
      icon: "🦶",
      badge: "어린이·어르신 낙상방지",
      description: "어르신 및 아이들의 실내 낙상 사고를 방지하기 위해 물기 배출이 우수하고 접착력이 뛰어난 논슬립 미끄럼 방지 안전 패드입니다."
    },
    {
      id: 6,
      targetType: "life",
      category: "보행안전",
      name: "어린이·야간 보행자 고휘도 안전 반사 키링 (옐로카드)",
      price: 4500,
      stock: 400,
      certification: "유럽 EN13356 반사안전인증",
      icon: "🎒",
      badge: "스쿨존 안전",
      description: "야간 자동차 전조등 불빛을 150m 밖에서도 360도 반사하여 보행자 교통사고 위험을 90% 이상 줄여주는 안전 반사 참입니다."
    },

    // 2. 전문 산업현장 안전용품
    {
      id: 7,
      targetType: "industry",
      category: "개인보호구",
      name: "KCs 인증 초경량 ABS 통풍형 안전모 (턱끈·내장재 포함)",
      price: 18000,
      stock: 200,
      certification: "한국산업안전보건공단 KCs 안전인증(AB종)",
      icon: "⛑️",
      badge: "현장필수",
      description: "물체 낙하 및 비래, 감전 위험을 효과적으로 흡수하는 경량 고강도 쉘과 땀 배출이 용이한 통풍 벤트 구조의 최고급 안전모입니다."
    },
    {
      id: 8,
      targetType: "industry",
      category: "추락방지",
      name: "원터치 다이얼 그네식 5점 지지 안전대 (죔줄+더블카라비너)",
      price: 89000,
      stock: 60,
      certification: "고용노동부 고시 추락방지용 안전대 KCs",
      icon: "🪢",
      badge: "중대재해예방",
      description: "2m 이상 고소 작업 시 추락 충격을 온몸으로 고르게 분산하여 척추와 장기를 보호하는 프리미엄 그네식 안전벨트 세트입니다."
    },
    {
      id: 9,
      targetType: "industry",
      category: "호흡보호",
      name: "산업용 특급 방진마스크 20매입 (안면 밀착 밸브형)",
      price: 32000,
      stock: 130,
      certification: "KCs 특급 안면부 여과식 방진마스크",
      icon: "🤿",
      badge: "분진차단",
      description: "용접 흄, 미세 분진, 석면 작업 등 유해 미립자를 99% 이상 차단하며 배기밸브가 있어 호흡 저항을 최소화한 전문 방진마스크입니다."
    },
    {
      id: 10,
      targetType: "industry",
      category: "가스측정",
      name: "밀폐공간 복합 4가스 정밀 휴대용 측정기 (산소/일산화/황화/가연성)",
      price: 380000,
      stock: 25,
      certification: "방폭 안전인증 Ex ia IIC T4",
      icon: "📟",
      badge: "질식사고예방",
      description: "맨홀, 정화조, 탱크 등 밀폐공간 진입 전 산소 결핍 및 폭발성/유독가스를 실시간 4종 동시 감지하여 경보하는 필수 안전계측기입니다."
    }
  ],
  orders: [
    {
      id: 1,
      orderNumber: "ORD-20261025-1001",
      buyerName: "김안전",
      buyerPhone: "xxx-xxxx-xxxx",
      buyerEmail: "worker@safety.org",
      shippingAddress: "서울특별시 강남구 역삼동 123-45 3층 현장사무소",
      items: [
        { productId: 1, name: "가정용 친환경 미니 강화액 소화기", price: 28500, quantity: 2 },
        { productId: 2, name: "골든타임 화재대피용 습식 방연마스크", price: 19800, quantity: 1 }
      ],
      totalAmount: 76800,
      paymentMethod: "신용카드",
      status: "배송준비", // '결제완료' | '배송준비' | '배송중' | '배송완료'
      createdAt: "2026-10-25 14:30:00"
    }
  ]
};

function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf-8');
      return defaultData;
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db:', err);
    return defaultData;
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing db:', err);
    return false;
  }
}

module.exports = {
  getDb: readDb,
  saveDb: writeDb
};
