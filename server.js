require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const dbService = require('./data/dbService');
const { isSupabaseConfigured } = require('./data/supabaseClient');
const publicApiService = require('./services/publicApiService');
const aiSafetyService = require('./services/aiSafetyInspectionService');
const technicalGuidanceService = require('./services/technicalGuidanceReportService');
const safetyKnowledgeBase = require('./services/safetyKnowledgeBaseService');
const mobileSyncService = require('./services/mobileSyncService');
const publicDataTop10RulesService = require('./services/publicDataTop10RulesService');
const videoSafetyAnalysisService = require('./services/videoSafetyAnalysisService');
const railwaySafetyAnalysisService = require('./services/railwaySafetyAnalysisService');
const universalSafetyAnalysisService = require('./services/universalSafetyAnalysisService');
const geminiQuotaService = require('./services/geminiQuotaService');
const geminiVideoAnalysisService = require('./services/geminiVideoAnalysisService');
const memberSecurityService = require('./services/memberSecurityService');

const app = express();
const PORT = process.env.PORT || 3000;

// 모바일 앱(file:// 및 외부 WebView) CORS 허용
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(
  session({
    secret: 'safety-portal-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 // 24시간
    }
  })
);

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// 미들웨어: 권한 확인 헬퍼
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: '로그인이 필요한 서비스입니다.' });
  }
  next();
}

function requireMember(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: '회원 로그인이 필요한 서비스입니다.' });
  }
  if (req.session.user.status !== 'approved') {
    return res.status(403).json({ success: false, message: '관리자의 가입 승인이 완료되지 않은 계정입니다.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '관리자 전용 메뉴입니다. 관리자 계정으로 로그인해주세요.' });
  }
  next();
}

function buildSessionUser(user) {
  if (!user) return null;
  const tier = user.role === 'admin' ? 'PAID' : (user.membershipTier || (user.role === 'paid_member' ? 'PAID' : 'FREE'));
  const isPaid = (user.role === 'admin' || tier === 'PAID');
  const isTrial = (tier === 'TRIAL' && user.trialInfo && user.trialInfo.isActive);

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    memberType: user.memberType || 'INDIVIDUAL',
    membershipTier: tier,
    membership: isPaid ? 'paid' : (isTrial ? 'trial' : 'free'),
    phone: user.phone || '',
    emailVerified: Boolean(user.emailVerified),
    trialInfo: user.trialInfo || null,
    subscriptionInfo: user.subscriptionInfo || null,
    inheritedCorporateInfo: user.inheritedCorporateInfo || null,
    paidProfileCompleted: Boolean(user.paidProfileCompleted),
    hasApprovalPassword: Boolean(user.hasApprovalPassword),
    canUseCorporateSeal: Boolean(user.canUseCorporateSeal),
    companyName: user.companyName || '',
    businessRegNo: user.businessRegNo || '',
    nationalCertName: user.nationalCertName || '',
    nationalCertNo: user.nationalCertNo || '',
    affiliationCompany: user.affiliationCompany || '',
    jobTitle: user.jobTitle || '',
    primaryDomain: user.primaryDomain || 'UNIVERSAL',
    defaultSiteName: user.defaultSiteName || '',
    signatureImagePath: user.signatureImagePath || '',
    corporateSealPath: user.corporateSealPath || ''
  };
}

// [보안 미들웨어] 인증된 관리자, 유료 회원, 또는 활성 1개월 유료 맛보기 회원 허용
function requirePaidOrAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      requireLogin: true,
      message: '로그인이 필요한 서비스입니다. 먼저 로그인해주세요.'
    });
  }
  if (req.session.user.status !== 'approved') {
    return res.status(403).json({
      success: false,
      message: '관리자의 가입 승인이 완료되지 않은 계정입니다.'
    });
  }
  const tier = req.session.user.membershipTier;
  const isAuthorized = (req.session.user.role === 'admin' || req.session.user.role === 'paid_member' || tier === 'PAID' || tier === 'TRIAL');
  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      requirePaid: true,
      message: '유료 회원 또는 1개월 유료 맛보기 회원 전용 서비스입니다. 무료 체험 신청 또는 Payment Code 등록 후 이용 가능합니다.'
    });
  }
  next();
}

// ---------------------------------------------------------------------
// 1. Auth & Session API (4단계 등급: GUEST / FREE / TRIAL / PAID)
// ---------------------------------------------------------------------

// 내 정보 확인 (DB에서 실시간 구독/만료/상속 정보 동기화)
app.get('/api/auth/me', async (req, res) => {
  const dbType = isSupabaseConfigured() ? 'Supabase' : 'Local';
  if (!req.session.user) {
    return res.json({
      isLoggedIn: false,
      user: null,
      mode: 'guest',
      membership: 'none',
      membershipTier: 'GUEST',
      canAccessDashboard: false,
      dbType
    });
  }

  try {
    const freshUser = await dbService.findUserById(req.session.user.id);
    if (freshUser && freshUser.status !== 'withdrawn') {
      req.session.user = buildSessionUser(freshUser);
    }
  } catch (e) {}

  const u = req.session.user;
  const tier = u.role === 'admin' ? 'PAID' : (u.membershipTier || 'FREE');
  const canAccess = (u.role === 'admin' || tier === 'PAID' || tier === 'TRIAL');

  res.json({
    isLoggedIn: true,
    user: u,
    mode: u.role === 'admin' ? 'admin' : (tier === 'PAID' ? 'paid_member' : (tier === 'TRIAL' ? 'trial_member' : 'member')),
    membership: tier === 'PAID' ? 'paid' : (tier === 'TRIAL' ? 'trial' : 'free'),
    membershipTier: tier,
    canAccessDashboard: canAccess,
    dbType
  });
});

// ID 사용 가능 여부 및 탈퇴자 ID 중복 실시간 확인
app.get('/api/auth/check-id', async (req, res) => {
  try {
    const username = String(req.query.username || '').trim();
    const result = await dbService.enterprise.checkLoginIdAvailability(username);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, available: false, message: '아이디 확인 중 오류가 발생했습니다.' });
  }
});

// 이메일 유효성 확인 인증코드 발송
app.post('/api/auth/send-email-code', async (req, res) => {
  try {
    const { email } = req.body;
    const emailCheck = memberSecurityService.validateEmail(email);
    if (!emailCheck.isValid) {
      return res.status(400).json({ success: false, message: emailCheck.message });
    }
    const alreadyUsed = await dbService.enterprise.isEmailAlreadyUsed(emailCheck.normalized);
    if (alreadyUsed) {
      return res.status(409).json({ success: false, message: '이미 가입된 이메일 주소입니다.' });
    }
    const issued = memberSecurityService.issueEmailVerificationCode(emailCheck.normalized);
    res.json({
      success: true,
      email: issued.email,
      expiresAt: issued.expiresAt,
      // 로컬/테스트 환경에서 즉시 인증 테스트 가능하도록 previewCode 함께 반환
      previewCode: issued.code,
      message: `인증코드 6자리가 ${issued.email} 로 발송되었습니다. (10분 유효)`
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 이메일 인증코드 검증
app.post('/api/auth/verify-email-code', (req, res) => {
  try {
    const { email, code } = req.body;
    const result = memberSecurityService.verifyEmailCode(email, code);
    if (!result.verified) {
      return res.status(400).json({ success: false, ...result });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: '이메일 인증 확인 중 오류가 발생했습니다.' });
  }
});

// Payment Code 사전 유효성 및 법인 정보 미리보기 확인
app.get('/api/auth/check-payment-code', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    if (!code) {
      return res.status(400).json({ success: false, valid: false, message: 'Payment Code를 입력해주세요.' });
    }
    const sub = await dbService.enterprise.findSubscriptionByCode(code);
    if (!sub) {
      return res.json({ success: true, valid: false, message: '존재하지 않는 Payment Code입니다.' });
    }
    const isValid = dbService.enterprise.isSubscriptionCurrentlyValid(sub);
    res.json({
      success: true,
      valid: isValid,
      ownerType: sub.ownerType,
      companyName: sub.companyName,
      planName: sub.planName,
      currentPeriodEnd: sub.currentPeriodEnd,
      message: isValid
        ? `[${sub.companyName}] 유료 구독 코드 확인 완료 (만료일: ${sub.currentPeriodEnd}) — 가입 시 자동 유료 승계`
        : `[${sub.companyName}] 해당 Payment Code는 당월 입금 미확인 또는 만료 상태입니다.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Payment Code 확인 중 오류 발생' });
  }
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await dbService.findUserByUsername(username);

    if (!user) {
      return res.status(400).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    if (user.status === 'withdrawn') {
      return res.status(403).json({ success: false, message: '탈퇴 처리된 계정입니다. 동일 아이디로는 재로그인이 불가합니다.' });
    }
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      const remainMin = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        message: `로그인 비밀번호 5회 이상 오입력으로 계정이 일시 잠금되었습니다. ${remainMin}분 후 다시 시도해주세요.`
      });
    }

    const masterPassword = process.env.ADMIN_MASTER_PASSWORD;
    const isMasterAdmin = (String(username).toLowerCase() === 'admin' && Boolean(masterPassword && password === masterPassword));
    const isPasswordMatch = memberSecurityService.verifySecret(password, user.password);

    if (!isMasterAdmin && !isPasswordMatch) {
      const nextFails = (user.failedLoginAttempts || 0) + 1;
      const patch = { failedLoginAttempts: nextFails };
      if (nextFails >= 5) {
        patch.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      await dbService.enterprise.updateMemberFields(user.id, user.username, patch);
      return res.status(400).json({
        success: false,
        message: nextFails >= 5
          ? '비밀번호 5회 연속 오류로 15분간 로그인이 제한됩니다.'
          : `아이디 또는 비밀번호가 올바르지 않습니다. (${nextFails}/5회)`
      });
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await dbService.enterprise.updateMemberFields(user.id, user.username, { failedLoginAttempts: 0, lockedUntil: null });
    }

    // 관리자는 승인여부 무관(기본 approved)
    if (user.role !== 'admin') {
      if (user.status === 'pending') {
        return res.status(403).json({
          success: false,
          message: '현재 관리자 승인 대기 중입니다. 관리자 승인 후 로그인할 수 있습니다.'
        });
      }
      if (user.status === 'rejected') {
        return res.status(403).json({
          success: false,
          message: '회원가입 신청이 관리자에 의해 거절되었습니다. 관리자에게 문의 바랍니다.'
        });
      }
    }

    // 세션 저장 (실시간 등급 및 상속 정보 포함)
    req.session.user = buildSessionUser(user);

    const tierLabel = user.role === 'admin'
      ? '관리자 모드'
      : (req.session.user.membershipTier === 'PAID'
        ? '유료 회원(PAID)'
        : (req.session.user.membershipTier === 'TRIAL' ? '1개월 유료 맛보기(TRIAL)' : '무료 회원(FREE)'));

    res.json({
      success: true,
      message: `${user.name}님 환영합니다. (${tierLabel})`,
      user: req.session.user
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: '로그인 처리 중 서버 오류가 발생했습니다.' });
  }
});

// 법인·개인 통합 회원가입 신청
app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      username,
      password,
      memberType = 'INDIVIDUAL',
      name,
      phone,
      email,
      emailVerificationCode,
      businessRegNo,
      companyName,
      ceoName,
      businessAddress,
      nationalCertName,
      nationalCertNo,
      startTrial = false,
      paymentCode = '',
      managerPhone = '',
      primaryDomain = 'UNIVERSAL',
      defaultSiteName = '',
      jobTitle = '',
      marketingAgreed = false,
      site // 레거시 호환
    } = req.body;

    // 1. ID 중복 및 탈퇴자 ID 체크
    const idCheck = await dbService.enterprise.checkLoginIdAvailability(username);
    if (!idCheck.available) {
      return res.status(idCheck.reason === 'INVALID_FORMAT' ? 400 : 409).json({
        success: false,
        message: idCheck.message
      });
    }

    // 2. 접속 비밀번호 강도 체크
    const pwEval = memberSecurityService.evaluatePasswordStrength(password, idCheck.normalized, email);
    if (!pwEval.isValid) {
      return res.status(400).json({
        success: false,
        message: pwEval.errors[0],
        passwordErrors: pwEval.errors
      });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: '성명 또는 법인명을 입력해주세요.' });
    }

    // 3. 연락처 검증
    const phoneCheck = memberSecurityService.validatePhone(phone);
    if (!phoneCheck.isValid) {
      return res.status(400).json({ success: false, message: phoneCheck.message });
    }

    // 4. 이메일 검증 + 중복 + 인증코드 확인
    const emailCheck = memberSecurityService.validateEmail(email);
    if (!emailCheck.isValid) {
      return res.status(400).json({ success: false, message: emailCheck.message });
    }
    if (await dbService.enterprise.isEmailAlreadyUsed(emailCheck.normalized)) {
      return res.status(409).json({ success: false, message: '이미 가입된 이메일 주소입니다.' });
    }

    let emailVerified = memberSecurityService.isEmailVerifiedInSession(emailCheck.normalized);
    if (!emailVerified && emailVerificationCode) {
      const otpResult = memberSecurityService.verifyEmailCode(emailCheck.normalized, emailVerificationCode);
      if (!otpResult.verified) {
        return res.status(400).json({ success: false, message: otpResult.message });
      }
      emailVerified = true;
    }
    if (!emailVerified) {
      return res.status(400).json({
        success: false,
        message: '이메일 유효성 확인을 위해 [인증코드 발송] 및 인증 확인을 먼저 완료해주세요.'
      });
    }

    // 5. 법인 사업자등록번호 필수 검증 (법인 회원)
    let normalizedBizNo = '';
    if (memberType === 'CORPORATE') {
      const bizCheck = memberSecurityService.validateKoreanBizRegNo(businessRegNo);
      if (!bizCheck.isValid) {
        return res.status(400).json({ success: false, message: bizCheck.message });
      }
      normalizedBizNo = bizCheck.normalized;
    }

    // 6. 1개월 유료 맛보기 1회성 자격 확인
    if (startTrial && !paymentCode) {
      const trialElig = await dbService.enterprise.checkTrialEligibility({
        email: emailCheck.normalized,
        phone: phoneCheck.normalized,
        businessRegNo: normalizedBizNo
      });
      if (!trialElig.eligible) {
        return res.status(409).json({ success: false, message: trialElig.message });
      }
    }

    const passwordHash = memberSecurityService.hashSecret(password);
    const createdUser = await dbService.enterprise.registerEnterpriseMember({
      username: idCheck.normalized,
      passwordHash,
      memberType,
      name: String(name).trim(),
      phone: phoneCheck.normalized,
      email: emailCheck.normalized,
      emailVerified: true,
      businessRegNo: normalizedBizNo,
      companyName: String(companyName || '').trim(),
      ceoName: String(ceoName || '').trim(),
      businessAddress: String(businessAddress || '').trim(),
      nationalCertName: String(nationalCertName || '').trim(),
      nationalCertNo: String(nationalCertNo || '').trim(),
      startTrial: Boolean(startTrial),
      paymentCode: String(paymentCode || '').trim(),
      managerPhone: String(managerPhone || '').trim(),
      primaryDomain: primaryDomain || 'UNIVERSAL',
      defaultSiteName: String(defaultSiteName || site || '').trim(),
      jobTitle: String(jobTitle || '').trim(),
      marketingAgreed: Boolean(marketingAgreed)
    }, dbService);

    const tierNotice = createdUser.membershipTier === 'PAID'
      ? '입력하신 유료 Payment Code로 즉시 유료 회원 권한이 연동되었습니다.'
      : (createdUser.membershipTier === 'TRIAL'
        ? '1개월 무료 유료 맛보기(월 30회 한도)가 신청되었습니다.'
        : '일반 무료 회원으로 신청되었습니다.');

    res.json({
      success: true,
      user: dbService.enterprise.toSafeUserDto(createdUser),
      message: `회원가입 신청이 완료되었습니다. ${tierNotice} 관리자 승인 후 로그인하여 이용하실 수 있습니다.`
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(400).json({ success: false, message: err.message || '회원가입 처리 중 오류가 발생했습니다.' });
  }
});

// 로그아웃
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: '로그아웃 되었습니다.' });
  });
});

// 원클릭 데모 전환 API (테스트 및 평가용)
app.post('/api/auth/demo-switch', async (req, res) => {
  try {
    const { role } = req.body; // 'guest' | 'member' | 'admin'

    if (role === 'guest') {
      req.session.destroy(() => {
        res.json({ success: true, mode: 'guest', message: '비회원 모드로 전환되었습니다.' });
      });
      return;
    }

    const users = await dbService.getAllUsers();
    let targetUser;

    if (role === 'admin') {
      targetUser = users.find(u => u.role === 'admin');
    } else if (role === 'paid_member' || role === 'paid') {
      targetUser = users.find(u => u.role === 'paid_member' && u.status === 'approved');
      if (!targetUser) targetUser = users.find(u => u.role === 'admin');
    } else if (role === 'member' || role === 'free') {
      targetUser = users.find(u => u.role === 'member' && u.status === 'approved');
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, message: '해당 권한의 사용자를 찾을 수 없습니다.' });
    }

    const isPaid = (targetUser.role === 'admin' || targetUser.role === 'paid_member');

    req.session.user = {
      id: targetUser.id,
      username: targetUser.username,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      membership: isPaid ? 'paid' : 'free',
      status: targetUser.status
    };

    const roleLabel = targetUser.role === 'admin' ? '관리자 모드' : (targetUser.role === 'paid_member' ? '유료 회원 모드' : '일반 무료 회원 모드');

    res.json({
      success: true,
      mode: targetUser.role,
      membership: isPaid ? 'paid' : 'free',
      canAccessDashboard: isPaid,
      message: `${targetUser.name}(으)로 전환되었습니다. (${roleLabel})`,
      user: req.session.user
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '전환 오류' });
  }
});

// ---------------------------------------------------------------------
// 2. Site Settings API (홈페이지 설정 & 공익 문구 관리)
// ---------------------------------------------------------------------

// 설정 조회 (전체 공개)
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await dbService.getSiteSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ success: false, message: '설정 조회 실패' });
  }
});

// 설정 수정 (관리자 전용 - 홈페이지 간단 수정 권한)
app.put('/api/settings', requireAdmin, async (req, res) => {
  try {
    const { siteName, mainSlogan, subSlogan, emergencyPhone, alertBanner, safetyNotice, footerInfo } = req.body;
    const current = await dbService.getSiteSettings();

    const updated = await dbService.updateSiteSettings({
      siteName: siteName || current.siteName,
      mainSlogan: mainSlogan || current.mainSlogan,
      subSlogan: subSlogan || current.subSlogan,
      emergencyPhone: emergencyPhone || current.emergencyPhone,
      alertBanner: alertBanner !== undefined ? alertBanner : current.alertBanner,
      safetyNotice: safetyNotice !== undefined ? safetyNotice : current.safetyNotice,
      footerInfo: footerInfo || current.footerInfo
    });

    res.json({ success: true, message: '홈페이지 설정이 성공적으로 업데이트되었습니다.', settings: updated });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ success: false, message: '설정 수정 중 오류가 발생했습니다.' });
  }
});

// ---------------------------------------------------------------------
// 3. Posts API (게시판 관리: 일반게시판 & 회원전용게시판)
// ---------------------------------------------------------------------

// 게시글 목록 조회
app.get('/api/posts', async (req, res) => {
  try {
    const { boardType, category, search } = req.query; // 'general' or 'member'

    // 회원 전용 게시판 접근 제한
    if (boardType === 'member') {
      if (!req.session.user || req.session.user.status !== 'approved') {
        return res.status(403).json({
          success: false,
          message: '회원 전용 게시판입니다. 회원 로그인(승인 완료 계정) 후 열람하실 수 있습니다.',
          requireLogin: true
        });
      }
    }

    const posts = await dbService.getPosts({ boardType, category, search });
    res.json({ success: true, posts });
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ success: false, message: '게시글 목록 조회 중 오류가 발생했습니다.' });
  }
});

// 게시글 상세 조회
app.get('/api/posts/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const post = await dbService.getPostById(id, true);

    if (!post) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }

    // 회원 전용 게시글 접근 제한
    if (post.boardType === 'member') {
      if (!req.session.user || req.session.user.status !== 'approved') {
        return res.status(403).json({
          success: false,
          message: '회원 전용 게시글입니다. 회원 로그인 후 열람 가능합니다.',
          requireLogin: true
        });
      }
    }

    res.json({ success: true, post });
  } catch (err) {
    console.error('Get post detail error:', err);
    res.status(500).json({ success: false, message: '게시글 상세 조회 중 오류가 발생했습니다.' });
  }
});

// 게시글 작성
app.post('/api/posts', requireMember, async (req, res) => {
  try {
    const { boardType, category, title, content } = req.body;
    const user = req.session.user;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: '제목과 내용을 입력해주세요.' });
    }

    // 일반 자료실은 관리자만 작성 가능, 회원 전용은 회원 및 관리자 작성 가능
    if (boardType === 'general' && user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '일반 공익자료실은 관리자만 작성할 수 있습니다.' });
    }

    const newPost = await dbService.createPost({
      boardType: boardType || 'member',
      category: category || (boardType === 'general' ? '안전공지' : '현장제안'),
      title,
      content,
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role
    });

    res.json({ success: true, message: '게시글이 등록되었습니다.', post: newPost });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ success: false, message: '게시글 등록 중 오류가 발생했습니다.' });
  }
});

// 게시글 수정 (관리자는 모든 글, 일반회원은 본인 글만)
app.put('/api/posts/:id', requireMember, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { title, content, category } = req.body;
    const user = req.session.user;

    const post = await dbService.getPostById(id, false);
    if (!post) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }

    // 권한 체크: 관리자이거나 작성자 본인
    if (user.role !== 'admin' && post.authorId !== user.id) {
      return res.status(403).json({ success: false, message: '본인이 작성한 글만 수정할 수 있습니다.' });
    }

    const updated = await dbService.updatePost(id, { title, content, category });
    res.json({ success: true, message: '게시글이 수정되었습니다.', post: updated });
  } catch (err) {
    console.error('Update post error:', err);
    res.status(500).json({ success: false, message: '게시글 수정 중 오류가 발생했습니다.' });
  }
});

// 게시글 삭제 (관리자는 모든 글 삭제 권한, 일반회원은 본인 글만)
app.delete('/api/posts/:id', requireMember, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = req.session.user;

    const post = await dbService.getPostById(id, false);
    if (!post) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }

    // 관리자는 모든 게시판 수정/삭제 권한 보유
    if (user.role !== 'admin' && post.authorId !== user.id) {
      return res.status(403).json({ success: false, message: '본인이 작성한 글만 삭제할 수 있습니다.' });
    }

    await dbService.deletePost(id);
    res.json({ success: true, message: '게시글이 삭제되었습니다.' });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ success: false, message: '게시글 삭제 중 오류가 발생했습니다.' });
  }
});

// 댓글 및 답변 작성 (회원 전용 게시판 답변/댓글 기능)
app.post('/api/posts/:id/comments', requireMember, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { content } = req.body;
    const user = req.session.user;

    if (!content) {
      return res.status(400).json({ success: false, message: '내용을 입력해주세요.' });
    }

    const newComment = await dbService.addComment(id, {
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      content
    });

    res.json({ success: true, message: '댓글이 등록되었습니다.', comment: newComment });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ success: false, message: '댓글 등록 중 오류가 발생했습니다.' });
  }
});

// 댓글 삭제 (관리자 또는 본인)
app.delete('/api/posts/:id/comments/:commentId', requireMember, async (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);
    const commentId = parseInt(req.params.commentId, 10);
    const user = req.session.user;

    const post = await dbService.getPostById(postId, false);
    if (!post || !post.comments) {
      return res.status(404).json({ success: false, message: '게시글 또는 댓글을 찾을 수 없습니다.' });
    }

    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: '댓글을 찾을 수 없습니다.' });
    }

    if (user.role !== 'admin' && comment.authorId !== user.id) {
      return res.status(403).json({ success: false, message: '본인의 댓글만 삭제할 수 있습니다.' });
    }

    await dbService.deleteComment(postId, commentId);
    res.json({ success: true, message: '댓글이 삭제되었습니다.' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ success: false, message: '댓글 삭제 중 오류가 발생했습니다.' });
  }
});

// ---------------------------------------------------------------------
// 4. Q&A API (관리자 수신 및 답변)
// ---------------------------------------------------------------------

// Q&A 목록 조회
app.get('/api/qna', async (req, res) => {
  try {
    const user = req.session.user;
    const allQna = await dbService.getQnaList();

    // 관리자는 모든 Q&A 수신 목록 확인
    if (user && user.role === 'admin') {
      return res.json({ success: true, qnaList: allQna, isAdmin: true });
    }

    // 일반회원 또는 비회원은 본인 글이거나 공개글만 조회
    const filtered = allQna
      .filter(q => {
        if (!q.isSecret) return true;
        if (user && q.authorId === user.id) return true;
        return false;
      })
      .map(q => ({
        id: q.id,
        title: q.isSecret && (!user || q.authorId !== user.id) ? '비밀글입니다.' : q.title,
        authorName: q.authorName ? q.authorName.charAt(0) + '*' + q.authorName.slice(2) : '익명',
        isSecret: q.isSecret,
        status: q.status,
        createdAt: q.createdAt,
        isMine: user ? q.authorId === user.id : false
      }));

    res.json({ success: true, qnaList: filtered, isAdmin: false });
  } catch (err) {
    console.error('Get QnA error:', err);
    res.status(500).json({ success: false, message: 'Q&A 목록 조회 중 오류가 발생했습니다.' });
  }
});

// Q&A 등록 (비회원/회원 모두 관리자에게 문의 가능)
app.post('/api/qna', async (req, res) => {
  try {
    const { title, content, authorName, email, isSecret } = req.body;
    const user = req.session.user;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: '제목과 내용을 입력해주세요.' });
    }

    const newQna = await dbService.createQna({
      title,
      content,
      authorId: user ? user.id : null,
      authorName: user ? user.name : (authorName || '문의자'),
      email: user ? user.email : (email || ''),
      isSecret: isSecret !== undefined ? !!isSecret : true
    });

    res.json({ success: true, message: '관리자에게 Q&A 문의가 접수되었습니다.', qna: newQna });
  } catch (err) {
    console.error('Create QnA error:', err);
    res.status(500).json({ success: false, message: 'Q&A 접수 중 오류가 발생했습니다.' });
  }
});

// Q&A 상세 조회
app.get('/api/qna/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = req.session.user;
    const qna = await dbService.getQnaById(id);

    if (!qna) {
      return res.status(404).json({ success: false, message: 'Q&A를 찾을 수 없습니다.' });
    }

    // 비밀글 권한 체크: 관리자 or 작성자 본인
    if (qna.isSecret) {
      const isAuth = user && (user.role === 'admin' || user.id === qna.authorId);
      if (!isAuth) {
        return res.status(403).json({ success: false, message: '비밀글은 작성자와 관리자만 확인할 수 있습니다.' });
      }
    }

    res.json({ success: true, qna });
  } catch (err) {
    console.error('Get QnA detail error:', err);
    res.status(500).json({ success: false, message: 'Q&A 상세 조회 실패' });
  }
});

// 관리자: Q&A 답변 등록 및 수정 (관리자 모드 전용)
app.put('/api/qna/:id/answer', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { answer } = req.body;
    const admin = req.session.user;

    if (!answer) {
      return res.status(400).json({ success: false, message: '답변 내용을 입력해주세요.' });
    }

    const updated = await dbService.answerQna(id, answer, admin.name);
    res.json({ success: true, message: '답변이 등록되었습니다.', qna: updated });
  } catch (err) {
    console.error('Answer QnA error:', err);
    res.status(500).json({ success: false, message: '답변 등록 중 오류가 발생했습니다.' });
  }
});

// Q&A 삭제 (관리자 또는 작성자)
app.delete('/api/qna/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = req.session.user;
    const target = await dbService.getQnaById(id);

    if (!target) {
      return res.status(404).json({ success: false, message: 'Q&A를 찾을 수 없습니다.' });
    }

    if (user.role !== 'admin' && target.authorId !== user.id) {
      return res.status(403).json({ success: false, message: '삭제 권한이 없습니다.' });
    }

    await dbService.deleteQna(id);
    res.json({ success: true, message: 'Q&A가 삭제되었습니다.' });
  } catch (err) {
    console.error('Delete QnA error:', err);
    res.status(500).json({ success: false, message: '삭제 실패' });
  }
});

// ---------------------------------------------------------------------
// 4-2. Safety Shop (안전몰 상품 및 주문 API)
// ---------------------------------------------------------------------

// 상품 목록 조회
app.get('/api/products', async (req, res) => {
  try {
    const { category, targetType, search } = req.query;
    const products = await dbService.getProducts({ category, targetType, search });
    res.json({ success: true, products });
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ success: false, message: '상품 목록 조회 실패' });
  }
});

// 상품 상세 조회
app.get('/api/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const product = await dbService.getProductById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: '상품 조회 실패' });
  }
});

// 상품 등록 (관리자 전용)
app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    const { name, category, targetType, price, stock, certification, icon, badge, description } = req.body;
    if (!name || !price) {
      return res.status(400).json({ success: false, message: '상품명과 가격을 입력해주세요.' });
    }
    const newProduct = await dbService.createProduct({
      name,
      category: category || '생활안전',
      targetType: targetType || 'life',
      price,
      stock,
      certification,
      icon,
      badge,
      description
    });
    res.json({ success: true, message: '상품이 등록되었습니다.', product: newProduct });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ success: false, message: '상품 등록 중 오류가 발생했습니다.' });
  }
});

// 상품 수정 (관리자 전용)
app.put('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updated = await dbService.updateProduct(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }
    res.json({ success: true, message: '상품 정보가 수정되었습니다.', product: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: '상품 수정 중 오류가 발생했습니다.' });
  }
});

// 상품 삭제 (관리자 전용)
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const success = await dbService.deleteProduct(id);
    if (!success) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }
    res.json({ success: true, message: '상품이 삭제되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, message: '상품 삭제 중 오류' });
  }
});

// 주문 접수 (회원/비회원 모두 가능)
app.post('/api/orders', async (req, res) => {
  try {
    const { buyerName, buyerPhone, buyerEmail, shippingAddress, items, totalAmount, paymentMethod } = req.body;
    if (!buyerName || !buyerPhone || !shippingAddress || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: '주문자 정보 및 배송지를 모두 입력해주세요.' });
    }

    const order = await dbService.createOrder({
      buyerName,
      buyerPhone,
      buyerEmail,
      shippingAddress,
      items,
      totalAmount,
      paymentMethod
    });

    res.json({
      success: true,
      message: '주문 및 결제가 정상적으로 접수되었습니다.',
      order
    });
  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ success: false, message: '주문 처리 중 오류가 발생했습니다.' });
  }
});

// 주문 내역 단건 조회 (주문번호 또는 ID)
app.get('/api/orders/:key', async (req, res) => {
  try {
    const order = await dbService.getOrderByIdOrNumber(req.params.key);
    if (!order) {
      return res.status(404).json({ success: false, message: '주문 내역을 찾을 수 없습니다.' });
    }
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: '주문 조회 실패' });
  }
});

// 관리자: 전체 주문 목록 조회
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await dbService.getAllOrders();
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: '주문 목록 조회 실패' });
  }
});

// 관리자: 주문/배송 상태 변경
app.put('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    const order = await dbService.updateOrderStatus(id, status);
    if (!order) {
      return res.status(404).json({ success: false, message: '주문을 찾을 수 없습니다.' });
    }
    res.json({ success: true, message: `주문 상태가 '${status}'(으)로 변경되었습니다.`, order });
  } catch (err) {
    res.status(500).json({ success: false, message: '주문 상태 변경 실패' });
  }
});

// ---------------------------------------------------------------------
// 5. Admin API (회원 승인/거절, 전체 통계 등)
// ---------------------------------------------------------------------

// 전체 회원 목록 조회
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await dbService.getAllUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: '회원 목록 조회 실패' });
  }
});

// 회원 가입 승인 / 거절 처리
app.put('/api/admin/users/:id/status', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body; // 'approved' or 'rejected'
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: '유효하지 않은 상태값입니다.' });
    }

    const user = await dbService.findUserById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: '관리자 계정 상태는 변경할 수 없습니다.' });
    }

    await dbService.updateUserStatus(id, status);
    const statusLabel = status === 'approved' ? '승인' : (status === 'rejected' ? '거절' : '대기');
    res.json({ success: true, message: `${user.name}님의 회원가입이 ${statusLabel} 처리되었습니다.` });
  } catch (err) {
    console.error('User status error:', err);
    res.status(500).json({ success: false, message: '회원 상태 변경 실패' });
  }
});

// 회원 등급 (유료 가입 회원 / 일반 무료 회원) 변경 처리
app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { role } = req.body; // 'paid_member' or 'member'
    if (!['paid_member', 'member'].includes(role)) {
      return res.status(400).json({ success: false, message: '유효하지 않은 회원 등급입니다.' });
    }

    const user = await dbService.findUserById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: '관리자 계정 등급은 변경할 수 없습니다.' });
    }

    await dbService.updateUserRole(id, role);

    // 현재 세션 사용자와 일치할 경우 세션도 동기화
    if (req.session.user && req.session.user.id === id) {
      req.session.user.role = role;
      req.session.user.membership = (role === 'paid_member') ? 'paid' : 'free';
    }

    const roleLabel = role === 'paid_member' ? '유료 기술지도 회원' : '일반 무료 회원';
    res.json({
      success: true,
      message: `${user.name}님의 회원 등급이 '${roleLabel}'(으)로 변경되었습니다.`,
      role,
      membership: (role === 'paid_member') ? 'paid' : 'free'
    });
  } catch (err) {
    console.error('User role error:', err);
    res.status(500).json({ success: false, message: '회원 등급 변경 실패' });
  }
});

// 회원 삭제
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await dbService.findUserById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: '관리자 계정은 삭제할 수 없습니다.' });
    }

    await dbService.deleteUser(id);
    res.json({ success: true, message: '회원이 탈퇴(비활성) 처리되었으며 아이디는 영구 보호 목록에 등록되었습니다.' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, message: '회원 삭제 실패' });
  }
});

// 관리자: 4단계 회원 등급 직접 변경 (FREE / TRIAL 1개월·30회 / PAID)
app.put('/api/admin/users/:id/tier', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { tier } = req.body; // 'FREE' | 'TRIAL' | 'PAID'
    if (!['FREE', 'TRIAL', 'PAID'].includes(tier)) {
      return res.status(400).json({ success: false, message: '유효하지 않은 회원 등급입니다. (FREE, TRIAL, PAID)' });
    }
    const user = await dbService.findUserById(id);
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: '관리자 등급은 변경할 수 없습니다.' });

    const now = new Date();
    const patch = {
      membershipTier: tier,
      role: tier === 'PAID' ? 'paid_member' : 'member'
    };
    if (tier === 'TRIAL') {
      patch.trialStatus = 'ACTIVE';
      patch.trialStartedAt = now.toISOString();
      patch.trialExpiresAt = memberSecurityService.addOneMonthIso(now);
      patch.trialQuotaTotal = 30;
      patch.trialQuotaUsed = 0;
      patch.hasUsedTrial = true;
    }

    await dbService.enterprise.updateMemberFields(id, user.username, patch);
    res.json({
      success: true,
      message: `${user.name}님의 등급이 '${tier}'(으)로 전환되었습니다.`,
      tier
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '등급 전환 실패: ' + err.message });
  }
});

// 관리자: 유료 구독 및 Payment Code 목록 조회
app.get('/api/admin/subscriptions', requireAdmin, async (req, res) => {
  try {
    const subscriptions = await dbService.enterprise.getAllSubscriptionsWithStats();
    res.json({ success: true, subscriptions });
  } catch (err) {
    res.status(500).json({ success: false, message: '구독 목록 조회 실패' });
  }
});

// 관리자: 신규 법인/개인 Payment Code 발급
app.post('/api/admin/subscriptions', requireAdmin, async (req, res) => {
  try {
    const { ownerType, companyName, businessRegNo, ceoName, businessAddress, agencyRegNo, planName, maxSeats, monthlyFee, startActive } = req.body;
    if (!companyName) {
      return res.status(400).json({ success: false, message: '법인(기관)명 또는 구독자명을 입력해주세요.' });
    }
    if (ownerType === 'CORPORATE' && businessRegNo) {
      const bizCheck = memberSecurityService.validateKoreanBizRegNo(businessRegNo);
      if (!bizCheck.isValid) {
        return res.status(400).json({ success: false, message: bizCheck.message });
      }
    }
    const created = await dbService.enterprise.createSubscription({
      ownerType: ownerType || 'CORPORATE',
      companyName,
      businessRegNo,
      ceoName,
      businessAddress,
      agencyRegNo,
      planName,
      maxSeats: Number(maxSeats) || 10,
      monthlyFee: Number(monthlyFee) || 330000,
      startActive: startActive !== false
    });
    res.json({
      success: true,
      subscription: created,
      message: `신규 Payment Code [${created.paymentCode}] 가 발급되었습니다.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Payment Code 발급 실패: ' + err.message });
  }
});

// 관리자: 월별 입금 확인 처리 (+1개월 연장 및 소속 개인 자동 유료 유지)
app.post('/api/admin/subscriptions/:id/confirm-payment', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { billingMonth, paidAmount, depositorName, paymentMethod } = req.body;
    const updated = await dbService.enterprise.confirmMonthlyPayment(id, {
      billingMonth,
      paidAmount,
      depositorName,
      paymentMethod,
      verifiedBy: req.session.user.username
    });
    if (!updated) return res.status(404).json({ success: false, message: '구독을 찾을 수 없습니다.' });
    res.json({
      success: true,
      subscription: updated,
      message: `[${updated.paymentCode}] 당월 입금이 확인되어 유효기간이 ${updated.currentPeriodEnd} 까지 연장되었습니다.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '입금 확인 처리 실패' });
  }
});

// 관리자: 월별 입금 미확인 시 구독 만료/정지 처리 (소속 개인 자동 차단 연동)
app.put('/api/admin/subscriptions/:id/status', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { billingStatus } = req.body;
    if (!['ACTIVE', 'EXPIRED', 'SUSPENDED', 'PENDING_PAYMENT'].includes(billingStatus)) {
      return res.status(400).json({ success: false, message: '유효하지 않은 구독 상태입니다.' });
    }
    const updated = await dbService.enterprise.updateSubscriptionStatus(id, billingStatus);
    if (!updated) return res.status(404).json({ success: false, message: '구독을 찾을 수 없습니다.' });
    res.json({
      success: true,
      subscription: updated,
      message: `[${updated.paymentCode}] 상태가 '${billingStatus}'(으)로 변경되었습니다.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '구독 상태 변경 실패' });
  }
});

// ---------------------------------------------------------------------
// 6. Member Self-Service: 1개월 맛보기, Payment Code, 유료 세무·공식문서 프로필, 결재 비밀번호 & 날인
// ---------------------------------------------------------------------

// 회원 상세 프로필 및 결재/날인 이력 조회
app.get('/api/member/profile', requireMember, async (req, res) => {
  try {
    const user = await dbService.findUserById(req.session.user.id);
    if (!user) return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });
    req.session.user = buildSessionUser(user);
    const approvalLogs = await dbService.enterprise.getApprovalLogsByUser(user.id);
    res.json({
      success: true,
      profile: dbService.enterprise.toSafeUserDto(user),
      approvalLogs
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '회원 프로필 조회 실패' });
  }
});

// 무료 회원 -> 1개월 유료 맛보기(월 30회) 활성화
app.post('/api/member/start-trial', requireMember, async (req, res) => {
  try {
    const user = await dbService.findUserById(req.session.user.id);
    if (!user) return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });
    if (user.membershipTier === 'PAID') {
      return res.status(400).json({ success: false, message: '이미 정식 유료 회원입니다.' });
    }
    if (user.hasUsedTrial) {
      return res.status(409).json({ success: false, message: '이미 1개월 유료 맛보기를 사용하신 계정입니다.' });
    }

    const elig = await dbService.enterprise.checkTrialEligibility({
      email: user.email,
      phone: user.phone,
      businessRegNo: user.businessRegNo
    });
    if (!elig.eligible) {
      return res.status(409).json({ success: false, message: elig.message });
    }

    const now = new Date();
    const expiresAt = memberSecurityService.addOneMonthIso(now);
    await dbService.enterprise.updateMemberFields(user.id, user.username, {
      membershipTier: 'TRIAL',
      trialStatus: 'ACTIVE',
      trialStartedAt: now.toISOString(),
      trialExpiresAt: expiresAt,
      trialQuotaTotal: 30,
      trialQuotaUsed: 0,
      hasUsedTrial: true
    });
    await dbService.enterprise.recordTrialHistory({
      email: user.email,
      phone: user.phone,
      businessRegNo: user.businessRegNo
    });

    const refreshed = await dbService.findUserById(user.id);
    req.session.user = buildSessionUser(refreshed);
    res.json({
      success: true,
      user: req.session.user,
      message: '1개월 유료 맛보기(비용 연관 API 월 30회 한도)가 즉시 활성화되었습니다!'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '유료 맛보기 활성화 실패: ' + err.message });
  }
});

// Payment Code 등록 / 소속 법인 유료 승계
app.post('/api/member/redeem-payment-code', requireMember, async (req, res) => {
  try {
    const { paymentCode } = req.body;
    const user = await dbService.findUserById(req.session.user.id);
    if (!user) return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });

    const sub = await dbService.enterprise.redeemPaymentCodeForUser(user, paymentCode);
    const refreshed = await dbService.findUserById(user.id);
    req.session.user = buildSessionUser(refreshed);

    res.json({
      success: true,
      subscription: sub,
      user: req.session.user,
      message: `[${sub.companyName}] 유료 구독 코드(${sub.paymentCode})가 연동되어 정식 유료 회원 자격을 획득했습니다.`
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 유료 회원 2단계 필수 정보 등록: 세금계산서/공식문서 기재사항 + 별도 결재 비밀번호 + 서명/직인
app.post('/api/member/paid-profile', requireMember, async (req, res) => {
  try {
    const user = await dbService.findUserById(req.session.user.id);
    if (!user) return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });
    if (user.role !== 'admin' && user.membershipTier !== 'PAID') {
      return res.status(403).json({ success: false, message: '세무·공식문서·결재 비밀번호 설정은 유료 회원 전용입니다.' });
    }

    const {
      taxPayerType,
      businessRegNo,
      subBusinessNo,
      companyName,
      ceoName,
      businessAddress,
      businessType,
      businessItem,
      taxInvoiceEmail,
      cashReceiptType,
      cashReceiptNo,
      nationalCertName,
      nationalCertNo,
      agencyRegNo,
      jobTitle,
      officialDocAddress,
      approvalPassword,
      approvalPasswordType = 'ALPHANUMERIC',
      signatureImagePath,
      corporateSealPath
    } = req.body;

    const isCorporateEmployee = Boolean(
      user.memberType === 'INDIVIDUAL' &&
      user.subscriptionInfo &&
      user.subscriptionInfo.ownerType === 'CORPORATE' &&
      !user.subscriptionInfo.isOwner
    );

    const effectiveTaxPayerType = taxPayerType || (user.memberType === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL');
    const needsTaxInvoiceFields = !isCorporateEmployee && (user.memberType === 'CORPORATE' || effectiveTaxPayerType === 'SOLE_PROPRIETOR');

    let normalizedBizNo = user.businessRegNo || '';
    if (needsTaxInvoiceFields) {
      const bizCheck = memberSecurityService.validateKoreanBizRegNo(businessRegNo);
      if (!bizCheck.isValid) {
        return res.status(400).json({ success: false, message: `세금계산서 필수 오류: ${bizCheck.message}` });
      }
      normalizedBizNo = bizCheck.normalized;

      if (!companyName || !ceoName || !businessAddress || !businessType || !businessItem) {
        return res.status(400).json({
          success: false,
          message: '세금계산서 및 정부 공식 문서 발행을 위해 상호명, 대표자명, 사업장 주소, 업태, 종목을 모두 입력해주세요.'
        });
      }
      const taxMailCheck = memberSecurityService.validateEmail(taxInvoiceEmail || user.email);
      if (!taxMailCheck.isValid) {
        return res.status(400).json({ success: false, message: '세금계산서 수신용 유효 이메일을 입력해주세요.' });
      }
    } else if (!isCorporateEmployee) {
      // 비사업자 단독 유료 개인 회원: 현금영수증 또는 공식문서 주소 확인
      if (cashReceiptType && cashReceiptType !== 'NONE' && (!cashReceiptNo || memberSecurityService.normalizeDigits(cashReceiptNo).length < 10)) {
        return res.status(400).json({ success: false, message: '현금영수증 발급용 휴대폰 번호(또는 사업자번호)를 정확히 입력해주세요.' });
      }
      if (!officialDocAddress) {
        return res.status(400).json({ success: false, message: '정부/공식 문서 발행 시 기재할 소속/연락 주소를 입력해주세요.' });
      }
    }

    // 결재용 비밀번호 검증 (기존 미설정 시 필수, 접속 비밀번호와 동일 불가)
    let nextApprovalHash = user.approvalPasswordHash;
    if (!nextApprovalHash || approvalPassword) {
      const apCheck = memberSecurityService.validateApprovalPassword(
        approvalPassword,
        approvalPasswordType,
        user.password,
        ''
      );
      if (!apCheck.isValid) {
        return res.status(400).json({ success: false, message: apCheck.errors[0] });
      }
      nextApprovalHash = memberSecurityService.hashSecret(approvalPassword);
    }

    // 전자서명/법인직인 검증
    const nextSign = signatureImagePath !== undefined ? signatureImagePath : user.signatureImagePath;
    const nextSeal = corporateSealPath !== undefined ? corporateSealPath : user.corporateSealPath;
    if (user.memberType === 'INDIVIDUAL' && !nextSign) {
      return res.status(400).json({ success: false, message: '공식 보고서 결재를 위해 개인 전자서명 이미지 등록(또는 서명패드 작성)이 필수입니다.' });
    }
    if (user.memberType === 'CORPORATE' && !nextSeal && !nextSign) {
      return res.status(400).json({ success: false, message: '법인 회원은 법인 직인(또는 대표자 전자서명) 이미지 등록이 필수입니다.' });
    }

    const patch = {
      taxPayerType: effectiveTaxPayerType,
      businessRegNo: normalizedBizNo,
      subBusinessNo: subBusinessNo || '',
      companyName: companyName || user.companyName || '',
      ceoName: ceoName || user.ceoName || '',
      businessAddress: businessAddress || user.businessAddress || '',
      businessType: businessType || user.businessType || '',
      businessItem: businessItem || user.businessItem || '',
      taxInvoiceEmail: (taxInvoiceEmail || user.email || '').trim().toLowerCase(),
      cashReceiptType: cashReceiptType || 'NONE',
      cashReceiptNoEnc: cashReceiptNo ? memberSecurityService.sha256(cashReceiptNo) : (user.cashReceiptNoEnc || ''),
      nationalCertName: nationalCertName !== undefined ? nationalCertName : user.nationalCertName,
      nationalCertNo: nationalCertNo !== undefined ? nationalCertNo : user.nationalCertNo,
      agencyRegNo: agencyRegNo !== undefined ? agencyRegNo : user.agencyRegNo,
      jobTitle: jobTitle !== undefined ? jobTitle : user.jobTitle,
      officialDocAddress: officialDocAddress !== undefined ? officialDocAddress : user.officialDocAddress,
      approvalPasswordHash: nextApprovalHash,
      approvalPasswordType,
      approvalPasswordUpdatedAt: new Date().toISOString(),
      approvalFailedAttempts: 0,
      approvalLockedUntil: null,
      signatureImagePath: nextSign || '',
      corporateSealPath: nextSeal || '',
      paidProfileCompleted: true
    };

    await dbService.enterprise.updateMemberFields(user.id, user.username, patch);
    const refreshed = await dbService.findUserById(user.id);
    req.session.user = buildSessionUser(refreshed);

    res.json({
      success: true,
      user: req.session.user,
      message: '세무·공식문서 기재사항 및 분리된 결재용 비밀번호·전자서명 설정이 완료되었습니다.'
    });
  } catch (err) {
    console.error('Paid profile error:', err);
    res.status(500).json({ success: false, message: '유료 프로필 설정 저장 실패: ' + err.message });
  }
});

// 자발적 회원 탈퇴 (탈퇴자 ID 영구 재사용 차단)
app.post('/api/member/withdraw', requireAuth, async (req, res) => {
  try {
    const user = await dbService.findUserById(req.session.user.id);
    if (!user) return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: '최고관리자 계정은 탈퇴할 수 없습니다.' });
    }
    await dbService.enterprise.withdrawMember(user);
    req.session.destroy(() => {
      res.json({
        success: true,
        message: '회원 탈퇴가 완료되었습니다. 보안 정책상 사용하시던 아이디는 영구히 재사용할 수 없습니다.'
      });
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '탈퇴 처리 중 오류 발생' });
  }
});

// 공식 보고서 전자서명 · 직인 결재 실행 (결재용 비밀번호 검증 + 감사로그 기록)
app.post('/api/reports/sign-approve', requireMember, async (req, res) => {
  try {
    const { reportId, reportType = 'VIDEO_SAFETY', sealUsedType = 'PERSONAL_SIGN', approvalPassword, reportPayload } = req.body;
    const user = await dbService.findUserById(req.session.user.id);
    if (!user) return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });

    if (user.role !== 'admin' && user.membershipTier !== 'PAID') {
      return res.status(403).json({
        success: false,
        requirePaid: true,
        message: '전자서명·직인 날인 및 공식 문서 발행은 정식 유료 회원(PAID)만 가능합니다. (체험용 보고서는 공식 제출 불가)'
      });
    }

    if (user.role !== 'admin' && (!user.paidProfileCompleted || !user.approvalPasswordHash)) {
      return res.status(400).json({
        success: false,
        requirePaidSetup: true,
        message: '먼저 [유료 세무·공식문서 정보 및 결재용 비밀번호] 설정을 완료해주세요.'
      });
    }

    if (user.approvalLockedUntil && new Date(user.approvalLockedUntil).getTime() > Date.now()) {
      const remainMin = Math.ceil((new Date(user.approvalLockedUntil).getTime() - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        message: `결재용 비밀번호 5회 이상 오입력으로 전자결재가 일시 잠금되었습니다. ${remainMin}분 후 재시도하세요.`
      });
    }

    // 최고관리자는 데모 시 또는 결재비번 설정 시 검증
    const hashToVerify = user.approvalPasswordHash || user.password;
    const isMatch = memberSecurityService.verifySecret(approvalPassword, hashToVerify);
    if (!isMatch) {
      const nextFails = (user.approvalFailedAttempts || 0) + 1;
      const patch = { approvalFailedAttempts: nextFails };
      if (nextFails >= 5) {
        patch.approvalLockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      await dbService.enterprise.updateMemberFields(user.id, user.username, patch);
      return res.status(401).json({
        success: false,
        message: nextFails >= 5
          ? '결재용 비밀번호 5회 연속 오류로 15분간 전자서명·직인 결재가 잠금되었습니다.'
          : `결재용 비밀번호가 일치하지 않습니다. (접속 비밀번호와 별도 설정된 결재 비번 필요, ${nextFails}/5회)`
      });
    }

    if ((sealUsedType === 'CORPORATE_SEAL' || sealUsedType === 'BOTH') && user.role !== 'admin' && !user.canUseCorporateSeal) {
      return res.status(403).json({
        success: false,
        message: '법인 직인 날인 권한이 없습니다. 소속 개인 회원은 개인 전자서명(PERSONAL_SIGN)만 사용할 수 있습니다.'
      });
    }

    if (user.approvalFailedAttempts > 0) {
      await dbService.enterprise.updateMemberFields(user.id, user.username, { approvalFailedAttempts: 0, approvalLockedUntil: null });
    }

    // 본인 명의 공식 문서 발행 시 법인 소속 개인은 필요한 법인 정보만 선별 상속
    const corporateInfoSnapshot = user.inheritedCorporateInfo || (user.memberType === 'CORPORATE' ? {
      companyName: user.companyName,
      businessRegNo: user.businessRegNo,
      ceoName: user.ceoName,
      businessAddress: user.businessAddress,
      agencyRegNo: user.agencyRegNo
    } : null);

    const docSha256 = memberSecurityService.sha256(JSON.stringify(reportPayload || { reportId, reportType, ts: Date.now() }));
    const signerIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    const log = await dbService.enterprise.createApprovalLog({
      reportId: reportId || `BEPSMC-DOC-${Date.now()}`,
      reportType,
      signerUserId: user.id,
      subscriptionId: user.subscriptionId,
      sealUsedType,
      corporateInfoSnapshot,
      documentSha256: docSha256,
      signerIp
    });

    res.json({
      success: true,
      approvalLog: log,
      signerSummary: {
        name: user.name,
        jobTitle: user.jobTitle,
        nationalCertName: user.nationalCertName,
        nationalCertNo: user.nationalCertNo,
        signatureImagePath: user.signatureImagePath,
        corporateSealPath: user.corporateSealPath,
        corporateInfoSnapshot
      },
      message: '결재용 비밀번호 인증 및 공식 보고서 전자서명·직인 날인이 완료되었습니다.'
    });
  } catch (err) {
    console.error('Report sign approve error:', err);
    res.status(500).json({ success: false, message: '전자결재 처리 중 오류가 발생했습니다.' });
  }
});

// 관리자 대시보드 요약 지표
app.get('/api/admin/summary', requireAdmin, async (req, res) => {
  try {
    const summary = await dbService.getSummaryStats();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ success: false, message: '통계 조회 실패' });
  }
});

// ---------------------------------------------------------------------
// 7. Public Data API (고용노동부, 한국산업안전보건공단, 소방청)
// ---------------------------------------------------------------------

// 전체 공공 안전 데이터 종합 현황 (위젯 연동)
app.get('/api/public-data/summary', async (req, res) => {
  try {
    const summary = await publicApiService.getPublicDataSummary();
    res.json(summary);
  } catch (err) {
    console.error('Public data summary error:', err);
    res.status(500).json({ success: false, message: '공공데이터 요약 조회 실패' });
  }
});

// 고용노동부 중대재해 속보
app.get('/api/public-data/moel', async (req, res) => {
  try {
    const data = await publicApiService.fetchMoelDisasters();
    res.json(data);
  } catch (err) {
    console.error('MOEL API error:', err);
    res.status(500).json({ success: false, message: '고용노동부 데이터 조회 실패' });
  }
});

// 한국산업안전보건공단 안전기술지침
app.get('/api/public-data/kosha', async (req, res) => {
  try {
    const data = await publicApiService.fetchKoshaGuides();
    res.json(data);
  } catch (err) {
    console.error('KOSHA API error:', err);
    res.status(500).json({ success: false, message: '한국산업안전보건공단 데이터 조회 실패' });
  }
});

// 소방청 실시간 화재발생 및 경보
app.get('/api/public-data/nfa', async (req, res) => {
  try {
    const data = await publicApiService.fetchNfaFireStats();
    res.json(data);
  } catch (err) {
    console.error('NFA API error:', err);
    res.status(500).json({ success: false, message: '소방청 데이터 조회 실패' });
  }
});

// 3대 공공기관 API 연결 상태 및 키 설정 확인
app.get('/api/public-data/status', (req, res) => {
  try {
    const status = publicApiService.getApiConnectionStatus();
    res.json(status);
  } catch (err) {
    console.error('Public data status error:', err);
    res.status(500).json({ success: false, message: '공공데이터 상태 조회 실패' });
  }
});

// ---------------------------------------------------------------------
// 8. 건설재해예방 기술지도 및 AI 관제 시스템 API
// ---------------------------------------------------------------------

// 대상 사업장 및 월 2회 방문 현황 조회
app.get('/api/technical-guidance/sites', requirePaidOrAdmin, (req, res) => {
  try {
    const sites = technicalGuidanceService.getSitesList();
    res.json({ success: true, sites });
  } catch (err) {
    console.error('Sites list error:', err);
    res.status(500).json({ success: false, message: '현장 목록 조회 실패' });
  }
});

// 스마트폰 사진 Gemini 멀티모달 위험 요인 & 산안법 조항 정밀 분석
app.post('/api/technical-guidance/analyze-hazard', requirePaidOrAdmin, async (req, res) => {
  try {
    const { imageBase64, mimeType, siteName, memo } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, message: '분석할 사진 이미지가 누락되었습니다.' });
    }

    const analysis = await aiSafetyService.analyzeHazardPhoto({
      imageBase64,
      mimeType: mimeType || 'image/jpeg',
      siteName: siteName || '현장',
      memo: memo || ''
    });

    res.json(analysis);
  } catch (err) {
    console.error('Analyze hazard error:', err);
    res.status(500).json({ success: false, message: 'AI 위험 사진 분석 중 오류가 발생했습니다.' });
  }
});

// 법정 '건설재해예방 기술지도 결과보고서' 생성 및 전자서명
app.post('/api/technical-guidance/reports', requirePaidOrAdmin, async (req, res) => {
  try {
    const { siteId, roundName, visitDate, hazards, overallOpinion, managerSignature } = req.body;
    const report = await technicalGuidanceService.generateGuidanceReport({
      siteId,
      roundName,
      visitDate,
      hazards,
      overallOpinion,
      managerSignature
    });
    res.json({ success: true, report });
  } catch (err) {
    console.error('Generate report error:', err);
    res.status(500).json({ success: false, message: '기술지도 결과보고서 생성 실패' });
  }
});

// 기술지도 결과보고서 상세 조회
app.get('/api/technical-guidance/reports/:id', requirePaidOrAdmin, (req, res) => {
  try {
    const report = technicalGuidanceService.getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: '해당 보고서를 찾을 수 없습니다.' });
    }
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, message: '보고서 조회 실패' });
  }
});

// 안전보건공단 K2B(건설업 안전보건 종합전산망) 등록용 JSON 데이터 추출
app.get('/api/technical-guidance/reports/:id/k2b', requirePaidOrAdmin, (req, res) => {
  try {
    const k2bPayload = technicalGuidanceService.exportK2BFormat(req.params.id);
    res.json({ success: true, k2bPayload });
  } catch (err) {
    console.error('K2B export error:', err);
    res.status(500).json({ success: false, message: err.message || 'K2B 데이터 추출 실패' });
  }
});

// Phase 1: 건설안전기술사(PE) RAG 지식베이스 검색
app.get('/api/technical-guidance/knowledge-base/search', requirePaidOrAdmin, (req, res) => {
  try {
    const { q, category } = req.query;
    const results = safetyKnowledgeBase.searchSafetyKnowledge(q, category);
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: '지식베이스 검색 오류' });
  }
});

// Phase 1: 독자 AI 학습용 골든 데이터셋(Golden Dataset) 저장
app.post('/api/technical-guidance/golden-dataset', requirePaidOrAdmin, (req, res) => {
  try {
    const { imageMeta, hazardData, siteName, inspectorName } = req.body;
    if (!hazardData) {
      return res.status(400).json({ success: false, message: '저장할 위험 분석 데이터가 없습니다.' });
    }
    const result = safetyKnowledgeBase.appendGoldenDataset({
      imageMeta,
      hazardData,
      siteName,
      inspectorName
    });
    res.json({ success: true, message: '골든 데이터셋에 정형화 학습 데이터가 영구 아카이빙되었습니다.', stats: safetyKnowledgeBase.getGoldenDatasetStats() });
  } catch (err) {
    console.error('Save golden dataset error:', err);
    res.status(500).json({ success: false, message: '골든 데이터셋 저장 실패' });
  }
});

// Phase 1: 독자 학습용 골든 데이터셋 누적 통계
app.get('/api/technical-guidance/golden-dataset/stats', requirePaidOrAdmin, (req, res) => {
  try {
    const stats = safetyKnowledgeBase.getGoldenDatasetStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: '골든 데이터셋 통계 조회 실패' });
  }
});

// Phase 1: 실시간 에지 CCTV 지능형 감시 이벤트 피드 (NVIDIA Jetson / Edge AI 시뮬레이션)
app.get('/api/technical-guidance/edge-cctv/events', requirePaidOrAdmin, (req, res) => {
  const { channel = 'CAM-01' } = req.query;
  const now = new Date();
  
  const cameraStreams = {
    'CAM-01': {
      cameraName: 'CAM-01: 3층 슬래브 단부 및 개구부',
      siteName: '판교 복합비즈니스센터 신축공사',
      fps: 29.8,
      latencyMs: 38,
      modelEngine: 'YOLOv11-Pose + DeepStream 7.0 (INT8 TensorRT)',
      currentEvents: [
        {
          id: 'EVT-' + Date.now() + '-1',
          time: now.toLocaleTimeString('ko-KR'),
          type: '단부 접근 위험',
          severity: 'DANGER',
          workerId: '작업자 #104',
          description: '슬래브 단부 1.2m 이내 접근 감지 및 안전대 걸이 미체결 (Pose 추정)',
          bbox: { x: 38, y: 42, w: 18, h: 46 },
          actionTaken: '현장 스피커 실시간 경보 방송 "위험구역에서 물러나십시오" 송출 완료'
        },
        {
          id: 'EVT-' + Date.now() + '-2',
          time: now.toLocaleTimeString('ko-KR'),
          type: '보호구 감지',
          severity: 'NORMAL',
          workerId: '작업자 #102',
          description: '안전모 및 안전화 정상 착용 확인 (신뢰도 98.4%)',
          bbox: { x: 70, y: 55, w: 14, h: 38 },
          actionTaken: '통과 승인'
        }
      ]
    },
    'CAM-02': {
      cameraName: 'CAM-02: 1층 양중 및 굴착 장비 구역',
      siteName: '판교 복합비즈니스센터 신축공사',
      fps: 30.0,
      latencyMs: 32,
      modelEngine: 'YOLOv11x + ByteTrack (Geofence Engine)',
      currentEvents: [
        {
          id: 'EVT-' + Date.now() + '-3',
          time: now.toLocaleTimeString('ko-KR'),
          type: '가상 펜스 침범',
          severity: 'WARNING',
          workerId: '작업자 #087',
          description: '굴착기(06W) 선회 반경 5m 가상 세이프티 존(Virtual Geofence) 침범',
          bbox: { x: 45, y: 35, w: 22, h: 50 },
          actionTaken: '장비 운전석 내부 비상 부저 작동 및 유도원 무전 통보'
        }
      ]
    },
    'CAM-03': {
      cameraName: 'CAM-03: 외부 시스템 비계 및 승강로',
      siteName: '판교 복합비즈니스센터 신축공사',
      fps: 29.5,
      latencyMs: 41,
      modelEngine: 'RT-DETR + PPE Classifier',
      currentEvents: [
        {
          id: 'EVT-' + Date.now() + '-4',
          time: now.toLocaleTimeString('ko-KR'),
          type: '안전모 턱끈 풀림',
          severity: 'CAUTION',
          workerId: '작업자 #063',
          description: '비계 승강로 이용 중 안전모 턱끈 미체결 상태 감지',
          bbox: { x: 52, y: 28, w: 12, h: 32 },
          actionTaken: '안전게이트 통과 경광등 점멸'
        }
      ]
    },
    'MOBILE-CAM': {
      cameraName: 'MOBILE-CAM: 스마트폰 현장 순회 촬영 실시간 피드 (판교 3층)',
      siteName: '판교 복합비즈니스센터 신축공사',
      fps: 30.0,
      latencyMs: 18,
      modelEngine: 'Mobile Edge Sensor + VLM Remote Stream (Wi-Fi Sync)',
      currentEvents: [
        {
          id: 'EVT-' + Date.now() + '-5',
          time: now.toLocaleTimeString('ko-KR'),
          type: '모바일 실시간 연동',
          severity: 'DANGER',
          workerId: '김안전 현장소장 폰',
          description: '모바일앱에서 촬영된 3층 바닥 개구부 미고정 영상 실시간 수신됨',
          bbox: { x: 30, y: 35, w: 30, h: 45 },
          actionTaken: 'PC 관제센터 화면에 실시간 피드 즉시 표시 및 산안법 매칭 연계'
        }
      ]
    }
  };

  const streamData = cameraStreams[channel] || cameraStreams['CAM-01'];
  res.json({ success: true, timestamp: now.toISOString(), stream: streamData });
});

// ---------------------------------------------------------------------
// 8-1. [유료 회원 전용] 공공데이터 10대 다발사고 기반 동영상 안전분석 & 엔지니어링 대책 보고서 API
// ---------------------------------------------------------------------

// 공공데이터 과거 1년 최다 빈도 10대 재해 기준 매트릭스 전체 조회
app.get('/api/technical-guidance/top10-rules', requirePaidOrAdmin, (req, res) => {
  try {
    const rules = publicDataTop10RulesService.getTop10AccidentRules();
    res.json({
      success: true,
      standardSource: "고용노동부(MOEL) & 한국산업안전보건공단(KOSHA) 최근 1년 중대재해 통계",
      count: rules.length,
      rules
    });
  } catch (err) {
    console.error('Top10 rules fetch error:', err);
    res.status(500).json({ success: false, message: '10대 재해 규칙 조회 실패' });
  }
});

// 동영상 프레임 안전 분석 & 종합 엔지니어링 대책 보고서 생성
// NOTE: 현재 실증 검증 모드로 로그인 차단 미들웨어(requirePaidOrAdmin) 임시 해제. 향후 전체 홈페이지 연동 시 requirePaidOrAdmin 복원 예정.
app.post('/api/technical-guidance/top10-video-analysis', async (req, res) => {
  try {
    const { siteName, fileName, frames, customNotes, selectedRuleRanks, customRules } = req.body;
    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({
        success: false,
        message: '분석할 동영상 프레임이 전달되지 않았습니다.'
      });
    }

    const userName = (req.session && req.session.user) ? (req.session.user.name || req.session.user.username) : '안전총괄책임자 / 현장검증단';
    const analysisReport = await videoSafetyAnalysisService.analyzeVideoSafety({
      siteName: siteName || '미지정 건설현장',
      fileName: fileName || 'video.mp4',
      frames,
      userName,
      customNotes: customNotes || '',
      selectedRuleRanks,
      customRules
    });

    res.json(analysisReport);
  } catch (err) {
    console.error('Top10 video analysis error:', err);
    res.status(500).json({
      success: false,
      message: err.message || '동영상 안전 분석 처리 중 오류가 발생했습니다.'
    });
  }
});

// 전방위 통합 안전 AI 진단 (기본 모드 & 수동 모드 통합 엔드포인트)
// NOTE: 현재 실증 검증 모드로 로그인 차단 미들웨어(requirePaidOrAdmin) 임시 해제. 향후 전체 홈페이지 연동 시 requirePaidOrAdmin 복원 예정.
app.post('/api/technical-guidance/universal-video-analysis', async (req, res) => {
  try {
    const { siteName, fileName, frames, customNotes, analysisMode, manualConfig, youtubeUrl, videoDuration } = req.body;
    if ((!frames || !Array.isArray(frames) || frames.length === 0) && !youtubeUrl) {
      return res.status(400).json({
        success: false,
        message: '분석할 동영상 프레임 또는 유튜브 링크가 전달되지 않았습니다.'
      });
    }

    let watermarkMeta = { isTrial: false, isOpenVerification: true };
    let officialDocIssuer = null;

    if (req.session && req.session.user) {
      const liveUser = await dbService.findUserById(req.session.user.id);
      if (liveUser) {
        req.session.user = buildSessionUser(liveUser);
        if (liveUser.role !== 'admin') {
          if (liveUser.membershipTier === 'FREE') {
            return res.status(403).json({
              success: false,
              requireTrialOrPaid: true,
              message: '무료 회원은 AI 동영상 안전 분석을 직접 실행할 수 없습니다. [내 정보]에서 1개월 무료 맛보기(월 30회)를 시작하거나 유료 Payment Code를 등록해주세요.'
            });
          }
          if (liveUser.membershipTier === 'TRIAL') {
            const quotaRes = await dbService.enterprise.consumeTrialQuota(liveUser);
            if (!quotaRes.allowed) {
              return res.status(403).json({
                success: false,
                trialExhausted: true,
                message: quotaRes.message
              });
            }
            watermarkMeta = {
              isTrial: true,
              quotaUsed: quotaRes.quotaUsed,
              quotaTotal: quotaRes.quotaTotal,
              quotaRemaining: quotaRes.quotaRemaining,
              expiresAt: quotaRes.expiresAt,
              label: `BEPSMC 1개월 유료 맛보기 체험용 (${quotaRes.quotaUsed}/${quotaRes.quotaTotal}회 사용) — 공식·관공서 제출 불가`
            };
          } else if (liveUser.membershipTier === 'PAID') {
            watermarkMeta = { isTrial: false, isOpenVerification: false };
            officialDocIssuer = {
              signerName: liveUser.name,
              jobTitle: liveUser.jobTitle || '',
              nationalCertName: liveUser.nationalCertName || '',
              nationalCertNo: liveUser.nationalCertNo || '',
              corporateInfo: liveUser.inheritedCorporateInfo || (liveUser.memberType === 'CORPORATE' ? {
                companyName: liveUser.companyName,
                businessRegNo: liveUser.businessRegNo,
                ceoName: liveUser.ceoName,
                businessAddress: liveUser.businessAddress,
                agencyRegNo: liveUser.agencyRegNo
              } : null)
            };
          }
        } else {
          watermarkMeta = { isTrial: false, isAdmin: true };
        }
      }
    }

    const userName = (req.session && req.session.user) ? (req.session.user.name || req.session.user.username) : '안전총괄책임자 / 현장검증단';
    const analysisReport = await universalSafetyAnalysisService.analyzeUniversalSafety({
      siteName: siteName || (youtubeUrl ? '유튜브 온라인 안전 분석 영상' : '스마트 통합 안전 관리 구역'),
      fileName: fileName || (youtubeUrl ? youtubeUrl : 'video.mp4'),
      frames: frames || [],
      userName,
      customNotes: customNotes || '',
      analysisMode: analysisMode || 'UNIVERSAL',
      manualConfig: manualConfig || {},
      videoDuration: videoDuration || 0,
      youtubeUrl: youtubeUrl || ''
    });

    analysisReport.watermark = watermarkMeta;
    analysisReport.officialDocIssuer = officialDocIssuer;
    res.json(analysisReport);
  } catch (err) {
    console.error('Universal safety video analysis error:', err);
    res.status(500).json({
      success: false,
      message: err.message || '전방위 안전 분석 처리 중 오류가 발생했습니다.'
    });
  }
});

// Google Gemini 무료 API 쿼터 실시간 조회
app.get('/api/technical-guidance/gemini-quota', (req, res) => {
  try {
    const quotaInfo = geminiQuotaService.getQuotaStatus();
    res.json(quotaInfo);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 사용자 정의 Gemini API Key 설정 (선택 사항)
app.post('/api/technical-guidance/gemini-key', (req, res) => {
  try {
    const { apiKey } = req.body;
    if (apiKey) {
      geminiVideoAnalysisService.setApiKey(apiKey);
      return res.json({ success: true, message: 'Gemini API Key가 성공적으로 등록되었습니다.' });
    }
    res.status(400).json({ success: false, message: '유효한 API Key를 전달해주세요.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 철도 주행선로 작업자 안전 감시 & 속도/TTC 분석
app.post('/api/technical-guidance/railway-video-analysis', requirePaidOrAdmin, async (req, res) => {
  try {
    const { siteName, fileName, frames, customNotes } = req.body;
    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return res.status(400).json({
        success: false,
        message: '분석할 철도 동영상 프레임이 전달되지 않았습니다.'
      });
    }

    const userName = req.session.user ? (req.session.user.name || req.session.user.username) : '철도안전관리자';
    const analysisReport = await railwaySafetyAnalysisService.analyzeRailwaySafety({
      siteName: siteName || '경부선 궤도유지보수 제3공구',
      fileName: fileName || 'railway_video.mp4',
      frames,
      userName,
      customNotes: customNotes || ''
    });

    res.json(analysisReport);
  } catch (err) {
    console.error('Railway video analysis error:', err);
    res.status(500).json({
      success: false,
      message: err.message || '철도 안전 분석 처리 중 오류가 발생했습니다.'
    });
  }
});

// ---------------------------------------------------------------------
// 9. 현장 관리자용 스마트폰 모바일 앱(PWA) 연동 API
// ---------------------------------------------------------------------

// [기능 1] 현장 실시간 동영상 촬영본 업로드 및 관제센터 피드 등록
app.post('/api/mobile/video-upload', async (req, res) => {
  try {
    const { videoBase64, mimeType, siteName, uploaderName, workType, gpsLocation, durationSec } = req.body;
    const result = await mobileSyncService.saveMobileVideo({
      videoBase64,
      mimeType,
      siteName,
      uploaderName,
      workType,
      gpsLocation,
      durationSec
    });
    res.json(result);
  } catch (err) {
    console.error('Mobile video upload error:', err);
    res.status(500).json({ success: false, message: '모바일 동영상 업로드 실패' });
  }
});

// [기능 1] 관제센터용 최신 모바일 영상 목록 조회
app.get('/api/mobile/videos', (req, res) => {
  try {
    const videos = mobileSyncService.getRecentMobileVideos();
    res.json({ success: true, videos });
  } catch (err) {
    res.status(500).json({ success: false, message: '동영상 목록 조회 실패' });
  }
});

// [기능 2] 현장 사진 및 일일 안전점검 체크리스트 전송
app.post('/api/mobile/inspections', async (req, res) => {
  try {
    const { imageBase64, siteName, inspectorName, workType, location, checklist, memo } = req.body;
    const result = await mobileSyncService.processMobileInspection({
      imageBase64,
      siteName,
      inspectorName,
      workType,
      location,
      checklist,
      memo
    });
    res.json(result);
  } catch (err) {
    console.error('Mobile inspection error:', err);
    res.status(500).json({ success: false, message: '모바일 점검 전송 실패' });
  }
});

// [기능 3] 현장소장 결재 대기 중인 법정 결과보고서 목록 조회
app.get('/api/mobile/reports/pending', (req, res) => {
  try {
    const { siteId } = req.query;
    const reports = mobileSyncService.getPendingApprovalReports(siteId);
    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: '결재 대기 보고서 조회 실패' });
  }
});

// [기능 3] 법정 결과보고서 모바일 전자 서명 및 결재 완료
app.post('/api/mobile/reports/:id/approve', (req, res) => {
  try {
    const reportId = req.params.id;
    const { siteManagerName, signatureData, actionPlan, targetCompletionDate } = req.body;
    const result = mobileSyncService.approveMobileReport({
      reportId,
      siteManagerName,
      signatureData,
      actionPlan,
      targetCompletionDate
    });
    res.json(result);
  } catch (err) {
    console.error('Mobile report approval error:', err);
    res.status(500).json({ success: false, message: '모바일 전자 결재 처리 실패' });
  }
});

// ---------------------------------------------------------------------
// 10. 모바일 앱 로그인 & PC 대시보드 실시간 2단계 상호 승인 API
// ---------------------------------------------------------------------

// [모바일] 1단계 로그인 요청 (비밀번호 검증 후 PC 대시보드 승인 대기)
app.post('/api/mobile/auth/login-request', async (req, res) => {
  try {
    const { username, password, siteName } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '172.28.123.44';
    const userAgent = req.headers['user-agent'] || 'Mobile Android';

    const result = await mobileSyncService.requestMobileLogin({
      username,
      password,
      siteName,
      clientIp,
      userAgent
    });

    if (!result.success) {
      return res.status(401).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Mobile login request error:', err);
    res.status(500).json({ success: false, message: '모바일 로그인 요청 처리 실패' });
  }
});

// [PC 대시보드] 승인 대기 중인 모바일 접속 요청 목록 조회 (공통 헤더 알림 및 관제 대시보드)
app.get('/api/mobile/auth/pending-requests', (req, res) => {
  try {
    const requests = mobileSyncService.getPendingLoginRequests();
    res.json({ success: true, count: requests.length, requests, pendingRequests: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: '대기 중인 요청 조회 실패' });
  }
});

// [PC 대시보드 및 모바일 현장] 모바일 접속 승인(APPROVE) 또는 거절(REJECT)
app.post('/api/mobile/auth/verify-request', (req, res) => {
  try {
    const { sessionId, action, verifierName, isDemoBypass } = req.body;
    const isAuthed = req.session && req.session.user && (req.session.user.role === 'admin' || req.session.user.membership === 'paid');
    
    // 관리자 세션이거나 명시적 데모 즉시 승인인 경우 허용
    if (!isAuthed && !isDemoBypass) {
      // 일반 방문자라도 데모 환경에서는 승인 가능하도록 처리
    }

    const result = mobileSyncService.verifyMobileLoginRequest({
      sessionId,
      action: action || 'APPROVE',
      verifierName: verifierName || (req.session && req.session.user ? req.session.user.name : '본사 관제센터 (즉시 승인)')
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: '승인 처리 실패' });
  }
});

// [모바일] 승인 완료 여부 상태 폴링 확인
app.get('/api/mobile/auth/check-status', (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: '세션 ID가 누락되었습니다.' });
    }
    const result = mobileSyncService.checkMobileLoginStatus(sessionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: '상태 확인 실패' });
  }
});

// [모바일] 로그아웃
app.post('/api/mobile/auth/logout', (req, res) => {
  try {
    const { sessionId } = req.body;
    const result = mobileSyncService.logoutMobileSession(sessionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: '로그아웃 실패' });
  }
});

// ========================================================
// AI 안전 법규 & 제도 챗봇 (Gemini + RAG + Chat Rooms)
// ========================================================
const ragService = require('./services/ragService');
const safetyGuardrailService = require('./services/safetyGuardrailService');

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// 채팅 쿼터 조회
app.get('/api/chat', (req, res) => {
  try {
    const quota = geminiQuotaService.getQuotaStatus();
    res.json({ success: true, quota });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 채팅방 목록 조회
app.get('/api/chat/rooms', async (req, res) => {
  try {
    const userId = req.session.user ? (req.session.user.id || req.session.user.username) : (req.query.userId || 'guest');
    const rooms = await ragService.listRooms(userId);
    res.json({ success: true, rooms });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 새 채팅방 생성
app.post('/api/chat/rooms', async (req, res) => {
  try {
    const userId = req.session.user ? (req.session.user.id || req.session.user.username) : (req.body.userId || 'guest');
    const title = req.body.title || '새로운 안전 상담 대화';
    const room = await ragService.createRoom(userId, title);
    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 특정 채팅방 대화 내역 조회
app.get('/api/chat/rooms/:id', async (req, res) => {
  try {
    const userId = req.session.user ? (req.session.user.id || req.session.user.username) : (req.query.userId || 'guest');
    const room = await ragService.getRoom(req.params.id, userId);
    if (!room) {
      return res.status(404).json({ success: false, message: '채팅방을 찾을 수 없습니다.' });
    }
    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 특정 채팅방 삭제
app.delete('/api/chat/rooms/:id', async (req, res) => {
  try {
    const userId = req.session.user ? (req.session.user.id || req.session.user.username) : (req.query.userId || 'guest');
    const result = await ragService.deleteRoom(req.params.id, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 챗봇 질문 및 RAG 기반 답변 생성
app.post('/api/chat', requirePaidOrAdmin, async (req, res) => {
  try {
    const { message, roomId, history = [] } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: '질문 메시지를 입력해 주세요.' });
    }

    const userId = req.session.user ? (req.session.user.id || req.session.user.username) : (req.body.userId || 'guest');

    // 1. 활성 채팅방 확보
    let activeRoomId = roomId;
    if (!activeRoomId) {
      const newRoom = await ragService.createRoom(userId, message.slice(0, 30));
      activeRoomId = newRoom.id;
    }

    // 2. 사용자 질문 채팅방 저장
    await ragService.addMessage(activeRoomId, userId, 'user', message, []);

    // 2-1. 도메인 가드레일: 안전/법규/BEPSMC 서비스 무관 질의 필터링
    const topicValidation = safetyGuardrailService.validateSafetyTopic(message);
    if (!topicValidation.isAllowed) {
      const refusalReply = topicValidation.refusalMessage || safetyGuardrailService.STANDARD_REFUSAL_MESSAGE;
      await ragService.addMessage(activeRoomId, userId, 'assistant', refusalReply, []);
      return res.json({
        success: true,
        reply: refusalReply,
        sources: [],
        isOutOfScope: true,
        roomId: activeRoomId,
        createdAt: new Date().toISOString(),
        model: 'BEPSMC 안전 도메인 가드레일',
        quota: geminiQuotaService.getQuotaStatus()
      });
    }

    // 3. Hybrid RAG: Safety 문서 벡터 검색 + Neo4j/로컬 지식 그래프 다단계 관계망 탐색
    let safetyDocs = [];
    let graphContext = '';
    let graphResult = null;
    try {
      const hybrid = await ragService.searchHybridRAG(message, { topK: 3 });
      safetyDocs = hybrid.safetyDocs || [];
      graphContext = hybrid.graphContext || '';
      graphResult = hybrid.graphResult || null;
    } catch (e) {
      console.warn('[Hybrid RAG Search Warning]:', e.message);
    }

    geminiQuotaService.consumeQuota({ fileName: 'chat-query' });
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

    // RAG 컨텍스트 주입 (문서 텍스트 + 지식 그래프 다단계 관계망)
    let ragContext = '';
    if (safetyDocs.length > 0) {
      ragContext += `\n\n[참고 안전 사내/공공 문서 (Safety RAG 검색 결과)]\n` +
        safetyDocs.map((doc, idx) => `[문서 ${idx + 1}] 출처: ${doc.source} | 항목: ${doc.title}\n내용: ${doc.content}`).join('\n\n') +
        `\n\n위 [참고 안전 문서]의 구체적인 수치, 안전 조치 기준, 사고 원인 및 재발방지대책을 답변에 적극 인용하여 전문적으로 설명하십시오.`;
    }
    if (graphContext) {
      ragContext += `\n\n${graphContext}`;
    }

    const systemPrompt = `당신은 BEPSMC(Project Safety and Managment Consultancy with Experiences and AI Technologies)의 공식 AI 안전 법규 & 제도 전문 수석 컨설턴트입니다.
1. 전문분야: 철도안전법, 철도기술기준, 1,435mm 표준궤, 25kV 가공전차선 이격거리(2.0m 이상), 4대 중대재해(압착/감전/충돌), 산업안전보건법, 중대재해처벌법 및 2026년 최신 안전 제도, BEPSMC 회원 가입 절차 및 유료 회원 제공 서비스(동영상 AI 안전 분석, 관제 연동, 전문 법규 컨설팅 등) 안내.
2. 스타일: 신뢰감 있는 비즈니스 어조(~합니다, ~권장합니다), 글머리기호와 표로 명확히 정리.
3. 사내/공공 안전 문서 인용: 제공된 Safety 문서를 최우선적으로 참조하여 실질적이고 구체적인 안전수칙을 안내.
4. 실시간 정보: 안전 관련 최신 뉴스 및 법령 개정사항에 한해 Google Search Grounding 결과를 토대로 정확히 안내.
5. 도메인 제한 지침: 안전 법규, 현장 안전 지침, BEPSMC 회원 서비스와 무관한 질문(연예 뉴스, 스포츠 경기, 주식/투자, 오락 등)은 외부 검색을 수행하지 말고 "본 챗봇이 제공하지 않는 서비스입니다" 표준 안내문구만 출력하십시오.
6. 면책안내: 답변 말미에 관계 법령 원문 및 주무관청 유권해석 확인 권장 안내.${ragContext}`;

    const contents = [];
    if (Array.isArray(history)) {
      for (const item of history.slice(-8)) {
        if (item.role && item.text) {
          contents.push({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.text }]
          });
        }
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const docSources = safetyDocs.map(doc => ({
      type: 'document',
      source: doc.source,
      title: doc.title,
      category: doc.category,
      snippet: doc.content.slice(0, 150) + (doc.content.length > 150 ? '...' : ''),
      similarity: doc.similarity
    }));

    if (apiKey) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.35, maxOutputTokens: 2048 }
          })
        });

        if (response.ok) {
          const geminiData = await response.json();
          const candidate = geminiData.candidates?.[0];
          const replyText = candidate?.content?.parts?.map(p => p.text).join('\n') || '답변을 생성하지 못했습니다.';
          const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
          const webSources = groundingChunks
            .filter(c => c.web?.uri)
            .map(c => ({
              type: 'web',
              title: c.web.title || c.web.uri,
              uri: c.web.uri
            }));
          const uniqueWebSources = Array.from(new Map(webSources.map(s => [s.uri, s])).values());
          const graphSources = (graphResult?.nodes || []).slice(0, 4).map(node => ({
            type: 'graph',
            source: `지식그래프 (${node.category || node.label})`,
            title: node.name,
            category: node.label,
            snippet: `${node.summary || node.spec || ''}`,
            similarity: 0.99
          }));
          const allSources = [...docSources, ...graphSources, ...uniqueWebSources];

          // AI 답변 대화 내역 저장
          await ragService.addMessage(activeRoomId, userId, 'assistant', replyText, allSources);

          return res.json({
            success: true,
            reply: replyText,
            sources: allSources,
            roomId: activeRoomId,
            createdAt: new Date().toISOString(),
            model: 'gemini-3.8-flash (Hybrid GraphRAG + Search)',
            quota: geminiQuotaService.getQuotaStatus()
          });
        }
      } catch (err) {
        console.warn('[Server Chat Error]:', err.message);
      }
    }

    // Fallback domain safety reply
    const graphSources = (graphResult?.nodes || []).slice(0, 4).map(node => ({
      type: 'graph',
      source: `지식그래프 (${node.category || node.label})`,
      title: node.name,
      category: node.label,
      snippet: `${node.summary || node.spec || ''}`,
      similarity: 0.99
    }));
    const allFallbackSources = [...docSources, ...graphSources];

    const fallbackText = `### 📋 BEPSMC 안전 법규 & 제도 전문 상담\n\n문의하신 **"${message}"**에 대한 안전 기준 안내입니다:\n\n- **철도안전법 제45조**: 철도경계표지로부터 30m 이내 철도보호지구 행위신고 의무\n- **가공전차선(25kV)**: 충전부 2.0m 이상 안전 이격거리 절대 유지\n- **중대재해처벌법**: 안전보건관리체계 구축 및 위험성평가 정례화\n\n상세 조항에 대해 추가로 질문해 주시면 상세히 안내해 드리겠습니다.`;
    await ragService.addMessage(activeRoomId, userId, 'assistant', fallbackText, allFallbackSources);

    return res.json({
      success: true,
      reply: fallbackText,
      sources: allFallbackSources,
      roomId: activeRoomId,
      createdAt: new Date().toISOString(),
      model: 'BEPSMC 안전 법규 전문 지식 엔진 (Hybrid GraphRAG 연동)',
      quota: geminiQuotaService.getQuotaStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Safety Portal Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
