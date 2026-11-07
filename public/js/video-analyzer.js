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
 * 2. 동영상 드래그 앤 드롭 & 파일 선택 초기화
 */
function initVideoDropzone() {
  const dropzone = document.getElementById('video-dropzone');
  const fileInput = document.getElementById('video-file-input');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-blue-600', 'bg-blue-50/50');
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-blue-600', 'bg-blue-50/50');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-blue-600', 'bg-blue-50/50');
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
  const validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'];
  if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
    alert('지원되지 않는 비디오 형식입니다. MP4, WebM, MOV, AVI 파일을 선택해주세요.');
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

  if (fileNameDisplay) fileNameDisplay.textContent = file.name;
  if (fileSizeDisplay) fileSizeDisplay.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
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
  }

  // 기존 분석 결과 초기화
  const resultContainer = document.getElementById('analysis-result-container');
  if (resultContainer) resultContainer.classList.add('hidden');
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

    // 3단계: 화면 렌더링
    renderAnalysisResults(report);

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
function renderAnalysisResults(report) {
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
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded text-xs font-black bg-slate-900 text-amber-300 font-mono">
            ⏱️ ${evt.timeStr}
          </span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${evt.rank <= 3 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}">
            Rank ${evt.rank}위 (${evt.accidentType})
          </span>
        </div>
        <span class="text-xs font-black px-2 py-0.5 rounded ${evt.riskScore >= 75 ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'}">
          위험지수 ${evt.riskScore}점
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
        <!-- 캡처 스냅샷 -->
        <div class="relative rounded-lg overflow-hidden border border-slate-300 bg-slate-950 aspect-video flex items-center justify-center">
          ${evt.snapshotDataUrl ? `<img src="${evt.snapshotDataUrl}" class="w-full h-full object-cover">` : '<span class="text-xs text-slate-500">스냅샷 없음</span>'}
          <div class="absolute bottom-1 right-1 bg-black/70 text-[9px] text-white px-1.5 py-0.2 rounded font-mono">
            신뢰도 ${evt.confidence}%
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
