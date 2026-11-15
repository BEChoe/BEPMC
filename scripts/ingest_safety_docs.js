/**
 * scripts/ingest_safety_docs.js
 * Safety 폴더 문서(추락재해, 밀폐공간 질식재해, 전기화재 예방수칙 등)를
 * Gemini gemini-embedding-001 모델로 임베딩하여 로컬 백업 및 Supabase 적재 준비
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SAFETY_DIR = path.join(__dirname, '..', 'Safety');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'safety-embeddings.json');
const SQL_OUTPUT_FILE = path.join(__dirname, '..', 'supabase-rag-schema.sql');

const API_KEY = process.env.GEMINI_API_KEY || '';

async function getEmbedding(text, apiKey) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: 768
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embedding API HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.embedding?.values || [];
}

async function main() {
  console.log('🚀 Safety 문서 데이터 청킹 및 Gemini 임베딩 시작...');

  const chunks = [];

  // 1. Text 문서 수집
  const txtFiles = [
    '01_산업현장_3대핵심_추락재해_예방수칙.txt',
    '02_밀폐공간_질식재해_예방_및_작업안전.txt',
    '03_환절기_전기화재_및_폭발예방_체크리스트.txt'
  ];

  for (const filename of txtFiles) {
    const filePath = path.join(SAFETY_DIR, filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      // 제목 추출
      const firstLine = content.split('\n')[0].replace(/[[\]]/g, '').trim();
      
      // 전체 문서 및 단락별 청킹
      chunks.push({
        source: filename,
        title: firstLine || filename,
        content: content.trim(),
        category: filename.includes('추락') ? '추락재해' : (filename.includes('밀폐') ? '밀폐질식' : '전기화재')
      });

      // 단락별 추가 세부 청크
      const sections = content.split(/\n(?=\d+\.)/);
      if (sections.length > 1) {
        sections.forEach((sec, idx) => {
          if (idx > 0 && sec.trim()) {
            const secTitle = sec.split('\n')[0].trim();
            chunks.push({
              source: filename,
              title: `${firstLine} - ${secTitle}`,
              content: sec.trim(),
              category: filename.includes('추락') ? '추락재해' : (filename.includes('밀폐') ? '밀폐질식' : '전기화재')
            });
          }
        });
      }
    }
  }

  // 2. 건설안전사고사례 CSV에서 주요 핵심 유형 추출 (철도/추락/끼임/감전 등 대표 5건)
  const csvPath = path.join(SAFETY_DIR, '국토안전관리원_건설안전사고사례_20250630.csv');
  if (fs.existsSync(csvPath)) {
    try {
      const csvBuffer = fs.readFileSync(csvPath);
      const decoder = new TextDecoder('euc-kr');
      const csvContent = decoder.decode(csvBuffer);
      const lines = csvContent.split('\n').filter(l => l.trim());
      // 대표 사고 사례 5건 요약 청킹
      for (let i = 1; i <= Math.min(6, lines.length - 1); i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 25) {
          const accidentName = (parts[0] || '').replace(/["\r]/g, '').trim();
          const accidentType = (parts[14] || parts[13] || '안전사고').replace(/["\r]/g, '').trim();
          const process = (parts[22] || '').replace(/["\r]/g, '').trim();
          const location = (parts[23] || '').replace(/["\r]/g, '').trim();
          const cause = (parts[32] || parts[parts.length - 2] || '원인 조사 중').replace(/["\r]/g, '').trim();
          const prevention = (parts[parts.length - 1] || '안전관리 강화').replace(/["\r]/g, '').trim();

          chunks.push({
            source: '국토안전관리원_건설안전사고사례_20250630.csv',
            title: `국토안전관리원 사고사례: [${accidentType}] ${accidentName.slice(0, 35)}`,
            content: `[사고명] ${accidentName}\n[사고종류] ${accidentType}\n[작업공정] ${process}\n[발생위치] ${location}\n[사고개요/원인] ${cause}\n[재발방지대책] ${prevention}`,
            category: '건설사고사례'
          });
        }
      }
    } catch (e) {
      console.warn('CSV 파싱 경고:', e.message);
    }
  }

  console.log(`총 ${chunks.length}개의 Safety 문서 청크 생성 완료. 임베딩 벡터 생성 중...`);

  // 임베딩 생성
  const embeddedDocs = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[${i + 1}/${chunks.length}] 임베딩 생성 중: ${chunk.title}`);
    try {
      if (API_KEY) {
        const vector = await getEmbedding(`${chunk.title}\n${chunk.content}`, API_KEY);
        chunk.embedding = vector;
      } else {
        chunk.embedding = [];
      }
      chunk.id = i + 1;
      chunk.created_at = new Date().toISOString();
      embeddedDocs.push(chunk);
      // Rate limit 완화
      await new Promise(r => setTimeout(r, 400));
    } catch (err) {
      console.warn(`청크 ${i + 1} 임베딩 실패 (${chunk.title}):`, err.message);
      chunk.embedding = [];
      embeddedDocs.push(chunk);
    }
  }

  // 로컬 JSON 저장
  const dataDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(embeddedDocs, null, 2), 'utf8');
  console.log(`✅ 로컬 임베딩 파일 저장 완료: ${OUTPUT_FILE}`);

  // Supabase SQL 스키마 및 적재 스크립트 생성
  generateSupabaseSql(embeddedDocs);
}

function generateSupabaseSql(docs) {
  let sql = `-- ========================================================
-- BEPSMC RAG Chatbot Supabase Vector & Chat Schema
-- pgvector 확장 활성화 및 문서 임베딩 / 대화 세션 테이블
-- ========================================================

-- 1. pgvector 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Safety 문서 및 임베딩 저장 테이블
CREATE TABLE IF NOT EXISTS safety_documents (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성 (코사인 유사도 검색 가속)
CREATE INDEX IF NOT EXISTS safety_docs_embedding_idx 
ON safety_documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 10);

-- 3. 벡터 유사도 검색 함수 (Cosine Similarity)
CREATE OR REPLACE FUNCTION match_safety_documents (
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 4
)
RETURNS TABLE (
  id bigint,
  source text,
  title text,
  content text,
  category text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    safety_documents.id,
    safety_documents.source,
    safety_documents.title,
    safety_documents.content,
    safety_documents.category,
    1 - (safety_documents.embedding <=> query_embedding) AS similarity
  FROM safety_documents
  WHERE 1 - (safety_documents.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- 4. 사용자별 채팅방(세션) 테이블
CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 채팅 메시지(대화 내역, 출처, 타임스탬프) 테이블
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_messages_room_idx ON chat_messages(room_id, created_at ASC);
CREATE INDEX IF NOT EXISTS chat_rooms_user_idx ON chat_rooms(user_id, updated_at DESC);
`;

  fs.writeFileSync(SQL_OUTPUT_FILE, sql, 'utf8');
  console.log(`✅ Supabase RAG SQL 스키마 생성 완료: ${SQL_OUTPUT_FILE}`);
}

main().catch(console.error);
