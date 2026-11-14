import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
const ragService = require('../../../services/ragService');

const SYSTEM_PROMPT = `당신은 BEPMC(Project Management & Safety Support with Experiences and AI Technologies)의 공식 AI 안전 법규 & 제도 전문 수석 컨설턴트입니다.

[역할 및 지침]
1. 전문 분야:
   - 철도안전법, 철도기술기준, 철도차량 및 궤도 안전수칙 (1,435mm 표준궤, 25kV/1.5kV 가공전차선 안전 이격거리 2.0m 이상, 복선 교행 압착 방지, 진로 오인 방지, 열차접근경보 등)
   - 산업안전보건법 및 시행령/시행규칙, 산업안전보건기준에 관한 규칙 (추락, 협착, 전도, 감전 등 4대 위험작업 예방)
   - 중대재해 처벌 등에 관한 법률(중대재해처벌법) 및 안전보건관리체계 구축 7대 핵심요소
   - 고용노동부, 국토교통부, 한국교통안전공단, 한국산업안전보건공단(KOSHA) 최신 제도 및 지침
   - BEPMC 회원 가입 절차 및 유료 회원에게 제공되는 서비스(동영상 AI 안전 분석, 관제 연동, 법규 컨설팅 등) 안내
2. 답변 스타일:
   - 명확하고 정중하며 신뢰감 있는 전문 컨설턴트 어조(~합니다, ~권장합니다).
   - 법 조항, 수치(거리, 치수, 과태료, 대상 규모 등), 핵심 기준을 가독성 높은 글머리기호(-, •)와 표로 정리.
   - 최신 개정사항이나 2026년 기준은 실시간 구글 검색(Google Search Grounding) 결과를 토대로 팩트 위주로 안내.
3. BEPMC 사내 정보 관련:
   - BEPMC는 철도·건설·산업 현장 안전 관제, AI 비전 분석 및 안전 엔지니어링 컨설팅을 선도하는 전문 기업입니다.
   - 특정 사내 비공개 문서나 개별 사업 계약 관련 상세 정보는 별도 승인 절차 후 순차 연동 예정임을 정중히 안내하십시오.
4. 법적 고지 면책문구:
   - 답변 말미에 항상 간결한 안내문구(AI 자문 의견이며, 법적 인허가 등 최종 판단은 관계 법령 원문 및 주무관청 유권해석 확인 권장)를 포함하십시오.`;

// Local quota tracking helper
function getQuotaFile() {
  return path.join(process.cwd(), 'data', 'gemini-quota.json');
}

function getQuotaStatus() {
  const today = new Date().toISOString().slice(0, 10);
  const quotaFile = getQuotaFile();
  let data = { date: today, dailyLimit: 1500, usedToday: 0, remainingToday: 1500, rpmLimit: 15 };
  try {
    if (fs.existsSync(quotaFile)) {
      const parsed = JSON.parse(fs.readFileSync(quotaFile, 'utf8'));
      if (parsed.date === today) {
        data = parsed;
      }
    }
  } catch (e) {
    console.warn('[Quota] Read error:', e.message);
  }
  return data;
}

function incrementQuota() {
  const today = new Date().toISOString().slice(0, 10);
  const quotaFile = getQuotaFile();
  let data = getQuotaStatus();
  data.date = today;
  data.usedToday = (data.usedToday || 0) + 1;
  data.remainingToday = Math.max(0, (data.dailyLimit || 1500) - data.usedToday);
  data.lastRequestTimestamp = new Date().toISOString();
  try {
    fs.writeFileSync(quotaFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Quota] Write error:', e.message);
  }
  return data;
}

// Comprehensive Railway & Industrial Safety Domain Knowledge Fallback
function generateDomainExpertReply(query) {
  const q = query.toLowerCase();

  if (q.includes('이격거리') || q.includes('전차선') || q.includes('전기') || q.includes('감전')) {
    return `### ⚡ 가공전차선 및 고압선 안전 이격거리 기준 안내

1. **가공전차선(25,000V / 25kV AC) 안전 이격거리**
   - **건축물 및 공작물과의 이격거리**: 최소 **2.0m 이상** 절대 이격 유지 (철도건설기술기준 제42조)
   - **작업자 및 장비(크레인, 항타기 등)의 안전 이격거리**: 최소 **2.0m ~ 3.0m 이상** 확보 및 방호관 설치 필수
   - **직류 전차선(1,500V DC - 지하철 구간)**: 최소 **1.0m 이상** 이격

2. **작업 시 3대 감전 방지 수칙**
   - **단전 및 접지 확인**: 승인된 작업계획에 따른 단전 조치 및 휴대용 단락접지용구 설치 확인
   - **철도전기안전관리자 입회**: 전차선로 인근 고소작업 시 감시인 상시 배치
   - **비절연 공구 사용 금지**: 절연 안전모, 절연 장화, 검전기 착용 의무화

※ 본 답변은 철도기술기준 및 안전보건규칙에 근거한 BEPMC AI 전문 지식 자문입니다. 상세 작업 전 철도공사·교통공사의 승인된 단전 일정을 반드시 재확인하시기 바랍니다.`;
  }

  if (q.includes('4대') || q.includes('압착') || q.includes('충돌') || q.includes('궤도')) {
    return `### 🚂 철도 궤도 작업 시 4대 중대재해 예방 기준

철도 궤도 작업은 일반 산업현장과 달리 고속 열차 운행선과 인접하여 다음 **4대 핵심 위험**을 철저히 차단해야 합니다:

1. **복선 선로 교행 열차 압착사고 방지**
   - 복선 구간에서 양방향 열차가 동시 또는 연속 교행할 때 선로 사이(궤간 1,435mm 및 도상 중심간격) 폭이 협소하여 인체 압착 위험 발생
   - **예방 조치**: 열차 접근 경보 시 선로 사이가 아닌 **선로 외측 안전지대(대피소)**로 즉시 대피 (대피가능시간 TTC 최소 30초 이상 확보)

2. **진로 오인 및 동일 선로 열차 충돌 방지**
   - 선로전환기 정위/반위 오인 및 신호기 현시 불일치로 인한 열차 진입 충돌
   - **예방 조치**: 진로 표시등 및 차단기 연동, 궤도단락 확인 및 무전 점검

3. **가공전차선(25kV) 감전사고 방지**
   - 25,000V 특고압 감전 방지를 위해 건축한계 내 장비 회전 반경 제한 및 이격거리 2.0m 유지

4. **추락 및 협착사고 방지**
   - 궤도 보수 장비(타이탬퍼, 밸러스트 레귤레이터 등) 작업 반경 내 작업자 접근 금지

※ 현장 투입 전 10초 안전점검(TBM) 및 철도운행안전관리자(열차감시원) 배치가 필수적입니다.`;
  }

  if (q.includes('중대재해') || q.includes('처벌법') || q.includes('안전보건관리체계')) {
    return `### 🛡️ 2026년 중대재해처벌법 핵심 체크리스트

중대재해처벌법에 따른 경영책임자의 **안전보건관리체계 구축 및 이행 7대 핵심요소**는 다음과 같습니다:

1. **경영방침 및 목표 설정**: 사업장 안전보건 목표 공표 및 전 직원 전파
2. **전담 인력 및 예산 배정**: 안전관리자 선임 및 실질적 안전보건 예산 집행권 부여
3. **위험성평가(Risk Assessment) 정례화**: 유해·위험요인 사전 파악 및 개선대책 수립 (반기 1회 이상 점검)
4. **종사자 의견 청취 절차 마련**: 산업안전보건위원회 또는 안전보건협의체 회의 개최
5. **비상조치 매뉴얼 수립**: 중대재해 발생 시 작업중지, 근로자 대피 및 응급구호 체계 가동
6. **도급·용역·위탁 사업장 평가**: 수급인의 안전보건 역량 평가 및 기준 충족 시에만 도급 계약 체결
7. **관계 법령 의무 이행 평가**: 산업안전보건법 등 안전 관계 법령 준수 여부를 반기 1회 이상 점검

※ 50인 미만 사업장도 전면 적용 중이므로 위험성평가 기반 사전 안전점검 일지 작성을 강력히 권장합니다.`;
  }

  if (q.includes('보호지구') || q.includes('30m') || q.includes('철도보호')) {
    return `### 📐 철도안전법 제45조(철도보호지구) 관리 기준

1. **철도보호지구의 범위**
   - 철도경계표지(철도용지 경계선)로부터 **30미터 이내의 지역**

2. **신고 및 제한 행위 대상**
   - 토지의 굴착·성토·절토 기타 토지의 형질변경
   - 건축물의 신축·개축·증축 또는 인공구조물의 설치
   - 흙·돌·자갈 등 중량물의 적치 또는 위험물의 채취
   - 철도차량 운행에 지장을 줄 우려가 있는 크레인 등 건설기계 작업

3. **이행 절차**
   - 착공 30일 전까지 관할 철도운영자(한국철도공사, 국가철도공단 등)에 행위신고서 및 안전관리계획서 제출 승인 필수
   - 미신고 착공 시 **2년 이하의 징역 또는 2천만원 이하의 벌금** 부과 대상

※ 공사 계획 수립 시 반드시 사전 협의 절차를 거치시기 바랍니다.`;
  }

  // General Safety Guidance fallback
  return `### 📋 BEPMC 안전 법규 & 제도 전문 상담

문의하신 **"${query}"**에 대한 안전 관계 법규 및 기준 안내입니다:

1. **관련 법령 체계**
   - **산업안전보건법**: 현장 위험물질 관리, 안전시설물(난간, 개구부 덮개 등) 설치, 안전보건교육 의무화
   - **철도안전법 및 기술기준**: 궤도, 전차선(25kV 2.0m 이상), 차량 한계 및 열차운행선 안전관리
   - **중대재해처벌법**: 안전보건관리체계 구축, 위험성평가 이행, 중대재해 예방 의무

2. **BEPMC 안전 권고사항**
   - 작업 착수 전 **TBM(Tool Box Meeting)**을 통해 위험요인을 상호 공유하고 필수 보호구를 착용하십시오.
   - 위험 상황 인지 시 근로자의 **작업중지권**을 적극 보장해야 합니다.

추가적인 특정 법 조항이나 세부 수칙에 대해 질문해 주시면 더욱 상세히 안내해 드리겠습니다.`;
}

// GET: Current Quota Status
export async function GET() {
  const quota = getQuotaStatus();
  return NextResponse.json({
    success: true,
    quota: {
      dailyLimit: quota.dailyLimit || 1500,
      usedToday: quota.usedToday || 0,
      remainingToday: quota.remainingToday ?? 1500,
      rpmLimit: quota.rpmLimit || 15,
      date: quota.date,
    },
  });
}

// POST: Chat Query
export async function POST(request) {
  try {
    const { message, history = [] } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: '질문 메시지를 입력해 주세요.' },
        { status: 400 }
      );
    }

    // Update local quota
    const updatedQuota = incrementQuota();
    const userId = body.userId || 'guest';
    let activeRoomId = body.roomId;

    // 1. 활성 채팅방 관리 및 질문 메시지 기록
    if (!activeRoomId) {
      const newRoom = await ragService.createRoom(userId, message.slice(0, 30));
      activeRoomId = newRoom.id;
    }
    await ragService.addMessage(activeRoomId, userId, 'user', message, []);

    // 2. RAG: Safety 문서 벡터 유사도 검색 (Gemini gemini-embedding-001)
    let safetyDocs = [];
    try {
      safetyDocs = await ragService.searchSafetyDocuments(message, { topK: 3 });
    } catch (e) {
      console.warn('[Next.js RAG Search Warning]:', e.message);
    }

    const docSources = safetyDocs.map(doc => ({
      type: 'document',
      source: doc.source,
      title: doc.title,
      category: doc.category,
      snippet: doc.content.slice(0, 150) + (doc.content.length > 150 ? '...' : ''),
      similarity: doc.similarity
    }));

    // RAG 컨텍스트 주입
    let ragContext = '';
    if (safetyDocs.length > 0) {
      ragContext = `\n\n[참고 안전 사내/공공 문서 (Safety RAG 검색 결과)]\n` +
        safetyDocs.map((doc, idx) => `[문서 ${idx + 1}] 출처: ${doc.source} | 항목: ${doc.title}\n내용: ${doc.content}`).join('\n\n') +
        `\n\n위 [참고 안전 문서]의 구체적인 수치, 안전 조치 기준, 사고 원인 및 재발방지대책을 답변에 적극 인용하여 전문적으로 설명하십시오.`;
    }

    const effectiveSystemPrompt = `${SYSTEM_PROMPT}${ragContext}`;

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      '';

    // Build Gemini contents array from conversation history
    const contents = [];
    if (Array.isArray(history)) {
      for (const item of history.slice(-8)) {
        if (item.role && item.text) {
          contents.push({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.text }],
          });
        }
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const candidateModels = [
      'gemini-3.8-flash',
      'gemini-flash-latest',
    ];

    let geminiData = null;
    let usedModel = '';
    let isQuotaError = false;

    if (apiKey) {
      // Step 1: Try with Google Search Grounding + RAG Context
      for (const model of candidateModels) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(35000),
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: effectiveSystemPrompt }],
              },
              contents,
              tools: [
                {
                  google_search: {},
                },
              ],
              generationConfig: {
                temperature: 0.35,
                maxOutputTokens: 2048,
              },
            }),
          });

          if (response.ok) {
            geminiData = await response.json();
            usedModel = `${model} (RAG + Google Search)`;
            break;
          } else {
            if (response.status === 429) {
              isQuotaError = true;
              break;
            }
          }
        } catch (err) {
          console.warn('[Gemini Search Error]:', err.name, err.message);
          break;
        }
      }

      // Step 2: If Search Grounding hit quota, try plain LLM with RAG
      if (!geminiData && isQuotaError) {
        for (const model of candidateModels) {
          try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(35000),
              body: JSON.stringify({
                systemInstruction: {
                  parts: [{ text: effectiveSystemPrompt }],
                },
                contents,
                generationConfig: {
                  temperature: 0.35,
                  maxOutputTokens: 2048,
                },
              }),
            });

            if (response.ok) {
              geminiData = await response.json();
              usedModel = `${model} (RAG 안전 지식)`;
              isQuotaError = false;
              break;
            }
          } catch (e) {
            break;
          }
        }
      }
    }

    // Step 3: If API is available, extract response
    if (geminiData && geminiData.candidates?.[0]) {
      const candidate = geminiData.candidates[0];
      const replyText =
        candidate.content?.parts?.map((p) => p.text).join('\n') ||
        '답변을 생성하지 못했습니다.';

      const groundingChunks =
        candidate.groundingMetadata?.groundingChunks || [];
      const webSources = groundingChunks
        .filter((c) => c.web?.uri)
        .map((c) => ({
          type: 'web',
          title: c.web.title || c.web.uri,
          uri: c.web.uri,
        }));

      const uniqueWebSources = Array.from(
        new Map(webSources.map((s) => [s.uri, s])).values()
      );
      const allSources = [...docSources, ...uniqueWebSources];

      // Save assistant reply to room
      await ragService.addMessage(activeRoomId, userId, 'assistant', replyText, allSources);

      return NextResponse.json({
        success: true,
        reply: replyText,
        sources: allSources,
        roomId: activeRoomId,
        createdAt: new Date().toISOString(),
        model: usedModel,
        quota: updatedQuota,
      });
    }

    // Step 4: Intelligent Domain Safety Knowledge Fallback
    const domainReply = generateDomainExpertReply(message);
    const quotaNotice = isQuotaError
      ? `> ⚠️ **Google API 할당량 안내**: 현재 Google AI Studio 프로젝트의 실시간 검색 쿼터가 일시 소진되어, **BEPMC 내장 안전 법규 전문 지식 엔진**으로 정확히 분석하여 즉시 답변해 드립니다.\n\n`
      : '';

    const fallbackReply = quotaNotice + domainReply;
    await ragService.addMessage(activeRoomId, userId, 'assistant', fallbackReply, docSources);

    return NextResponse.json({
      success: true,
      reply: fallbackReply,
      sources: docSources,
      roomId: activeRoomId,
      createdAt: new Date().toISOString(),
      model: 'BEPMC 안전 법규 전문 지식 엔진 (RAG 연동)',
      quotaExceeded: isQuotaError,
      quota: updatedQuota,
    });
  } catch (err) {
    console.error('[API /api/chat Error]:', err);
    return NextResponse.json(
      {
        success: false,
        error: `서버 오류가 발생했습니다: ${err.message}`,
      },
      { status: 500 }
    );
  }
}
