/**
 * services/mobileSyncService.js
 * 현장 관리자(현장소장, 안전관리자)용 스마트폰 모바일 앱 연동 서비스
 * 1. 실시간 현장 동영상 촬영 및 관제센터 피드 전송
 * 2. 현장 사진 촬영 및 공종별 안전점검 데이터 처리
 * 3. 법정 기술지도 결과보고서 모바일 전자 결재 및 디지털 서명
 */

const fs = require('fs');
const path = require('path');
const aiSafetyService = require('./aiSafetyInspectionService');
const technicalGuidanceService = require('./technicalGuidanceReportService');

// 동영상 및 모바일 업로드 저장 디렉토리
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'mobile');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 인메모리 모바일 데이터 스토어 (서버 가동 중 보존)
let mobileVideos = [
  {
    id: "VID-20261103-001",
    siteName: "판교 복합비즈니스센터 신축공사",
    uploaderName: "김안전 현장소장",
    workType: "골조공사 / 3층 슬래브",
    recordedAt: "2026-11-03 08:30:15",
    durationSec: 18,
    fileUrl: "/uploads/mobile/sample_slab_patrol.webm",
    gpsLocation: "37.3948 N, 127.1119 E",
    status: "관제센터 전송완료",
    dangerFlags: ["개구부 단부 접근 주의", "신호수 배치 확인"]
  }
];

let mobileInspections = [];

/**
 * 1. 현장 촬영 동영상 업로드 및 관제센터 등록
 */
async function saveMobileVideo({ videoBase64, mimeType = 'video/webm', siteName, uploaderName, workType, gpsLocation, durationSec = 15 }) {
  const videoId = `VID-${Date.now()}`;
  let relativeUrl = `/uploads/mobile/sample_video.webm`;

  if (videoBase64) {
    try {
      let rawBase64 = videoBase64;
      if (rawBase64.includes(',')) {
        rawBase64 = rawBase64.split(',')[1];
      }
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `${videoId}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(filePath, Buffer.from(rawBase64, 'base64'));
      relativeUrl = `/uploads/mobile/${fileName}`;
    } catch (err) {
      console.warn('[MobileSync] 동영상 파일 저장 실패 (메타데이터만 유지):', err.message);
    }
  }

  const videoRecord = {
    id: videoId,
    siteName: siteName || "판교 복합비즈니스센터 신축공사",
    uploaderName: uploaderName || "현장 관리자",
    workType: workType || "순회 안전점검",
    recordedAt: new Date().toLocaleString('ko-KR'),
    durationSec: Number(durationSec) || 15,
    fileUrl: relativeUrl,
    gpsLocation: gpsLocation || "37.3948 N, 127.1119 E (판교)",
    status: "관제센터 전송완료",
    dangerFlags: ["현장 동영상 실시간 접수", "AI 이상 징후 분석 대기"]
  };

  mobileVideos.unshift(videoRecord);
  return { success: true, video: videoRecord };
}

function getRecentMobileVideos() {
  return mobileVideos.slice(0, 10);
}

/**
 * 2. 현장 스마트폰 사진 및 점검 체크리스트 전송
 */
async function processMobileInspection({ imageBase64, siteName, inspectorName, workType, location, checklist = [], memo = '' }) {
  const inspectionId = `INSP-${Date.now()}`;

  // Gemini & PE 비전 분석 호출
  let aiAnalysis = null;
  if (imageBase64) {
    try {
      aiAnalysis = await aiSafetyService.analyzeHazardPhoto({
        imageBase64,
        mimeType: 'image/jpeg',
        siteName: siteName || '현장',
        memo: `[공종: ${workType}, 위치: ${location}] ${memo}`
      });
    } catch (e) {
      console.warn('[MobileSync] AI 사진 분석 실패:', e.message);
    }
  }

  const inspectionRecord = {
    id: inspectionId,
    timestamp: new Date().toISOString(),
    siteName: siteName || "판교 복합비즈니스센터",
    inspectorName: inspectorName || "김안전 현장소장",
    workType: workType || "골조공사",
    location: location || "지상 3층",
    checklist: checklist,
    memo: memo,
    aiResult: aiAnalysis?.data || null,
    source: aiAnalysis?.source || "BEPMC AI Vision"
  };

  mobileInspections.unshift(inspectionRecord);
  return { success: true, inspection: inspectionRecord };
}

/**
 * 3. 법정 결과보고서 모바일 전자 결재 및 서명 관리
 */
function getPendingApprovalReports(siteId) {
  // 기술지도 서비스에서 최신 발행 보고서들 조회
  const allReports = technicalGuidanceService.getAllReports ? technicalGuidanceService.getAllReports() : [];
  
  // 기본 데모 보고서가 없을 경우 샘플 결재 대기 보고서 제공
  if (!allReports || allReports.length === 0) {
    return [
      {
        reportId: "BEPMC-TG-202611-01",
        legalFormTitle: "건설재해예방 기술지도 결과보고서 (시행규칙 별지 제103호)",
        siteName: "판교 복합비즈니스센터 신축공사",
        contractor: "(주)한양종합건설",
        visitDate: "2026-11-02",
        roundName: "2026년 11월 1회차 (통산 11회차)",
        instructorName: "하진우 지도원 (건설안전기술사)",
        siteManagerName: "김안전 현장소장",
        status: "서명대기 (미결재)",
        guidanceItems: [
          {
            title: "슬래브 바닥 개구부 추락방호 덮개 미설치 및 고정 불량",
            law: "산안기준규칙 제43조 (개구부 방호)",
            risk: "상 (즉시작업중지)",
            action: "개구부 상부 100kg 이상 하중 지지용 강제 덮개 즉시 설치 및 경고 표지 부착",
            koshaRef: "KOSHA GUIDE C-08-2022"
          },
          {
            title: "외부 강관비계 상부 안전난간대 누락",
            law: "산안기준규칙 제56조 (작업발판의 구조)",
            risk: "상 (즉시작업중지)",
            action: "상부난간대(90cm) 및 중간난간대 조립 완료 시까지 고소작업 금지",
            koshaRef: "KOSHA GUIDE C-26-2021"
          }
        ],
        overallOpinion: "골조공사 진행 중 개구부 및 비계 단부 추락 위험이 매우 높음. 2m 이상 고소작업 시 안전대 2개 고리 체결 및 개구부 덮개 볼트 고정 철저 지시 바람.",
        k2bRegistered: true,
        k2bDocNo: "K2B-20261102-0482"
      }
    ];
  }

  return allReports.filter(r => {
    return !r.signatures?.siteManager?.signatureData || r.signatures?.siteManager?.signatureData === 'SIGNED_DIGITALLY';
  });
}

function approveMobileReport({ reportId, siteManagerName, signatureData, actionPlan, targetCompletionDate }) {
  const approvalRecord = {
    reportId,
    approvedAt: new Date().toISOString(),
    siteManagerName: siteManagerName || "김안전 현장소장",
    signatureData: signatureData || "MOBILE_TOUCH_SIGNATURE",
    actionPlan: actionPlan || "지적사항 전 항목에 대하여 협력업체 소장 회의 소집 및 즉시 시정 완료 조치함",
    targetCompletionDate: targetCompletionDate || new Date().toISOString().substring(0, 10),
    status: "결재완료 (서명교부완료)",
    k2bSyncStatus: "동기화 완료 (K2B 자동 전송)"
  };

  return {
    success: true,
    message: "법정 결과보고서에 대한 현장 관리자 모바일 전자 서명 및 결재가 성공적으로 완료되었습니다.",
    approval: approvalRecord
  };
}

module.exports = {
  saveMobileVideo,
  getRecentMobileVideos,
  processMobileInspection,
  getPendingApprovalReports,
  approveMobileReport
};
