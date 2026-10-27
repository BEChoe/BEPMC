"""
pipeline.py
- [RAG 오케스트레이터 파이프라인]
- 역할:
  1. 바탕화면 docs 문서 로드 및 색인 관리
  2. Sub-Agent 1 (문서 검색 에이전트)과 Sub-Agent 2 (요약/답변 에이전트)의 작업 조율
  3. 대화 세션 히스토리 보관 및 파이프라인 통계 제공
"""

import time
from pathlib import Path
from typing import List, Dict, Any, Optional

from document_loader import DocumentLoader, DEFAULT_DOCS_DIR
from retriever_agent import RetrieverAgent
from generator_agent import GeneratorAgent


class RAGPipeline:
    """
    바탕화면 문서 기반 RAG 멀티 에이전트 파이프라인
    """
    def __init__(self, docs_dir: Optional[Path] = None):
        self.loader = DocumentLoader(docs_dir=docs_dir)
        self.retriever = RetrieverAgent()
        self.generator = GeneratorAgent()
        
        self.history: List[Dict[str, Any]] = []
        self.indexed_files: List[str] = []
        self.total_chunks: int = 0
        
        # 최초 문서 로드 및 인덱싱 실행
        self.refresh_knowledge_base()

    def set_model(self, model_name: str) -> Dict[str, Any]:
        """답변 생성 에이전트의 LLM 모델 변경"""
        self.generator.set_preferred_model(model_name)
        return self.generator.get_ollama_status()

    def refresh_knowledge_base(self) -> Dict[str, Any]:
        """바탕화면 docs 폴더를 다시 스캔하여 인덱스를 최신 상태로 갱신"""
        start_time = time.time()
        
        # 문서가 없는 경우 샘플 생성 (사용자 선택적 허용)
        chunks = self.loader.load_documents()
        self.retriever.index_documents(chunks)
        
        # 고유 파일명 목록 추출
        unique_files = list(set(c.filename for c in chunks))
        self.indexed_files = sorted(unique_files)
        self.total_chunks = len(chunks)
        
        elapsed_sec = round(time.time() - start_time, 3)
        return {
            "status": "ready",
            "docs_dir": str(self.loader.docs_dir),
            "file_count": len(self.indexed_files),
            "files": self.indexed_files,
            "total_chunks": self.total_chunks,
            "indexing_time_sec": elapsed_sec
        }

    def ask(self, query: str, top_k: int = 3) -> Dict[str, Any]:
        """
        사용자 질문을 받아 파이프라인(검색 -> 요약)을 순차 실행하고 결과 반환
        """
        start_time = time.time()
        query = query.strip()

        if not query:
            return {
                "query": "",
                "answer": "질문 내용을 입력해주세요.",
                "sources": [],
                "retrieved_count": 0,
                "elapsed_ms": 0,
                "pipeline_steps": []
            }

        pipeline_steps = []

        # -----------------------------------------------------------------
        # STEP 1: 서브 에이전트 1 (문서 검색) 호출
        # -----------------------------------------------------------------
        step1_start = time.time()
        search_result = self.retriever.retrieve(query, top_k=top_k)
        step1_duration = round((time.time() - step1_start) * 1000, 2)
        
        pipeline_steps.append({
            "step": 1,
            "agent": self.retriever.name,
            "action": "문서 검색 및 관련도 랭킹 산출",
            "matches_found": len(search_result.get("results", [])),
            "duration_ms": step1_duration,
            "reasoning": search_result.get("reasoning", "")
        })

        # -----------------------------------------------------------------
        # STEP 2: 서브 에이전트 2 (요약 및 답변 생성) 호출
        # -----------------------------------------------------------------
        step2_start = time.time()
        gen_result = self.generator.synthesize_answer(query, search_result)
        step2_duration = round((time.time() - step2_start) * 1000, 2)

        pipeline_steps.append({
            "step": 2,
            "agent": self.generator.name,
            "action": "본문 요약, 환각 검증 및 출처 표기 답변 생성",
            "engine": gen_result.get("engine_used", "Local"),
            "duration_ms": step2_duration
        })

        total_elapsed_ms = round((time.time() - start_time) * 1000, 1)

        final_response = {
            "query": query,
            "answer": gen_result.get("answer", ""),
            "sources": gen_result.get("sources", []),
            "retrieved_chunks": search_result.get("results", []),
            "engine_used": gen_result.get("engine_used", "Local"),
            "total_elapsed_ms": total_elapsed_ms,
            "pipeline_steps": pipeline_steps
        }

        # 대화 기록 저장
        self.history.append({
            "query": query,
            "answer": gen_result.get("answer", ""),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        })

        return final_response


if __name__ == "__main__":
    pipeline = RAGPipeline()
    info = pipeline.refresh_knowledge_base()
    print("=== [RAG 파이프라인 초기화 완료] ===")
    print(f"문서 경로: {info['docs_dir']}")
    print(f"색인 파일({info['file_count']}개): {', '.join(info['files'])}")
    print(f"총 청크 수: {info['total_chunks']}개\n")

    q = "스타트업에서 제품-시장 적합성(PMF)이 왜 중요한가요?"
    print(f"Q: {q}")
    res = pipeline.ask(q)
    print("\n--- 파이프라인 실행 단계 ---")
    for s in res['pipeline_steps']:
        print(f"Step {s['step']} [{s['agent']}]: {s['action']} ({s['duration_ms']}ms)")

    print("\n--- A (답변) ---")
    print(res['answer'])
