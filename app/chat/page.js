'use client';

import React, { useState, useRef, useEffect } from 'react';

const SUGGESTED_QUESTIONS = [
  '산업현장 3대 핵심 추락재해 예방수칙과 안전난간 기준은?',
  '밀폐공간 작업 시 산소 농도 기준과 질식 예방 수칙은?',
  '환절기 전기화재 및 감전 예방을 위한 핵심 체크리스트는?',
  '철도 궤도 작업 시 가공전차선(25kV) 안전 이격거리 규정은?',
];

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ChatPage() {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: `반갑습니다. **BEPMC 공식 AI 안전 법규 & 제도 전문 RAG 컨설턴트**입니다.\n\n사내 Safety 문서 데이터(추락재해 예방수칙, 밀폐공간 질식재해 매뉴얼, 환절기 전기화재 체크리스트, 국토안전관리원 사고사례 등)를 Gemini 임베딩 모델(\`gemini-embedding-001\`)로 사전 분석하여 가장 정확한 근거를 바탕으로 답변합니다.\n\n모든 대화와 참고 출처는 좌측 대화 목록에 방별로 자동 기록됩니다.`,
      sources: [],
      timestamp: new Date().toISOString()
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState({
    dailyLimit: 1500,
    usedToday: 0,
    remainingToday: 1500,
  });
  const [isLocked, setIsLocked] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load chat rooms
  const loadRooms = async () => {
    try {
      const res = await fetch('/api/chat/rooms');
      const data = await res.json();
      if (data.success && Array.isArray(data.rooms)) {
        setRooms(data.rooms);
        if (!currentRoomId && data.rooms.length > 0) {
          selectRoom(data.rooms[0].id);
        }
      }
    } catch (e) {
      console.warn('Load rooms failed:', e);
    }
  };

  // Select a room
  const selectRoom = async (roomId) => {
    setCurrentRoomId(roomId);
    setSidebarOpen(false);
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}`);
      const data = await res.json();
      if (data.success && data.room) {
        const msgs = (data.room.messages || []).map((m) => ({
          id: m.id,
          role: m.role,
          text: m.content,
          sources: typeof m.sources === 'string' ? JSON.parse(m.sources || '[]') : (m.sources || []),
          timestamp: m.created_at
        }));
        if (msgs.length > 0) {
          setMessages(msgs);
        }
      }
    } catch (e) {
      console.warn('Load room messages failed:', e);
    }
  };

  // Start new chat
  const handleStartNewChat = () => {
    setCurrentRoomId(null);
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        text: `새 대화가 준비되었습니다. 현장 안전수칙, 법규, 사고대책을 자유롭게 문의해 주세요.`,
        sources: [],
        timestamp: new Date().toISOString()
      },
    ]);
    setSidebarOpen(false);
  };

  // Delete a room
  const handleDeleteRoom = async (e, roomId) => {
    e.stopPropagation();
    if (!confirm('이 대화방을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        if (currentRoomId === roomId) {
          handleStartNewChat();
        }
        loadRooms();
      }
    } catch (err) {
      alert('대화방 삭제 중 오류가 발생했습니다.');
    }
  };

  // Load quota status & check paid membership on mount
  useEffect(() => {
    fetch('/api/chat')
      .then((res) => res.json())
      .then((data) => {
        if (data.quota) {
          setQuota(data.quota);
        }
      })
      .catch((err) => console.warn('[Quota Fetch Error]:', err));

    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        const isLoggedIn = Boolean(data && data.isLoggedIn);
        const user = data.user;
        const tier = data.membershipTier || (data.membership === 'paid' ? 'PAID' : (data.membership === 'trial' ? 'TRIAL' : 'FREE'));
        const isPaid = (data.mode === 'admin' || user?.role === 'admin' || tier === 'PAID' || tier === 'TRIAL');
        if (!isPaid) {
          setIsLocked(true);
          setIsGuest(!isLoggedIn);
        } else {
          loadRooms();
        }
      })
      .catch(() => {
        setIsLocked(true);
        setIsGuest(true);
      });
  }, []);

  const handleSend = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: new Date().toISOString()
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const history = newMessages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          roomId: currentRoomId,
          history
        }),
      });

      const data = await res.json();

      if (data.quota) {
        setQuota(data.quota);
      }

      if (data.roomId && data.roomId !== currentRoomId) {
        setCurrentRoomId(data.roomId);
        loadRooms();
      }

      if (data.success) {
        const aiMsg = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: data.reply,
          sources: data.sources || [],
          model: data.model,
          timestamp: data.createdAt || new Date().toISOString()
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `오류가 발생했습니다: ${data.error || '답변을 불러오지 못했습니다.'}`,
          sources: [],
          isError: true,
          timestamp: new Date().toISOString()
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err) {
      const errorMsg = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        text: `네트워크 연결 중 문제가 발생했습니다: ${err.message}`,
        sources: [],
        isError: true,
        timestamp: new Date().toISOString()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-layout">
      {/* Sidebar for Chat Rooms */}
      <aside className={`chat-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="sidebar-logo-badge">AI</span>
            <span className="sidebar-title">대화 목록</span>
          </div>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>
            ✕
          </button>
        </div>

        <div className="sidebar-action">
          <button className="btn-new-chat" onClick={handleStartNewChat}>
            + 새 대화 시작
          </button>
        </div>

        <div className="rooms-container">
          {rooms.length === 0 ? (
            <div className="rooms-empty">저장된 대화가 없습니다.</div>
          ) : (
            rooms.map((r) => (
              <div
                key={r.id}
                onClick={() => selectRoom(r.id)}
                className={`room-item ${r.id === currentRoomId ? 'active' : ''}`}
              >
                <div className="room-info">
                  <div className="room-title">{r.title || '새로운 안전 상담'}</div>
                  <div className="room-time">{formatDate(r.updated_at || r.created_at)}</div>
                </div>
                <button
                  className="btn-room-del"
                  title="삭제"
                  onClick={(e) => handleDeleteRoom(e, r.id)}
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <div className="status-indicator">
            <span className="status-dot"></span>
            <span>RAG 지식 엔진 가동 중</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="chat-viewport">
        {/* Top Header */}
        <header className="chat-header">
          <div className="chat-header-content">
            <div className="chat-brand">
              <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(true)}>
                ☰
              </button>
              <a href="/" className="brand-logo" title="BEPMC 홈으로 이동">
                <span className="brand-accent">BEPMC</span>
              </a>
              <div className="brand-divider"></div>
              <div>
                <div className="title-row">
                  <h1 className="brand-title">AI 안전 법규 & 제도 RAG 컨설턴트</h1>
                  {/* Compact Quota Indicator */}
                  <div
                    className="quota-pill"
                    title={`Google Gemini API 일일 제공량: ${quota.dailyLimit}회 | 오늘 사용량: ${quota.usedToday}회 | 잔여량: ${quota.remainingToday}회`}
                  >
                    <span className="quota-dot"></span>
                    <span className="quota-text">
                      제공량 <strong>{quota.dailyLimit}</strong>회 / 사용량 <strong>{quota.usedToday}</strong>회 (잔여량 <strong>{quota.remainingToday}</strong>회)
                    </span>
                  </div>
                </div>
                <p className="brand-subtitle">
                  Project Management & Safety Support with Experiences and AI Technologies
                </p>
              </div>
            </div>
            <div className="header-actions">
              <button
                onClick={handleStartNewChat}
                className="btn-header-secondary"
                title="새 대화 시작"
              >
                새 대화
              </button>
              <a href="/" className="btn-header-primary">
                홈으로
              </a>
            </div>
          </div>
        </header>

        {/* Main Chat Stream */}
        <main className="chat-main">
          <div className="chat-stream-container">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`message-row ${msg.role === 'user' ? 'user-row' : 'assistant-row'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="avatar-bot">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2a3 3 0 0 0-3 3v1H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3V5a3 3 0 0 0-3-3Z" />
                      <circle cx="9" cy="13" r="1" fill="currentColor" />
                      <circle cx="15" cy="13" r="1" fill="currentColor" />
                      <path d="M10 17h4" />
                    </svg>
                  </div>
                )}

                <div className={`message-bubble ${msg.role === 'user' ? 'user-bubble' : 'assistant-bubble'}`}>
                  {msg.role === 'assistant' && (
                    <div className="bubble-badge">
                      <span>{msg.model ? `BEPMC AI (${msg.model})` : 'BEPMC AI RAG 컨설턴트'}</span>
                      <span className="badge-grounded">Safety RAG 검증</span>
                      {msg.timestamp && (
                        <span className="bubble-time">{formatTime(msg.timestamp)}</span>
                      )}
                    </div>
                  )}

                  <div className="message-content">
                    {msg.text.split('\n').map((line, i) => (
                      <React.Fragment key={i}>
                        {renderFormattedLine(line)}
                        {i < msg.text.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Safety RAG Document Citations */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources-container">
                      {/* Document Citations */}
                      {msg.sources.filter(s => s.type === 'document' || !s.uri).length > 0 && (
                        <div className="doc-sources-box">
                          <div className="sources-title">
                            📚 참고한 Safety 안전 문서 및 사례 ({msg.sources.filter(s => s.type === 'document' || !s.uri).length}건)
                          </div>
                          <div className="doc-grid">
                            {msg.sources.filter(s => s.type === 'document' || !s.uri).map((d, idx) => (
                              <div key={idx} className="doc-card">
                                <div className="doc-card-header">
                                  <span className="doc-card-title">{d.title}</span>
                                  {d.category && <span className="doc-card-cat">{d.category}</span>}
                                </div>
                                <div className="doc-card-snippet">{d.snippet}</div>
                                <div className="doc-card-footer">
                                  <span className="doc-card-source">출처: {d.source}</span>
                                  {d.similarity && (
                                    <span className="doc-card-sim">
                                      일치도 {Math.min(99, Math.round(d.similarity * 100))}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Web Citations */}
                      {msg.sources.filter(s => s.type === 'web' || s.uri).length > 0 && (
                        <div className="web-sources-box">
                          <div className="sources-title">
                            🌐 실시간 검색 참조 출처 ({msg.sources.filter(s => s.type === 'web' || s.uri).length}건)
                          </div>
                          <div className="sources-list">
                            {msg.sources.filter(s => s.type === 'web' || s.uri).map((s, idx) => (
                              <a
                                key={idx}
                                href={s.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="source-chip"
                                title={s.title}
                              >
                                <span className="source-num">{idx + 1}</span>
                                <span className="source-name">{s.title || s.uri}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {msg.role === 'user' && msg.timestamp && (
                    <div className="user-bubble-time">{formatTime(msg.timestamp)}</div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="avatar-user">
                    <span>나</span>
                  </div>
                )}
              </div>
            ))}

            {/* Loading Indicator */}
            {loading && (
              <div className="message-row assistant-row">
                <div className="avatar-bot">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a3 3 0 0 0-3 3v1H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3V5a3 3 0 0 0-3-3Z" />
                  </svg>
                </div>
                <div className="message-bubble assistant-bubble loading-bubble">
                  <div className="loading-pulse">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </div>
                  <span className="loading-text">Safety 문서 임베딩 벡터 검색 및 AI 분석 중...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Suggested Questions */}
        {messages.length <= 2 && !loading && (
          <div className="suggested-container">
            <div className="suggested-wrapper">
              <span className="suggested-label">💡 Safety 문서 기반 추천 질문:</span>
              <div className="suggested-chips">
                {SUGGESTED_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(q)}
                    className="suggested-chip"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Input Area */}
        <footer className="chat-footer">
          <div className="input-wrapper">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isLocked ? "🔒 유료 회원 전용 서비스입니다. 로그인 또는 유료 등급 신청 후 이용해 주세요." : "안전 관련 법규, 현장 수칙, 사고 예방 대책에 대해 질문해 주세요... (Enter: 전송, Shift+Enter: 줄바꿈)"}
              rows={1}
              disabled={loading || isLocked}
              className="chat-textarea"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading || isLocked}
              className="btn-send"
              title="질문 전송"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <p className="disclaimer-text">
            BEPMC AI는 Safety 사내 지침 및 실시간 검색을 참조하여 답변합니다. 인허가 및 법적 분쟁 등 중대 사안은 국가법령정보센터 원문 및 관계 기관의 유권해석을 최종 확인하시기 바랍니다.
          </p>
        </footer>

        {/* Paid Member Lock Modal */}
        {isLocked && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '2px solid #1c69d4', textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '16px', backgroundColor: '#eff6ff', color: '#1c69d4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', border: '1px solid #bfdbfe' }}>
                <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div style={{ display: 'inline-block', padding: '4px 12px', backgroundColor: '#fef3c7', color: '#78350f', borderRadius: '9999px', fontSize: '12px', fontWeight: 800, marginBottom: '8px' }}>
                💎 유료 구독 전용 서비스
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', marginBottom: '8px' }}>
                유료 회원만 이용 가능한 서비스입니다
              </h2>
              <p style={{ fontSize: '13.5px', color: '#475569', marginBottom: '24px', lineHeight: 1.6 }}>
                {isGuest
                  ? 'BEPMC AI 안전 법규 & 제도 RAG 챗봇은 정기구독 유료회원 및 맛보기 체험회원 전용 서비스입니다. 로그인 또는 회원가입 후 이용해 주세요.'
                  : '현재 고객님은 [일반 무료 회원] 등급입니다. 유료 정기구독(PAID)으로 전환하시면 RAG 기반 안전 법규 챗봇을 제한 없이 이용하실 수 있습니다.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {isGuest ? (
                  <>
                    <a href="/login.html?redirect=/chat" style={{ width: '100%', padding: '12px', backgroundColor: '#1c69d4', color: '#ffffff', borderRadius: '10px', fontWeight: 700, fontSize: '14px', textDecoration: 'none', display: 'block', boxSizing: 'border-box' }}>
                      로그인하기
                    </a>
                    <a href="/register.html" style={{ width: '100%', padding: '10px', backgroundColor: '#f1f5f9', color: '#334155', borderRadius: '10px', fontWeight: 600, fontSize: '13px', textDecoration: 'none', display: 'block', boxSizing: 'border-box' }}>
                      회원가입 신청
                    </a>
                  </>
                ) : (
                  <a href="/paid-onboarding.html" style={{ width: '100%', padding: '12px', background: 'linear-gradient(to right, #f59e0b, #d97706)', color: '#ffffff', borderRadius: '10px', fontWeight: 900, fontSize: '14px', textDecoration: 'none', display: 'block', boxSizing: 'border-box' }}>
                    💎 유료 등급 전환 신청
                  </a>
                )}
                <a href="/" style={{ width: '100%', padding: '8px', color: '#64748b', fontSize: '12px', fontWeight: 500, textDecoration: 'none', display: 'block' }}>
                  메인 홈페이지로 돌아가기
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Styling */}
      <style jsx>{`
        .chat-layout {
          display: flex;
          height: 100vh;
          overflow: hidden;
          background-color: #f8fafc;
        }

        /* Sidebar */
        .chat-sidebar {
          width: 280px;
          background-color: #ffffff;
          border-right: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          z-index: 20;
          transition: transform 0.2s ease-in-out;
        }
        .sidebar-header {
          padding: 16px;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .sidebar-logo-badge {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          background-color: #1c69d4;
          color: #ffffff;
          font-size: 11px;
          font-weight: 900;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sidebar-title {
          font-size: 14px;
          font-weight: 700;
          color: #1e293b;
        }
        .sidebar-close-btn {
          display: none;
          background: none;
          border: none;
          font-size: 16px;
          cursor: pointer;
        }
        .sidebar-action {
          padding: 12px;
        }
        .btn-new-chat {
          width: 100%;
          padding: 10px;
          background-color: #1c69d4;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: background-color 0.15s;
        }
        .btn-new-chat:hover {
          background-color: #0653b6;
        }
        .rooms-container {
          flex: 1;
          overflow-y: auto;
          padding: 6px 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .rooms-empty {
          text-align: center;
          padding: 30px 10px;
          font-size: 12px;
          color: #94a3b8;
        }
        .room-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.15s;
        }
        .room-item:hover {
          background-color: #f1f5f9;
        }
        .room-item.active {
          background-color: #eff6ff;
          border-color: #bfdbfe;
          color: #1d4ed8;
          font-weight: 700;
        }
        .room-info {
          flex: 1;
          min-width: 0;
          padding-right: 6px;
        }
        .room-title {
          font-size: 12.5px;
          color: #1e293b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .room-time {
          font-size: 10px;
          color: #94a3b8;
          margin-top: 2px;
        }
        .btn-room-del {
          background: none;
          border: none;
          font-size: 12px;
          cursor: pointer;
          opacity: 0.5;
          padding: 2px;
        }
        .btn-room-del:hover {
          opacity: 1;
        }
        .sidebar-footer {
          padding: 12px;
          border-top: 1px solid #f1f5f9;
          font-size: 11px;
          color: #64748b;
        }
        .status-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #10b981;
        }

        /* Viewport */
        .chat-viewport {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100vh;
          min-width: 0;
          background-color: #f8fafc;
          color: #1e293b;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
        }

        /* Header */
        .chat-header {
          background-color: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          padding: 12px 20px;
          flex-shrink: 0;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        }
        .chat-header-content {
          max-width: 1000px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .chat-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sidebar-toggle-btn {
          display: none;
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #334155;
        }
        .brand-logo {
          text-decoration: none;
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.5px;
        }
        .brand-accent {
          color: #1c69d4;
        }
        .brand-divider {
          width: 1px;
          height: 24px;
          background-color: #cbd5e1;
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .brand-title {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
          line-height: 1.2;
        }

        /* Quota Indicator Pill */
        .quota-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background-color: #eff6ff;
          border: 1px solid #bfdbfe;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          color: #1d4ed8;
          cursor: help;
        }
        .quota-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #10b981;
        }
        .quota-text {
          font-size: 11px;
          color: #1e40af;
          line-height: 1.2;
        }
        .quota-text strong {
          font-weight: 700;
          color: #1c69d4;
        }

        .brand-subtitle {
          font-size: 11px;
          color: #64748b;
          margin: 2px 0 0 0;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .btn-header-secondary {
          background-color: transparent;
          border: 1px solid #cbd5e1;
          color: #475569;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
        }
        .btn-header-primary {
          background-color: #1c69d4;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          padding: 6px 14px;
          border-radius: 6px;
          text-decoration: none;
        }

        /* Chat Main */
        .chat-main {
          flex: 1;
          overflow-y: auto;
          padding: 20px 16px;
        }
        .chat-stream-container {
          max-width: 860px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Message Bubbles */
        .message-row {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .user-row {
          justify-content: flex-end;
        }
        .avatar-bot {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background-color: #1c69d4;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .avatar-user {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background-color: #1e293b;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .message-bubble {
          max-width: 80%;
          padding: 14px 18px;
          border-radius: 12px;
          font-size: 14.5px;
          line-height: 1.6;
        }
        .user-bubble {
          background-color: #1c69d4;
          color: #ffffff;
          border-bottom-right-radius: 2px;
        }
        .user-bubble-time {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.7);
          text-align: right;
          margin-top: 4px;
        }
        .assistant-bubble {
          background-color: #ffffff;
          color: #1e293b;
          border: 1px solid #e2e8f0;
          border-bottom-left-radius: 2px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .bubble-badge {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11.5px;
          font-weight: 700;
          color: #1c69d4;
          margin-bottom: 8px;
          gap: 8px;
        }
        .badge-grounded {
          background-color: #d1fae5;
          color: #065f46;
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 4px;
        }
        .bubble-time {
          font-size: 10px;
          color: #94a3b8;
          font-weight: normal;
        }

        /* Sources Container */
        .sources-container {
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sources-title {
          font-size: 11.5px;
          font-weight: 700;
          color: #1e3a8a;
          margin-bottom: 6px;
        }
        .doc-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 8px;
        }
        .doc-card {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px;
          font-size: 11px;
        }
        .doc-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
          gap: 4px;
        }
        .doc-card-title {
          font-weight: 700;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .doc-card-cat {
          background-color: #e2e8f0;
          color: #334155;
          font-size: 9.5px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .doc-card-snippet {
          color: #475569;
          font-size: 10.5px;
          line-height: 1.4;
          margin-bottom: 6px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .doc-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 9.5px;
          color: #94a3b8;
        }
        .doc-card-source {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 140px;
        }
        .doc-card-sim {
          color: #1c69d4;
          font-weight: 700;
        }
        .sources-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .source-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background-color: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 2px 8px;
          font-size: 11px;
          color: #334155;
          text-decoration: none;
          max-width: 200px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .source-num {
          font-weight: 700;
          color: #1c69d4;
        }

        /* Loading Animation */
        .loading-bubble {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
        }
        .loading-pulse {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .dot {
          width: 6px;
          height: 6px;
          background-color: #1c69d4;
          border-radius: 50%;
          animation: pulse 1.4s infinite ease-in-out both;
        }
        .dot:nth-child(1) { animation-delay: -0.32s; }
        .dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
        .loading-text {
          font-size: 13px;
          color: #64748b;
        }

        /* Suggested Questions */
        .suggested-container {
          padding: 0 16px 12px 16px;
          max-width: 860px;
          margin: 0 auto;
          width: 100%;
        }
        .suggested-wrapper {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .suggested-label {
          font-size: 11.5px;
          font-weight: 700;
          color: #64748b;
        }
        .suggested-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .suggested-chip {
          background-color: #ffffff;
          border: 1px solid #cbd5e1;
          color: #1e293b;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .suggested-chip:hover {
          background-color: #eff6ff;
          border-color: #1c69d4;
          color: #1c69d4;
        }

        /* Footer */
        .chat-footer {
          background-color: #ffffff;
          border-top: 1px solid #e2e8f0;
          padding: 14px 20px 16px 20px;
          flex-shrink: 0;
        }
        .input-wrapper {
          max-width: 860px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 8px 12px;
          transition: border-color 0.15s ease;
        }
        .input-wrapper:focus-within {
          border-color: #1c69d4;
          background-color: #ffffff;
          box-shadow: 0 0 0 2px rgba(28, 105, 212, 0.1);
        }
        .chat-textarea {
          flex: 1;
          border: none;
          background: transparent;
          resize: none;
          outline: none;
          font-size: 14px;
          line-height: 1.5;
          color: #1e293b;
          max-height: 120px;
          font-family: inherit;
        }
        .btn-send {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: none;
          background-color: #1c69d4;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .btn-send:disabled {
          background-color: #cbd5e1;
          cursor: not-allowed;
        }
        .disclaimer-text {
          max-width: 860px;
          margin: 8px auto 0 auto;
          font-size: 10.5px;
          color: #94a3b8;
          text-align: center;
        }

        @media (max-width: 768px) {
          .chat-sidebar {
            position: fixed;
            top: 0;
            bottom: 0;
            left: 0;
            transform: translateX(-100%);
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          }
          .chat-sidebar.open {
            transform: translateX(0);
          }
          .sidebar-close-btn {
            display: block;
          }
          .sidebar-toggle-btn {
            display: block;
          }
          .brand-subtitle {
            display: none;
          }
          .message-bubble {
            max-width: 90%;
          }
        }
      `}</style>
    </div>
  );
}

function renderFormattedLine(line) {
  if (line.startsWith('> ')) {
    return (
      <div style={{ backgroundColor: '#fffbeb', borderLeft: '3px solid #f59e0b', padding: '6px 10px', borderRadius: '4px', margin: '6px 0', fontSize: '13px', color: '#92400e' }}>
        {renderInlineMarkdown(line.slice(2))}
      </div>
    );
  }
  if (line.startsWith('### ')) {
    return <strong style={{ fontSize: '15px', display: 'block', margin: '8px 0 4px 0', color: '#0f172a' }}>{line.replace('### ', '')}</strong>;
  }
  if (line.startsWith('## ')) {
    return <strong style={{ fontSize: '16px', display: 'block', margin: '10px 0 6px 0', color: '#0f172a' }}>{line.replace('## ', '')}</strong>;
  }
  if (line.startsWith('- ') || line.startsWith('* ')) {
    return (
      <span style={{ display: 'inline-block', marginLeft: '6px' }}>
        • {renderInlineMarkdown(line.slice(2))}
      </span>
    );
  }
  return renderInlineMarkdown(line);
}

function renderInlineMarkdown(text) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} style={{ backgroundColor: '#f1f5f9', color: '#1e40af', padding: '1px 5px', borderRadius: '4px', fontSize: '12px' }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
