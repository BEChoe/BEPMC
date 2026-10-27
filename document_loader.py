"""
document_loader.py
- 바탕화면의 docs 디렉터리(또는 지정된 디렉터리)에서 문서들을 읽어와 청크(작은 조각) 단위로 분할합니다.
- 지원 포맷: .txt, .md, .markdown, .pdf, .docx, .csv, .json
- 코딩 초보자도 이해하기 쉬운 직관적인 구조와 상세 주석 제공
"""

import os
import re
from pathlib import Path
from typing import List, Dict, Any, Optional

# 기본 바탕화면 docs 경로 계산
DEFAULT_DOCS_DIR = Path.home() / "Desktop" / "docs"


class DocumentChunk:
    """문서의 한 조각(Chunk)을 표현하는 데이터 클래스"""
    def __init__(self, doc_id: str, filename: str, filepath: str, chunk_id: int, content: str):
        self.doc_id = doc_id
        self.filename = filename
        self.filepath = filepath
        self.chunk_id = chunk_id
        self.content = content.strip()
        self.char_count = len(self.content)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "doc_id": self.doc_id,
            "filename": self.filename,
            "filepath": self.filepath,
            "chunk_id": self.chunk_id,
            "content": self.content,
            "char_count": self.char_count
        }

    def __repr__(self):
        snippet = self.content[:40].replace("\n", " ")
        return f"<Chunk {self.filename} #{self.chunk_id}: '{snippet}...'>"


class DocumentLoader:
    """바탕화면 docs 폴더를 감시하고 문서를 파싱/청킹하는 로더"""

    def __init__(self, docs_dir: Optional[Path] = None, chunk_size: int = 500, overlap: int = 100):
        self.docs_dir = Path(docs_dir) if docs_dir else DEFAULT_DOCS_DIR
        self.chunk_size = chunk_size
        self.overlap = overlap

    def ensure_docs_dir(self) -> Path:
        """문서 폴더가 없으면 자동 생성"""
        self.docs_dir.mkdir(parents=True, exist_ok=True)
        return self.docs_dir

    def read_text_file(self, filepath: Path) -> str:
        """인코딩(UTF-8, CP949)을 자동 감지하여 텍스트 파일 읽기"""
        encodings = ['utf-8', 'cp949', 'euc-kr', 'latin1']
        for enc in encodings:
            try:
                with open(filepath, 'r', encoding=enc) as f:
                    return f.read()
            except (UnicodeDecodeError, LookupError):
                continue
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()

    def read_pdf_file(self, filepath: Path) -> str:
        """PDF 파일 읽기 (pypdf 패키지 사용, 미설치 시 안내)"""
        try:
            import pypdf
            reader = pypdf.PdfReader(filepath)
            texts = []
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text() or ""
                if page_text:
                    texts.append(f"[페이지 {i+1}]\n{page_text}")
            return "\n\n".join(texts)
        except ImportError:
            return f"[PDF 알림] '{filepath.name}' 파일을 읽으려면 'pip install pypdf' 명령어로 pypdf 패키지를 설치해주세요."
        except Exception as e:
            return f"[PDF 읽기 오류] {filepath.name}: {e}"

    def read_docx_file(self, filepath: Path) -> str:
        """Word docx 파일 읽기 (외부 패키지 없이 Python 내장 zipfile + XML 파서로 100% 자체 구동)"""
        try:
            import zipfile
            import xml.etree.ElementTree as ET
            with zipfile.ZipFile(filepath) as z:
                xml_content = z.read('word/document.xml')
                tree = ET.fromstring(xml_content)
                # Word 본문 XML의 네임스페이스에서 w:t 태그(텍스트) 추출
                namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                paragraphs = []
                for p in tree.findall('.//w:p', namespaces):
                    texts = [node.text for node in p.findall('.//w:t', namespaces) if node.text]
                    line = "".join(texts).strip()
                    if line:
                        paragraphs.append(line)
                return "\n\n".join(paragraphs)
        except Exception as e:
            # 보조 라이브러리 python-docx 시도
            try:
                import docx
                doc = docx.Document(filepath)
                return "\n\n".join([p.text for p in doc.paragraphs if p.text.strip()])
            except Exception:
                return f"[Word 파싱 오류] {filepath.name}: {e}"

    def split_into_chunks(self, text: str, filename: str, filepath: str, doc_id: str) -> List[DocumentChunk]:
        """텍스트를 문맥 유지를 위해 오버랩을 두어 청크 단위로 분할"""
        if not text.strip():
            return []

        # 1. 단락 단위 우선 분할
        paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
        chunks: List[DocumentChunk] = []
        current_chunk = ""
        chunk_idx = 1

        for p in paragraphs:
            if len(current_chunk) + len(p) + 2 <= self.chunk_size:
                current_chunk = (current_chunk + "\n\n" + p).strip()
            else:
                if current_chunk:
                    chunks.append(DocumentChunk(doc_id, filename, filepath, chunk_idx, current_chunk))
                    chunk_idx += 1
                
                # 단락 자체가 chunk_size보다 크면 문장/글자 단위로 자르기
                if len(p) > self.chunk_size:
                    start = 0
                    while start < len(p):
                        end = min(start + self.chunk_size, len(p))
                        part = p[start:end]
                        chunks.append(DocumentChunk(doc_id, filename, filepath, chunk_idx, part))
                        chunk_idx += 1
                        start += (self.chunk_size - self.overlap)
                    current_chunk = ""
                else:
                    current_chunk = p

        if current_chunk:
            chunks.append(DocumentChunk(doc_id, filename, filepath, chunk_idx, current_chunk))

        return chunks

    def load_documents(self) -> List[DocumentChunk]:
        """바탕화면 docs 디렉터리의 모든 지원 문서를 로드하고 청크 목록으로 반환"""
        self.ensure_docs_dir()
        all_chunks: List[DocumentChunk] = []

        supported_exts = {'.txt', '.md', '.markdown', '.pdf', '.docx', '.csv', '.json'}
        doc_count = 0

        for file_path in self.docs_dir.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in supported_exts:
                ext = file_path.suffix.lower()
                doc_id = f"doc_{doc_count + 1}"
                doc_count += 1

                content = ""
                if ext in {'.txt', '.md', '.markdown', '.csv', '.json'}:
                    content = self.read_text_file(file_path)
                elif ext == '.pdf':
                    content = self.read_pdf_file(file_path)
                elif ext == '.docx':
                    content = self.read_docx_file(file_path)

                file_chunks = self.split_into_chunks(content, file_path.name, str(file_path), doc_id)
                all_chunks.extend(file_chunks)

        return all_chunks

    def create_sample_docs_if_empty(self) -> int:
        """폴더가 비어있는 경우 초보자가 즉시 테스트해볼 수 있도록 샘플 안전 지침서 2건 자동 생성"""
        self.ensure_docs_dir()
        existing = [f for f in self.docs_dir.iterdir() if f.is_file()]
        if existing:
            return len(existing)

        # 샘플 1: BEPMC 안전관리 행동요령
        sample1 = self.docs_dir / "BEPMC_현장_안전관리수칙.md"
        sample1.write_text("""# BEPMC 현장 안전관리 기본수칙 및 행동요령

## 1. 3대 중대재해 예방 핵심 수칙
- **추락 예방**: 2m 이상 고소 작업 시 반드시 5점 지지 안전대를 착용하고 안전난간 및 작업발판을 점검합니다.
- **끼임 예방**: 회전기계 정비 및 보수 시 반드시 전원을 차단하고 LOTO(Lockout-Tagout) 잠금장치를 체결합니다.
- **보호구 착용**: 안전모, 안전화, 안전대는 작업장 진입 전 100% 착용해야 하며, 턱끈을 반드시 체결합니다.

## 2. 비상상황 시 골든타임 4단계 대응
1. **발견 즉시 전파**: "불이야" 또는 "사고발생"을 큰소리로 외치고 비상벨을 누릅니다.
2. **초기 진화 및 대피**: 소화기(강화액/분말)로 초기 진화하며, 연기 발생 시 젖은 수건으로 호흡기를 보호하고 낮은 자세로 비상계단을 이용합니다.
3. **긴급 신고**: 안전한 장소로 대피한 즉시 비상연락망(xxx-xxxx-xxxx)에 정확한 위치와 부상자 여부를 알립니다.
4. **인원 점검**: 집결지에서 인원을 확인하고 심정지 환자가 있을 시 4분 내 심폐소생술(CPR)을 가슴 중앙 5cm 깊이로 분당 100~120회 시행합니다.
""", encoding='utf-8')

        # 샘플 2: 안전용품 규격 및 점검 기준
        sample2 = self.docs_dir / "BEPMC_안전용품_규격_및_사용기준.txt"
        sample2.write_text("""[BEPMC 프로젝트 매니지먼트 컨설팅 - 안전장비 가이드]

1. 안전모 규격:
- 한국산업안전보건공단 KCs 안전인증(AB종 또는 ABE종)을 필한 경량 고강도 제품만 사용 가능합니다.
- 충격흡수 라이너와 통풍 벤트가 있는 모델을 권장하며, 착용 전 균열 및 턱끈 체결 상태를 매일 확인합니다.

2. 밀폐공간 가스 측정 기준:
- 맨홀, 정화조, 탱크 등 밀폐공간 진입 전 4대 가스(산소, 일산화탄소, 황화수소, 가연성가스)를 측정합니다.
- 적정 산소 농도는 18% 이상 23.5% 미만이어야 하며, 기준 미달 시 급기 환기팬을 15분 이상 가동한 후 재측정합니다.

3. 비상구급함 및 방연마스크 비치:
- 각 작업 구역 반경 30m 이내에 비상 구급함과 습식 방연마스크를 상시 비치합니다.
- 비상 연락처: 비상상황실 xxx-xxxx-xxxx
""", encoding='utf-8')

        return 2


if __name__ == "__main__":
    loader = DocumentLoader()
    samples_created = loader.create_sample_docs_if_empty()
    print(f"문서 폴더: {loader.docs_dir}")
    chunks = loader.load_documents()
    print(f"총 {len(chunks)}개의 문서 청크가 로드되었습니다.")
    for c in chunks[:3]:
        print(" ", c)
