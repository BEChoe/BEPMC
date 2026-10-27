"""
retriever_agent.py
- [Sub-Agent 1: 문서 검색 에이전트]
- 역할: 사용자 질문(Query)을 분석하여 지식베이스(문서 청크들)에서 가장 관련성이 높은 본문 조각들을 탐색하고 점수를 매겨 반환합니다.
- 외부 무거운 C++ 빌드 도구 없이도 순수 파이썬 기반의 하이브리드(BM25 + TF-IDF 형태소 n-gram + 키워드 매칭) 검색 엔진으로 초보자 환경에서도 100% 안정 작동합니다.
"""

import re
import math
from collections import Counter
from typing import List, Dict, Any, Optional
from document_loader import DocumentChunk, DocumentLoader


STOP_WORDS = {
    '은', '는', '이', '가', '을', '를', '에', '에서', '으로', '로', '와', '과', '의', '도', '만',
    '어떤', '무엇', '얼마', '인가', '있는', '하는', '짓는', '되는', '어떻게', '왜', '요', '해',
    '것', '수', '등', '및', '그', '저', '이것', '저것', '대해', '대한', '통해', '위해',
    '알려줘', '설명해줘', '말해줘', '가르쳐줘', '질문', '답변', '내용', '뭐야', '인가요', '있나요'
}


class SearchResult:
    """검색된 청크와 관련도 점수, 선정 사유를 담는 결과 객체"""
    def __init__(self, chunk: DocumentChunk, score: float, matched_terms: List[str], rank: int):
        self.chunk = chunk
        self.score = round(score, 4)
        self.matched_terms = matched_terms
        self.rank = rank

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rank": self.rank,
            "filename": self.chunk.filename,
            "chunk_id": self.chunk.chunk_id,
            "score": self.score,
            "matched_terms": self.matched_terms,
            "content": self.chunk.content
        }

    def __repr__(self):
        return f"<Result #{self.rank} [{self.chunk.filename} c{self.chunk.chunk_id}] score={self.score}>"


class RetrieverAgent:
    """
    Sub-Agent 1: 문서 검색 에이전트
    - 문서 인덱싱, 역색인 생성, 질의어 분석, 상위 K개 핵심 청크 추출
    """
    def __init__(self, name: str = "문서 검색 에이전트 (Retriever)"):
        self.name = name
        self.chunks: List[DocumentChunk] = []
        self.doc_freq: Dict[str, int] = {}
        self.total_docs: int = 0
        self.avg_doc_len: float = 0.0

    def tokenize(self, text: str) -> List[str]:
        """한국어 및 영문 텍스트 토큰화 (단어 및 2글자 이상 n-gram 결합)"""
        # 특수문자 정제
        cleaned = re.sub(r'[^\w\s가-힣]', ' ', text.lower())
        words = [w.strip() for w in cleaned.split() if len(w.strip()) >= 1]
        
        tokens = list(words)
        # 한국어 복합어 매칭을 위한 2~3글자 음절 n-gram 보강
        for w in words:
            if re.search(r'[가-힣]', w) and len(w) >= 2:
                for i in range(len(w) - 1):
                    tokens.append(w[i:i+2])
        return tokens

    def index_documents(self, chunks: List[DocumentChunk]):
        """문서 청크 목록을 받아 역색인(Inverted Index) 및 통계 구축"""
        self.chunks = chunks
        self.total_docs = len(chunks)
        self.doc_freq = {}

        if self.total_docs == 0:
            self.avg_doc_len = 0.0
            return

        total_tokens = 0
        for chunk in chunks:
            tokens = set(self.tokenize(chunk.content))
            total_tokens += len(tokens)
            for t in tokens:
                self.doc_freq[t] = self.doc_freq.get(t, 0) + 1

        self.avg_doc_len = total_tokens / self.total_docs if self.total_docs > 0 else 0.0

    def calculate_bm25_score(self, query_tokens: List[str], chunk_tokens: List[str]) -> tuple[float, List[str]]:
        """BM25 알고리즘 기반 관련도 점수 계산"""
        k1 = 1.5
        b = 0.75
        doc_len = len(chunk_tokens)
        chunk_counter = Counter(chunk_tokens)
        score = 0.0
        matched = []

        for q in query_tokens:
            if q in chunk_counter:
                matched.append(q)
                tf = chunk_counter[q]
                df = self.doc_freq.get(q, 0)
                # BM25 IDF
                idf = math.log((self.total_docs - df + 0.5) / (df + 0.5) + 1.0)
                # BM25 TF formula
                tf_norm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (doc_len / (self.avg_doc_len or 1.0))))
                score += (idf * tf_norm)

        return score, list(set(matched))

    def extract_keywords(self, text: str) -> List[str]:
        """조사 및 어미를 정제하여 의미 있는 핵심 키워드 목록 추출"""
        cleaned = re.sub(r'[^\w\s가-힣]', ' ', text.lower())
        words = [w.strip() for w in cleaned.split() if len(w.strip()) >= 1]
        
        # 한국어 조사 및 어미 제거 패턴
        suffix_pattern = r'(에서는|에게서|으로는|에서|으로|에게|부터|까지|이란|마다|조차|마저|이나|이야|이다|이며|이고|한테|은|는|이|가|을|를|에|로|와|과|의|도|만|요|야)$'
        keywords = []
        for w in words:
            if w in STOP_WORDS:
                continue
            stemmed = re.sub(suffix_pattern, '', w)
            if len(stemmed) >= 2 and stemmed not in STOP_WORDS:
                keywords.append(stemmed)
            elif len(w) >= 2 and w not in STOP_WORDS:
                keywords.append(w)
        return list(dict.fromkeys(keywords))

    def retrieve(self, query: str, top_k: int = 3, min_score: float = 2.0) -> Dict[str, Any]:
        """
        질문(query)에 대해 가장 관련도 높은 상위 top_k개 청크를 탐색
        반환값: 서브 에이전트 결과 딕셔너리
        """
        if not self.chunks:
            return {
                "agent": self.name,
                "status": "empty_knowledge_base",
                "message": "인덱싱된 문서가 없습니다. docs 폴더를 확인해주세요.",
                "results": [],
                "query": query
            }

        query_keywords = self.extract_keywords(query)
        query_tokens = self.tokenize(query)
        
        # 불용어 제외 유효 키워드 필터링
        filtered_tokens = [t for t in query_tokens if t not in STOP_WORDS and len(t) >= 2]
        if not filtered_tokens and not query_keywords:
            return {
                "agent": self.name,
                "status": "no_match",
                "message": "질문에서 의미 있는 핵심 검색어를 찾지 못했습니다.",
                "results": [],
                "query": query
            }

        scored_results = []
        for chunk in self.chunks:
            chunk_tokens = self.tokenize(chunk.content)
            chunk_content_lower = chunk.content.lower()

            # 환각 방지 핵심: 질문의 실질적 핵심 명사 키워드가 본문에 최소 1개 이상 존재해야 함
            has_substantive_match = False
            if query_keywords:
                for kw in query_keywords:
                    if kw in chunk_content_lower:
                        has_substantive_match = True
                        break
            else:
                has_substantive_match = True

            if not has_substantive_match:
                continue

            score, matched = self.calculate_bm25_score(filtered_tokens or query_tokens, chunk_tokens)
            
            # 파일명에 질의어가 포함된 경우 가산점
            filename_lower = chunk.filename.lower()
            for kw in query_keywords:
                if kw in filename_lower:
                    score += 2.0
                    matched.append(f"파일명:{kw}")

            if score >= min_score and matched:
                scored_results.append((score, chunk, matched))

        # 점수 내림차순 정렬
        scored_results.sort(key=lambda x: x[0], reverse=True)

        results: List[SearchResult] = []
        for rank, (score, chunk, matched) in enumerate(scored_results[:top_k], start=1):
            results.append(SearchResult(chunk, score, matched, rank))

        return {
            "agent": self.name,
            "status": "success" if results else "no_match",
            "query": query,
            "total_indexed_chunks": len(self.chunks),
            "match_count": len(results),
            "results": [r.to_dict() for r in results],
            "reasoning": f"질문 키워드 {list(set(query_tokens[:5]))} 기준 상위 {len(results)}건의 관련 문맥 추출 완료"
        }


if __name__ == "__main__":
    loader = DocumentLoader()
    chunks = loader.load_documents()
    
    agent = RetrieverAgent()
    agent.index_documents(chunks)
    
    test_query = "스타트업이 실패하는 주된 원인 1위는 뭐야?"
    print(f"질문: {test_query}")
    output = agent.retrieve(test_query, top_k=2)
    print(f"상태: {output['status']}, 매칭 수: {output['match_count']}")
    for res in output['results']:
        print(f"[{res['rank']}위] 점수: {res['score']} | 파일: {res['filename']} (청크 #{res['chunk_id']})")
        print(f"본문 미리보기: {res['content'][:100]}...\n")
