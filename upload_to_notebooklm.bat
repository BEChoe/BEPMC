@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ============================================================
echo   📚 BEPMC NotebookLM 소스 업로드 및 슬라이드 생성 도구
echo ============================================================
echo.

rem 1. 로그인 상태 확인
call uvx --from notebooklm-mcp-cli nlm login --check > nul 2>&1
if %errorlevel% neq 0 (
    echo [안내] Google NotebookLM 인증이 필요합니다.
    echo 브라우저 창이 열리면 Google 계정으로 로그인해주세요.
    echo.
    call uvx --from notebooklm-mcp-cli nlm login
    if %errorlevel% neq 0 (
        echo [오류] 로그인에 실패했습니다. 다시 시도해주세요.
        pause
        exit /b 1
    )
)

echo [1/3] 새 노트북 생성 중: "BEPMC 환절기 다발사고 안전대책"...
for /f "tokens=*" %%i in ('uvx --from notebooklm-mcp-cli nlm notebook create "BEPMC 환절기 다발사고 안전대책" --json') do set CREATE_RES=%%i

echo %CREATE_RES% | findstr /i "id" > nul
if %errorlevel% neq 0 (
    echo [안내] 기본 명령어로 노트북 생성 진행...
    call uvx --from notebooklm-mcp-cli nlm notebook create "BEPMC 환절기 다발사고 안전대책"
)

echo.
echo [2/3] 슬라이드 소스 문서 업로드 중...
echo 대상 파일: d:\BEPMC\BEPMC_환절기_안전대책_슬라이드_구성안.md
for /f "tokens=1" %%a in ('uvx --from notebooklm-mcp-cli nlm list notebooks ^| findstr /i "BEPMC"') do set NOTEBOOK_ID=%%a

if "%NOTEBOOK_ID%"=="" (
    echo [안내] 노트북 ID를 조회할 수 없어 최신 노트북으로 업로드합니다.
    call uvx --from notebooklm-mcp-cli nlm source add --file "d:\BEPMC\BEPMC_환절기_안전대책_슬라이드_구성안.md" --wait
) else (
    echo 연결된 노트북 ID: %NOTEBOOK_ID%
    call uvx --from notebooklm-mcp-cli nlm source add %NOTEBOOK_ID% --file "d:\BEPMC\BEPMC_환절기_안전대책_슬라이드_구성안.md" --wait
    echo.
    echo [3/3] 슬라이드 덱(Slide Deck) 자동 생성 중...
    call uvx --from notebooklm-mcp-cli nlm slides create %NOTEBOOK_ID% --format presenter_slides --language ko --confirm
)

echo.
echo ============================================================
echo   ✅ NotebookLM 소스 업로드 및 슬라이드 생성 완료!
echo   https://notebooklm.google.com 에서 결과물을 확인하세요.
echo ============================================================
pause
