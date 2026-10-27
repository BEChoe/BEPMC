"""
test_rag.py
- RAG 챗봇 파이프라인의 핵심 기능(문서 로딩, 검색, 답변 요약, 출처 표기, 환각 방지)을 자동 검증하는 테스트 스크립트
"""

import sys
from pipeline import RAGPipeline


def run_tests():
    print("=" * 60)
    print("🧪 RAG 챗봇 시스템 자동 무결성 검증 테스트 시작")
    print("=" * 60)

    # 1. 파이프라인 초기화 테스트
    pipeline = RAGPipeline()
    status = pipeline.refresh_knowledge_base()
    print(f"\n[테스트 1] 문서 로딩 및 인덱싱: {'성공' if status['status'] == 'ready' else '실패'}")
    print(f" - 대상 경로: {status['docs_dir']}")
    print(f" - 색인된 문서 수: {status['file_count']}개")
    print(f" - 생성된 청크 수: {status['total_chunks']}개")
    assert status['total_chunks'] > 0, "문서 청크가 1개 이상 로드되어야 합니다."

    # 2. 존재하는 질문 질의 테스트
    test_q1 = "스타트업 실패의 5대 핵심 원인은 뭐야?"
    print(f"\n[테스트 2] 문서 내 존재하는 질문 질의: '{test_q1}'")
    res1 = pipeline.ask(test_q1, top_k=2)
    print(f" - 총 소요 시간: {res1['total_elapsed_ms']}ms")
    print(f" - 검색된 청크 수: {len(res1['retrieved_chunks'])}개")
    print(f" - 출처 표기 여부: {'있음' if res1['sources'] else '없음'}")
    print(f" - 답변 요약 미리보기:\n{res1['answer'][:180]}...")
    assert len(res1['retrieved_chunks']) > 0, "검색 결과가 있어야 합니다."
    assert len(res1['sources']) > 0, "출처가 표기되어야 합니다."

    # 3. 문서에 없는 질문 질의 테스트 (환각 방지 테스트)
    test_q2 = "화성에 우주 기지를 짓는 공사 예산은 얼마인가요?"
    print(f"\n[테스트 3] 문서에 없는 질문 (환각 방지 테스트): '{test_q2}'")
    res2 = pipeline.ask(test_q2, top_k=2)
    print(f" - 응답: {res2['answer'][:150]}...")
    assert "죄송합니다" in res2['answer'] or "근거를 찾지 못했습니다" in res2['answer'], "환각 방지 메시지가 출력되어야 합니다."

    # 4. 빈 질문 입력 방어 테스트
    test_q3 = "   "
    print(f"\n[테스트 4] 공백 질문 입력 방어 테스트")
    res3 = pipeline.ask(test_q3)
    print(f" - 응답: {res3['answer']}")
    assert "질문 내용" in res3['answer'], "공백 질문 안내가 나와야 합니다."

    print("\n" + "=" * 60)
    print("🎉 모든 테스트 케이스를 통과했습니다! (4/4 통과)")
    print("=" * 60)


if __name__ == "__main__":
    run_tests()
