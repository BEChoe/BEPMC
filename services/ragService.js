/**
 * services/ragService.js
 * BEPSMC AI RAG (Retrieval-Augmented Generation) & Chat Storage Service
 * 
 * - 문서/질문 임베딩: Gemini gemini-embedding-001 (768 차원)
 * - 벡터 검색 및 채팅방/메시지 저장:
 *     1) Supabase pgvector 및 tables (SUPABASE_URL / SUPABASE_KEY 제공 시)
 *     2) 로컬 Fallback (Supabase 미설정 시 data/safety-embeddings.json & data/chat-rooms.json)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const neo4jGraphService = require('./neo4jGraphService');

const EMBEDDINGS_FILE = path.join(process.cwd(), 'data', 'safety-embeddings.json');
const CHAT_ROOMS_FILE = path.join(process.cwd(), 'data', 'chat-rooms.json');

// Supabase 환경 변수 확인
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

let supabaseClient = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('[RAG] Supabase client initialized.');
  } catch (e) {
    console.warn('[RAG] Supabase init warning:', e.message);
  }
}

// --------------------------------------------------------------------------
// 1. Gemini Embedding
// --------------------------------------------------------------------------
async function getQueryEmbedding(text) {
  if (!GEMINI_API_KEY) {
    return null;
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[RAG] Embedding API error (${response.status}):`, errText);
      return null;
    }
    const data = await response.json();
    return data.embedding?.values || null;
  } catch (err) {
    console.warn('[RAG] getQueryEmbedding exception:', err.message);
    return null;
  }
}

// --------------------------------------------------------------------------
// 2. Vector Math Helper (Cosine Similarity)
// --------------------------------------------------------------------------
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// --------------------------------------------------------------------------
// 3. Search Safety Documents (Supabase or Local Fallback)
// --------------------------------------------------------------------------
async function searchSafetyDocuments(query, options = {}) {
  const topK = options.topK || 3;
  const threshold = options.threshold || 0.45;

  // 1) 쿼리 임베딩 생성
  const queryVector = await getQueryEmbedding(query);

  // 2) Supabase가 설정되어 있는 경우 Supabase RPC 호출
  if (supabaseClient && queryVector) {
    try {
      const { data, error } = await supabaseClient.rpc('match_safety_documents', {
        query_embedding: queryVector,
        match_threshold: threshold,
        match_count: topK
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map(d => ({
          id: d.id,
          source: d.source,
          title: d.title,
          content: d.content,
          category: d.category,
          similarity: Number(d.similarity?.toFixed(4) || 0)
        }));
      }
    } catch (e) {
      console.warn('[RAG] Supabase vector search error, falling back to local:', e.message);
    }
  }

  // 3) Local Fallback (data/safety-embeddings.json)
  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    return [];
  }

  try {
    const rawDocs = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf8'));
    const queryLower = query.toLowerCase();
    const keywords = ['추락', '안전대', '안전난간', '작업발판', '비계', '개구부', 
                      '밀폐', '질식', '산소', '유해가스', '송기마스크', '공기호흡기',
                      '전기', '화재', '감전', '이격거리', '전차선', '접지', '누전',
                      '철도', '궤도', '복선', '압착', '열차'];

    const scored = rawDocs.map(doc => {
      let score = 0;
      if (queryVector && doc.embedding && doc.embedding.length === queryVector.length) {
        score = cosineSimilarity(queryVector, doc.embedding);
      }
      
      // Keyword bonus boost for precise retrieval
      const docText = `${doc.title} ${doc.content}`.toLowerCase();
      let keywordHits = 0;
      keywords.forEach(kw => {
        if (queryLower.includes(kw) && docText.includes(kw)) {
          keywordHits++;
        }
      });
      const boostedScore = score + (keywordHits * 0.08);

      return {
        id: doc.id,
        source: doc.source,
        title: doc.title,
        content: doc.content,
        category: doc.category,
        similarity: Number(boostedScore.toFixed(4))
      };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  } catch (err) {
    console.warn('[RAG] Local document search error:', err.message);
    return [];
  }
}

// --------------------------------------------------------------------------
// 3-1. Hybrid GraphRAG (Vector Search + Neo4j / Local Knowledge Graph)
// --------------------------------------------------------------------------
async function searchHybridRAG(query, options = {}) {
  // 1) 벡터 검색 (Supabase pgvector or 로컬 임베딩)
  let safetyDocs = [];
  try {
    safetyDocs = await searchSafetyDocuments(query, options);
  } catch (err) {
    console.warn('[Hybrid RAG] Vector search error:', err.message);
  }

  // 2) 지식 그래프 다단계 관계망 탐색 (100% 무료 로컬 내장 엔진 or Neo4j AuraDB)
  let graphResult = null;
  let graphContext = '';
  try {
    graphResult = await neo4jGraphService.searchSafetyGraph(query, options);
    if (graphResult) {
      graphContext = neo4jGraphService.formatGraphContext(graphResult);
    }
  } catch (err) {
    console.warn('[Hybrid RAG] Graph traversal error:', err.message);
  }

  return {
    safetyDocs,
    graphResult,
    graphContext
  };
}

// --------------------------------------------------------------------------
// 4. Chat Rooms & Messages Management (Supabase or Local JSON)
// --------------------------------------------------------------------------
function readLocalChatRooms() {
  if (!fs.existsSync(CHAT_ROOMS_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(CHAT_ROOMS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeLocalChatRooms(rooms) {
  const dir = path.dirname(CHAT_ROOMS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CHAT_ROOMS_FILE, JSON.stringify(rooms, null, 2), 'utf8');
}

async function listRooms(userId) {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('chat_rooms')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (!error && data) return data;
    } catch (e) {
      console.warn('[RAG] Supabase listRooms error:', e.message);
    }
  }

  // Local fallback
  const rooms = readLocalChatRooms();
  return rooms
    .filter(r => r.user_id === userId || !r.user_id)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

async function createRoom(userId, title) {
  const roomTitle = title || '새로운 안전 상담 대화';
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('chat_rooms')
        .insert([{ user_id: userId, title: roomTitle }])
        .select()
        .single();
      if (!error && data) return data;
    } catch (e) {
      console.warn('[RAG] Supabase createRoom error:', e.message);
    }
  }

  // Local fallback
  const rooms = readLocalChatRooms();
  const newRoom = {
    id: `room-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    user_id: userId,
    title: roomTitle,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    messages: []
  };
  rooms.unshift(newRoom);
  writeLocalChatRooms(rooms);
  return newRoom;
}

async function getRoom(roomId, userId) {
  if (supabaseClient) {
    try {
      const { data: room, error: rErr } = await supabaseClient
        .from('chat_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (!rErr && room) {
        const { data: messages, error: mErr } = await supabaseClient
          .from('chat_messages')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });
        
        return {
          ...room,
          messages: (!mErr && messages) ? messages : []
        };
      }
    } catch (e) {
      console.warn('[RAG] Supabase getRoom error:', e.message);
    }
  }

  // Local fallback
  const rooms = readLocalChatRooms();
  const room = rooms.find(r => r.id === roomId);
  return room || null;
}

async function addMessage(roomId, userId, role, content, sources = []) {
  const now = new Date().toISOString();
  if (supabaseClient) {
    try {
      await supabaseClient.from('chat_messages').insert([{
        room_id: roomId,
        user_id: userId,
        role,
        content,
        sources: JSON.stringify(sources),
        created_at: now
      }]);
      await supabaseClient.from('chat_rooms').update({
        updated_at: now
      }).eq('id', roomId);
    } catch (e) {
      console.warn('[RAG] Supabase addMessage error:', e.message);
    }
  }

  // Local fallback
  const rooms = readLocalChatRooms();
  const roomIdx = rooms.findIndex(r => r.id === roomId);
  if (roomIdx !== -1) {
    if (!rooms[roomIdx].messages) rooms[roomIdx].messages = [];
    rooms[roomIdx].messages.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      room_id: roomId,
      user_id: userId,
      role,
      content,
      sources,
      created_at: now
    });
    rooms[roomIdx].updated_at = now;
    // Auto title update if this is the first user question
    if (role === 'user' && (rooms[roomIdx].title === '새로운 안전 상담 대화' || !rooms[roomIdx].title)) {
      rooms[roomIdx].title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
    }
    writeLocalChatRooms(rooms);
  }
}

async function deleteRoom(roomId, userId) {
  if (supabaseClient) {
    try {
      await supabaseClient.from('chat_rooms').delete().eq('id', roomId);
    } catch (e) {
      console.warn('[RAG] Supabase deleteRoom error:', e.message);
    }
  }

  // Local fallback
  let rooms = readLocalChatRooms();
  rooms = rooms.filter(r => r.id !== roomId);
  writeLocalChatRooms(rooms);
  return { success: true };
}

module.exports = {
  getQueryEmbedding,
  searchSafetyDocuments,
  searchHybridRAG,
  neo4jGraphService,
  listRooms,
  createRoom,
  getRoom,
  addMessage,
  deleteRoom
};
