/**
 * scripts/upload_to_supabase.js
 * data/safety-embeddings.json 에 사전 임베딩된 18개 Safety 문서를
 * 사용자가 제공한 Supabase safety_documents 테이블로 일괄 적재
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const EMBEDDINGS_FILE = path.join(__dirname, '..', 'data', 'safety-embeddings.json');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function upload() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ .env 에 SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY(또는 SUPABASE_ANON_KEY)를 먼저 입력해 주세요.');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    console.error(`❌ 임베딩 파일이 존재하지 않습니다: ${EMBEDDINGS_FILE}`);
    process.exit(1);
  }

  const docs = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf8'));
  console.log(`📦 총 ${docs.length}개의 임베딩 문서를 Supabase safety_documents 테이블로 적재합니다...`);

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const { error } = await supabase.from('safety_documents').insert([{
      source: doc.source,
      title: doc.title,
      content: doc.content,
      category: doc.category,
      embedding: doc.embedding
    }]);

    if (error) {
      console.warn(`[${i + 1}/${docs.length}] 적재 실패 (${doc.title}):`, error.message);
    } else {
      console.log(`[${i + 1}/${docs.length}] ✅ 적재 완료: ${doc.title}`);
    }
  }

  console.log('🎉 모든 Safety 문서가 Supabase에 성공적으로 적재되었습니다!');
}

upload().catch(console.error);
