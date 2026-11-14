'use client';

import React, { useState, useRef, useEffect } from 'react';

const SUGGESTED_QUESTIONS = [
  '철도 궤도 작업 시 4대 중대재해(압착/감전/충돌 등) 예방 기준은?',
  '2026년 중대재해처벌법 핵심 안전보건관리체계 체크리스트는?',
  '가공전차선(25kV) 인근 작업 시 안전 이격거리 규정은?',
  '철도보호지구(선로 30m 이내) 행위 제한 및 안전 관리 절차는?',
];

export default function ChatPage() {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: `반갑습니다. **BEPMC 공식 AI 안전 법규 & 제도 전문 컨설턴트**입니다.\n\n철도안전법, 철도기술기준, 산업안전보건법, 중대재해처벌법 및 2026년 최신 안전 고시·제도에 대해 궁금한 점을 질문해 주세요.\n**Google Search Grounding** 및 **BEPMC 안전 지식 엔진**이 연동되어 있어 실시간 웹 정보와 전문 법규 지식을 종합하여 답변해 드립니다.`,
      sources: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState({
    dailyLimit: 1500,
    usedToday: 0,
    remainingToday: 1500,
  });

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load quota status on mount
  useEffect(() => {
    fetch('/api/chat')
      .then((res) => res.json())
      .then((data) => {
        if (data.quota) {
          setQuota(data.quota);
        }
      })
      .catch((err) => console.warn('[Quota Fetch Error]:', err));
  }, []);

  const handleSend = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: query,
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
        body: JSON.stringify({ message: query, history }),
      });

      const data = await res.json();

      if (data.quota) {
        setQuota(data.quota);
      }

      if (data.success) {
        const aiMsg = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          text: data.reply,
          sources: data.sources || [],
          searchQueries: data.searchQueries || [],
          model: data.model,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `오류가 발생했습니다: ${data.error || '답변을 불러오지 못했습니다.'}`,
          sources: [],
          isError: true,
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

  const handleClearChat = () => {
    if (confirm('대화 내용을 모두 초기화할까요?')) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          text: `대화가 초기화되었습니다. 철도 및 산업안전 법규, 제도에 대해 무엇이든 질문해 주세요.`,
          sources: [],
        },
      ]);
    }
  };

  return (
    <div className="chat-viewport">
      {/* Top Header */}
      <header className="chat-header">
        <div className="chat-header-content">
          <div className="chat-brand">
            <a href="/" className="brand-logo" title="BEPMC 홈으로 이동">
              <span className="brand-accent">BEPMC</span>
            </a>
            <div className="brand-divider"></div>
            <div>
              <div className="title-row">
                <h1 className="brand-title">AI 안전 법규 & 제도 컨설턴트</h1>
                {/* Compact Quota Indicator */}
                <div
                  className="quota-pill"
                  title={`Google Gemini API 일일 제공량: ${quota.dailyLimit}회 | 오늘 사용량: ${quota.usedToday}회 | 잔여량: ${quota.remainingToday}회 (매일 KST 09:00 자동 리셋)`}
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
              onClick={handleClearChat}
              className="btn-header-secondary"
              title="대화 초기화"
            >
              대화 초기화
            </button>
            <a href="/" className="btn-header-primary">
              홈으로 돌아가기
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
                    <span>{msg.model ? `BEPMC AI (${msg.model})` : 'BEPMC AI 컨설턴트'}</span>
                    {msg.sources && msg.sources.length > 0 && (
                      <span className="badge-grounded">🌐 실시간 웹 검색 연동</span>
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

                {/* Sources / Grounding Metadata */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="sources-container">
                    <div className="sources-title">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                      <span>실시간 검색 참조 출처 ({msg.sources.length})</span>
                    </div>
                    <div className="sources-list">
                      {msg.sources.map((s, idx) => (
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
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      ))}
                    </div>
                  </div>
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
                <span className="loading-text">법령 및 안전 기준을 검색·분석하여 답변을 작성 중입니다...</span>
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
            <span className="suggested-label">💡 추천 질문:</span>
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
            placeholder="안전 관련 법규, 시행령, 지침 또는 제도에 대해 질문해 주세요... (Enter: 전송, Shift+Enter: 줄바꿈)"
            rows={1}
            disabled={loading}
            className="chat-textarea"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
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
          BEPMC AI는 공식 법령 및 실시간 Google Search를 참조하여 답변합니다. 인허가 및 법적 분쟁 등 중대 사안은 국가법령정보센터 원문 및 관계 기관의 유권해석을 최종 확인하시기 바랍니다.
        </p>
      </footer>

      {/* Styling */}
      <style jsx>{`
        .chat-viewport {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background-color: #f7f7f7;
          color: #262626;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
        }

        /* Header */
        .chat-header {
          background-color: #ffffff;
          border-bottom: 1px solid #e6e6e6;
          padding: 12px 24px;
          flex-shrink: 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .chat-header-content {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .chat-brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .brand-logo {
          text-decoration: none;
          font-size: 24px;
          font-weight: 800;
          color: #1a1a1a;
          letter-spacing: -0.5px;
        }
        .brand-accent {
          color: #1c69d4;
        }
        .brand-divider {
          width: 1px;
          height: 28px;
          background-color: #e6e6e6;
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .brand-title {
          font-size: 17px;
          font-weight: 700;
          color: #1a1a1a;
          margin: 0;
          line-height: 1.2;
        }

        /* Quota Indicator Pill */
        .quota-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background-color: #f0f5fc;
          border: 1px solid #cce0fa;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 11.5px;
          color: #2a5298;
          cursor: help;
          transition: all 0.15s ease;
        }
        .quota-pill:hover {
          background-color: #e4eefd;
          border-color: #1c69d4;
        }
        .quota-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #22c55e;
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
        }
        .quota-text {
          font-size: 11.5px;
          color: #3b5998;
          line-height: 1.2;
        }
        .quota-text strong {
          font-weight: 700;
          color: #1c69d4;
        }

        .brand-subtitle {
          font-size: 11px;
          color: #6b6b6b;
          margin: 2px 0 0 0;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .btn-header-secondary {
          background-color: transparent;
          border: 1px solid #d6d6d6;
          color: #3c3c3c;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-header-secondary:hover {
          background-color: #f0f0f0;
          border-color: #b5b5b5;
        }
        .btn-header-primary {
          background-color: #1c69d4;
          border: none;
          color: #ffffff;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 4px;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          transition: background-color 0.15s ease;
        }
        .btn-header-primary:hover {
          background-color: #0653b6;
        }

        /* Main Stream */
        .chat-main {
          flex: 1;
          overflow-y: auto;
          padding: 24px 16px;
        }
        .chat-stream-container {
          max-width: 860px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Message Rows */
        .message-row {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .user-row {
          justify-content: flex-end;
        }
        .assistant-row {
          justify-content: flex-start;
        }

        /* Avatars */
        .avatar-bot {
          width: 36px;
          height: 36px;
          border-radius: 6px;
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
          border-radius: 6px;
          background-color: #262e38;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          flex-shrink: 0;
        }

        /* Bubbles */
        .message-bubble {
          max-width: 80%;
          padding: 16px 20px;
          border-radius: 8px;
          font-size: 15px;
          line-height: 1.65;
          word-break: break-word;
        }
        .user-bubble {
          background-color: #1c69d4;
          color: #ffffff;
          border-bottom-right-radius: 2px;
        }
        .assistant-bubble {
          background-color: #ffffff;
          color: #262626;
          border: 1px solid #e6e6e6;
          border-bottom-left-radius: 2px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
        }

        .bubble-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 12px;
          font-weight: 700;
          color: #1c69d4;
        }
        .badge-grounded {
          background-color: #e8f2fe;
          color: #1c69d4;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .message-content {
          font-size: 14.5px;
          color: inherit;
        }

        /* Sources */
        .sources-container {
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid #ebebeb;
        }
        .sources-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #6b6b6b;
          margin-bottom: 8px;
        }
        .sources-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .source-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background-color: #f7f7f7;
          border: 1px solid #e6e6e6;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 11.5px;
          color: #3c3c3c;
          text-decoration: none;
          max-width: 260px;
          transition: all 0.15s ease;
        }
        .source-chip:hover {
          background-color: #edf5ff;
          border-color: #1c69d4;
          color: #1c69d4;
        }
        .source-num {
          font-weight: 700;
          color: #1c69d4;
        }
        .source-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Loading */
        .loading-bubble {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
        }
        .loading-pulse {
          display: flex;
          gap: 4px;
        }
        .dot {
          width: 8px;
          height: 8px;
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
          font-size: 13.5px;
          color: #6b6b6b;
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
          gap: 8px;
        }
        .suggested-label {
          font-size: 12px;
          font-weight: 700;
          color: #6b6b6b;
        }
        .suggested-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .suggested-chip {
          background-color: #ffffff;
          border: 1px solid #d6d6d6;
          color: #262626;
          padding: 8px 14px;
          border-radius: 20px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }
        .suggested-chip:hover {
          background-color: #edf5ff;
          border-color: #1c69d4;
          color: #1c69d4;
        }

        /* Footer */
        .chat-footer {
          background-color: #ffffff;
          border-top: 1px solid #e6e6e6;
          padding: 16px 24px 20px 24px;
          flex-shrink: 0;
        }
        .input-wrapper {
          max-width: 860px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 10px;
          background-color: #f7f7f7;
          border: 1px solid #d6d6d6;
          border-radius: 8px;
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
          font-size: 14.5px;
          line-height: 1.5;
          color: #262626;
          max-height: 120px;
          font-family: inherit;
        }
        .chat-textarea::placeholder {
          color: #9a9a9a;
        }
        .btn-send {
          width: 38px;
          height: 38px;
          border-radius: 6px;
          border: none;
          background-color: #1c69d4;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: background-color 0.15s ease;
        }
        .btn-send:hover:not(:disabled) {
          background-color: #0653b6;
        }
        .btn-send:disabled {
          background-color: #d6d6d6;
          cursor: not-allowed;
        }
        .disclaimer-text {
          max-width: 860px;
          margin: 10px auto 0 auto;
          font-size: 11px;
          color: #9a9a9a;
          text-align: center;
          line-height: 1.4;
        }

        @media (max-width: 640px) {
          .chat-header { padding: 10px 14px; }
          .brand-title { font-size: 15px; }
          .brand-subtitle { display: none; }
          .quota-remain { display: none; }
          .message-bubble { max-width: 90%; }
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
    return <strong style={{ fontSize: '16px', display: 'block', margin: '8px 0 4px 0', color: '#1a1a1a' }}>{line.replace('### ', '')}</strong>;
  }
  if (line.startsWith('## ')) {
    return <strong style={{ fontSize: '17px', display: 'block', margin: '10px 0 6px 0', color: '#1a1a1a' }}>{line.replace('## ', '')}</strong>;
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
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
