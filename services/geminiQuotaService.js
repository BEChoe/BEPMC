/**
 * services/geminiQuotaService.js
 * Google Gemini API 무료 티어(Free Tier) 일일 할당량(1,500회) 및 RPM(15회/분) 추적 관리 서비스
 */

const fs = require('fs');
const path = require('path');

const QUOTA_FILE = path.join(__dirname, '..', 'data', 'gemini-quota.json');
const DAILY_FREE_LIMIT = 1500; // Google AI Studio 무료 티어 일일 한도
const RPM_LIMIT = 15;          // 분당 요청 한도

// data 디렉토리 확보
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function getTodayString() {
  const now = new Date();
  return now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC 기준, 매일 00:00 UTC = 09:00 KST 리셋)
}

function loadQuotaData() {
  const today = getTodayString();
  try {
    if (fs.existsSync(QUOTA_FILE)) {
      const content = fs.readFileSync(QUOTA_FILE, 'utf8');
      const data = JSON.parse(content);
      if (data.date === today) {
        return data;
      }
    }
  } catch (err) {
    console.warn('[Gemini Quota] 로드 실패, 초기화합니다:', err.message);
  }

  // 새로운 날짜이거나 파일이 없으면 일일 1,500회로 리셋
  const freshData = {
    date: today,
    dailyLimit: DAILY_FREE_LIMIT,
    usedToday: 0,
    remainingToday: DAILY_FREE_LIMIT,
    rpmLimit: RPM_LIMIT,
    lastRequestTimestamp: null,
    history: []
  };
  saveQuotaData(freshData);
  return freshData;
}

function saveQuotaData(data) {
  try {
    fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[Gemini Quota] 저장 실패:', err.message);
  }
}

class GeminiQuotaService {
  /**
   * 현재 쿼터 정보 조회
   */
  getQuotaStatus() {
    const data = loadQuotaData();
    const remaining = Math.max(0, data.dailyLimit - data.usedToday);
    const usagePercent = ((data.usedToday / data.dailyLimit) * 100).toFixed(1);

    return {
      success: true,
      date: data.date,
      dailyLimit: data.dailyLimit,
      usedToday: data.usedToday,
      remainingToday: remaining,
      usagePercent: Number(usagePercent),
      rpmLimit: data.rpmLimit,
      resetNotice: '매일 KST 09:00 (UTC 00:00) 1,500회 자동 리셋',
      isAvailable: remaining > 0
    };
  }

  /**
   * API 1회 호출 시 쿼터 차감
   */
  consumeQuota(metadata = {}) {
    const data = loadQuotaData();
    if (data.usedToday >= data.dailyLimit) {
      return {
        success: false,
        exhausted: true,
        message: '일일 무료 쿼터(1,500회)가 소진되었습니다. 내일 09:00에 리셋됩니다.'
      };
    }

    data.usedToday += 1;
    data.remainingToday = Math.max(0, data.dailyLimit - data.usedToday);
    data.lastRequestTimestamp = new Date().toISOString();

    if (metadata.fileName || metadata.duration) {
      data.history.unshift({
        timestamp: data.lastRequestTimestamp,
        fileName: metadata.fileName || 'video',
        durationSec: metadata.duration || 0
      });
      if (data.history.length > 50) data.history.pop();
    }

    saveQuotaData(data);
    return {
      success: true,
      usedToday: data.usedToday,
      remainingToday: data.remainingToday,
      dailyLimit: data.dailyLimit
    };
  }

  /**
   * 테스트 및 관리자용 쿼터 수동 리셋
   */
  resetQuota() {
    const today = getTodayString();
    const resetData = {
      date: today,
      dailyLimit: DAILY_FREE_LIMIT,
      usedToday: 0,
      remainingToday: DAILY_FREE_LIMIT,
      rpmLimit: RPM_LIMIT,
      lastRequestTimestamp: null,
      history: []
    };
    saveQuotaData(resetData);
    return this.getQuotaStatus();
  }
}

module.exports = new GeminiQuotaService();
