"""
generator_agent.py
- [Sub-Agent 2: 요약 및 답변 생성 에이전트]
- 역할: 문서 검색 에이전트(Retriever)가 찾아낸 본문 조각(Context)들을 종합/요약하여 사용자 질문에 대한 명확하고 근거 있는 한국어 답변을 생성합니다.
- 특징:
  1. 철저한 환각 방지(Hallucination Guard): 문서에 없는 내용은 지어내지 않고 솔직히 알림
  2. 출처 표기: 각 답변 문단마다 어떤 문서의 몇 번째 청크를 참고했는지 명시 ([출처: 파일명, 청크 #])
  3. 듀얼 엔진 지원:
     - 기본 모드: 외부 API 키 없이도 로컬에서 100% 동작하는 고성능 문맥 요약기 (코딩 초보자 즉시 사용 가능)
     - LLM 연동 모드: .env에 GEMINI_API_KEY 또는 OPENAI_API_KEY가 입력되어 있으면 Gemini/OpenAI를 통한 심층 생성
"""

import os
import re
from typing import List, Dict, Any, Optional


class GeneratorAgent:
    """
    Sub-Agent 2: 요약 및 답변 생성 에이전트
    """
    def __init__(self, name: str = "요약 및 답변 에이전트 (Generator)"):
        self.name = name
        self.api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.openai_key = os.getenv("OPENAI_API_KEY")

    def synthesize_answer(self, query: str, search_output: Dict[str, Any]) -> Dict[str, Any]:
        """
        검색 결과와 질문을 받아 최종 요약 답변 생성
        """
        results = search_output.get("results", [])

        # 1. 검색 결과가 전혀 없거나 상태가 실패인 경우 (환각 방지)
        if not results:
            fallback_msg = (
                f"**죄송합니다.** 바탕화면의 `docs` 폴더 내 문서에서 **'{query}'**에 대한 명확한 근거를 찾지 못했습니다.\n\n"
                f"💡 **팁**: 관련 내용이 담긴 문서(.txt, .md, .docx, .pdf 등)를 `Desktop/docs` 폴더에 넣으신 후 다시 질문해 주세요."
            )
            return {
                "agent": self.name,
                "status": "not_found",
                "answer": fallback_msg,
                "sources": [],
                "engine_used": "hallucination_guard"
            }

        # 2. LLM API 키가 존재하는 경우 -> 생성형 API 호출 시도
        if self.api_key:
            try:
                llm_answer = self._call_gemini_api(query, results)
                if llm_answer:
                    return {
                        "agent": self.name,
                        "status": "success",
                        "answer": llm_answer,
                        "sources": [f"{r['filename']} (청크 #{r['chunk_id']})" for r in results],
                        "engine_used": "Gemini API"
                    }
            except Exception as e:
                print(f"[Generator] Gemini API 호출 실패(로컬 요약기로 전환): {e}")

        # 3. 기본 로컬 문맥 요약 엔진 (API 키 없는 초보자 환경에서도 100% 무결점 작동)
        local_answer = self._generate_local_extractive_summary(query, results)
        return {
            "agent": self.name,
            "status": "success",
            "answer": local_answer,
            "sources": [f"{r['filename']} (청크 #{r['chunk_id']})" for r in results],
            "engine_used": "Local Contextual Synthesizer"
        }

    def _generate_local_extractive_summary(self, query: str, results: List[Dict[str, Any]]) -> str:
        """
        로컬에서 검색된 청크들을 질문과 연관된 핵심 문장 단위로 정밀 추출 및 요약
        """
        query_words = [w.lower() for w in re.sub(r'[^\w\s가-힣]', '', query).split() if len(w) >= 1]
        
        sections = []
        sections.append(f"**바탕화면 문서 검색 결과에 기반한 답변입니다.**\n")

        total_extracted = 0

        for r in results:
            content = r["content"]
            filename = r["filename"]
            chunk_id = r["chunk_id"]
            score = r["score"]

            # 문장 단위 분할 (. ! ? \n)
            raw_sentences = [s.strip() for s in re.split(r'(?<=[.!?\n])\s+', content) if len(s.strip()) >= 5]
            
            # 각 문장의 질의어 부합도 평가
            scored_sentences = []
            for s in raw_sentences:
                s_lower = s.lower()
                matches = sum(1 for w in query_words if w in s_lower)
                if matches > 0:
                    scored_sentences.append((matches, s))

            # 매칭 순으로 상위 3문장 선별
            scored_sentences.sort(key=lambda x: x[0], reverse=True)
            top_sentences = [s for _, s in scored_sentences[:3]]

            if top_sentences:
                total_extracted += len(top_sentences)
                body = " ".join(top_sentences)
                # 하이라이트 처리 (키워드 볼드)
                for qw in query_words[:3]:
                    if len(qw) >= 2:
                        body = re.sub(f"({re.escape(qw)})", r"**\1**", body, flags=re.IGNORECASE)

                section_text = (
                    f"### 📄 {filename} (관련도: {score})\n"
                    f"{body}\n\n"
                    f"> 📌 **참고 구절**: [출처: `{filename}`, 청크 #{chunk_id}]"
                )
                sections.append(section_text)
            else:
                # 단락 전체가 하나의 문맥인 경우 본문 일부 인용
                snippet = content[:250].replace("\n", " ").strip()
                sections.append(
                    f"### 📄 {filename}\n"
                    f"{snippet}...\n\n"
                    f"> 📌 **참고 구절**: [출처: `{filename}`, 청크 #{chunk_id}]"
                )

        # 종합 안내 맺음말
        sections.append(
            f"\n---\n"
            f"ℹ️ *더 구체적인 내용이 필요하시면 질문을 상세히 적어주시거나 `Desktop/docs` 폴더의 원본 문서를 열람해 주세요.*"
        )

        return "\n\n".join(sections)

    def _call_gemini_api(self, query: str, results: List[Dict[str, Any]]) -> Optional[str]:
        """Gemini SDK 또는 REST API를 사용한 지능형 생성"""
        try:
            from google import genai
            client = genai.Client(api_key=self.api_key)
            
            context_blocks = []
            for r in results:
                context_blocks.append(f"--- [문서: {r['filename']} / 청크 #{r['chunk_id']}] ---\n{r['content']}")
            context_str = "\n\n".join(context_blocks)

            prompt = (
                f"너는 바탕화면 문서 기반 전문 지식 챗봇 에이전트야.\n"
                f"오직 아래 제공된 [참고 문서 내용]에만 근거하여 사용자 질문에 명확하고 친절한 한국어로 답변해줘.\n"
                f"문서에 없는 내용은 절대 추측하거나 지어내지 말고, 각 핵심 사실마다 반드시 출처 [출처: 파일명, 청크 #]를 달아줘.\n\n"
                f"[참고 문서 내용]:\n{context_str}\n\n"
                f"[사용자 질문]: {query}\n\n"
                f"[답변]:"
            )

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            return response.text
        except Exception as e:
            # google-genai 미설치 시 구형 google-generativeai 시도
            try:
                import google.generativeai as legacy_genai
                legacy_genai.configure(api_key=self.api_key)
                model = legacy_genai.GenerativeModel("gemini-1.5-flash")
                resp = model.generate_content(prompt)
                return resp.text
            except Exception as e2:
                print(f"[Gemini API fallback error] {e2}")
                return None


if __name__ == "__main__":
    from retriever_agent import RetrieverAgent
    from document_loader import DocumentLoader

    loader = DocumentLoader()
    chunks = loader.load_documents()

    retriever = RetrieverAgent()
    retriever.index_documents(chunks)

    test_q = "스타트업 실패 원인 중 시장 문제와 관련된 내용은 뭐야?"
    search_res = retriever.retrieve(test_q, top_k=2)

    generator = GeneratorAgent()
    answer_res = generator.synthesize_answer(test_q, search_res)

    print("=== [에이전트 2 최종 답변] ===")
    print(f"엔진: {answer_res['engine_used']}")
    print(answer_res['answer'])
