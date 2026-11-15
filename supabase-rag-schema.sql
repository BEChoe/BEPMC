-- ========================================================
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
