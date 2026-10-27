@echo off
chcp 65001 > nul
title Desktop Docs RAG 챗봇 시스템
echo ============================================================
echo   📚 Desktop Docs RAG 챗봇 시스템을 시작합니다
echo   - 대상 폴더: 바탕화면\docs
echo   - 2단계 멀티 에이전트: [검색 에이전트] + [요약/답변 에이전트]
echo ============================================================
echo.
echo 잠시만 기다려주세요. 웹 브라우저가 자동으로 실행됩니다...
echo.

python app.py

if errorlevel 1 (
    echo.
    echo [알림] 파이썬 실행 중 오류가 발생했습니다.
    echo python 또는 python3 명령어가 PATH에 등록되어 있는지 확인해주세요.
    pause
)
