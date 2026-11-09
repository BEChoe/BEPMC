/**
 * public/js/video-analyzer.js
 * 
 * 공공데이터 과거 1년 10대 다발재해 기반 동영상 AI 위험성평가 & 안전대책 보고서 프론트엔드 엔진
 * - 로컬/외부 동영상 파일(MP4, WebM, MOV) 로드 & 브라우저 Canvas 고속 프레임 캡처
 * - 백엔드 10대 재해 규칙 엔진(/api/technical-guidance/top10-video-analysis) 연동
 * - 동영상 재생 연동 타임라인 마커 & 스냅샷 바운딩 뷰어
 * - 3단계 공학적 대책 및 A4 인쇄/PDF 보고서 출력
 */

let videoState = {
  file: null,
  videoUrl: null,
  duration: 0,
  extractedFrames: [],
  analysisReport: null,
  isAnalyzing: false,
  selectedEventId: null
};

// 1. 초기화 & 권한 검증
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof initLayout === 'function') {
    await initLayout('technical-guidance');
  } else if (typeof checkAuth === 'function') {
    await checkAuth();
  }

  checkPaidUserAccess();
  initVideoDropzone();
  loadTop10RulesReference();
});

/**
 * 유료 회원 전용 접근 제어 게이트키퍼
 */
function checkPaidUserAccess() {
  const isPaid = (currentAuth.mode === 'admin' || currentAuth.membership === 'paid' || (currentAuth.user && currentAuth.user.role === 'paid_member'));
  const gatekeeper = document.getElementById('gatekeeper-section');
  const mainStudio = document.getElementById('studio-main-section');
  const badge = document.getElementById('user-tier-badge');

  if (!currentAuth.isLoggedIn) {
    if (gatekeeper) gatekeeper.classList.remove('hidden');
    if (mainStudio) mainStudio.classList.add('hidden');
    const unauthBox = document.getElementById('gate-unauth');
    if (unauthBox) unauthBox.classList.remove('hidden');
    const freeBox = document.getElementById('gate-free');
    if (freeBox) freeBox.classList.add('hidden');
    if (badge) badge.innerHTML = '<span class="bg-slate-700 text-slate-300 px-2 py-0.5 rounded text-[10px]">미로그인</span>';
    return false;
  }

  if (!isPaid) {
    if (gatekeeper) gatekeeper.classList.remove('hidden');
    if (mainStudio) mainStudio.classList.add('hidden');
    const unauthBox = document.getElementById('gate-unauth');
    if (unauthBox) unauthBox.classList.add('hidden');
    const freeBox = document.getElementById('gate-free');
    if (freeBox) freeBox.classList.remove('hidden');
    if (badge) badge.innerHTML = '<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">일반 회원 (유료 전환 필요)</span>';
    return false;
  }

  // 승인된 유료회원 또는 관리자
  if (gatekeeper) gatekeeper.classList.add('hidden');
  if (mainStudio) mainStudio.classList.remove('hidden');
  if (badge) {
    badge.innerHTML = currentAuth.mode === 'admin' 
      ? '<span class="bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded font-black text-[11px]">👑 최고관리자 모드</span>'
      : '<span class="bg-emerald-500 text-white px-2.5 py-0.5 rounded font-black text-[11px]">💎 유료 플랜 활성화</span>';
  }
  return true;
}

/**
 * 대시보드 화면 내 즉시 로그인 핸들러 (전체 화면으로 튕기지 않고 본 동영상 분석 보드로 바로 입장)
 */
async function handleDirectStudioLogin(e) {
  if (e && e.preventDefault) e.preventDefault();
  const usernameInput = document.getElementById('studio-login-username');
  const passwordInput = document.getElementById('studio-login-password');
  const btnLogin = document.getElementById('btn-studio-login');
  const errorMsg = document.getElementById('studio-login-error');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  if (!username || !password) {
    alert('아이디와 비밀번호를 모두 입력해주세요.');
    return;
  }

  try {
    if (btnLogin) {
      btnLogin.disabled = true;
      btnLogin.innerHTML = '<span class="inline-block animate-spin mr-1">⏳</span> 인증 확인 중...';
    }
    if (errorMsg) errorMsg.classList.add('hidden');

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const result = await res.json();

    if (result.success) {
      // 1. 공통 세션 상태 즉시 갱신
      if (typeof checkAuth === 'function') {
        await checkAuth();
      }
      // 2. 상단 글로벌 헤더 회원/관리자 배지 재렌더링
      if (typeof initLayout === 'function') {
        await initLayout('technical-guidance');
      }
      // 3. 전체 화면으로 튕기지 않고 본 동영상 분석 대시보드 영역 즉시 오픈
      checkPaidUserAccess();
      // 4. 공공데이터 기준표 재로드
      loadTop10RulesReference();
    } else {
      if (errorMsg) {
        errorMsg.textContent = result.message || '아이디 또는 비밀번호가 올바르지 않습니다.';
        errorMsg.classList.remove('hidden');
      } else {
        alert(result.message || '로그인 실패');
      }
    }
  } catch (err) {
    console.error('Direct login error:', err);
    alert('로그인 처리 중 오류 발생: ' + err.message);
  } finally {
    if (btnLogin) {
      btnLogin.disabled = false;
      btnLogin.innerHTML = '<span>🔓</span> 동영상 분석 대시보드 바로 입장';
    }
  }
}

/**
 * 공공데이터 10대 재해 기준 매트릭스 참조 로드
 */
async function loadTop10RulesReference() {
  try {
    const res = await fetch('/api/technical-guidance/top10-rules');
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.rules)) {
      renderTop10RulesReferenceTable(data.rules);
    }
  } catch (e) {
    console.error('Failed to load top10 rules reference:', e);
  }
}

function renderTop10RulesReferenceTable(rules) {
  const container = document.getElementById('top10-reference-list');
  if (!container) return;

  container.innerHTML = rules.map(r => `
    <div class="p-3 bg-white rounded-xl border border-slate-200 hover:border-blue-400 transition shadow-sm space-y-1.5">
      <div class="flex items-center justify-between">
        <span class="inline-flex items-center gap-1.5 font-black text-xs ${r.rank <= 3 ? 'text-rose-600' : 'text-blue-700'}">
          <span class="w-5 h-5 rounded-full ${r.rank <= 3 ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'} flex items-center justify-center text-[11px] font-black">${r.rank}</span>
          ${escapeHtml(r.title)}
        </span>
        <span class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          과거 1년 점유율 ${r.sharePercent}%
        </span>
      </div>
      <p class="text-[11px] text-slate-600 leading-snug">${escapeHtml(r.criteria)}</p>
      <div class="text-[10px] text-slate-400 flex items-center gap-2 pt-0.5">
        <span>⚖️ ${escapeHtml(r.legalBasis.lawName)} ${escapeHtml(r.legalBasis.articleNo)}</span>
        <span>·</span>
        <span class="text-rose-600 font-semibold">${escapeHtml(r.dangerLevel)}</span>
      </div>
    </div>
  `).join('');
}

/**
 * 2. 윈도우 탐색기 직접 열기 (Native File System Access API + Fallback)
 */
async function openWindowsFileExplorer() {
  // 1. 크롬 / 엣지 등 최신 브라우저의 네이티브 윈도우 파일 선택기 호출
  if (window.showOpenFilePicker) {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: '동영상 파일 (*.mp4, *.avi, *.mov, *.webm, *.mkv, *.wmv)',
            accept: {
              'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.wmv', '.m4v', '.flv', '.ts', '.3gp', '.asf']
            }
          }
        ],
        multiple: false
      });
      if (fileHandle) {
        const file = await fileHandle.getFile();
        handleSelectedVideoFile(file);
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // 사용자가 윈도우 탐색기에서 취소를 누른 경우
      console.warn('Native File System API fallback:', err);
    }
  }

  // 2. 표준 브라우저 HTML5 파일 선택기 폴백
  const fileInput = document.getElementById('video-file-input');
  if (fileInput) {
    fileInput.value = ''; // 동일 파일 재선택 지원
    fileInput.click();
  }
}

/**
 * 동영상 드래그 앤 드롭 & 파일 선택 초기화
 */
function initVideoDropzone() {
  const dropzone = document.getElementById('video-dropzone');
  const fileInput = document.getElementById('video-file-input');

  if (!dropzone || !fileInput) return;

  // 윈도우 탐색기에서 브라우저로 직접 드래그 앤 드롭
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-blue-600', 'bg-blue-100/60');
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-blue-600', 'bg-blue-100/60');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-blue-600', 'bg-blue-100/60');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSelectedVideoFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSelectedVideoFile(e.target.files[0]);
    }
  });
}

/**
 * 선택된 동영상 로드 및 플레이어 준비
 */
function handleSelectedVideoFile(file) {
  if (!file) return;

  // 윈도우 환경 확장자 및 비디오 포맷 전면 지원
  const isVideo = (file.type && file.type.startsWith('video/')) || 
                  file.name.match(/\.(mp4|webm|mov|avi|mkv|wmv|m4v|flv|ts|3gp|asf|ogg)$/i);
  if (!isVideo) {
    alert(`선택하신 파일(${file.name})은 비디오 형식이 아닙니다.\n\nMP4, AVI, MOV, WebM, MKV, WMV 등 동영상 파일을 선택해주세요.`);
    return;
  }

  videoState.file = file;
  if (videoState.videoUrl) {
    URL.revokeObjectURL(videoState.videoUrl);
  }
  videoState.videoUrl = URL.createObjectURL(file);

  const videoPlayer = document.getElementById('source-video-player');
  const fileInfoBox = document.getElementById('selected-file-info');
  const fileNameDisplay = document.getElementById('file-name-display');
  const fileSizeDisplay = document.getElementById('file-size-display');
  const emptyPlaceholder = document.getElementById('player-empty-placeholder');
  const btnStartAnalysis = document.getElementById('btn-start-analysis');

  if (fileNameDisplay) {
    fileNameDisplay.textContent = file.name;
    fileNameDisplay.title = file.name;
  }
  if (fileSizeDisplay) {
    fileSizeDisplay.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (fileInfoBox) fileInfoBox.classList.remove('hidden');
  if (emptyPlaceholder) emptyPlaceholder.classList.add('hidden');
  
  if (videoPlayer) {
    videoPlayer.classList.remove('hidden');
    videoPlayer.src = videoState.videoUrl;
    videoPlayer.load();

    videoPlayer.onloadedmetadata = () => {
      videoState.duration = videoPlayer.duration;
      const durationDisplay = document.getElementById('file-duration-display');
      if (durationDisplay) durationDisplay.textContent = formatTime(videoPlayer.duration);
      if (btnStartAnalysis) btnStartAnalysis.disabled = false;
    };

    videoPlayer.onerror = (err) => {
      console.warn('Video element playback warning:', err);
      // 일부 브라우저에서 레거시 코덱(.avi 등) 미지원 시 안내 메시지
      const durationDisplay = document.getElementById('file-duration-display');
      if (durationDisplay) durationDisplay.textContent = '동영상 로드 완료 (프레임 추출 분석 가능)';
      if (btnStartAnalysis) btnStartAnalysis.disabled = false;
    };
  }

  // 기존 분석 결과 초기화
  const resultContainer = document.getElementById('analysis-result-container');
  if (resultContainer) resultContainer.classList.add('hidden');
}

/**
 * 윈도우 동영상 파일이 바로 없을 때를 위한 샘플 현장 CCTV 시뮬레이션 영상 생성 & 자동 로드
 */
async function loadDemoSampleVideo() {
  const btnStartAnalysis = document.getElementById('btn-start-analysis');

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    recorder.start();

    // 4초간 10대 재해 핵심 상황(단부, 비계, 굴착기) 시뮬레이션 프레임 렌더링
    for (let s = 0; s < 25; s++) {
      const t = s * 0.16;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 640, 360);

      // 슬래브 바닥
      ctx.fillStyle = '#334155';
      ctx.fillRect(30, 160, 580, 170);

      // 상단 CCTV 메타
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, 0, 640, 34);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 13px Pretendard, sans-serif';
      ctx.fillText('BEPMC 현장 관제 CCTV [판교 복합시설 A구역 3층 골조공사]', 15, 22);

      if (t < 1.5) {
        // [1위] 단부 추락 위험
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(490, 160, 120, 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('🚨 슬래브 단부 안전난간 미설치 (추락위험)', 330, 130);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(460, 180, 24, 55);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(472, 170, 10, 0, Math.PI * 2); ctx.fill();
      } else if (t < 2.8) {
        // [2위] 이동식비계 아웃트리거 미설치
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 3;
        ctx.strokeRect(180, 120, 80, 160);
        ctx.fillStyle = '#f97316';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('⚠️ 이동식비계 아웃트리거 미설치', 140, 95);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(205, 135, 20, 45);
      } else {
        // [3위] 굴착기 선회반경 내 작업자
        ctx.fillStyle = '#eab308';
        ctx.fillRect(100, 200, 90, 55);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('⚠️ 굴착기 선회반경 내 근로자 접근', 90, 175);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(215, 210, 20, 45);
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px monospace';
      ctx.fillText(`CAM-01 2026-11-07 14:30:${String(Math.floor(t)).padStart(2, '0')}`, 30, 310);
      await new Promise(r => setTimeout(r, 60));
    }

    recorder.stop();
    await new Promise(r => recorder.onstop = r);

    const blob = new Blob(chunks, { type: 'video/webm' });
    const sampleFile = new File([blob], '샘플_건설현장_CCTV_안전위반검출.webm', { type: 'video/webm' });
    handleSelectedVideoFile(sampleFile);
  } catch (e) {
    console.error('Demo video generation error:', e);
    alert('샘플 영상 생성 실패: ' + e.message);
  }
}

/**
 * 3. 브라우저 Canvas 기반 비디오 키프레임 추출 (1~2초 간격 샘플링)
 */
async function extractVideoKeyframes(videoElement, sampleIntervalSec = 1.5, maxFrames = 20) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const duration = videoElement.duration;
  const frames = [];

  // 가로세로 640px 비율 축소 (속도 및 전송 최적화)
  const targetWidth = 640;
  const scale = targetWidth / (videoElement.videoWidth || 640);
  canvas.width = targetWidth;
  canvas.height = Math.round((videoElement.videoHeight || 360) * scale);

  const progressBar = document.getElementById('extraction-progress-bar');
  const progressText = document.getElementById('extraction-progress-text');

  let currentTime = 0.5; // 시작 0.5초부터
  let frameIdx = 0;

  while (currentTime < duration && frameIdx < maxFrames) {
    // 비디오 시점 이동
    videoElement.currentTime = currentTime;
    await new Promise(resolve => {
      const onSeeked = () => {
        videoElement.removeEventListener('seeked', onSeeked);
        resolve();
      };
      videoElement.addEventListener('seeked', onSeeked);
    });

    // 캔버스 캡처
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);

    frames.push({
      frameIndex: frameIdx,
      timestamp: currentTime,
      timeStr: formatTime(currentTime),
      dataUrl: dataUrl
    });

    frameIdx++;
    currentTime += sampleIntervalSec;

    // UI 진행률 업데이트
    const pct = Math.min(100, Math.round((frameIdx / Math.min(maxFrames, Math.ceil(duration / sampleIntervalSec))) * 100));
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressText) progressText.textContent = `동영상 프레임 캡처 중... (${frameIdx}장 추출, ${pct}%)`;
  }

  return frames;
}

/**
 * 4. 분석 시작 버튼 핸들러
 */
async function startVideoSafetyAnalysis() {
  if (!videoState.file) {
    alert('먼저 분석할 동영상 파일을 선택해주세요.');
    return;
  }

  const isPaid = (currentAuth.mode === 'admin' || currentAuth.membership === 'paid' || (currentAuth.user && currentAuth.user.role === 'paid_member'));
  if (!isPaid) {
    alert('본 동영상 AI 안전진단은 유료 회원 전용 기능입니다.');
    checkPaidUserAccess();
    return;
  }

  const videoPlayer = document.getElementById('source-video-player');
  const btnStart = document.getElementById('btn-start-analysis');
  const progressContainer = document.getElementById('analysis-progress-container');
  const progressText = document.getElementById('extraction-progress-text');
  const siteNameInput = document.getElementById('site-name-input');
  const customNotesInput = document.getElementById('custom-notes-input');
  const sampleIntervalSelect = document.getElementById('sample-interval-select');

  try {
    videoState.isAnalyzing = true;
    if (btnStart) {
      btnStart.disabled = true;
      btnStart.innerHTML = `<span class="inline-block animate-spin mr-2">⏳</span> 분석 진행 중...`;
    }
    if (progressContainer) progressContainer.classList.remove('hidden');

    const sampleInterval = parseFloat(sampleIntervalSelect ? sampleIntervalSelect.value : '1.5') || 1.5;

    // 1단계: 비디오 프레임 추출
    const frames = await extractVideoKeyframes(videoPlayer, sampleInterval, 20);
    videoState.extractedFrames = frames;

    if (progressText) {
      progressText.textContent = `공공데이터 10대 재해 규칙 엔진 & CV 심층 판정 실행 중...`;
    }

    // 2단계: 백엔드 판정 API 전송
    const response = await fetch('/api/technical-guidance/top10-video-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteName: siteNameInput ? siteNameInput.value.trim() : '미지정 건설현장',
        fileName: videoState.file.name,
        customNotes: customNotesInput ? customNotesInput.value.trim() : '',
        frames: frames
      })
    });

    const report = await response.json();
    if (!response.ok || !report.success) {
      throw new Error(report.message || '동영상 분석 실패');
    }

    videoState.analysisReport = report;

    if (progressText) {
      progressText.textContent = `프라이버시 비식별화(얼굴·신체 모자이크) & 안전 위반 마킹 처리 중...`;
    }

    // 3단계: 화면 렌더링 (비동기 스냅샷 마킹 및 비식별화 처리)
    await renderAnalysisResults(report);

  } catch (err) {
    console.error('Analysis error:', err);
    alert('동영상 분석 중 오류가 발생했습니다: ' + err.message);
  } finally {
    videoState.isAnalyzing = false;
    if (btnStart) {
      btnStart.disabled = false;
      btnStart.innerHTML = `<span>⚡</span> 공공데이터 10대 재해 동영상 정밀 분석 실행`;
    }
    if (progressContainer) progressContainer.classList.add('hidden');
  }
}

/**
 * 5. 종합 분석 결과 UI 렌더링
 */
async function renderAnalysisResults(report) {
  const resultContainer = document.getElementById('analysis-result-container');
  if (!resultContainer) return;
  resultContainer.classList.remove('hidden');

  // 스크롤 이동
  resultContainer.scrollIntoView({ behavior: 'smooth' });

  // 상단 메타데이터
  document.getElementById('report-id-badge').textContent = report.reportId;
  document.getElementById('report-date-badge').textContent = report.reportDate;
  document.getElementById('report-site-name').textContent = report.siteName;
  document.getElementById('report-file-name').textContent = report.fileName;

  // [요구사항 1 & 2] 타임라인 스냅샷에 프라이버시 보호(얼굴/신체 모자이크) 및 안전위반 마킹 일괄 적용
  if (Array.isArray(report.timelineEvents)) {
    for (const evt of report.timelineEvents) {
      if (evt.snapshotDataUrl) {
        evt.snapshotDataUrl = await processSnapshotMarkingAndPrivacy(
          evt.snapshotDataUrl,
          evt.hazardMarkings,
          evt.privacyRegions
        );
      }
    }
  }

  // 종합 안전 지수 및 등급
  const scoreEl = document.getElementById('overall-score-display');
  const gradeEl = document.getElementById('overall-grade-display');
  const scoreBar = document.getElementById('overall-score-bar');

  if (scoreEl) scoreEl.textContent = report.videoSummary.overallSafetyScore;
  if (gradeEl) {
    gradeEl.textContent = report.videoSummary.overallGrade;
    gradeEl.style.backgroundColor = report.videoSummary.gradeBadgeColor;
    gradeEl.style.color = '#ffffff';
  }
  if (scoreBar) {
    scoreBar.style.width = `${report.videoSummary.overallSafetyScore}%`;
    scoreBar.style.backgroundColor = report.videoSummary.gradeBadgeColor;
  }

  // 최다 위험 위반 항목 하이라이트
  const pri = report.primaryCriticalViolation;
  if (pri) {
    document.getElementById('critical-hazard-title').textContent = `[${pri.rank}위 ${pri.accidentType}] ${pri.title}`;
    document.getElementById('critical-hazard-share').textContent = `과거 1년 통계 점유율: ${pri.sharePercent}%`;
    document.getElementById('critical-hazard-law').textContent = `⚖️ ${pri.legalBasis.lawName} ${pri.legalBasis.articleNo} (${pri.legalBasis.articleTitle})`;
    document.getElementById('critical-hazard-penalty').textContent = `처벌 규정: ${pri.legalBasis.punishment}`;
  }

  // 타임라인 마커 및 이벤트 목록 렌더링
  renderTimelineEvents(report.timelineEvents);

  // 10대 재해 매트릭스 그리드 렌더링
  renderTop10MatrixGrid(report.top10MatrixStatus);

  // 3단계 공학적 대책 렌더링
  renderActionRecommendations(report.recommendations);
}

/**
 * 타임라인 이벤트 목록 & 비디오 연동
 */
function renderTimelineEvents(events) {
  const listContainer = document.getElementById('timeline-events-list');
  const timelineMarkersBar = document.getElementById('video-timeline-markers-bar');
  if (!listContainer) return;

  const totalDuration = videoState.duration || 1;

  // 비디오 프로그레스 바 위 마커 배치
  if (timelineMarkersBar) {
    timelineMarkersBar.innerHTML = events.map(evt => {
      const leftPct = Math.min(98, Math.max(2, (evt.timestamp / totalDuration) * 100));
      return `
        <div onclick="seekVideoTo(${evt.timestamp}, '${evt.id}')" 
             title="[${evt.timeStr}] ${evt.title}"
             class="absolute top-0 transform -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-rose-500 hover:scale-150 transition cursor-pointer border-2 border-white shadow-md z-10"
             style="left: ${leftPct}%;">
        </div>
      `;
    }).join('');
  }

  // 카드 목록 렌더링
  listContainer.innerHTML = events.map((evt, idx) => `
    <div id="event-card-${evt.id}" onclick="seekVideoTo(${evt.timestamp}, '${evt.id}')" 
         class="p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-500 transition shadow-sm cursor-pointer space-y-2.5">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="px-2 py-0.5 rounded text-xs font-black bg-slate-900 text-amber-300 font-mono">
            ⏱️ ${evt.timeStr}
          </span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${evt.rank <= 3 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}">
            Rank ${evt.rank}위 (${evt.accidentType})
          </span>
          ${evt.trackedWorker ? `
            <span class="bg-indigo-900/90 text-indigo-200 border border-indigo-400/50 text-[10px] px-2 py-0.5 rounded font-black font-mono">
              👤 ${escapeHtml(evt.trackedWorker.id)} (${evt.trackedWorker.durationSec}초 지속)
            </span>
          ` : ''}
          ${evt.trackedWorker && evt.trackedWorker.insideGeofence ? `
            <span class="bg-rose-900/90 text-rose-200 border border-rose-400/50 text-[10px] px-2 py-0.5 rounded font-bold animate-pulse">
              🚨 ${escapeHtml(evt.trackedWorker.insideGeofence)}
            </span>
          ` : ''}
        </div>
        <span class="text-xs font-black px-2 py-0.5 rounded ${evt.riskScore >= 75 ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'}">
          위험지수 ${evt.riskScore}점
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
        <!-- 캡처 스냅샷 (위반사항 마킹 및 얼굴/신체 모자이크 처리) -->
        <div class="relative rounded-lg overflow-hidden border border-slate-300 bg-slate-950 aspect-video flex items-center justify-center group">
          ${evt.snapshotDataUrl ? `<img src="${evt.snapshotDataUrl}" class="w-full h-full object-cover">` : '<span class="text-xs text-slate-500">스냅샷 없음</span>'}
          <div class="absolute bottom-1 right-1 bg-black/75 text-[9px] text-white px-1.5 py-0.2 rounded font-mono">
            신뢰도 ${evt.confidence}%
          </div>
          <div class="absolute bottom-1 left-1 bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 text-[9px] px-1.5 py-0.2 rounded font-bold flex items-center gap-0.5">
            <span>🛡️</span> 비식별화
          </div>
        </div>

        <!-- 위반 내용 및 법적 근거 -->
        <div class="md:col-span-3 space-y-1.5">
          <h4 class="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
            <span class="text-rose-600">⚠️</span> ${escapeHtml(evt.title)}
          </h4>
          <p class="text-[11px] text-slate-600 leading-snug">
            <b>판정기준:</b> ${escapeHtml(evt.criteria)}
          </p>
          <div class="text-[10px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100 flex flex-wrap gap-x-3 gap-y-1">
            <span>⚖️ <b>법조항:</b> ${escapeHtml(evt.legalBasis.lawName)} ${escapeHtml(evt.legalBasis.articleNo)}</span>
            <span>🚨 <b>조치수준:</b> <span class="text-rose-600 font-bold">${escapeHtml(evt.dangerLevel)}</span></span>
            <span class="text-emerald-700 font-bold">🛡️ <b>프라이버시:</b> 얼굴·노출부위 모자이크 완료</span>
          </div>
          <div class="text-[11px] text-blue-900 bg-blue-50/70 p-2 rounded border border-blue-200">
            <b>🛡️ 즉시 시정 권고사항:</b> ${escapeHtml(evt.immediateAction)}
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

/**
 * [핵심 기능 1 & 2] 캔버스 기반 안전위반 사항 시각적 마킹(Bounding Box) & 개인 프라이버시(얼굴/신체부위 모자이크) 처리
 */
async function processSnapshotMarkingAndPrivacy(dataUrl, hazardMarkings = [], privacyRegions = []) {
  if (!dataUrl) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width || 640;
      canvas.height = img.height || 360;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      // 1. 원본 스냅샷 프레임 렌더링
      ctx.drawImage(img, 0, 0, w, h);

      // 2. [요구사항 2] 개인 프라이버시 보호: 얼굴 및 특정 신체(노출부위) 픽셀 모자이크 처리
      if (Array.isArray(privacyRegions) && privacyRegions.length > 0) {
        privacyRegions.forEach(region => {
          const rx = Math.max(0, Math.floor(region.box.x * w));
          const ry = Math.max(0, Math.floor(region.box.y * h));
          const rw = Math.min(w - rx, Math.floor(region.box.w * w));
          const rh = Math.min(h - ry, Math.floor(region.box.h * h));
          if (rw > 0 && rh > 0) {
            // 픽셀 모자이크 적용
            applyMosaicFilter(ctx, rx, ry, rw, rh, 9);

            // 비식별화 영역 녹색 점선 테두리
            ctx.save();
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 2]);
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.restore();
          }
        });
      }

      // 3. [요구사항 1] 안전 위반 사항 바운딩 박스 & 마킹 오버레이
      if (Array.isArray(hazardMarkings) && hazardMarkings.length > 0) {
        hazardMarkings.forEach(hazard => {
          const hx = Math.max(0, Math.floor(hazard.box.x * w));
          const hy = Math.max(0, Math.floor(hazard.box.y * h));
          const hw = Math.min(w - hx, Math.floor(hazard.box.w * w));
          const hh = Math.min(h - hy, Math.floor(hazard.box.h * h));
          if (hw > 0 && hh > 0) {
            const color = hazard.color || '#ef4444';

            // 반투명 위험 강조 배경
            ctx.fillStyle = color === '#ef4444' ? 'rgba(239, 68, 68, 0.16)' : 'rgba(249, 115, 22, 0.16)';
            ctx.fillRect(hx, hy, hw, hh);

            // 주 테두리
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(hx, hy, hw, hh);

            // 4개 코너 브래킷 강조 (┏ ┓ ┗ ┛)
            const bLen = Math.min(18, Math.floor(Math.min(hw, hh) / 4));
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = '#ffffff';

            ctx.beginPath();
            ctx.moveTo(hx, hy + bLen); ctx.lineTo(hx, hy); ctx.lineTo(hx + bLen, hy);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(hx + hw - bLen, hy); ctx.lineTo(hx + hw, hy); ctx.lineTo(hx + hw, hy + bLen);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(hx, hy + hh - bLen); ctx.lineTo(hx, hy + hh); ctx.lineTo(hx + bLen, hy + hh);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(hx + hw - bLen, hy + hh); ctx.lineTo(hx + hw, hy + hh); ctx.lineTo(hx + hw, hy + hh - bLen);
            ctx.stroke();

            // [추천 2] 굴착기 선회반경 및 슬래브 단부 가상 세이프티존 (Polygon Geofence) 시각화
            if (hazard.label && (hazard.label.includes('굴착기') || hazard.label.includes('선회반경'))) {
              ctx.save();
              ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
              ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
              ctx.lineWidth = 2;
              ctx.setLineDash([6, 4]);

              // 굴착기 중심 기준 5m 원형 세이프티존
              const centerX = hx + hw * 0.4;
              const centerY = hy + hh * 0.55;
              const radius = Math.max(hw, hh) * 0.78;

              ctx.beginPath();
              ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();

              // 세이프티존 배지 태그
              ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
              ctx.fillRect(centerX - 100, centerY - radius - 16, 200, 18);
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 10px Pretendard, sans-serif';
              ctx.fillText('🚨 [가상 세이프티존] 선회반경 5m 통제구역', centerX - 92, centerY - radius - 3);
              ctx.restore();
            }

            // 위반 텍스트 라벨 태그 배지
            ctx.font = 'bold 12px Pretendard, sans-serif';
            const labelText = hazard.label || '⚠️ 안전 위반 검출';
            const textWidth = ctx.measureText(labelText).width;
            const tagHeight = 22;
            const tagY = Math.max(6, hy - tagHeight - 2);

            ctx.fillStyle = color;
            ctx.fillRect(hx, tagY, textWidth + 16, tagHeight);

            ctx.fillStyle = '#ffffff';
            ctx.fillText(labelText, hx + 8, tagY + 15);
          }
        });
      }

      // 4. 스냅샷 상단 워터마크 태그 (개인정보보호법 제25조 비식별화 + ByteTrack 다중객체 추적)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(8, 8, 295, 22);
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(8, 8, 295, 22);
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 10px Pretendard, sans-serif';
      ctx.fillText('🛡️ [하이브리드 AI] 비식별화 + ByteTrack 다중객체 추적', 13, 23);

      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };

    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * 모자이크 픽셀레이션 필터 (얼굴 및 신체 노출부위 비식별화)
 */
function applyMosaicFilter(ctx, x, y, w, h, blockSize = 9) {
  x = Math.max(0, Math.floor(x));
  y = Math.max(0, Math.floor(y));
  w = Math.min(ctx.canvas.width - x, Math.floor(w));
  h = Math.min(ctx.canvas.height - y, Math.floor(h));
  if (w <= 0 || h <= 0) return;

  const imgData = ctx.getImageData(x, y, w, h);
  const data = imgData.data;

  for (let by = 0; by < h; by += blockSize) {
    for (let bx = 0; bx < w; bx += blockSize) {
      let r = 0, g = 0, b = 0, count = 0;

      for (let dy = 0; dy < blockSize && by + dy < h; dy++) {
        for (let dx = 0; dx < blockSize && bx + dx < w; dx++) {
          const idx = ((by + dy) * w + (bx + dx)) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          count++;
        }
      }

      if (count === 0) continue;
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);

      for (let dy = 0; dy < blockSize && by + dy < h; dy++) {
        for (let dx = 0; dx < blockSize && bx + dx < w; dx++) {
          const idx = ((by + dy) * w + (bx + dx)) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
        }
      }
    }
  }

  ctx.putImageData(imgData, x, y);
}

/**
 * 특정 초로 비디오 점프 및 하이라이트
 */
function seekVideoTo(seconds, eventId) {
  const videoPlayer = document.getElementById('source-video-player');
  if (videoPlayer) {
    videoPlayer.currentTime = seconds;
    videoPlayer.play().catch(() => {});
  }

  // 카드 하이라이트
  document.querySelectorAll('[id^="event-card-"]').forEach(el => {
    el.classList.remove('ring-2', 'ring-blue-600', 'bg-blue-50/30');
  });

  const targetCard = document.getElementById(`event-card-${eventId}`);
  if (targetCard) {
    targetCard.classList.add('ring-2', 'ring-blue-600', 'bg-blue-50/30');
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * 10대 재해 매트릭스 그리드 렌더링
 */
function renderTop10MatrixGrid(matrixStatus) {
  const container = document.getElementById('top10-matrix-grid');
  if (!container) return;

  container.innerHTML = matrixStatus.map(item => {
    const isDetected = item.violationCount > 0;
    return `
      <div class="p-3.5 rounded-xl border ${isDetected ? 'border-rose-400 bg-rose-50/30 shadow-sm' : 'border-slate-200 bg-white opacity-70'} space-y-1.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-full ${item.rank <= 3 ? 'bg-rose-600 text-white' : 'bg-slate-700 text-white'} flex items-center justify-center text-[10px] font-black">
              ${item.rank}
            </span>
            <span class="text-xs font-black text-slate-900 truncate max-w-[140px] sm:max-w-none" title="${escapeHtml(item.title)}">
              ${escapeHtml(item.title)}
            </span>
          </div>
          <span class="text-[10px] font-black px-2 py-0.5 rounded ${isDetected ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-200 text-slate-600'}">
            ${isDetected ? `검출 ${item.violationCount}건` : '정상 (미검출)'}
          </span>
        </div>
        <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
          <span>과거 1년 점유율: <b>${item.sharePercent}%</b></span>
          ${isDetected ? `<span class="text-rose-700 font-bold">최대 위험도: ${item.maxSeverityScore}점</span>` : '<span class="text-emerald-600 font-medium">안전 구역</span>'}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 3단계 공학적 대책 목록 렌더링
 */
function renderActionRecommendations(recs) {
  const immContainer = document.getElementById('immediate-actions-list');
  const engContainer = document.getElementById('engineering-controls-list');
  const admContainer = document.getElementById('administrative-plans-list');

  if (immContainer) {
    immContainer.innerHTML = recs.immediateActions.map(action => `
      <li class="flex items-start gap-2 text-xs text-rose-950 font-medium">
        <span class="text-rose-600 font-black">▶</span>
        <span>${escapeHtml(action)}</span>
      </li>
    `).join('');
  }

  if (engContainer) {
    engContainer.innerHTML = recs.engineeringControls.map(measure => `
      <li class="flex items-start gap-2 text-xs text-blue-950 font-medium">
        <span class="text-blue-600 font-black">■</span>
        <span>${escapeHtml(measure)}</span>
      </li>
    `).join('');
  }

  if (admContainer) {
    admContainer.innerHTML = recs.administrativePlans.map(plan => `
      <li class="flex items-start gap-2 text-xs text-slate-800">
        <span class="text-emerald-600 font-black">✔</span>
        <span>${escapeHtml(plan)}</span>
      </li>
    `).join('');
  }
}

/**
 * 인쇄 및 PDF 저장
 */
function printSafetyReport() {
  window.print();
}

/**
 * 보고서 데이터 JSON 다운로드
 */
function exportReportJson() {
  if (!videoState.analysisReport) {
    alert('다운로드할 분석 결과가 없습니다.');
    return;
  }
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(videoState.analysisReport, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `${videoState.analysisReport.reportId}_BEPMC_Safety_Report.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * 시간 포맷 헬퍼 (초 -> MM:SS)
 */
function formatTime(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return `${mm}:${ss}`;
}
