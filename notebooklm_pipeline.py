import subprocess
import json
import sys
from pathlib import Path

SOURCE_FILE = Path(r"d:\BEPMC\BEPMC_환절기_안전대책_슬라이드_구성안.md")
UVX = r"C:\Users\jassyguy\.local\bin\uvx.exe"

def run_nlm(args):
    cmd = [UVX, "--from", "notebooklm-mcp-cli", "nlm"] + args
    print(f">> Executing: nlm {' '.join(args)}")
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if res.stdout:
        print(res.stdout)
    if res.stderr:
        print("[stderr]:", res.stderr)
    return res

def main():
    print("=" * 60)
    print(" 📚 BEPMC NotebookLM 소스 업로드 및 슬라이드 생성 파이프라인")
    print("=" * 60)

    # 1. 새 노트북 생성
    print("\n[Step 1] 새 노트북 생성...")
    res = run_nlm(["notebook", "create", "BEPMC 환절기 다발사고 특별안전대책", "--json"])
    notebook_id = None
    if res.returncode == 0 and res.stdout.strip():
        try:
            data = json.loads(res.stdout)
            notebook_id = data.get("id") or data.get("notebook_id")
        except Exception as e:
            print("JSON parsing note:", e)

    if not notebook_id:
        # 목록에서 검색
        list_res = run_nlm(["list", "notebooks", "--json"])
        if list_res.returncode == 0 and list_res.stdout.strip():
            try:
                items = json.loads(list_res.stdout)
                for item in items:
                    if "BEPMC" in item.get("title", ""):
                        notebook_id = item.get("id")
                        break
            except Exception as e:
                print("List JSON parsing error:", e)

    if not notebook_id:
        print("[오류] 노트북 ID 획득 실패")
        sys.exit(1)

    print(f" -> 대상 노트북 ID: {notebook_id}")

    # 2. 소스 파일 업로드
    print(f"\n[Step 2] 소스 파일 업로드 ({SOURCE_FILE})...")
    res_source = run_nlm(["source", "add", notebook_id, "--file", str(SOURCE_FILE), "--wait"])
    if res_source.returncode != 0:
        print("[경고] 소스 업로드 응답 코드 비정상, 목록 확인...")
        run_nlm(["list", "sources", notebook_id])

    # 3. 슬라이드 생성
    print("\n[Step 3] 슬라이드 덱(Slide Deck) 생성 요청...")
    res_slides = run_nlm(["slides", "create", notebook_id, "--format", "presenter_slides", "--language", "ko", "--confirm"])
    
    print("\n" + "=" * 60)
    print(" 🎉 모든 작업이 완료되었습니다!")
    print(f" 노트북 ID: {notebook_id}")
    print(" Google NotebookLM (https://notebooklm.google.com) 에서")
    print(" 'BEPMC 환절기 다발사고 특별안전대책' 슬라이드를 확인하세요!")
    print("=" * 60)

if __name__ == "__main__":
    main()
