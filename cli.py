"""
cli.py
- [터미널 대화형 인터페이스]
- 터미널(콘솔) 환경에서 바로 실행하여 대화할 수 있는 직관적인 CLI 챗봇
- 실행 방법: python cli.py
"""

import sys
from pipeline import RAGPipeline


def main():
    print("=" * 60)
    print("  📚 바탕화면 docs 문서 기반 RAG 챗봇 (터미널 모드)")
    print("=" * 60)
    print("  [Sub-Agent 1] 문서 검색 에이전트 (Retriever)")
    print("  [Sub-Agent 2] 요약 및 답변 에이전트 (Generator)")
    print("-" * 60)
    print("  * 명령어: 'refresh' (문서 다시 읽기) | 'exit' 또는 'q' (종료)")
    print("=" * 60)

    try:
        pipeline = RAGPipeline()
    except Exception as e:
        print(f"❌ 파이프라인 초기화 실패: {e}")
        return

    info = pipeline.refresh_knowledge_base()
    print(f"\n📂 인식된 문서 경로: {info['docs_dir']}")
    print(f"📄 색인된 문서 수: {info['file_count']}개 ({', '.join(info['files']) if info['files'] else '문서 없음'})")
    print(f"🧩 총 지식 청크: {info['total_chunks']}개\n")

    while True:
        try:
            query = input("\n💬 질문을 입력하세요: ").strip()
            if not query:
                continue

            if query.lower() in {"exit", "quit", "q", "종료"}:
                print("\n👋 챗봇을 종료합니다. 좋은 하루 되세요!")
                break

            if query.lower() in {"refresh", "새로고침", "reload"}:
                print("\n🔄 바탕화면 docs 폴더를 다시 스캔합니다...")
                updated_info = pipeline.refresh_knowledge_base()
                print(f"✅ 갱신 완료: {updated_info['file_count']}개 파일, {updated_info['total_chunks']}개 청크 색인됨.")
                continue

            print("\n⏳ 두 서브 에이전트가 협력하여 문서를 분석 중입니다...")
            res = pipeline.ask(query)

            # 파이프라인 진행 과정 출력
            print("\n" + "-" * 50)
            print("🤖 [파이프라인 진행 로그]")
            for step in res["pipeline_steps"]:
                print(f" • Step {step['step']} [{step['agent']}]: {step['action']} ({step['duration_ms']}ms)")
            print("-" * 50)

            # 최종 답변 출력
            print("\n📢 [에이전트 답변]")
            print(res["answer"])

            # 참고 출처 출력
            if res.get("sources"):
                print("\n📌 [참고한 문서 출처]")
                for src in res["sources"]:
                    print(f" - {src}")

        except KeyboardInterrupt:
            print("\n\n👋 프로그램을 종료합니다.")
            break
        except Exception as err:
            print(f"\n❌ 처리 중 오류 발생: {err}")


if __name__ == "__main__":
    main()
