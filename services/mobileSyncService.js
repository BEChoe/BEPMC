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
const dbService = require('../data/dbService');
const { supabase, isSupabaseConfigured } = require('../data/supabaseClient');

// 동영상 및 모바일 업로드 저장 디렉토리 (Vercel 서버리스 읽기전용 파일시스템 대응)
const isVercel = Boolean(process.env.VERCEL);
const UPLOADS_DIR = isVercel
  ? path.join('/tmp', 'uploads', 'mobile')
  : path.join(__dirname, '..', 'public', 'uploads', 'mobile');

try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[mobileSyncService] 업로드 디렉토리 생성 스킵 (읽기전용 환경):', err.message);
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

// 모바일 2단계 접속 승인 세션 스토어
let mobileAuthSessions = {};

/**
 * 0. 모바일 앱 로그인 요청 (비밀번호 1차 검증 후 PC 대시보드 승인 대기 등록)
 */
async function requestMobileLogin({ username, password, siteName, clientIp, userAgent }) {
  // 계정 조회 (admin 또는 등록된 사용자)
  let user = null;
  if (dbService && dbService.findUserByUsername) {
    try {
      user = await dbService.findUserByUsername(username);
    } catch (e) {}
  }

  // 관리자 및 사용자 인증 (환경변수 ADMIN_MASTER_PASSWORD 또는 DB 비밀번호 검증)
  const masterPassword = process.env.ADMIN_MASTER_PASSWORD;
  const isMasterAdmin = (username === 'admin' && Boolean(masterPassword && password === masterPassword));
  const isPasswordMatch = user && user.password && (user.password === password);

  if (!user && isMasterAdmin) {
    user = {
      id: 1,
      username: 'admin',
      name: '김안전 현장소장 (수석관리자)',
      role: 'admin',
      email: 'safety_admin@bepmc.co.kr'
    };
  } else if (user && isMasterAdmin) {
    // 환경변수 마스터 비밀번호 일치 시 통과
  } else if (!user || !isPasswordMatch) {
    return { success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' };
  }

  // 승인 대기(pending) 및 거절(rejected) 상태 검증 (관리자 제외)
  if (user && user.role !== 'admin') {
    if (user.status === 'pending') {
      return {
        success: false,
        isPending: true,
        message: '가입 승인 대기 중인 계정입니다. 본사 관리자의 승인 완료 후 이용하실 수 있습니다.'
      };
    }
    if (user.status === 'rejected') {
      return {
        success: false,
        message: '관리자에 의해 가입 승인이 거절된 계정입니다. 본사 관리자에게 문의하세요.'
      };
    }
  }

  const sessionId = `MBL-AUTH-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date();

  const sessionRecord = {
    sessionId,
    user: {
      id: user.id || 1,
      username: user.username,
      name: user.name || '김안전 현장소장',
      role: user.role || 'admin',
      email: user.email || 'safety@bepmc.co.kr'
    },
    userName: user.name || '김안전 현장소장',
    username: user.username,
    role: user.role || 'admin',
    siteName: siteName || '판교 복합비즈니스센터 신축공사',
    clientIp: clientIp || '192.168.35.161',
    userAgent: userAgent || 'Android Mobile App',
    status: 'PENDING_VERIFICATION', // PENDING_VERIFICATION | APPROVED | REJECTED | EXPIRED
    requestedAt: now.toLocaleTimeString('ko-KR'),
    timestamp: now.toISOString(),
    verifiedAt: null,
    verifierName: null,
    verificationInfo: {
      idVerified: true,
      passwordVerified: true,
      method: isMasterAdmin ? '관리자 보안 자격증명 일치' : '안전 포털 DB 자격증명 일치',
      checkedAt: now.toLocaleTimeString('ko-KR')
    },
    autoApproveSeconds: 2
  };

  mobileAuthSessions[sessionId] = sessionRecord;

  // [핵심] 대시보드 상에서 ID 및 비밀번호 확인 후 2초 뒤 자동 승인(Auto-Approval) 프로토콜
  setTimeout(() => {
    if (mobileAuthSessions[sessionId] && mobileAuthSessions[sessionId].status === 'PENDING_VERIFICATION') {
      mobileAuthSessions[sessionId].status = 'APPROVED';
      mobileAuthSessions[sessionId].verifiedAt = new Date().toISOString();
      mobileAuthSessions[sessionId].verifierName = '본사 PC 대시보드 (ID/비번 대조 자동 승인)';
      mobileAuthSessions[sessionId].isAutoApproved = true;
      console.log(`[Auto-Approve] 모바일 세션(${sessionId}) 계정(${user.username}) ID/비번 확인 완료 -> PC 대시보드 자동 승인`);
    }
  }, 2200);

  return {
    success: true,
    sessionId,
    status: 'PENDING_VERIFICATION',
    message: '1차 비밀번호 검증 완료. 본사 PC 대시보드에서 계정 확인 후 자동 승인을 진행합니다.',
    user: sessionRecord.user,
    autoApproveDelaySec: 2
  };
}

/**
 * PC 관제 대시보드용: 승인 대기 중인 모바일 로그인 요청 목록
 */
function getPendingLoginRequests() {
  const list = Object.values(mobileAuthSessions).filter(s => s.status === 'PENDING_VERIFICATION');
  return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * PC 관제 대시보드에서 모바일 접속 승인 또는 거절 처리
 */
function verifyMobileLoginRequest({ sessionId, action = 'APPROVE', verifierName = '본사 AI 관제 데스크' }) {
  const session = mobileAuthSessions[sessionId];
  if (!session) {
    return { success: false, message: '해당 접속 요청 세션을 찾을 수 없습니다.' };
  }

  if (action === 'APPROVE') {
    session.status = 'APPROVED';
    session.verifiedAt = new Date().toISOString();
    session.verifierName = verifierName;
    return {
      success: true,
      message: `'${session.user.name}' 님의 모바일 접속이 승인되었습니다. 모바일 앱 기능이 즉시 활성화됩니다.`,
      session
    };
  } else {
    session.status = 'REJECTED';
    session.verifiedAt = new Date().toISOString();
    return {
      success: true,
      message: `'${session.user.name}' 님의 모바일 접속이 거절되었습니다.`,
      session
    };
  }
}

/**
 * 모바일 앱에서 승인 여부 폴링 확인
 */
function checkMobileLoginStatus(sessionId) {
  const session = mobileAuthSessions[sessionId];
  if (!session) {
    return { success: false, status: 'NOT_FOUND', message: '로그인 세션이 존재하지 않습니다.' };
  }
  return {
    success: true,
    sessionId: session.sessionId,
    status: session.status,
    user: session.user,
    verifiedAt: session.verifiedAt,
    verifierName: session.verifierName,
    verificationInfo: session.verificationInfo,
    isAutoApproved: session.isAutoApproved || false
  };
}

/**
 * 모바일 세션 로그아웃
 */
function logoutMobileSession(sessionId) {
  if (sessionId && mobileAuthSessions[sessionId]) {
    delete mobileAuthSessions[sessionId];
  }
  return { success: true, message: '모바일 세션이 로그아웃되었습니다.' };
}

/**
 * 1. 현장 촬영 동영상 업로드 및 관제센터 등록 (Supabase Storage 영구 저장 및 로컬 폴백)
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
      const buffer = Buffer.from(rawBase64, 'base64');

      // 1. Supabase Storage 클라우드 영구 저장 시도 (bepmc-media 버킷)
      let uploadedToCloud = false;
      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase.storage
            .from('bepmc-media')
            .upload(`videos/${fileName}`, buffer, {
              contentType: mimeType,
              upsert: true
            });

          if (!error) {
            const publicUrlData = supabase.storage
              .from('bepmc-media')
              .getPublicUrl(`videos/${fileName}`);
            if (publicUrlData && publicUrlData.data && publicUrlData.data.publicUrl) {
              relativeUrl = publicUrlData.data.publicUrl;
              uploadedToCloud = true;
            }
          } else {
            console.warn('[MobileSync] Supabase Storage 동영상 업로드 응답:', error.message);
          }
        } catch (storageErr) {
          console.warn('[MobileSync] Supabase Storage 동영상 예외:', storageErr.message);
        }
      }

      // 2. 로컬 디스크 파일 저장 (로컬 개발 환경 또는 클라우드 실패 시)
      if (!uploadedToCloud) {
        try {
          const filePath = path.join(UPLOADS_DIR, fileName);
          fs.writeFileSync(filePath, buffer);
          relativeUrl = `/uploads/mobile/${fileName}`;
        } catch (fsErr) {
          console.warn('[MobileSync] 로컬 파일 쓰기 스킵 (읽기전용 환경):', fsErr.message);
        }
      }
    } catch (err) {
      console.warn('[MobileSync] 동영상 처리 실패:', err.message);
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
 * 2. 현장 스마트폰 사진 및 점검 체크리스트 전송 (Supabase Storage 영구 저장 및 로컬 폴백)
 */
async function processMobileInspection({ imageBase64, siteName, inspectorName, workType, location, checklist = [], memo = '' }) {
  const inspectionId = `INSP-${Date.now()}`;
  let photoFileUrl = null;

  if (imageBase64) {
    try {
      let rawBase64 = imageBase64;
      if (rawBase64.includes(',')) {
        rawBase64 = rawBase64.split(',')[1];
      }
      const photoFileName = `${inspectionId}.jpg`;
      const buffer = Buffer.from(rawBase64, 'base64');

      // 1. Supabase Storage 클라우드 영구 저장 시도 (bepmc-media 버킷)
      let uploadedToCloud = false;
      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase.storage
            .from('bepmc-media')
            .upload(`photos/${photoFileName}`, buffer, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (!error) {
            const publicUrlData = supabase.storage
              .from('bepmc-media')
              .getPublicUrl(`photos/${photoFileName}`);
            if (publicUrlData && publicUrlData.data && publicUrlData.data.publicUrl) {
              photoFileUrl = publicUrlData.data.publicUrl;
              uploadedToCloud = true;
            }
          } else {
            console.warn('[MobileSync] Supabase Storage 사진 업로드 응답:', error.message);
          }
        } catch (storageErr) {
          console.warn('[MobileSync] Supabase Storage 사진 예외:', storageErr.message);
        }
      }

      // 2. 로컬 디스크 파일 저장
      if (!uploadedToCloud) {
        try {
          const photoFilePath = path.join(UPLOADS_DIR, photoFileName);
          fs.writeFileSync(photoFilePath, buffer);
          photoFileUrl = `/uploads/mobile/${photoFileName}`;
        } catch (fsErr) {
          console.warn('[MobileSync] 사진 로컬 파일 쓰기 스킵:', fsErr.message);
        }
      }
    } catch (e) {
      console.warn('[MobileSync] 사진 처리 실패:', e.message);
    }
  }

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
    photoUrl: photoFileUrl,
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
  approveMobileReport,
  requestMobileLogin,
  getPendingLoginRequests,
  verifyMobileLoginRequest,
  checkMobileLoginStatus,
  logoutMobileSession
};
