require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

const isConfigured = Boolean(
  supabaseUrl && 
  supabaseKey && 
  supabaseUrl.startsWith('https://') && 
  !supabaseUrl.includes('your-project-id')
);

let supabase = null;
if (isConfigured) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log(`[Database] Supabase Cloud DB 연동 완료 (${supabaseUrl})`);
  } catch (err) {
    console.error('[Database] Supabase 초기화 오류:', err.message);
  }
} else {
  console.log('[Database] Supabase 환경변수(SUPABASE_URL, SUPABASE_KEY) 미설정 -> 로컬 스토어 모드로 동작합니다.');
}

module.exports = {
  supabase,
  isSupabaseConfigured: () => Boolean(supabase)
};
