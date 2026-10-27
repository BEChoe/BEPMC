"""
app.py
- [웹 챗봇 GUI 서버]
- 외부 무거운 프레임워크(Node/npm 등) 설치 없이, 파이썬 표준 라이브러리(http.server)만으로 동작하는 경량 고성능 웹 챗봇
- 브라우저를 통해 질문하고, 서브 에이전트들의 실시간 추론 과정 및 출처를 시각적으로 확인 가능
- 실행 방법: python app.py
"""

import json
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
import webbrowser
import threading
from pathlib import Path

from pipeline import RAGPipeline

PORT = 8501
pipeline_instance: RAGPipeline = None


HTML_PAGE = """<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Desktop Docs RAG 챗봇 - AI 문서 비서</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@300;400;600;700;800&display=swap');
    body { font-family: 'Pretendard', sans-serif; }
    .chat-bubble-user { background: linear-gradient(135deg, #2563eb, #1d4ed8); }
    .chat-bubble-bot { background: #ffffff; border: 1px solid #e2e8f0; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen flex flex-col">

  <!-- 상단 네비게이션 헤더 -->
  <header class="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-sm">
    <div class="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl shadow-md">
          📚
        </div>
        <div>
          <h1 class="text-base font-bold text-white flex items-center gap-2">
            Desktop Docs RAG 챗봇
            <span class="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
              멀티 에이전트 파이프라인
            </span>
          </h1>
          <p class="text-xs text-slate-400">바탕화면 docs 문서 기반 실시간 지식 질의응답</p>
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <button id="btn-refresh" onclick="refreshDocs()" class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          문서 다시 읽기
        </button>
      </div>
    </div>
  </header>

  <!-- 문서 상태 대시보드 띠 -->
  <div class="bg-blue-900/10 border-b border-blue-100 py-2.5 px-4">
    <div class="max-w-5xl mx-auto flex flex-wrap items-center justify-between text-xs gap-2">
      <div class="flex items-center gap-2 text-slate-700">
        <span class="font-bold text-blue-800">📂 대상 폴더:</span>
        <code id="docs-path" class="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-900 font-mono text-[11px]">로딩 중...</code>
      </div>
      <div class="flex items-center gap-3 text-slate-600">
        <div id="ollama-badge" class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          🦙 Ollama 확인 중...
        </div>
        <div class="h-3 w-px bg-slate-300"></div>
        <div>색인된 문서: <strong id="doc-count" class="text-blue-700 font-bold">0</strong>개</div>
        <div class="h-3 w-px bg-slate-300"></div>
        <div>총 지식 조각: <strong id="chunk-count" class="text-emerald-700 font-bold">0</strong>개</div>
      </div>
    </div>
  </div>

  <!-- 메인 채팅 영역 -->
  <main class="flex-1 max-w-5xl w-full mx-auto p-4 flex flex-col">
    <!-- 메시지 목록 -->
    <div id="chat-messages" class="flex-1 space-y-4 mb-4 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
      
      <!-- 환영 인사말 -->
      <div class="chat-bubble-bot p-4 rounded-2xl shadow-sm space-y-3">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">🤖</div>
          <span class="font-bold text-slate-900 text-xs">RAG 에이전트 비서</span>
          <span class="text-[10px] text-slate-400">시스템 안내</span>
        </div>
        <div class="text-xs leading-relaxed text-slate-700 space-y-2">
          <p>안녕하세요! <strong>바탕화면의 docs 폴더</strong>에 보관된 문서를 분석하여 정확하고 명확하게 답변해 드리는 RAG 어시스턴트입니다.</p>
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] space-y-1">
            <div class="font-semibold text-slate-800">🔍 동작 방식 (2단계 멀티 에이전트 파이프라인):</div>
            <div>• <strong>Sub-Agent 1 (문서 검색)</strong>: 질문의 의미를 분석하여 관련성 높은 핵심 본문 청크를 실시간 탐색합니다.</div>
            <div>• <strong>Sub-Agent 2 (요약/답변)</strong>: 검색된 문맥을 바탕으로 출처(파일명, 청크 번호)를 명시하여 친절한 답변을 작성합니다.</div>
          </div>
        </div>

        <!-- 추천 질문 칩 -->
        <div id="sample-questions" class="pt-2 border-t border-slate-100">
          <span class="text-[11px] font-semibold text-slate-500 mb-2 block">💡 추천 질문 예시 (클릭 시 자동 입력):</span>
          <div class="flex flex-wrap gap-1.5" id="chip-container">
            <!-- 자바스크립트로 동적 로드 -->
          </div>
        </div>
      </div>

    </div>

    <!-- 하단 입력창 -->
    <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-lg sticky bottom-2">
      <form id="chat-form" onsubmit="handleSend(event)" class="flex gap-2 items-center">
        <input 
          type="text" 
          id="user-input" 
          placeholder="바탕화면 문서에 대해 궁금한 점을 물어보세요... (예: 스타트업 실패 원인은?)"
          autocomplete="off"
          class="flex-1 text-xs sm:text-sm p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
        <button 
          type="submit" 
          id="btn-send"
          class="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm px-5 py-3 rounded-xl transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
        >
          <span>질문하기</span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </button>
      </form>
    </div>
  </main>

  <script>
    async function loadStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        document.getElementById('docs-path').textContent = data.docs_dir;
        document.getElementById('doc-count').textContent = data.file_count;
        document.getElementById('chunk-count').textContent = data.total_chunks;
        
        // Ollama 상태 뱃지 갱신
        const ollamaEl = document.getElementById('ollama-badge');
        if (data.ollama && data.ollama.running) {
          if (data.ollama.active_model) {
            ollamaEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300';
            ollamaEl.innerHTML = `🦙 Ollama: <strong>${data.ollama.active_model}</strong> 사용 중`;
          } else {
            ollamaEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300';
            ollamaEl.innerHTML = `🦙 Ollama: 실행 중 (모델 없음)`;
          }
        } else {
          ollamaEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200';
          ollamaEl.innerHTML = `🦙 Ollama: 미실행 (로컬 엔진 작동)`;
        }
        
        // 추천 질문 칩 갱신
        const container = document.getElementById('chip-container');
        container.innerHTML = '';
        const samples = [
          "스타트업 실패의 주된 원인 1위는 뭐야?",
          "제품-시장 적합성(PMF)이란?",
          "현금 흐름 관리와 런웨이가 왜 중요한가요?",
          "현장 안전관리 3대 핵심 수칙 알려줘"
        ];
        samples.forEach(text => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'text-[11px] bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 px-2.5 py-1 rounded-lg transition';
          btn.textContent = text;
          btn.onclick = () => {
            document.getElementById('user-input').value = text;
            document.getElementById('user-input').focus();
          };
          container.appendChild(btn);
        });
      } catch (e) {
        console.error('Status fetch failed:', e);
      }
    }

    async function refreshDocs() {
      const btn = document.getElementById('btn-refresh');
      btn.disabled = true;
      btn.innerHTML = '🔄 스캔 중...';
      try {
        const res = await fetch('/api/refresh', { method: 'POST' });
        const data = await res.json();
        alert(`✅ 문서 갱신 완료!\\n- 대상 파일: ${data.file_count}개\\n- 생성된 청크: ${data.total_chunks}개`);
        await loadStatus();
      } catch (e) {
        alert('문서 갱신 중 오류가 발생했습니다.');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> 문서 다시 읽기';
      }
    }

    function appendMessage(sender, text, steps = [], sources = []) {
      const container = document.getElementById('chat-messages');
      const div = document.createElement('div');
      
      if (sender === 'user') {
        div.className = 'flex justify-end';
        div.innerHTML = `
          <div class="chat-bubble-user text-white p-3.5 rounded-2xl max-w-xl text-xs sm:text-sm shadow-md">
            ${escapeHtml(text)}
          </div>
        `;
      } else {
        div.className = 'chat-bubble-bot p-4 rounded-2xl shadow-sm space-y-3';
        
        // 파이프라인 단계 UI
        let stepsHtml = '';
        if (steps && steps.length > 0) {
          stepsHtml = `
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px] space-y-1">
              <div class="font-bold text-slate-700 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                멀티 에이전트 파이프라인 실행 완료
              </div>
              <div class="space-y-0.5 text-slate-500 pt-1">
                ${steps.map(s => `<div>• <strong>Step ${s.step} [${escapeHtml(s.agent)}]</strong>: ${escapeHtml(s.action)} <span class="text-slate-400">(${s.duration_ms}ms)</span></div>`).join('')}
              </div>
            </div>
          `;
        }

        // 마크다운 줄바꿈 및 서식 간이 변환
        let formattedText = escapeHtml(text)
          .replace(/\\*\\*(.*?)\\*\\*/g, '<strong class="text-slate-900 font-bold">$1</strong>')
          .replace(/^### (.*$)/gim, '<h4 class="font-bold text-slate-900 text-sm mt-3 mb-1 border-b pb-1">$1</h4>')
          .replace(/^> (.*$)/gim, '<blockquote class="border-l-2 border-blue-500 pl-2 text-slate-600 bg-blue-50/50 py-1 rounded-r">$1</blockquote>')
          .replace(/\\n/g, '<br>');

        // 출처 태그
        let sourcesHtml = '';
        if (sources && sources.length > 0) {
          sourcesHtml = `
            <div class="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span class="font-bold text-slate-500">참고 문서 출처:</span>
              ${sources.map(src => `<span class="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md font-mono">${escapeHtml(src)}</span>`).join('')}
            </div>
          `;
        }

        div.innerHTML = `
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">🤖</div>
            <span class="font-bold text-slate-900 text-xs">RAG 에이전트 비서</span>
          </div>
          ${stepsHtml}
          <div class="text-xs sm:text-sm leading-relaxed text-slate-800">
            ${formattedText}
          </div>
          ${sourcesHtml}
        `;
      }

      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    async function handleSend(e) {
      e.preventDefault();
      const input = document.getElementById('user-input');
      const query = input.value.trim();
      if (!query) return;

      input.value = '';
      appendMessage('user', query);

      const btn = document.getElementById('btn-send');
      btn.disabled = true;

      // 임시 로딩 말풍선
      const loadingDiv = document.createElement('div');
      loadingDiv.id = 'temp-loading';
      loadingDiv.className = 'chat-bubble-bot p-3 rounded-2xl flex items-center gap-2 text-xs text-slate-500';
      loadingDiv.innerHTML = '<span class="animate-spin text-base">⏳</span> 두 서브 에이전트(검색·요약)가 문서를 분석 중입니다...';
      document.getElementById('chat-messages').appendChild(loadingDiv);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        const data = await res.json();
        
        const temp = document.getElementById('temp-loading');
        if (temp) temp.remove();

        appendMessage('bot', data.answer, data.pipeline_steps, data.sources);
      } catch (err) {
        const temp = document.getElementById('temp-loading');
        if (temp) temp.remove();
        appendMessage('bot', '죄송합니다. 서버 통신 중 오류가 발생했습니다.');
      } finally {
        btn.disabled = false;
        document.getElementById('user-input').focus();
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // 초기 로딩
    loadStatus();
  </script>
</body>
</html>
"""


class RAGHTTPRequestHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/" or parsed.path == "/index.html":
            self._set_headers(200, "text/html")
            self.wfile.write(HTML_PAGE.encode("utf-8"))
        elif parsed.path == "/api/status":
            self._set_headers(200)
            status_data = {
                "docs_dir": str(pipeline_instance.loader.docs_dir),
                "file_count": len(pipeline_instance.indexed_files),
                "files": pipeline_instance.indexed_files,
                "total_chunks": pipeline_instance.total_chunks,
                "ollama": pipeline_instance.generator.get_ollama_status()
            }
            self.wfile.write(json.dumps(status_data, ensure_ascii=False).encode("utf-8"))
        else:
            self._set_headers(404, "text/plain")
            self.wfile.write(b"Not Found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        if parsed.path == "/api/chat":
            try:
                data = json.loads(body.decode("utf-8"))
                query = data.get("query", "")
                result = pipeline_instance.ask(query)
                self._set_headers(200)
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

        elif parsed.path == "/api/refresh":
            try:
                result = pipeline_instance.refresh_knowledge_base()
                self._set_headers(200)
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
            except Exception as e:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(b"Not Found")


def run_server(port=PORT):
    global pipeline_instance
    print("⏳ 바탕화면 docs 폴더 문서를 로드하고 인덱스를 생성하는 중...")
    pipeline_instance = RAGPipeline()
    
    server_address = ("0.0.0.0", port)
    httpd = HTTPServer(server_address, RAGHTTPRequestHandler)
    url = f"http://localhost:{port}"
    print(f"\n" + "=" * 60)
    print(f"  🚀 Desktop Docs RAG 챗봇 웹 서비스가 시작되었습니다!")
    print(f"  👉 브라우저 주소: {url}")
    print(f"  📂 연결된 문서 폴더: {pipeline_instance.loader.docs_dir}")
    print(f"  📄 색인 파일: {len(pipeline_instance.indexed_files)}개 | 총 {pipeline_instance.total_chunks}개 청크")
    print("=" * 60)
    print("  * 종료하려면 터미널에서 Ctrl + C 를 누르세요.\n")

    # 웹 브라우저 자동 오픈
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 서버를 안전하게 종료합니다.")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
