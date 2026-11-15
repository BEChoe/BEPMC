/**
 * data/enterpriseMemberService.js
 * BEPSMC 법인·개인 통합 회원 관리, 4단계 등급(GUEST/FREE/TRIAL/PAID),
 * 탈퇴자 ID 영구 차단, 1개월(월30회) 맛보기, Payment Code 월별 정산 및 전자서명/직인 결재 저장 계층
 */

const { supabase, isSupabaseConfigured } = require('./supabaseClient');
const localStore = require('./store');
const sec = require('../services/memberSecurityService');

function isMissingSchemaError(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  const code = String(err.code || '');
  return code === '42703' || code === '42P01' || code === 'PGRST204' || msg.includes('column') || msg.includes('relation');
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getNextId(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 1;
  return Math.max(...arr.map(x => Number(x.id) || 0)) + 1;
}

/**
 * 확장 메타데이터 로컬 캐시(Supabase 스키마 마이그레이션 전/후 모두 무중단 지원)
 */
function getMetaForUsername(username) {
  if (!username) return {};
  const db = localStore.getDb();
  const key = String(username).trim().toLowerCase();
  return (db.userExtendedMeta && db.userExtendedMeta[key]) || {};
}

function saveMetaForUsername(username, patch) {
  if (!username) return;
  const db = localStore.getDb();
  const key = String(username).trim().toLowerCase();
  db.userExtendedMeta = db.userExtendedMeta || {};
  db.userExtendedMeta[key] = {
    ...(db.userExtendedMeta[key] || {}),
    ...patch
  };
  localStore.saveDb(db);
}

/**
 * 구독 조회 (ID 또는 Payment Code)
 */
async function getSubscriptionById(subId) {
  if (!subId) return null;
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('payment_subscriptions')
        .select('*')
        .eq('id', subId)
        .single();
      if (!error && data) return normalizeSubFromDb(data);
    } catch (e) {}
  }
  const db = localStore.getDb();
  return (db.paymentSubscriptions || []).find(s => Number(s.id) === Number(subId)) || null;
}

async function findSubscriptionByCode(paymentCode) {
  const code = String(paymentCode || '').trim().toUpperCase();
  if (!code) return null;

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('payment_subscriptions')
        .select('*')
        .eq('payment_code', code)
        .single();
      if (!error && data) return normalizeSubFromDb(data);
    } catch (e) {}
  }

  const db = localStore.getDb();
  return (db.paymentSubscriptions || []).find(s => String(s.paymentCode || '').toUpperCase() === code) || null;
}

function normalizeSubFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    paymentCode: row.payment_code || row.paymentCode,
    ownerType: row.owner_type || row.ownerType || 'CORPORATE',
    ownerUserId: row.owner_user_id || row.ownerUserId,
    companyName: row.company_name || row.companyName || '',
    businessRegNo: row.business_reg_no || row.businessRegNo || '',
    ceoName: row.ceo_name || row.ceoName || '',
    businessAddress: row.business_address || row.businessAddress || '',
    agencyRegNo: row.agency_reg_no || row.agencyRegNo || '',
    planName: row.plan_name || row.planName || 'BEPSMC 유료 구독',
    maxSeats: Number(row.max_seats ?? row.maxSeats ?? 10),
    monthlyFee: Number(row.monthly_fee ?? row.monthlyFee ?? 0),
    billingStatus: row.billing_status || row.billingStatus || 'PENDING_PAYMENT',
    currentPeriodStart: row.current_period_start || row.currentPeriodStart || null,
    currentPeriodEnd: row.current_period_end || row.currentPeriodEnd || null,
    lastPaidAt: row.last_paid_at || row.lastPaidAt || null,
    createdAt: row.created_at || row.createdAt || null
  };
}

function isSubscriptionCurrentlyValid(sub) {
  if (!sub) return false;
  if (sub.billingStatus !== 'ACTIVE') return false;
  if (sub.currentPeriodEnd && String(sub.currentPeriodEnd).slice(0, 10) < getTodayStr()) {
    return false;
  }
  return true;
}

/**
 * 사용자 Raw 객체 + Extended Meta 결합 + 실시간 4단계 등급 및 법인 공식문서 상속 계산
 */
async function hydrateUser(rawUser) {
  if (!rawUser) return null;
  const username = rawUser.username || rawUser.login_id;
  const meta = getMetaForUsername(username);

  const merged = {
    id: rawUser.id,
    username,
    name: rawUser.name,
    email: rawUser.email || meta.email || '',
    password: rawUser.password,
    role: rawUser.role || 'member',
    status: rawUser.status || 'pending',
    createdAt: rawUser.created_at || rawUser.createdAt || '',

    memberType: rawUser.member_type || rawUser.memberType || meta.memberType || 'INDIVIDUAL',
    membershipTier: rawUser.membership_tier || rawUser.membershipTier || meta.membershipTier || (rawUser.role === 'paid_member' || rawUser.role === 'admin' ? 'PAID' : 'FREE'),
    phone: rawUser.phone || meta.phone || '',
    emailVerified: Boolean(rawUser.email_verified ?? rawUser.emailVerified ?? meta.emailVerified ?? false),
    emailVerifiedAt: rawUser.email_verified_at || rawUser.emailVerifiedAt || meta.emailVerifiedAt || null,
    failedLoginAttempts: Number(rawUser.failed_login_attempts ?? rawUser.failedLoginAttempts ?? meta.failedLoginAttempts ?? 0),
    lockedUntil: rawUser.locked_until || rawUser.lockedUntil || meta.lockedUntil || null,

    // 1개월 유료 맛보기 (월 30회)
    trialStatus: rawUser.trial_status || rawUser.trialStatus || meta.trialStatus || 'NOT_STARTED',
    trialStartedAt: rawUser.trial_started_at || rawUser.trialStartedAt || meta.trialStartedAt || null,
    trialExpiresAt: rawUser.trial_expires_at || rawUser.trialExpiresAt || meta.trialExpiresAt || null,
    trialQuotaTotal: Number(rawUser.trial_quota_total ?? rawUser.trialQuotaTotal ?? meta.trialQuotaTotal ?? 30),
    trialQuotaUsed: Number(rawUser.trial_quota_used ?? rawUser.trialQuotaUsed ?? meta.trialQuotaUsed ?? 0),
    hasUsedTrial: Boolean(rawUser.has_used_trial ?? rawUser.hasUsedTrial ?? meta.hasUsedTrial ?? false),

    // 세무 & 공식문서 필수/선택 필드
    taxPayerType: rawUser.tax_payer_type || rawUser.taxPayerType || meta.taxPayerType || null,
    businessRegNo: rawUser.business_reg_no || rawUser.businessRegNo || meta.businessRegNo || '',
    subBusinessNo: rawUser.sub_business_no || rawUser.subBusinessNo || meta.subBusinessNo || '',
    companyName: rawUser.company_name || rawUser.companyName || meta.companyName || '',
    ceoName: rawUser.ceo_name || rawUser.ceoName || meta.ceoName || '',
    businessAddress: rawUser.business_address || rawUser.businessAddress || meta.businessAddress || '',
    businessType: rawUser.business_type || rawUser.businessType || meta.businessType || '',
    businessItem: rawUser.business_item || rawUser.businessItem || meta.businessItem || '',
    taxInvoiceEmail: rawUser.tax_invoice_email || rawUser.taxInvoiceEmail || meta.taxInvoiceEmail || '',
    cashReceiptType: rawUser.cash_receipt_type || rawUser.cashReceiptType || meta.cashReceiptType || 'NONE',
    cashReceiptNoEnc: rawUser.cash_receipt_no_enc || rawUser.cashReceiptNoEnc || meta.cashReceiptNoEnc || '',
    nationalCertName: rawUser.national_cert_name || rawUser.nationalCertName || meta.nationalCertName || '',
    nationalCertNo: rawUser.national_cert_no || rawUser.nationalCertNo || meta.nationalCertNo || '',
    agencyRegNo: rawUser.agency_reg_no || rawUser.agencyRegNo || meta.agencyRegNo || '',
    affiliationCompany: rawUser.affiliation_company || rawUser.affiliationCompany || meta.affiliationCompany || '',
    jobTitle: rawUser.job_title || rawUser.jobTitle || meta.jobTitle || '',
    officialDocAddress: rawUser.official_doc_address || rawUser.officialDocAddress || meta.officialDocAddress || '',

    // 결재용 비밀번호 & 전자서명/직인
    approvalPasswordHash: rawUser.approval_password_hash || rawUser.approvalPasswordHash || meta.approvalPasswordHash || null,
    approvalPasswordType: rawUser.approval_password_type || rawUser.approvalPasswordType || meta.approvalPasswordType || 'ALPHANUMERIC',
    approvalPasswordUpdatedAt: rawUser.approval_password_updated_at || rawUser.approvalPasswordUpdatedAt || meta.approvalPasswordUpdatedAt || null,
    approvalFailedAttempts: Number(rawUser.approval_failed_attempts ?? rawUser.approvalFailedAttempts ?? meta.approvalFailedAttempts ?? 0),
    approvalLockedUntil: rawUser.approval_locked_until || rawUser.approvalLockedUntil || meta.approvalLockedUntil || null,
    signatureImagePath: rawUser.signature_image_path || rawUser.signatureImagePath || meta.signatureImagePath || '',
    corporateSealPath: rawUser.corporate_seal_path || rawUser.corporateSealPath || meta.corporateSealPath || '',
    canUseCorporateSeal: Boolean(rawUser.can_use_corporate_seal ?? rawUser.canUseCorporateSeal ?? meta.canUseCorporateSeal ?? false),

    // 구독 & 선택 항목
    subscriptionId: rawUser.subscription_id || rawUser.subscriptionId || meta.subscriptionId || null,
    enteredPaymentCode: rawUser.entered_payment_code || rawUser.enteredPaymentCode || meta.enteredPaymentCode || '',
    paidProfileCompleted: Boolean(rawUser.paid_profile_completed ?? rawUser.paidProfileCompleted ?? meta.paidProfileCompleted ?? false),
    managerPhone: rawUser.manager_phone || rawUser.managerPhone || meta.managerPhone || '',
    primaryDomain: rawUser.primary_domain || rawUser.primaryDomain || meta.primaryDomain || 'UNIVERSAL',
    defaultSiteName: rawUser.default_site_name || rawUser.defaultSiteName || meta.defaultSiteName || '',
    marketingAgreed: Boolean(rawUser.marketing_agreed ?? rawUser.marketingAgreed ?? meta.marketingAgreed ?? false),
    withdrawnAt: rawUser.withdrawn_at || rawUser.withdrawnAt || meta.withdrawnAt || null
  };

  // 실시간 구독 및 1개월 유료 맛보기 유효성 판정
  let subscriptionInfo = null;
  let inheritedCorporateInfo = null;
  let effectiveTier = merged.membershipTier;

  if (merged.role === 'admin') {
    effectiveTier = 'PAID';
  } else if (merged.subscriptionId) {
    const sub = await getSubscriptionById(merged.subscriptionId);
    if (sub) {
      const valid = isSubscriptionCurrentlyValid(sub);
      subscriptionInfo = {
        id: sub.id,
        paymentCode: sub.paymentCode,
        ownerType: sub.ownerType,
        isOwner: Number(sub.ownerUserId) === Number(merged.id),
        companyName: sub.companyName,
        planName: sub.planName,
        billingStatus: valid ? 'ACTIVE' : 'EXPIRED',
        currentPeriodEnd: sub.currentPeriodEnd
      };
      if (valid) {
        effectiveTier = 'PAID';
        // 법인 소속 개인 회원인 경우: 본인 명의 공식 문서 발행에 필요한 법인 정보만 선별 상속
        if (merged.memberType === 'INDIVIDUAL' && sub.ownerType === 'CORPORATE') {
          inheritedCorporateInfo = {
            companyName: sub.companyName,
            businessRegNo: sub.businessRegNo,
            ceoName: sub.ceoName,
            businessAddress: sub.businessAddress,
            agencyRegNo: sub.agencyRegNo
          };
        }
      } else if (merged.membershipTier === 'PAID') {
        effectiveTier = 'FREE';
      }
    }
  } else if (merged.role === 'paid_member') {
    // 레거시 관리자 수동 유료 승급 계정
    effectiveTier = 'PAID';
  }

  // 1개월 유료 맛보기(월 30회) 실시간 체크
  let trialInfo = {
    status: merged.trialStatus,
    startedAt: merged.trialStartedAt,
    expiresAt: merged.trialExpiresAt,
    quotaTotal: merged.trialQuotaTotal || 30,
    quotaUsed: merged.trialQuotaUsed || 0,
    quotaRemaining: Math.max(0, (merged.trialQuotaTotal || 30) - (merged.trialQuotaUsed || 0)),
    daysRemaining: 0,
    isActive: false
  };

  if (effectiveTier !== 'PAID' && merged.trialStatus === 'ACTIVE' && merged.trialExpiresAt) {
    const nowMs = Date.now();
    const expMs = new Date(merged.trialExpiresAt).getTime();
    if (nowMs <= expMs && merged.trialQuotaUsed < (merged.trialQuotaTotal || 30)) {
      effectiveTier = 'TRIAL';
      trialInfo.isActive = true;
      trialInfo.daysRemaining = Math.max(0, Math.ceil((expMs - nowMs) / (1000 * 60 * 60 * 24)));
    } else {
      effectiveTier = 'FREE';
      trialInfo.status = 'EXPIRED';
      trialInfo.isActive = false;
    }
  }

  merged.membershipTier = effectiveTier;
  merged.subscriptionInfo = subscriptionInfo;
  merged.inheritedCorporateInfo = inheritedCorporateInfo;
  merged.trialInfo = trialInfo;
  merged.hasApprovalPassword = Boolean(merged.approvalPasswordHash);

  return merged;
}

function toSafeUserDto(user) {
  if (!user) return null;
  const copy = { ...user };
  delete copy.password;
  delete copy.approvalPasswordHash;
  delete copy.cashReceiptNoEnc;
  return copy;
}

/**
 * 1. ID 중복 및 탈퇴자 ID 사용 차단 검사
 */
async function checkLoginIdAvailability(loginId) {
  const validation = sec.validateLoginId(loginId);
  if (!validation.isValid) {
    return {
      available: false,
      reason: 'INVALID_FORMAT',
      message: validation.errors[0]
    };
  }
  const lower = validation.normalized;

  // (A) Supabase reserved_login_ids 및 users 확인
  if (isSupabaseConfigured()) {
    try {
      const { data: uData } = await supabase
        .from('users')
        .select('id, username, status')
        .ilike('username', lower)
        .limit(1);
      if (uData && uData.length > 0) {
        const isWithdrawn = uData[0].status === 'withdrawn';
        return {
          available: false,
          reason: isWithdrawn ? 'WITHDRAWN_ID' : 'ALREADY_IN_USE',
          message: isWithdrawn
            ? '이미 탈퇴 처리된 아이디입니다. 보안 정책상 탈퇴자 아이디는 재사용할 수 없습니다.'
            : '이미 다른 회원이 사용 중인 아이디입니다.'
        };
      }

      const { data: rData, error: rErr } = await supabase
        .from('reserved_login_ids')
        .select('login_id_lower, reason')
        .eq('login_id_lower', lower)
        .limit(1);
      if (!rErr && rData && rData.length > 0) {
        const reason = rData[0].reason || 'WITHDRAWN';
        return {
          available: false,
          reason: reason === 'WITHDRAWN' ? 'WITHDRAWN_ID' : 'ALREADY_IN_USE',
          message: reason === 'WITHDRAWN'
            ? '이미 탈퇴 처리된 아이디입니다. 탈퇴한 회원의 아이디는 재사용이 불가능합니다.'
            : '이미 등록된 아이디입니다.'
        };
      }
    } catch (e) {}
  }

  // (B) 로컬 저장소 확인
  const db = localStore.getDb();
  const activeLocal = (db.users || []).find(u => String(u.username || '').toLowerCase() === lower);
  if (activeLocal) {
    const isWithdrawn = activeLocal.status === 'withdrawn';
    return {
      available: false,
      reason: isWithdrawn ? 'WITHDRAWN_ID' : 'ALREADY_IN_USE',
      message: isWithdrawn
        ? '이미 탈퇴 처리된 아이디입니다. 탈퇴한 회원의 아이디는 재사용이 불가능합니다.'
        : '이미 사용 중인 아이디입니다.'
    };
  }

  const reservedLocal = (db.reservedLoginIds || []).find(r => String(r.loginIdLower || '').toLowerCase() === lower);
  if (reservedLocal) {
    return {
      available: false,
      reason: reservedLocal.reason === 'WITHDRAWN' ? 'WITHDRAWN_ID' : 'ALREADY_IN_USE',
      message: reservedLocal.reason === 'WITHDRAWN'
        ? '탈퇴 처리된 회원의 아이디입니다. 다른 아이디를 선택해주세요.'
        : '이미 등록 이력이 있는 아이디입니다.'
    };
  }

  return {
    available: true,
    normalized: lower,
    reason: 'AVAILABLE',
    message: '사용 가능한 아이디입니다.'
  };
}

/**
 * reserved_login_ids 등록
 */
async function reserveLoginId(loginId, reason = 'ACTIVE', originalUserId = null) {
  const lower = String(loginId || '').trim().toLowerCase();
  if (!lower) return;

  if (isSupabaseConfigured()) {
    try {
      await supabase
        .from('reserved_login_ids')
        .upsert([{ login_id_lower: lower, reason, original_user_id: originalUserId }], { onConflict: 'login_id_lower' });
    } catch (e) {}
  }

  const db = localStore.getDb();
  const existing = (db.reservedLoginIds || []).find(r => r.loginIdLower === lower);
  if (existing) {
    existing.reason = reason;
    existing.originalUserId = originalUserId;
  } else {
    db.reservedLoginIds.push({
      id: getNextId(db.reservedLoginIds),
      loginIdLower: lower,
      reason,
      originalUserId,
      reservedAt: new Date().toISOString()
    });
  }
  localStore.saveDb(db);
}

/**
 * 2. 1개월 유료 맛보기 1회성 중복 체크 & 기록
 */
async function checkTrialEligibility({ email, phone, businessRegNo }) {
  const hashes = [];
  if (email) hashes.push({ type: 'EMAIL', hash: sec.sha256(`email:${email}`) });
  if (phone) hashes.push({ type: 'PHONE', hash: sec.sha256(`phone:${sec.normalizeDigits(phone)}`) });
  if (businessRegNo) hashes.push({ type: 'BIZ_REG_NO', hash: sec.sha256(`biz:${sec.normalizeDigits(businessRegNo)}`) });

  const db = localStore.getDb();
  for (const item of hashes) {
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('trial_history_hashes')
          .select('identity_type')
          .eq('identity_hash', item.hash)
          .limit(1);
        if (!error && data && data.length > 0) {
          return {
            eligible: false,
            blockedBy: item.type,
            message: '동일한 이메일·연락처 또는 사업자등록번호로 이미 1개월 유료 맛보기 체험 이력이 존재합니다.'
          };
        }
      } catch (e) {}
    }

    const foundLocal = (db.trialHistoryHashes || []).find(h => h.identityHash === item.hash);
    if (foundLocal) {
      return {
        eligible: false,
        blockedBy: item.type,
        message: '동일한 이메일·연락처 또는 사업자등록번호로 이미 1개월 유료 맛보기 체험 이력이 존재합니다.'
      };
    }
  }

  return { eligible: true };
}

async function recordTrialHistory({ email, phone, businessRegNo }) {
  const items = [];
  if (email) items.push({ type: 'EMAIL', hash: sec.sha256(`email:${email}`) });
  if (phone) items.push({ type: 'PHONE', hash: sec.sha256(`phone:${sec.normalizeDigits(phone)}`) });
  if (businessRegNo) items.push({ type: 'BIZ_REG_NO', hash: sec.sha256(`biz:${sec.normalizeDigits(businessRegNo)}`) });

  const db = localStore.getDb();
  for (const item of items) {
    if (isSupabaseConfigured()) {
      try {
        await supabase
          .from('trial_history_hashes')
          .upsert([{ identity_type: item.type, identity_hash: item.hash }], { onConflict: 'identity_hash' });
      } catch (e) {}
    }
    if (!db.trialHistoryHashes.find(h => h.identityHash === item.hash)) {
      db.trialHistoryHashes.push({
        id: getNextId(db.trialHistoryHashes),
        identityType: item.type,
        identityHash: item.hash,
        firstUsedAt: new Date().toISOString()
      });
    }
  }
  localStore.saveDb(db);
}

/**
 * 이메일 중복 확인
 */
async function isEmailAlreadyUsed(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase
        .from('users')
        .select('id, status')
        .ilike('email', normalized)
        .neq('status', 'withdrawn')
        .limit(1);
      if (data && data.length > 0) return true;
    } catch (e) {}
  }
  const db = localStore.getDb();
  return (db.users || []).some(u => String(u.email || '').toLowerCase() === normalized && u.status !== 'withdrawn');
}

/**
 * 3. 법인/개인 통합 회원가입 저장
 */
async function registerEnterpriseMember(payload, dbServiceRef) {
  const {
    username,
    passwordHash,
    memberType,
    name,
    phone,
    email,
    emailVerified,
    businessRegNo,
    companyName,
    ceoName,
    businessAddress,
    nationalCertName,
    nationalCertNo,
    startTrial,
    paymentCode,
    managerPhone,
    primaryDomain,
    defaultSiteName,
    jobTitle,
    marketingAgreed
  } = payload;

  let subscription = null;
  let membershipTier = 'FREE';
  let role = 'member';
  let trialFields = {
    trialStatus: 'NOT_STARTED',
    trialStartedAt: null,
    trialExpiresAt: null,
    trialQuotaTotal: 30,
    trialQuotaUsed: 0,
    hasUsedTrial: false
  };

  if (paymentCode) {
    subscription = await findSubscriptionByCode(paymentCode);
    if (!subscription) {
      throw new Error('입력하신 Payment Code를 찾을 수 없습니다.');
    }
    if (!isSubscriptionCurrentlyValid(subscription)) {
      throw new Error('해당 Payment Code는 월별 입금 확인이 만료되었거나 정지된 상태입니다.');
    }
    const seatCount = await countUsersBySubscription(subscription.id);
    if (seatCount >= subscription.maxSeats) {
      throw new Error(`해당 법인/구독의 최대 허용 인원(${subscription.maxSeats}명)을 초과했습니다. 관리자에게 문의해주세요.`);
    }
    membershipTier = 'PAID';
    role = 'paid_member';
  } else if (startTrial) {
    const now = new Date();
    membershipTier = 'TRIAL';
    trialFields = {
      trialStatus: 'ACTIVE',
      trialStartedAt: now.toISOString(),
      trialExpiresAt: sec.addOneMonthIso(now),
      trialQuotaTotal: 30,
      trialQuotaUsed: 0,
      hasUsedTrial: true
    };
  }

  // 기본 users 레코드 생성 (Supabase 호환 + 로컬 동기화)
  let createdUser = null;
  const extendedPatch = {
    memberType,
    membershipTier,
    phone,
    email,
    emailVerified: Boolean(emailVerified),
    emailVerifiedAt: emailVerified ? new Date().toISOString() : null,
    passwordChangedAt: new Date().toISOString(),
    ...trialFields,
    taxPayerType: memberType === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL',
    businessRegNo: businessRegNo || '',
    companyName: companyName || (memberType === 'CORPORATE' ? name : ''),
    ceoName: ceoName || '',
    businessAddress: businessAddress || '',
    taxInvoiceEmail: memberType === 'CORPORATE' ? email : '',
    nationalCertName: nationalCertName || '',
    nationalCertNo: nationalCertNo || '',
    affiliationCompany: subscription && subscription.ownerType === 'CORPORATE' ? subscription.companyName : (companyName || ''),
    jobTitle: jobTitle || '',
    subscriptionId: subscription ? subscription.id : null,
    enteredPaymentCode: subscription ? subscription.paymentCode : '',
    paidProfileCompleted: false,
    canUseCorporateSeal: memberType === 'CORPORATE',
    managerPhone: managerPhone || '',
    primaryDomain: primaryDomain || 'UNIVERSAL',
    defaultSiteName: defaultSiteName || '',
    marketingAgreed: Boolean(marketingAgreed)
  };

  if (isSupabaseConfigured()) {
    try {
      const fullRow = {
        username,
        password: passwordHash,
        name,
        email,
        role,
        status: 'pending',
        member_type: memberType,
        membership_tier: membershipTier,
        phone,
        email_verified: Boolean(emailVerified),
        email_verified_at: extendedPatch.emailVerifiedAt,
        trial_status: trialFields.trialStatus,
        trial_started_at: trialFields.trialStartedAt,
        trial_expires_at: trialFields.trialExpiresAt,
        trial_quota_total: 30,
        trial_quota_used: 0,
        has_used_trial: trialFields.hasUsedTrial,
        tax_payer_type: extendedPatch.taxPayerType,
        business_reg_no: extendedPatch.businessRegNo,
        company_name: extendedPatch.companyName,
        ceo_name: extendedPatch.ceoName,
        business_address: extendedPatch.businessAddress,
        national_cert_name: extendedPatch.nationalCertName,
        national_cert_no: extendedPatch.nationalCertNo,
        affiliation_company: extendedPatch.affiliationCompany,
        job_title: extendedPatch.jobTitle,
        subscription_id: extendedPatch.subscriptionId,
        entered_payment_code: extendedPatch.enteredPaymentCode,
        paid_profile_completed: false,
        can_use_corporate_seal: extendedPatch.canUseCorporateSeal,
        manager_phone: extendedPatch.managerPhone,
        primary_domain: extendedPatch.primaryDomain,
        default_site_name: extendedPatch.defaultSiteName,
        marketing_agreed: extendedPatch.marketingAgreed
      };

      const { data, error } = await supabase.from('users').insert([fullRow]).select().single();
      if (error) {
        if (isMissingSchemaError(error)) {
          // 원격 Supabase에 아직 마이그레이션 SQL이 실행되지 않은 경우 핵심 컬럼만 저장 + extendedMeta 백업
          createdUser = await dbServiceRef.createUser({
            username,
            password: passwordHash,
            name,
            email,
            role,
            status: 'pending'
          });
        } else {
          throw error;
        }
      } else {
        createdUser = data;
      }
    } catch (e) {
      console.error('Enterprise register Supabase fallback error:', e.message);
      createdUser = await dbServiceRef.createUser({
        username,
        password: passwordHash,
        name,
        email,
        role,
        status: 'pending'
      });
    }
  } else {
    createdUser = await dbServiceRef.createUser({
      username,
      password: passwordHash,
      name,
      email,
      role,
      status: 'pending'
    });
  }

  saveMetaForUsername(username, extendedPatch);
  await reserveLoginId(username, 'ACTIVE', createdUser.id);
  if (startTrial) {
    await recordTrialHistory({ email, phone, businessRegNo });
  }

  return await hydrateUser(createdUser);
}

/**
 * 구독 ID에 연결된 회원 수 계산
 */
async function countUsersBySubscription(subscriptionId) {
  if (!subscriptionId) return 0;
  if (isSupabaseConfigured()) {
    try {
      const { count, error } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_id', subscriptionId)
        .neq('status', 'withdrawn');
      if (!error && typeof count === 'number') return count;
    } catch (e) {}
  }
  const db = localStore.getDb();
  let cnt = 0;
  for (const u of (db.users || [])) {
    if (u.status === 'withdrawn') continue;
    const meta = getMetaForUsername(u.username);
    if (Number(u.subscriptionId || meta.subscriptionId) === Number(subscriptionId)) cnt++;
  }
  return cnt;
}

/**
 * 4. 회원 필드 업데이트 (유료 2단계 프로필, 결재 비밀번호, 맛보기 활성화, 쿼터 차감 등)
 */
async function updateMemberFields(userId, username, patch) {
  saveMetaForUsername(username, patch);

  const db = localStore.getDb();
  const localUser = (db.users || []).find(u => Number(u.id) === Number(userId) || String(u.username).toLowerCase() === String(username).toLowerCase());
  if (localUser) {
    Object.assign(localUser, patch);
    localStore.saveDb(db);
  }

  if (isSupabaseConfigured()) {
    const dbPatch = {};
    const map = {
      role: 'role',
      status: 'status',
      email: 'email',
      membershipTier: 'membership_tier',
      trialStatus: 'trial_status',
      trialStartedAt: 'trial_started_at',
      trialExpiresAt: 'trial_expires_at',
      trialQuotaTotal: 'trial_quota_total',
      trialQuotaUsed: 'trial_quota_used',
      hasUsedTrial: 'has_used_trial',
      taxPayerType: 'tax_payer_type',
      businessRegNo: 'business_reg_no',
      subBusinessNo: 'sub_business_no',
      companyName: 'company_name',
      ceoName: 'ceo_name',
      businessAddress: 'business_address',
      businessType: 'business_type',
      businessItem: 'business_item',
      taxInvoiceEmail: 'tax_invoice_email',
      cashReceiptType: 'cash_receipt_type',
      cashReceiptNoEnc: 'cash_receipt_no_enc',
      nationalCertName: 'national_cert_name',
      nationalCertNo: 'national_cert_no',
      agencyRegNo: 'agency_reg_no',
      affiliationCompany: 'affiliation_company',
      jobTitle: 'job_title',
      officialDocAddress: 'official_doc_address',
      approvalPasswordHash: 'approval_password_hash',
      approvalPasswordType: 'approval_password_type',
      approvalPasswordUpdatedAt: 'approval_password_updated_at',
      approvalFailedAttempts: 'approval_failed_attempts',
      approvalLockedUntil: 'approval_locked_until',
      signatureImagePath: 'signature_image_path',
      corporateSealPath: 'corporate_seal_path',
      canUseCorporateSeal: 'can_use_corporate_seal',
      subscriptionId: 'subscription_id',
      enteredPaymentCode: 'entered_payment_code',
      paidProfileCompleted: 'paid_profile_completed',
      failedLoginAttempts: 'failed_login_attempts',
      lockedUntil: 'locked_until',
      withdrawnAt: 'withdrawn_at'
    };

    for (const [k, col] of Object.entries(map)) {
      if (patch[k] !== undefined) dbPatch[col] = patch[k];
    }

    if (Object.keys(dbPatch).length > 0) {
      try {
        const { error } = await supabase.from('users').update(dbPatch).eq('id', userId);
        if (error && isMissingSchemaError(error)) {
          const corePatch = {};
          if (dbPatch.role !== undefined) corePatch.role = dbPatch.role;
          if (dbPatch.status !== undefined) corePatch.status = dbPatch.status;
          if (dbPatch.email !== undefined) corePatch.email = dbPatch.email;
          if (Object.keys(corePatch).length > 0) {
            await supabase.from('users').update(corePatch).eq('id', userId);
          }
        }
      } catch (e) {}
    }
  }
}

/**
 * 5. 회원 탈퇴 / 관리자 삭제 (물리 삭제 대신 Soft Delete + 탈퇴자 ID 영구 보존)
 */
async function withdrawMember(rawUser) {
  if (!rawUser) return false;
  const now = new Date().toISOString();
  await reserveLoginId(rawUser.username, 'WITHDRAWN', rawUser.id);
  await updateMemberFields(rawUser.id, rawUser.username, {
    status: 'withdrawn',
    membershipTier: 'FREE',
    withdrawnAt: now,
    email: `withdrawn_${rawUser.id}@deleted.bepmc`,
    phone: '',
    signatureImagePath: '',
    corporateSealPath: '',
    cashReceiptNoEnc: ''
  });
  return true;
}

/**
 * 6. 1개월 유료 맛보기 쿼터 차감 (월 30회 제한)
 */
async function consumeTrialQuota(user) {
  if (!user || user.membershipTier !== 'TRIAL') {
    return { allowed: false, message: '활성화된 유료 맛보기 상태가 아닙니다.' };
  }
  if (!user.trialInfo || !user.trialInfo.isActive) {
    return { allowed: false, message: '1개월 무료 맛보기 기간이 만료되었거나 월 30회 한도를 모두 소진했습니다.' };
  }

  const nextUsed = (user.trialQuotaUsed || 0) + 1;
  const quotaTotal = user.trialQuotaTotal || 30;
  const patch = { trialQuotaUsed: nextUsed };
  if (nextUsed >= quotaTotal) {
    patch.trialStatus = 'EXPIRED';
  }
  await updateMemberFields(user.id, user.username, patch);

  return {
    allowed: true,
    quotaTotal,
    quotaUsed: nextUsed,
    quotaRemaining: Math.max(0, quotaTotal - nextUsed),
    expiresAt: user.trialExpiresAt
  };
}

/**
 * 7. Payment Code 등록 / 승계
 */
async function redeemPaymentCodeForUser(user, paymentCode) {
  const sub = await findSubscriptionByCode(paymentCode);
  if (!sub) {
    throw new Error('유효하지 않은 Payment Code입니다. 발급 코드를 다시 확인해주세요.');
  }
  if (!isSubscriptionCurrentlyValid(sub)) {
    throw new Error('해당 Payment Code는 당월 입금이 확인되지 않았거나 유효기간이 만료되었습니다.');
  }

  if (Number(user.subscriptionId) !== Number(sub.id)) {
    const usedSeats = await countUsersBySubscription(sub.id);
    if (usedSeats >= sub.maxSeats) {
      throw new Error(`해당 구독 코드의 최대 허용 인원(${sub.maxSeats}명)이 모두 찼습니다.`);
    }
  }

  const patch = {
    subscriptionId: sub.id,
    enteredPaymentCode: sub.paymentCode,
    membershipTier: 'PAID',
    role: user.role === 'admin' ? 'admin' : 'paid_member',
    canUseCorporateSeal: user.memberType === 'CORPORATE' || Number(sub.ownerUserId) === Number(user.id)
  };
  if (user.trialStatus === 'ACTIVE') {
    patch.trialStatus = 'CONVERTED';
  }
  // 소속 법인 공식문서용 회사명 자동 연결
  if (user.memberType === 'INDIVIDUAL' && sub.ownerType === 'CORPORATE') {
    patch.affiliationCompany = sub.companyName || '';
  }

  await updateMemberFields(user.id, user.username, patch);
  return sub;
}

/**
 * 8. 유료 구독 관리 (관리자용 코드 발급 & 월별 입금 확인)
 */
async function getAllSubscriptionsWithStats() {
  let subs = [];
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.from('payment_subscriptions').select('*').order('id', { ascending: false });
      if (!error && Array.isArray(data)) subs = data.map(normalizeSubFromDb);
    } catch (e) {}
  }

  const db = localStore.getDb();
  if (subs.length === 0) {
    subs = (db.paymentSubscriptions || []).slice().reverse();
  }

  const logs = db.paymentMonthlyLogs || [];
  const enriched = [];
  for (const s of subs) {
    const seatsUsed = await countUsersBySubscription(s.id);
    const subLogs = logs.filter(l => Number(l.subscriptionId) === Number(s.id)).slice(-3).reverse();
    enriched.push({
      ...s,
      isCurrentlyValid: isSubscriptionCurrentlyValid(s),
      seatsUsed,
      recentLogs: subLogs
    });
  }
  return enriched;
}

async function createSubscription({
  ownerType = 'CORPORATE',
  ownerUserId = null,
  companyName,
  businessRegNo = '',
  ceoName = '',
  businessAddress = '',
  agencyRegNo = '',
  planName = 'BEPSMC 기업 안전 AI 월간 구독',
  maxSeats = 10,
  monthlyFee = 330000,
  startActive = true
}) {
  const paymentCode = sec.generatePaymentCode(ownerType);
  const today = getTodayStr();
  const nextMonth = sec.addOneMonthIso(new Date()).slice(0, 10);
  const nowIso = new Date().toISOString();

  const record = {
    paymentCode,
    ownerType,
    ownerUserId,
    companyName: companyName || '미지정 법인/회원',
    businessRegNo: sec.normalizeDigits(businessRegNo),
    ceoName,
    businessAddress,
    agencyRegNo,
    planName,
    maxSeats: Number(maxSeats) || 10,
    monthlyFee: Number(monthlyFee) || 0,
    billingStatus: startActive ? 'ACTIVE' : 'PENDING_PAYMENT',
    currentPeriodStart: startActive ? today : null,
    currentPeriodEnd: startActive ? nextMonth : null,
    lastPaidAt: startActive ? nowIso : null,
    createdAt: nowIso
  };

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.from('payment_subscriptions').insert([{
        payment_code: record.paymentCode,
        owner_type: record.ownerType,
        owner_user_id: record.ownerUserId,
        company_name: record.companyName,
        business_reg_no: record.businessRegNo,
        ceo_name: record.ceoName,
        business_address: record.businessAddress,
        agency_reg_no: record.agencyRegNo,
        plan_name: record.planName,
        max_seats: record.maxSeats,
        monthly_fee: record.monthlyFee,
        billing_status: record.billingStatus,
        current_period_start: record.currentPeriodStart,
        current_period_end: record.currentPeriodEnd,
        last_paid_at: record.lastPaidAt
      }]).select().single();
      if (!error && data) {
        return normalizeSubFromDb(data);
      }
    } catch (e) {}
  }

  const db = localStore.getDb();
  const newSub = { id: getNextId(db.paymentSubscriptions), ...record };
  db.paymentSubscriptions.push(newSub);
  if (startActive) {
    db.paymentMonthlyLogs.push({
      id: getNextId(db.paymentMonthlyLogs),
      subscriptionId: newSub.id,
      billingMonth: today.slice(0, 7),
      expectedAmount: record.monthlyFee,
      paidAmount: record.monthlyFee,
      depositorName: record.companyName,
      paymentMethod: '관리자 최초 승인',
      paymentStatus: 'PAID',
      verifiedBy: 'admin',
      verifiedAt: nowIso
    });
  }
  localStore.saveDb(db);
  return newSub;
}

async function confirmMonthlyPayment(subscriptionId, { billingMonth, paidAmount, depositorName, paymentMethod, verifiedBy }) {
  const today = getTodayStr();
  const now = new Date();
  const nextEnd = sec.addOneMonthIso(now).slice(0, 10);
  const nowIso = now.toISOString();

  const db = localStore.getDb();
  const sub = (db.paymentSubscriptions || []).find(s => Number(s.id) === Number(subscriptionId));
  if (sub) {
    sub.billingStatus = 'ACTIVE';
    sub.currentPeriodStart = today;
    sub.currentPeriodEnd = nextEnd;
    sub.lastPaidAt = nowIso;
    db.paymentMonthlyLogs.push({
      id: getNextId(db.paymentMonthlyLogs),
      subscriptionId: Number(subscriptionId),
      billingMonth: billingMonth || today.slice(0, 7),
      expectedAmount: sub.monthlyFee || Number(paidAmount) || 0,
      paidAmount: Number(paidAmount) || sub.monthlyFee || 0,
      depositorName: depositorName || sub.companyName,
      paymentMethod: paymentMethod || '계좌이체',
      paymentStatus: 'PAID',
      verifiedBy: verifiedBy || 'admin',
      verifiedAt: nowIso
    });
    localStore.saveDb(db);
  }

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('payment_subscriptions').update({
        billing_status: 'ACTIVE',
        current_period_start: today,
        current_period_end: nextEnd,
        last_paid_at: nowIso
      }).eq('id', subscriptionId);

      await supabase.from('payment_monthly_logs').insert([{
        subscription_id: subscriptionId,
        billing_month: billingMonth || today.slice(0, 7),
        expected_amount: Number(paidAmount) || 0,
        paid_amount: Number(paidAmount) || 0,
        depositor_name: depositorName || '',
        payment_method: paymentMethod || '계좌이체',
        payment_status: 'PAID',
        verified_by: verifiedBy || 'admin'
      }]);
    } catch (e) {}
  }

  return await getSubscriptionById(subscriptionId);
}

async function updateSubscriptionStatus(subscriptionId, billingStatus) {
  const db = localStore.getDb();
  const sub = (db.paymentSubscriptions || []).find(s => Number(s.id) === Number(subscriptionId));
  if (sub) {
    sub.billingStatus = billingStatus;
    localStore.saveDb(db);
  }
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('payment_subscriptions').update({ billing_status: billingStatus }).eq('id', subscriptionId);
    } catch (e) {}
  }
  return await getSubscriptionById(subscriptionId);
}

/**
 * 9. 전자서명 · 직인 날인 감사 로그 저장
 */
async function createApprovalLog({
  reportId,
  reportType,
  signerUserId,
  subscriptionId = null,
  sealUsedType,
  corporateInfoSnapshot = null,
  documentSha256,
  signerIp = ''
}) {
  const nowIso = new Date().toISOString();
  const entry = {
    reportId,
    reportType,
    signerUserId,
    subscriptionId,
    sealUsedType,
    corporateInfoSnapshot,
    documentSha256,
    approvalPwVerified: true,
    signerIp,
    signedAt: nowIso
  };

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('document_approval_logs').insert([{
        report_id: reportId,
        report_type: reportType,
        signer_user_id: signerUserId,
        subscription_id: subscriptionId,
        seal_used_type: sealUsedType,
        corporate_info_snapshot: corporateInfoSnapshot,
        document_sha256: documentSha256,
        approval_pw_verified: true,
        signer_ip: signerIp
      }]);
    } catch (e) {}
  }

  const db = localStore.getDb();
  const saved = { id: getNextId(db.documentApprovalLogs), ...entry };
  db.documentApprovalLogs.push(saved);
  localStore.saveDb(db);
  return saved;
}

async function getApprovalLogsByUser(userId) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('document_approval_logs')
        .select('*')
        .eq('signer_user_id', userId)
        .order('id', { ascending: false })
        .limit(20);
      if (!error && Array.isArray(data) && data.length > 0) return data;
    } catch (e) {}
  }
  const db = localStore.getDb();
  return (db.documentApprovalLogs || []).filter(l => Number(l.signerUserId) === Number(userId)).slice(-20).reverse();
}

module.exports = {
  hydrateUser,
  toSafeUserDto,
  getSubscriptionById,
  findSubscriptionByCode,
  isSubscriptionCurrentlyValid,
  checkLoginIdAvailability,
  checkTrialEligibility,
  isEmailAlreadyUsed,
  registerEnterpriseMember,
  updateMemberFields,
  withdrawMember,
  consumeTrialQuota,
  redeemPaymentCodeForUser,
  getAllSubscriptionsWithStats,
  createSubscription,
  confirmMonthlyPayment,
  updateSubscriptionStatus,
  createApprovalLog,
  getApprovalLogsByUser,
  recordTrialHistory
};
