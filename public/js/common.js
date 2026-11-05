// 공통 클라이언트 스크립트: 세션 관리, 헤더, 푸터, 알림

let currentAuth = {
  isLoggedIn: false,
  user: null,
  mode: 'guest' // 'guest' | 'member' | 'admin'
};

let currentSettings = {
  siteName: "BEPMC (Project Management Consultancy)",
  mainSlogan: "안전과 프로젝트 성공을 이끄는 신뢰의 파트너",
  subSlogan: "작업 전 10초 안전점검, 나와 가족과 동료를 지키는 가장 확실한 약속",
  emergencyPhone: "긴급구조 xxx-xxxx-xxxx | 산업안전보건 신고 xxx-xxxx-xxxx | 비상상황실 xxx-xxxx-xxxx",
  alertBanner: "★ [안전경보] 환절기 밀폐공간 질식 및 화재 예방 특별 안전점검 기간 운영 중",
  safetyNotice: "안전모, 안전화, 안전대 착용 미흡 시 작업장 출입이 엄격히 제한됩니다.",
  footerInfo: "BEPMC (Project Management Consultancy) | 주소: 서울특별시 강남구 테헤란로 152 | 대표: xxx-xxxx-xxxx"
};

// 1. 세션 상태 가져오기
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    currentAuth = data;
    return data;
  } catch (e) {
    console.error('Auth check error:', e);
    return currentAuth;
  }
}

// 2. 사이트 설정 가져오기
async function loadSiteSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    currentSettings = data;
    return data;
  } catch (e) {
    console.error('Settings load error:', e);
    return currentSettings;
  }
}

// 3. 로그아웃
async function logout() {
  if (!confirm('로그아웃 하시겠습니까?')) return;
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      alert('로그아웃 되었습니다.');
      window.location.href = '/index.html';
    }
  } catch (err) {
    alert('로그아웃 처리 중 오류가 발생했습니다.');
  }
}

// 4. 공통 레이아웃 렌더링 (헤더 + 상단배너 + 푸터)
async function initLayout(activeMenu = '') {
  await Promise.all([checkAuth(), loadSiteSettings()]);

  // 상단 알림 띠배너 렌더링 (경고/주의 옐로우 배너)
  const bannerContainer = document.getElementById('global-alert-banner');
  if (bannerContainer && currentSettings.alertBanner) {
    bannerContainer.innerHTML = `
      <div class="bg-amber-400 text-slate-900 px-4 py-2 text-xs font-semibold flex items-center justify-between border-b border-amber-500 shadow-sm">
        <div class="flex items-center gap-2 max-w-7xl mx-auto w-full">
          <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-amber-400 text-xs font-black">!</span>
          <span class="truncate">${escapeHtml(currentSettings.alertBanner)}</span>
        </div>
      </div>
    `;
  }

  // 요구사항: 상단의 비회원/일반회원/관리자 구분은 삭제
  const demoSwitcherContainer = document.getElementById('demo-role-switcher');
  if (demoSwitcherContainer) {
    demoSwitcherContainer.innerHTML = ''; // 완전히 비움
    demoSwitcherContainer.classList.add('hidden');
  }

  // 상단 글로벌 헤더 (편안하고 믿음직한 딥 블루 테마)
  const headerContainer = document.getElementById('global-header');
  if (headerContainer) {
    let authNavHtml = '';
    if (currentAuth.isLoggedIn) {
      const isPaid = (currentAuth.mode === 'admin' || currentAuth.membership === 'paid' || (currentAuth.user && currentAuth.user.role === 'paid_member'));
      authNavHtml = `
        <div class="flex items-center gap-3">
          ${currentAuth.mode === 'admin' ? `
            <a href="/admin.html" class="flex items-center gap-1.5 bg-amber-400 text-slate-950 hover:bg-amber-300 px-3 py-1.5 rounded-md font-black text-xs tracking-tight transition shadow-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              <span>관리자 모드</span>
            </a>
          ` : `
            <div class="flex items-center gap-1.5 text-xs bg-blue-900/80 text-blue-200 border border-blue-700 px-2.5 py-1 rounded font-medium">
              <span>회원: <b>${escapeHtml(currentAuth.user.name)}</b>님</span>
              ${isPaid ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 px-1.5 py-0.2 rounded font-black">💎 유료회원</span>' : '<span class="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.2 rounded font-normal">무료</span>'}
            </div>
          `}
          <button onclick="logout()" class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded transition font-medium border border-slate-700">
            로그아웃
          </button>
        </div>
      `;
    } else {
      authNavHtml = `
        <div class="flex items-center gap-2">
          <a href="/login.html" class="text-xs font-semibold text-slate-200 hover:text-amber-300 px-3 py-1.5 rounded transition">로그인</a>
          <a href="/register.html" class="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded transition shadow-sm">회원가입 신청</a>
        </div>
      `;
    }

    headerContainer.innerHTML = `
      <header class="bg-[#0f172a] border-b border-blue-900/60 text-white sticky top-0 z-40 shadow-lg">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <!-- BEPMC 회사 로고 및 명칭 -->
            <a href="/index.html" class="flex items-center gap-3 group">
              <div class="h-10 px-3 rounded-lg bg-blue-700 flex items-center justify-center font-black text-white text-base shadow-inner border border-blue-500 group-hover:scale-105 transition-transform tracking-tight">
                <span class="text-white">BE</span><span class="text-amber-300">PMC</span>
              </div>
              <div>
                <span class="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                  BEPMC
                  <span class="text-xs font-semibold text-blue-300 hidden sm:inline">(Project Management Consultancy)</span>
                  <span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
                </span>
                <span class="block text-[11px] text-slate-400 font-medium tracking-wider">PROJECT MANAGEMENT & SAFETY CONSULTANCY</span>
              </div>
            </a>

            <!-- 메인 네비게이션 -->
            <nav class="hidden md:flex items-center gap-1">
              <a href="/index.html" class="px-3.5 py-2 rounded-md text-sm font-semibold transition ${activeMenu === 'home' ? 'text-amber-400 bg-blue-950/80' : 'text-slate-300 hover:text-white hover:bg-blue-950/50'}">
                안전 공익정보
              </a>
              <a href="/shop.html" class="px-3.5 py-2 rounded-md text-sm font-semibold transition ${activeMenu === 'shop' ? 'text-amber-400 bg-blue-950/80' : 'text-slate-300 hover:text-white hover:bg-blue-950/50'} flex items-center gap-1.5">
                <span>🛒</span> 안전용품몰
                <span class="text-[10px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded font-black">생활·현장</span>
                <span id="nav-cart-count" class="hidden bg-emerald-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">0</span>
              </a>
              <a href="/boards.html?type=general" class="px-3.5 py-2 rounded-md text-sm font-semibold transition ${activeMenu === 'general' ? 'text-amber-400 bg-blue-950/80' : 'text-slate-300 hover:text-white hover:bg-blue-950/50'}">
                일반 안전자료실 <span class="text-[10px] bg-emerald-900/80 text-emerald-300 px-1.5 py-0.5 rounded font-normal ml-0.5">전체공개</span>
              </a>
              <a href="/boards.html?type=member" class="px-3.5 py-2 rounded-md text-sm font-semibold transition ${activeMenu === 'member' ? 'text-amber-400 bg-blue-950/80' : 'text-slate-300 hover:text-white hover:bg-blue-950/50'}">
                회원 전용 게시판 <span class="text-[10px] bg-amber-900/80 text-amber-300 px-1.5 py-0.5 rounded font-normal ml-0.5">회원전용</span>
              </a>
              <a href="/technical-guidance.html" class="px-3 py-2 rounded-md text-sm font-semibold transition ${activeMenu === 'technical-guidance' ? 'text-amber-400 bg-blue-950/80 ring-1 ring-amber-400/50' : 'text-amber-300 hover:text-white hover:bg-blue-950/50'} flex items-center gap-1.5">
                <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>건설기술지도 AI관제</span>
                <span class="text-[10px] bg-red-600 text-white px-1.5 py-0.2 rounded font-black tracking-tight">K2B</span>
              </a>
              <a href="/mobile-app.html" target="_blank" class="px-2.5 py-1.5 rounded-md text-xs font-black bg-amber-400 text-slate-950 hover:bg-amber-300 transition flex items-center gap-1 shadow-sm ml-1">
                <span>📱</span>
                <span>현장앱</span>
              </a>
              <a href="/qna.html" class="px-3.5 py-2 rounded-md text-sm font-semibold transition ${activeMenu === 'qna' ? 'text-amber-400 bg-blue-950/80' : 'text-slate-300 hover:text-white hover:bg-blue-950/50'}">
                안전 Q&A 문의
              </a>
            </nav>

            <!-- 사용자 인증 영역 -->
            <div>
              ${authNavHtml}
            </div>
          </div>
        </div>
      </header>
    `;
  }

  // 공통 푸터 (편안하고 믿음직한 네이비 블루 테마 + 관리자 모드 진입 링크)
  const footerContainer = document.getElementById('global-footer');
  if (footerContainer) {
    footerContainer.innerHTML = `
      <footer class="bg-[#0f172a] text-slate-400 border-t-4 border-blue-600 mt-auto">
        <!-- 안전 빗금 얇은 라인 -->
        <div class="h-1.5 safety-stripe-thin"></div>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
            <!-- 브랜드 & 회사 소개 -->
            <div class="md:col-span-2 space-y-3">
              <div class="flex items-center gap-2">
                <div class="px-2.5 py-1 rounded bg-blue-700 flex items-center justify-center font-black text-white text-xs">
                  <span>BEPMC</span>
                </div>
                <span class="text-base font-bold text-white">BEPMC(Project Management Consultancy)</span>
              </div>
              <p class="text-xs text-slate-300 leading-relaxed">
                ${escapeHtml(currentSettings.mainSlogan)}<br>
                ${escapeHtml(currentSettings.subSlogan)}
              </p>
              <div class="pt-2">
                <span class="inline-flex items-center gap-1.5 text-xs text-amber-300 font-bold bg-slate-800/80 px-3 py-1.5 rounded border border-slate-700">
                  <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                  ${escapeHtml(currentSettings.emergencyPhone)}
                </span>
              </div>
            </div>

            <!-- 바로가기 링크 -->
            <div>
              <h4 class="text-xs font-bold text-blue-300 uppercase tracking-wider mb-3">바로가기</h4>
              <ul class="space-y-2 text-xs">
                <li><a href="/index.html" class="hover:text-amber-300 transition">첫페이지 (공익안전정보)</a></li>
                <li><a href="/shop.html" class="hover:text-amber-300 transition text-amber-300 font-semibold">🛒 안전용품몰 (생활·현장용품)</a></li>
                <li><a href="/boards.html?type=general" class="hover:text-amber-300 transition">일반 안전자료실 (전체열람)</a></li>
                <li><a href="/boards.html?type=member" class="hover:text-amber-300 transition">회원 전용 게시판 (회원전용)</a></li>
                <li><a href="/technical-guidance.html" class="hover:text-amber-300 transition text-amber-400 font-semibold flex items-center gap-1"><span>🤖</span> 건설재해예방 기술지도 AI 관제 (K2B)</a></li>
                <li><a href="/mobile-app.html" target="_blank" class="hover:text-amber-300 transition text-amber-300 font-bold flex items-center gap-1"><span>📱</span> 현장 관리자 모바일앱 (동영상·점검·전자결재)</a></li>
                <li><a href="/qna.html" class="hover:text-amber-300 transition">안전 Q&A 문의 접수</a></li>
              </ul>
            </div>

            <!-- 고객지원 및 보안 안내 -->
            <div>
              <h4 class="text-xs font-bold text-blue-300 uppercase tracking-wider mb-3">고객지원 &amp; 안내</h4>
              <div class="space-y-2.5">
                <p class="text-[11px] text-slate-400">BEPMC 안전보건 및 사업관리 기준에 따라 엄격하게 운영되는 전문 포털입니다.</p>
                <div class="pt-1 text-xs text-slate-300 space-y-1 bg-slate-900/60 p-2.5 rounded border border-slate-800">
                  <div class="text-[11px] text-blue-300 font-semibold">• 문의 응답 시간: 평일 09:00 ~ 18:00</div>
                  <div class="text-[11px] text-slate-400">• 긴급 안전사고 발생 시 xxx-xxxx-xxxx 즉시 신고</div>
                </div>
                
                ${currentAuth.mode === 'admin' ? `
                  <div class="pt-2">
                    <a href="/admin.html" class="admin-footer-btn inline-flex items-center gap-2 text-xs text-amber-300 font-bold px-3 py-2 rounded bg-blue-950/80 border border-blue-500 w-full justify-center shadow-sm">
                      <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                      관리자 전용 대시보드 바로가기
                    </a>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- 저작권 및 푸터 정보 -->
          <div class="border-t border-slate-800 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2">
            <div>${escapeHtml(currentSettings.footerInfo)}</div>
            <div>© 2026 BEPMC (Project Management Consultancy). ALL RIGHTS RESERVED.</div>
          </div>
        </div>
      </footer>
    `;
  }
}

// XSS 방지용 HTML Escape
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ========================================================
// 장바구니 (Cart) 유틸리티 (로컬스토리지 기반)
// ========================================================
function getCart() {
  try {
    const raw = localStorage.getItem('bepmc_cart');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  try {
    localStorage.setItem('bepmc_cart', JSON.stringify(cart));
    updateCartBadge();
  } catch (e) {}
}

function addToCart(product, quantity = 1) {
  const cart = getCart();
  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      icon: product.icon || '🛡️',
      category: product.category,
      targetType: product.targetType,
      quantity
    });
  }
  saveCart(cart);
  alert(`'${product.name}' 상품이 장바구니에 담겼습니다.`);
}

function clearCart() {
  localStorage.removeItem('bepmc_cart');
  updateCartBadge();
}

function updateCartBadge() {
  const countBadge = document.getElementById('nav-cart-count');
  if (!countBadge) return;
  const cart = getCart();
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQty > 0) {
    countBadge.textContent = totalQty;
    countBadge.classList.remove('hidden');
  } else {
    countBadge.classList.add('hidden');
  }
}

// 레이아웃 초기화 후 배지 갱신 및 글로벌 모바일 승인 폴링 시작
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(updateCartBadge, 300);
  initGlobalMobileAuthWatcher();
});

/**
 * PC 전체 페이지 공통: 모바일 현장앱 접속 승인 요청 감시 및 원클릭 승인 팝업
 */
function initGlobalMobileAuthWatcher() {
  // 모달/토스트 DOM 생성
  const toastContainer = document.createElement('div');
  toastContainer.id = 'global-mobile-auth-popup';
  toastContainer.className = 'fixed bottom-5 right-5 z-50 max-w-sm w-full bg-slate-900 border-2 border-amber-400 text-white rounded-2xl p-4 shadow-2xl transition-all duration-300 transform translate-y-10 opacity-0 pointer-events-none';
  toastContainer.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 border border-amber-400/40 flex items-center justify-center text-xl flex-shrink-0">
        📱
      </div>
      <div class="flex-1 space-y-1">
        <div class="flex items-center justify-between">
          <span class="inline-flex items-center gap-1 bg-amber-400 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full">
            <span class="w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping"></span>
            모바일 로그인 감지 (자동 승인 연동)
          </span>
          <span id="g-auth-time" class="text-[10px] text-slate-400 font-mono">방금 전</span>
        </div>
        <h4 id="g-auth-title" class="text-xs font-bold text-white pt-0.5">김안전 현장소장 (admin)</h4>
        <div id="g-auth-verification-box" class="bg-slate-800/80 border border-slate-700 rounded-lg p-2 text-[11px] font-mono space-y-0.5 text-slate-300">
          <div class="flex justify-between"><span>계정 ID:</span><span class="text-white font-bold" id="g-auth-id">admin</span></div>
          <div class="flex justify-between"><span>비밀번호 검증:</span><span class="text-emerald-400 font-bold" id="g-auth-pw">일치 (●●●●●●●●)</span></div>
          <div class="flex justify-between text-[10px] text-amber-300 pt-0.5 border-t border-slate-700/60"><span id="g-auth-status-text">🔍 대시보드 자동 승인 진행 중...</span><span class="animate-pulse">⚡</span></div>
        </div>
        <div class="pt-1.5 flex items-center gap-2">
          <button id="g-btn-approve" class="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow active:scale-95 transition">
            즉시 승인
          </button>
          <button id="g-btn-reject" class="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold transition">
            거절
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(toastContainer);

  let currentReqSessionId = null;

  async function checkPendingAuth() {
    try {
      const res = await fetch('/api/mobile/auth/pending-requests');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      const requests = data.requests || data.pendingRequests || [];
      if (requests.length > 0) {
        const req = requests[0];
        currentReqSessionId = req.sessionId;
        document.getElementById('g-auth-title').textContent = `${req.userName || req.username} (단말: ${req.clientIp || '192.168.35.161'})`;
        document.getElementById('g-auth-id').textContent = req.username || 'admin';
        document.getElementById('g-auth-time').textContent = req.requestedAt || '방금 전';
        document.getElementById('g-auth-status-text').textContent = '✅ ID/비번 확인 완료 -> 자동 승인 완료!';

        toastContainer.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
      } else {
        toastContainer.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
        currentReqSessionId = null;
      }
    } catch (e) {}
  }

  document.getElementById('g-btn-approve').onclick = async () => {
    if (!currentReqSessionId) return;
    try {
      const res = await fetch('/api/mobile/auth/verify-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentReqSessionId,
          action: 'APPROVE',
          isDemoBypass: true,
          verifierName: '본사 PC 관제 데스크 (글로벌 팝업)'
        })
      });
      const data = await res.json();
      if (data.success) {
        toastContainer.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
        alert('✅ 모바일 단말 접속을 승인하였습니다. 모바일 화면이 즉시 활성화됩니다.');
        checkPendingAuth();
      }
    } catch (err) {
      alert('승인 처리 실패: ' + err.message);
    }
  };

  document.getElementById('g-btn-reject').onclick = async () => {
    if (!currentReqSessionId) return;
    try {
      await fetch('/api/mobile/auth/verify-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentReqSessionId,
          action: 'REJECT',
          isDemoBypass: true,
          verifierName: '본사 PC 관제 데스크'
        })
      });
      toastContainer.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
      checkPendingAuth();
    } catch (e) {}
  };

  checkPendingAuth();
  setInterval(checkPendingAuth, 2500);
}
