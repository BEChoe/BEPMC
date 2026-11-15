/**
 * services/memberSecurityService.js
 * BEPSMC 법인·개인 통합 회원 보안, 검증, 해싱 및 구독 코드 생성 유틸리티
 */

const crypto = require('crypto');

// 이메일 인증코드 임시 저장소 (메모리 TTL 10분)
const emailVerificationStore = new Map();

/**
 * 1. 비밀번호 / 결재용 비밀번호 단방향 솔트 해싱 (Node 내장 scrypt)
 */
function hashSecret(plainText) {
  if (!plainText || typeof plainText !== 'string') {
    throw new Error('해싱할 비밀번호 값이 비어있습니다.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainText, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

/**
 * 비밀번호 / 결재용 비밀번호 검증 (레거시 평문 호환 포함)
 */
function verifySecret(plainText, storedHash) {
  if (!plainText || !storedHash) return false;

  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const [, salt, originalHex] = parts;
    const derived = crypto.scryptSync(plainText, salt, 64);
    const originalBuf = Buffer.from(originalHex, 'hex');
    if (derived.length !== originalBuf.length) return false;
    return crypto.timingSafeEqual(derived, originalBuf);
  }

  // 레거시 초기 시드 계정 호환용
  return plainText === storedHash;
}

/**
 * SHA-256 단방향 해시 (중복/재체험 차단용 식별자 및 보고서 무결성 해시)
 */
function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex');
}

/**
 * 2. 로그인 아이디 형식 검증
 * - 영문 소문자, 숫자, 밑줄(_), 하이픈(-) 허용, 4~20자
 */
function validateLoginId(loginId) {
  const raw = String(loginId || '').trim();
  const normalized = raw.toLowerCase();
  const errors = [];

  if (normalized.length < 4 || normalized.length > 20) {
    errors.push('아이디는 4자 이상 20자 이하여야 합니다.');
  }
  if (!/^[a-z0-9_-]+$/.test(normalized)) {
    errors.push('아이디는 영문, 숫자, 밑줄(_), 하이픈(-)만 사용할 수 있습니다.');
  }
  if (/^(admin|root|system|bepmc_sys|guest|anonymous)$/.test(normalized) && normalized !== 'admin') {
    errors.push('시스템 예약어는 아이디로 사용할 수 없습니다.');
  }

  return {
    isValid: errors.length === 0,
    normalized,
    errors
  };
}

/**
 * 3. 접속 비밀번호 보안 등급 평가
 * - 최소 10자 이상 + 영문 대/소문자, 숫자, 특수문자 중 3종 이상 조합 권장
 */
function evaluatePasswordStrength(password, loginId = '', email = '') {
  const pw = String(password || '');
  const errors = [];
  let score = 0;

  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  const typeCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;

  if (pw.length < 10) {
    errors.push('접속 비밀번호는 보안을 위해 최소 10자 이상이어야 합니다.');
  } else {
    score += 30;
    if (pw.length >= 12) score += 10;
  }

  if (typeCount < 3) {
    errors.push('영문 대문자, 소문자, 숫자, 특수문자 중 최소 3가지 이상을 조합해주세요.');
  } else {
    score += typeCount * 15;
  }

  const lowerPw = pw.toLowerCase();
  if (loginId && loginId.trim().length >= 3 && lowerPw.includes(loginId.trim().toLowerCase())) {
    errors.push('비밀번호에 아이디와 동일한 문자열을 포함할 수 없습니다.');
    score -= 20;
  }

  if (email && email.includes('@')) {
    const emailLocal = email.split('@')[0].trim().toLowerCase();
    if (emailLocal.length >= 3 && lowerPw.includes(emailLocal)) {
      errors.push('비밀번호에 이메일 계정을 포함할 수 없습니다.');
      score -= 15;
    }
  }

  if (/(.)\1{3,}/.test(pw) || /0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf/i.test(pw)) {
    errors.push('4자리 이상 연속되거나 반복되는 문자/숫자는 사용할 수 없습니다.');
    score -= 20;
  }

  score = Math.max(0, Math.min(100, score));
  let level = 'WEAK';
  let label = '보안 취약';
  if (errors.length === 0 && score >= 80) {
    level = 'STRONG';
    label = '매우 높음 (안전)';
  } else if (errors.length === 0 && score >= 60) {
    level = 'MEDIUM';
    label = '양호 (사용 가능)';
  }

  return {
    isValid: errors.length === 0,
    score,
    level,
    label,
    typeCount,
    errors
  };
}

/**
 * 4. 전자서명 / 직인 결재용 비밀번호 검증 (접속 비밀번호와 별도 분리 강제)
 */
function validateApprovalPassword(approvalPassword, approvalType = 'ALPHANUMERIC', currentLoginPasswordHash = '', loginPasswordPlain = '') {
  const raw = String(approvalPassword || '');
  const errors = [];

  if (!raw) {
    return { isValid: false, errors: ['결재용 비밀번호를 입력해주세요.'] };
  }

  // 접속 비밀번호와 동일 여부 엄격 차단
  if (loginPasswordPlain && raw === loginPasswordPlain) {
    errors.push('결재용 비밀번호는 접속(로그인) 비밀번호와 다르게 설정해야 합니다.');
  } else if (currentLoginPasswordHash && verifySecret(raw, currentLoginPasswordHash)) {
    errors.push('결재용 비밀번호는 현재 접속(로그인) 비밀번호와 동일하게 설정할 수 없습니다.');
  }

  if (approvalType === 'PIN_6') {
    if (!/^\d{6}$/.test(raw)) {
      errors.push('간편 결재 PIN은 숫자 6자리로 입력해주세요.');
    } else if (/^(\d)\1{5}$/.test(raw) || '0123456789'.includes(raw) || '9876543210'.includes(raw)) {
      errors.push('단순 반복되거나 연속된 6자리 숫자는 결재 PIN으로 사용할 수 없습니다.');
    }
  } else {
    if (raw.length < 8) {
      errors.push('결재용 비밀번호는 최소 8자 이상이어야 합니다.');
    }
    const classes = [/[A-Za-z]/.test(raw), /[0-9]/.test(raw), /[^A-Za-z0-9]/.test(raw)].filter(Boolean).length;
    if (classes < 2) {
      errors.push('결재용 비밀번호는 영문·숫자·특수문자 중 2종 이상을 조합해주세요.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 5. 한국 사업자등록번호 유효성 및 국세청 체크섬 검증
 */
function normalizeDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

function validateKoreanBizRegNo(bizNo) {
  const digits = normalizeDigits(bizNo);
  if (digits.length !== 10) {
    return { isValid: false, normalized: digits, formatted: bizNo, message: '사업자등록번호는 숫자 10자리여야 합니다.' };
  }

  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * weights[i];
  }
  sum += Math.floor((Number(digits[8]) * 5) / 10);
  const checkDigit = (10 - (sum % 10)) % 10;

  if (checkDigit !== Number(digits[9])) {
    return {
      isValid: false,
      normalized: digits,
      formatted: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`,
      message: '사업자등록번호 검증 번호(체크섬)가 올바르지 않습니다. 정확한 10자리 번호를 확인해주세요.'
    };
  }

  return {
    isValid: true,
    normalized: digits,
    formatted: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`,
    message: '유효한 사업자등록번호입니다.'
  };
}

/**
 * 6. 연락처 & 이메일 형식 검증
 */
function validatePhone(phone) {
  const digits = normalizeDigits(phone);
  // 휴대폰(010 등 10~11자리), 유선/대표번호(02, 031, 1588 등 8~11자리)
  const isValid = /^0\d{7,10}$/.test(digits) || /^1[568]\d{6}$/.test(digits);
  return {
    isValid,
    normalized: digits,
    message: isValid ? '유효한 연락처입니다.' : '유효한 법인 대표번호 또는 휴대폰 번호(숫자 8~11자리)를 입력해주세요.'
  };
}

function validateEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const isValid = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized);
  return {
    isValid,
    normalized,
    message: isValid ? '유효한 이메일 형식입니다.' : '올바른 이메일 주소 형식을 입력해주세요.'
  };
}

/**
 * 7. 이메일 인증코드 발급 및 검증 (10분 만료)
 */
function issueEmailVerificationCode(email) {
  const check = validateEmail(email);
  if (!check.isValid) {
    throw new Error(check.message);
  }
  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = Date.now() + 10 * 60 * 1000;
  emailVerificationStore.set(check.normalized, {
    code,
    expiresAt,
    verified: false
  });
  return {
    email: check.normalized,
    code,
    expiresAt: new Date(expiresAt).toISOString()
  };
}

function verifyEmailCode(email, code) {
  const normalized = String(email || '').trim().toLowerCase();
  const record = emailVerificationStore.get(normalized);
  if (!record) {
    return { verified: false, message: '인증코드 발송 이력이 없습니다. 먼저 인증코드를 요청해주세요.' };
  }
  if (Date.now() > record.expiresAt) {
    emailVerificationStore.delete(normalized);
    return { verified: false, message: '인증코드 유효시간(10분)이 만료되었습니다. 다시 발송해주세요.' };
  }
  if (String(code || '').trim() !== record.code) {
    return { verified: false, message: '인증코드가 일치하지 않습니다.' };
  }
  record.verified = true;
  emailVerificationStore.set(normalized, record);
  return { verified: true, message: '이메일 유효성 인증이 완료되었습니다.' };
}

function isEmailVerifiedInSession(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const record = emailVerificationStore.get(normalized);
  return Boolean(record && record.verified && Date.now() <= record.expiresAt);
}

/**
 * 8. Payment Code 난수 발급기
 */
function generatePaymentCode(ownerType = 'CORPORATE') {
  const prefix = ownerType === 'CORPORATE' ? 'BEPSMC-C' : 'BEPSMC-P';
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `${prefix}-${year}-${suffix}`;
}

/**
 * 9. 1개월 후 만료일 계산
 */
function addOneMonthIso(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

module.exports = {
  hashSecret,
  verifySecret,
  sha256,
  validateLoginId,
  evaluatePasswordStrength,
  validateApprovalPassword,
  normalizeDigits,
  validateKoreanBizRegNo,
  validatePhone,
  validateEmail,
  issueEmailVerificationCode,
  verifyEmailCode,
  isEmailVerifiedInSession,
  generatePaymentCode,
  addOneMonthIso
};
