# -*- coding: utf-8 -*-
"""
generate_pitch_deck.py
정부 지원 사업 기술 창업 11단계 표준 Pitch Deck .pptx 생성 스크립트
- BEPMC-PTFORGOV 가이드라인 준수:
  1. 글씨체: HY그래픽M (한글), Arial (영문/숫자)
  2. 색상: 슬라이드당 최대 4색 (Background: #FFFFFF/#F8FAFC, Primary: #0F172A, Secondary: #1D4ED8, Accent: #EA580C)
  3. 시각 요소: 슬라이드당 최대 4개 이하 (정돈된 카드 레이아웃)
  4. 11단계 표준 구조 + 부록 Q&A 방어 슬라이드
"""

import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def create_deck(output_path="BEPMC_AI_산업안전_정부지원사업_발표자료.pptx"):
    prs = Presentation()
    # 16:9 와이드스크린 규격 (13.333 x 7.5 인치)
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # 4대 표준 색상
    C_BG = RGBColor(248, 250, 252)       # Light Slate Background #F8FAFC
    C_CARD_BG = RGBColor(255, 255, 255)  # Card White #FFFFFF
    C_PRIMARY = RGBColor(15, 23, 42)     # Deep Slate Navy #0F172A
    C_SECONDARY = RGBColor(29, 78, 216)  # Engineering Blue #1D4ED8
    C_ACCENT = RGBColor(234, 88, 12)     # Safety Orange #EA580C
    C_BORDER = RGBColor(226, 232, 240)   # Slate Border #E2E8F0
    C_SUBTEXT = RGBColor(71, 85, 105)    # Slate Subtext #475569

    FONT_KO = "HY그래픽M"
    FONT_EN = "Arial"

    blank_layout = prs.slide_layouts[6]

    def set_font(run, size=Pt(14), bold=False, color=C_PRIMARY, font_name=FONT_KO):
        run.font.name = font_name
        run.font.size = size
        run.font.bold = bold
        run.font.color.rgb = color

    def add_header(slide, step_num, step_title, category="문제인식"):
        # 상단 네비게이션 & 카테고리 태그
        cat_box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.4), Inches(2.2), Inches(0.35))
        cat_box.fill.solid()
        cat_box.fill.fore_color.rgb = C_SECONDARY
        cat_box.line.color.rgb = C_SECONDARY
        p = cat_box.text_frame.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = f"평가지표 | {category}"
        set_font(run, size=Pt(10), bold=True, color=RGBColor(255, 255, 255), font_name=FONT_KO)

        # 메인 타이틀
        title_box = slide.shapes.add_textbox(Inches(3.2), Inches(0.35), Inches(9.3), Inches(0.8))
        tf = title_box.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        run_num = p.add_run()
        run_num.text = f"{step_num}. "
        set_font(run_num, size=Pt(22), bold=True, color=C_ACCENT, font_name=FONT_EN)
        run_txt = p.add_run()
        run_txt.text = step_title
        set_font(run_txt, size=Pt(22), bold=True, color=C_PRIMARY, font_name=FONT_KO)

        # 헤더 구분선
        line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(1.15), Inches(11.733), Inches(0.02))
        line.fill.solid()
        line.fill.fore_color.rgb = C_BORDER
        line.line.color.rgb = C_BORDER

    def add_footer(slide):
        footer_box = slide.shapes.add_textbox(Inches(0.8), Inches(7.0), Inches(11.733), Inches(0.3))
        p = footer_box.text_frame.paragraphs[0]
        run = p.add_run()
        run.text = "BEPMC (Project Management Consultancy) | AI 기반 산업안전 관리 및 자문 시스템"
        set_font(run, size=Pt(9), bold=False, color=C_SUBTEXT, font_name=FONT_KO)
        p.alignment = PP_ALIGN.RIGHT

    # ==========================================
    # SLIDE 1: Hook & Executive Summary
    # ==========================================
    s1 = prs.slides.add_slide(blank_layout)
    add_header(s1, "01", "Executive Summary & 회사 소개", "기업개요 및 훅")
    
    # 시각 요소 1: Executive Summary 3줄 요약 카드
    card1 = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.35), Inches(11.733), Inches(2.2))
    card1.fill.solid()
    card1.fill.fore_color.rgb = RGBColor(238, 242, 255) # Indigo soft tint
    card1.line.color.rgb = C_SECONDARY
    card1.line.width = Pt(1.5)
    tf1 = card1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    r = p.add_run()
    r.text = "⚡ Executive Summary (핵심 3줄 요약)"
    set_font(r, size=Pt(14), bold=True, color=C_SECONDARY, font_name=FONT_KO)
    
    summaries = [
        ("시장 배경", "중대재해처벌법 전면 시행으로 산업 안전 리스크가 CEO의 직접적 경영·형사 리스크로 격상"),
        ("기술 차별성", "흙먼지·진동에 강한 '초저지연 엣지 필터링 + 3D 가상 재난 합성 데이터'로 오탐률 90% 이상 삭감"),
        ("사업 비전", "대규모 플랜트 충돌 사고 제로화 및 ISO45001 안전보건경영 연계 국가 표준 안전 솔루션 구축")
    ]
    for tag, desc in summaries:
        p = tf1.add_paragraph()
        r1 = p.add_run()
        r1.text = f"• [{tag}] "
        set_font(r1, size=Pt(12), bold=True, color=C_PRIMARY, font_name=FONT_KO)
        r2 = p.add_run()
        r2.text = desc
        set_font(r2, size=Pt(12), bold=False, color=C_PRIMARY, font_name=FONT_KO)

    # 시각 요소 2: 엘리베이터 피치 카드
    card2 = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(3.75), Inches(6.8), Inches(3.0))
    card2.fill.solid()
    card2.fill.fore_color.rgb = C_CARD_BG
    card2.line.color.rgb = C_BORDER
    tf2 = card2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    r = p.add_run()
    r.text = "🎯 BEPMC 핵심 가치 정의 (Elevator Pitch)"
    set_font(r, size=Pt(14), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    
    p = tf2.add_paragraph()
    r = p.add_run()
    r.text = "\n\"BEPMC는 대규모 플랜트 및 건설 현장의 중대재해를 실시간 엣지 비전 AI로 원천 차단하는 지능형 안전 엔지니어링 전문 기업입니다.\""
    set_font(r, size=Pt(13), bold=True, color=C_SECONDARY, font_name=FONT_KO)
    
    p = tf2.add_paragraph()
    r = p.add_run()
    r.text = "\n• 현장 중심주의: 단순 감시가 아닌 0.2초 초지향성 직격 경보\n• 공학적 신뢰성: 반복되는 오탐을 배제한 실체적 안전 인프라\n• 법적 방어력: KOSHA 기준 부합 일일 안전감사 리포트 자동화"
    set_font(r, size=Pt(11), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    # 시각 요소 3: 3대 핵심 목표 배너
    card3 = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(7.8), Inches(3.75), Inches(4.733), Inches(3.0))
    card3.fill.solid()
    card3.fill.fore_color.rgb = C_CARD_BG
    card3.line.color.rgb = C_ACCENT
    card3.line.width = Pt(1.5)
    tf3 = card3.text_frame
    tf3.word_wrap = True
    p = tf3.paragraphs[0]
    r = p.add_run()
    r.text = "🏆 본 과제 1차년도 핵심 목표"
    set_font(r, size=Pt(14), bold=True, color=C_ACCENT, font_name=FONT_KO)
    
    goals = [
        ("현장 오탐 제어율", "95% 이상 삭감 달성"),
        ("경보 반응 속도", "0.2초 이내 초저지연 직격 알림"),
        ("현장 PoC 실증", "수도권 플랜트 3개소 1,000시간 가동")
    ]
    for g_title, g_val in goals:
        p = tf3.add_paragraph()
        r1 = p.add_run()
        r1.text = f"\n• {g_title}: "
        set_font(r1, size=Pt(12), bold=True, color=C_PRIMARY, font_name=FONT_KO)
        r2 = p.add_run()
        r2.text = g_val
        set_font(r2, size=Pt(12), bold=True, color=C_SECONDARY, font_name=FONT_KO)

    add_footer(s1)

    # ==========================================
    # SLIDE 2: Problem
    # ==========================================
    s2 = prs.slides.add_slide(blank_layout)
    add_header(s2, "02", "구체적인 문제 제기 (The Problem)", "문제인식 (25점)")
    
    problems = [
        ("🚨 시간당 15회 오탐 (Alarm Fatigue)", "기존 일반 지능형 CCTV는 바람에 날리는 천막, 흙먼지, 그림자에도 '위험' 경보 남발\n-> 안전관리자의 경보 피로 누적으로 시스템을 강제 음소거(Mute)하거나 끄는 현장 무력화 발생"),
        ("🌧️ 가혹한 야외 환경 극복 실패", "실내 데이터로 학습된 기존 AI 모델은 비산먼지, 역광, 폭우, 기계 진동 시 인식률 40% 이하로 급락\n-> 수십 대 영상을 클라우드로 전송 시 3~5초 지연 발생으로 즉각 충돌 회피 불가능"),
        ("⚖️ 법적 공학 증빙 데이터의 전무", "사고 발생 시 산업안전보건기준에 관한 규칙 제38조(작업계획서), 제172조(신호수) 준수 여부 입증 곤란\n-> 중대재해처벌법 하에서 CSO 및 사업주의 객관적 무과실 입증 수단 부재")
    ]
    
    lefts = [0.8, 4.75, 8.7]
    for i, (p_title, p_desc) in enumerate(problems):
        card = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(lefts[i]), Inches(1.5), Inches(3.8), Inches(5.2))
        card.fill.solid()
        card.fill.fore_color.rgb = C_CARD_BG
        card.line.color.rgb = C_BORDER
        tf = card.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        r = p.add_run()
        r.text = f"Pain Point 0{i+1}"
        set_font(r, size=Pt(11), bold=True, color=C_ACCENT, font_name=FONT_EN)
        
        p = tf.add_paragraph()
        r = p.add_run()
        r.text = p_title
        set_font(r, size=Pt(14), bold=True, color=C_PRIMARY, font_name=FONT_KO)
        
        p = tf.add_paragraph()
        r = p.add_run()
        r.text = f"\n{p_desc}"
        set_font(r, size=Pt(12), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    add_footer(s2)

    # ==========================================
    # SLIDE 3: Solution
    # ==========================================
    s3 = prs.slides.add_slide(blank_layout)
    add_header(s3, "03", "직관적인 해결책 (The Solution)", "실현가능성 (30점)")
    
    # 시각 1: 엣지 컴퓨팅
    card1 = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.5), Inches(5.7), Inches(2.5))
    card1.fill.solid()
    card1.fill.fore_color.rgb = C_CARD_BG
    card1.line.color.rgb = C_SECONDARY
    tf1 = card1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    r = p.add_run()
    r.text = "혁신 1. 초경량 온디바이스 엣지 AI 필터링"
    set_font(r, size=Pt(14), bold=True, color=C_SECONDARY, font_name=FONT_KO)
    p = tf1.add_paragraph()
    r = p.add_run()
    r.text = "\n• 현장 카메라 단말에서 0.1초 내 1차 위험 객체/동선 판정\n• 통신 장애나 네트워크 단절 시에도 5m 위험반경 침범 즉시 현장 직접 경보\n• 불필요한 대역폭 비용 90% 절감 및 데이터 프라이버시 보호"
    set_font(r, size=Pt(11), bold=False, color=C_PRIMARY, font_name=FONT_KO)

    # 시각 2: 3D 가상 재난 합성 데이터
    card2 = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.8), Inches(1.5), Inches(5.733), Inches(2.5))
    card2.fill.solid()
    card2.fill.fore_color.rgb = C_CARD_BG
    card2.line.color.rgb = C_ACCENT
    tf2 = card2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    r = p.add_run()
    r.text = "혁신 2. 3D 가상 재난 물리 합성 데이터셋"
    set_font(r, size=Pt(14), bold=True, color=C_ACCENT, font_name=FONT_KO)
    p = tf2.add_paragraph()
    r = p.add_run()
    r.text = "\n• 실제 현장에서 촬영 불가한 '충돌·끼임·추락 순간' 3D 물리엔진 50만 컷 합성\n• 비산먼지, 역광, 기상악화 시뮬레이션을 사전 결합 학습\n• 오탐률 95% 이상 삭감 및 극한 야외 환경에서도 99% 감지 신뢰도 유지"
    set_font(r, size=Pt(11), bold=False, color=C_PRIMARY, font_name=FONT_KO)

    # 시각 3: 고객 ROI 지표 3종 바
    card3 = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(4.3), Inches(11.733), Inches(2.4))
    card3.fill.solid()
    card3.fill.fore_color.rgb = RGBColor(241, 245, 249)
    card3.line.color.rgb = C_BORDER
    tf3 = card3.text_frame
    tf3.word_wrap = True
    p = tf3.paragraphs[0]
    r = p.add_run()
    r.text = "🌟 고객이 체감하는 3대 압도적 가치 (Customer ROI)"
    set_font(r, size=Pt(13), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    
    rois = [
        ("오탐 피로도 95% 삭감", "진짜 위험에만 반응하는 신뢰성 99.2% 확보"),
        ("골든타임 0.2초 직격 경보", "운전자 모니터 + 작업자 초지향성 사운드 양방향 알림"),
        ("법적 무과실 공학 증빙", "KOSHA 10대 재해 기준 일일 안전감사 리포트 자동 생성")
    ]
    for tag, desc in rois:
        p = tf3.add_paragraph()
        r1 = p.add_run()
        r1.text = f"• [{tag}] "
        set_font(r1, size=Pt(12), bold=True, color=C_SECONDARY, font_name=FONT_KO)
        r2 = p.add_run()
        r2.text = desc
        set_font(r2, size=Pt(12), bold=False, color=C_PRIMARY, font_name=FONT_KO)

    add_footer(s3)

    # ==========================================
    # SLIDE 4: Market Opportunity
    # ==========================================
    s4 = prs.slides.add_slide(blank_layout)
    add_header(s4, "04", "최우선 타겟 시장 명확화 (Market)", "성장전략 (25점)")
    
    # 시각 1: TAM SAM SOM
    card1 = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.5), Inches(5.6), Inches(5.2))
    card1.fill.solid()
    card1.fill.fore_color.rgb = C_CARD_BG
    card1.line.color.rgb = C_BORDER
    tf1 = card1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    r = p.add_run()
    r.text = "📊 시장 규모 분석 (TAM-SAM-SOM)"
    set_font(r, size=Pt(14), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    
    markets = [
        ("TAM (전체 시장)", "4조 2,000억 원", "국내 스마트 건설 및 산업안전 비전 AI 시장 (CAGR 18.4%)"),
        ("SAM (유효 시장)", "6,800억 원", "중대재해처벌법 적용 대상 대규모 플랜트·토목 건설 현장"),
        ("SOM (거점 시장)", "180억 원", "수도권 및 주요 산단 내 복합 플랜트 중장비 운용 20개소 (1~2차년도 타겟)")
    ]
    for m_name, m_val, m_desc in markets:
        p = tf1.add_paragraph()
        r1 = p.add_run()
        r1.text = f"\n• {m_name}\n"
        set_font(r1, size=Pt(11), bold=True, color=C_SUBTEXT, font_name=FONT_KO)
        r2 = p.add_run()
        r2.text = f"  {m_val} "
        set_font(r2, size=Pt(16), bold=True, color=C_SECONDARY, font_name=FONT_EN)
        r3 = p.add_run()
        r3.text = f"\n  - {m_desc}"
        set_font(r3, size=Pt(10), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    # 시각 2: Beachhead Market 전략
    card2 = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.8), Inches(1.5), Inches(5.733), Inches(5.2))
    card2.fill.solid()
    card2.fill.fore_color.rgb = RGBColor(254, 242, 242) # soft rose
    card2.line.color.rgb = C_ACCENT
    tf2 = card2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    r = p.add_run()
    r.text = "🎯 최우선 거점 시장 (Beachhead Market)"
    set_font(r, size=Pt(14), bold=True, color=C_ACCENT, font_name=FONT_KO)
    
    p = tf2.add_paragraph()
    r = p.add_run()
    r.text = "\n\"대규모 플랜트 현장 내 '중장비-작업자 간 충돌 방지'에 먼저 쐐기를 박습니다.\""
    set_font(r, size=Pt(12), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    
    reasons = [
        ("사망 사고 1위 공종", "건설기계(굴착기·지게차) 충돌·협착은 건설업 전체 사망 원인 최상위"),
        ("즉각적 공사 중단 리스크", "사고 발생 시 고용노동부 즉각 전면 작업중지 명령 -> 하루 수억 원 손실"),
        ("원청 CSO의 최우선 지출 항목", "중대재해처벌법 법적 면책을 위해 가장 예산 배정이 시급한 1순위 솔루션")
    ]
    for tag, desc in reasons:
        p = tf2.add_paragraph()
        r1 = p.add_run()
        r1.text = f"\n• {tag}\n"
        set_font(r1, size=Pt(11), bold=True, color=C_PRIMARY, font_name=FONT_KO)
        r2 = p.add_run()
        r2.text = f"  {desc}"
        set_font(r2, size=Pt(11), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    add_footer(s4)

    # ==========================================
    # SLIDE 5: Product
    # ==========================================
    s5 = prs.slides.add_slide(blank_layout)
    add_header(s5, "05", "핵심 제품 및 서비스 (The Product)", "실현가능성 (30점)")
    
    features = [
        ("🛡️ 360도 가상 지오펜싱 & 0.2초 알림", "굴착기 선회 반경(3~5m) 및 지게차 주행 경로 내 작업자 진입 시 즉각 감지\n운전석 모니터 시각 경보 및 진입 작업자 방향 초지향성 사운드 동시 발령"),
        ("🦺 AI 작업자 상태 & 보호구(PPE) 판별", "안전모(미착용/불완전착용) 및 고시인성 반사조끼 착용 여부 픽셀 색상/윤곽 동시 검증\n단순 정지가 아닌 이동 궤적(Velocity Vector) 및 위험구역 체류시간(Tau) 추적"),
        ("📋 공공데이터 10대 재해 자동 감사 리포트", "고용노동부/KOSHA 10대 재해 통계 매트릭스와 실시간 대조하여 위반사항 자동 캡처\n내부 분석용 무손실 원본 뷰 & 대관 배포용 안면 비식별화 모자이크 2원화 출력")
    ]
    lefts = [0.8, 4.75, 8.7]
    for i, (f_title, f_desc) in enumerate(features):
        card = s5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(lefts[i]), Inches(1.5), Inches(3.8), Inches(5.2))
        card.fill.solid()
        card.fill.fore_color.rgb = C_CARD_BG
        card.line.color.rgb = C_SECONDARY if i==0 else C_BORDER
        card.line.width = Pt(1.5) if i==0 else Pt(1.0)
        tf = card.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        r = p.add_run()
        r.text = f"Core Feature 0{i+1}"
        set_font(r, size=Pt(11), bold=True, color=C_SECONDARY, font_name=FONT_EN)
        
        p = tf.add_paragraph()
        r = p.add_run()
        r.text = f_title
        set_font(r, size=Pt(13), bold=True, color=C_PRIMARY, font_name=FONT_KO)
        
        p = tf.add_paragraph()
        r = p.add_run()
        r.text = f"\n{f_desc}"
        set_font(r, size=Pt(11), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    add_footer(s5)

    # ==========================================
    # SLIDE 6: Business Model
    # ==========================================
    s6 = prs.slides.add_slide(blank_layout)
    add_header(s6, "06", "타당성 있는 비즈니스 모델 (Business Model)", "성장전략 (25점)")
    
    # 시각 1: 3-Tier 복합 수익 구조
    card1 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.5), Inches(6.5), Inches(5.2))
    card1.fill.solid()
    card1.fill.fore_color.rgb = C_CARD_BG
    card1.line.color.rgb = C_BORDER
    tf1 = card1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    r = p.add_run()
    r.text = "💰 3-Tier 다각화 수익 구조"
    set_font(r, size=Pt(14), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    
    tiers = [
        ("Tier 1. 엣지 H/W 구축비 (단기)", "현장당 1,500만 원 (일시불)", "산업용 엣지 AI 게이트웨이 및 방폭형 초지향성 사운드 센서 패키지 납품"),
        ("Tier 2. 클라우드 관제 SaaS (장기)", "현장당 월 150만 원 (구독형)", "실시간 AI 동적 분석, 이상행동 감지 라이선스, 클라우드 감사 데이터 저장"),
        ("Tier 3. 안전 컨설팅 연계 (고부가)", "현장당 월 100만 원 (옵션)", "월간 정기 안전위험성평가 공학 리포트 발행 및 KOSHA/ISO45001 자문")
    ]
    for t_name, t_price, t_desc in tiers:
        p = tf1.add_paragraph()
        r1 = p.add_run()
        r1.text = f"\n• {t_name}\n"
        set_font(r1, size=Pt(12), bold=True, color=C_SECONDARY, font_name=FONT_KO)
        r2 = p.add_run()
        r2.text = f"  기준가: {t_price}\n"
        set_font(r2, size=Pt(11), bold=True, color=C_ACCENT, font_name=FONT_KO)
        r3 = p.add_run()
        r3.text = f"  {t_desc}"
        set_font(r3, size=Pt(10), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    # 시각 2: 단위 경제성 (Unit Economics)
    card2 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(7.6), Inches(1.5), Inches(4.933), Inches(5.2))
    card2.fill.solid()
    card2.fill.fore_color.rgb = RGBColor(248, 250, 252)
    card2.line.color.rgb = C_SECONDARY
    card2.line.width = Pt(1.5)
    tf2 = card2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    r = p.add_run()
    r.text = "📈 단위 경제성 최적화 (Unit Economics)"
    set_font(r, size=Pt(14), bold=True, color=C_SECONDARY, font_name=FONT_KO)
    
    p = tf2.add_paragraph()
    r = p.add_run()
    r.text = "\n• 현장 평균 공기: 24개월 기준\n• 고객 생애 가치 (LTV):\n"
    set_font(r, size=Pt(11), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    r_val = p.add_run()
    r_val.text = "  현장당 약 7,500만 원\n"
    set_font(r_val, size=Pt(16), bold=True, color=C_ACCENT, font_name=FONT_KO)
    
    p = tf2.add_paragraph()
    r = p.add_run()
    r.text = "• 고객 획득 비용 (CAC):\n"
    set_font(r, size=Pt(11), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    r_cac = p.add_run()
    r_cac.text = "  현장당 약 400만 원 (본사 일괄 계약)\n"
    set_font(r_cac, size=Pt(14), bold=True, color=C_SECONDARY, font_name=FONT_KO)
    
    p = tf2.add_paragraph()
    r = p.add_run()
    r.text = "• LTV / CAC 비율:\n"
    set_font(r, size=Pt(11), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    r_ratio = p.add_run()
    r_ratio.text = "  18.7배 (고수익 건전성 확보)"
    set_font(r_ratio, size=Pt(16), bold=True, color=C_ACCENT, font_name=FONT_KO)

    add_footer(s6)

    # ==========================================
    # SLIDE 7: Moat & Competition
    # ==========================================
    s7 = prs.slides.add_slide(blank_layout)
    add_header(s7, "07", "기술적 진입 장벽 (Moat & Competition)", "실현가능성 (30점)")
    
    # 시각 1: 2x2 포지셔닝 맵 설명
    card1 = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.5), Inches(5.6), Inches(5.2))
    card1.fill.solid()
    card1.fill.fore_color.rgb = C_CARD_BG
    card1.line.color.rgb = C_BORDER
    tf1 = card1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    r = p.add_run()
    r.text = "🗺️ 2x2 경쟁 포지셔닝 분석"
    set_font(r, size=Pt(14), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    p = tf1.add_paragraph()
    r = p.add_run()
    r.text = "\n[X축: 환경 강건성 / Y축: 오탐 제어율 & 실시간성]\n"
    set_font(r, size=Pt(11), bold=True, color=C_SUBTEXT, font_name=FONT_KO)
    
    p = tf1.add_paragraph()
    r1 = p.add_run()
    r1.text = "• 기존 대기업/통신사 SI (좌하단)\n"
    set_font(r1, size=Pt(11), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    r2 = p.add_run()
    r2.text = "  클라우드 전송 지연(3~5초), 실내 정제 데이터 한계로 야외 현장 오탐 다발\n"
    set_font(r2, size=Pt(10), bold=False, color=C_SUBTEXT, font_name=FONT_KO)
    
    p = tf1.add_paragraph()
    r1 = p.add_run()
    r1.text = "• BEPMC 독점 포지션 (우상단)\n"
    set_font(r1, size=Pt(12), bold=True, color=C_SECONDARY, font_name=FONT_KO)
    r2 = p.add_run()
    r2.text = "  0.1초 엣지 초저지연 + 3D 가상 재난 데이터셋으로 가혹한 야외 환경 완벽 적응 및 무오탐 달성"
    set_font(r2, size=Pt(11), bold=False, color=C_PRIMARY, font_name=FONT_KO)

    # 시각 2: 독점적 방어 기제 3요소
    card2 = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.8), Inches(1.5), Inches(5.733), Inches(5.2))
    card2.fill.solid()
    card2.fill.fore_color.rgb = RGBColor(238, 242, 255)
    card2.line.color.rgb = C_SECONDARY
    tf2 = card2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    r = p.add_run()
    r.text = "🏰 독점적 기술 방어 기제 (Moat)"
    set_font(r, size=Pt(14), bold=True, color=C_SECONDARY, font_name=FONT_KO)
    
    moats = [
        ("1. 독점 3D 가상 재난 물리 데이터셋", "실제 현장에서 법적으로 수집 불가한 인체 협착·충돌 순간 3D 시뮬레이션 데이터 50만 건 선제 구축 (후발주자 모방 불가)"),
        ("2. 건설·철도 기하학 특허 선점", "표준궤간(1,435mm) 호모그래피 거리 추정 및 건축한계 2.0m 가상 펜스 알고리즘 특허 출원 1건 확보"),
        ("3. 산업안전보건법령 실시간 매핑 엔진", "고용노동부 규칙 제38조·제42조 위반 시 즉시 3단계 공학 대책을 출력하는 독자적 도메인 지식 베이스")
    ]
    for m_title, m_desc in moats:
        p = tf2.add_paragraph()
        r1 = p.add_run()
        r1.text = f"\n• {m_title}\n"
        set_font(r1, size=Pt(11), bold=True, color=C_PRIMARY, font_name=FONT_KO)
        r2 = p.add_run()
        r2.text = f"  {m_desc}"
        set_font(r2, size=Pt(10), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    add_footer(s7)

    # ==========================================
    # SLIDE 8: Go-to-Market
    # ==========================================
    s8 = prs.slides.add_slide(blank_layout)
    add_header(s8, "08", "단계별 성장 전략 (Go-to-Market)", "성장전략 (25점)")
    
    phases = [
        ("Phase 1 (1차년도)", "공공 실증 & 무오탐 레퍼런스 확보", "• 지자체 도로/상하수도 공사 및 우호 중견사 3개 현장 저비용 PoC 실증\n• 1,000시간 연속 무사고 가동 및 오탐 95% 삭감 공인 시험성적서 확보\n• 목표 매출: 1.5억 원 (테스트베드 및 초기 엣지 공급)"),
        ("Phase 2 (2차년도)", "민간 플랜트 및 철도 공구 확장", "• 정유·석유화학 대형 플랜트 T/A 현장 및 철도 궤도 공구 15개소 공급\n• 안전보건공단 스마트 안전장비 지원사업(70% 국비 지원) 공급기업 등록\n• 목표 매출: 12억 원 (SaaS 구독 매출 비중 40% 도달)"),
        ("Phase 3 (3차년도~)", "ISO45001 안전보건경영 토털 도약", "• 솔루션 납품을 넘어 기업의 안전보건경영체계(ISO45001) 공인 컨설팅 결합\n• 10대 건설사 전사 표준 안전 관제 플랫폼 채택 유도\n• 목표 매출: 50억 원 이상 (누적 관리 현장 100개소 달성)")
    ]
    lefts = [0.8, 4.75, 8.7]
    for i, (ph_step, ph_title, ph_desc) in enumerate(phases):
        card = s8.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(lefts[i]), Inches(1.5), Inches(3.8), Inches(5.2))
        card.fill.solid()
        card.fill.fore_color.rgb = C_CARD_BG
        card.line.color.rgb = C_ACCENT if i==0 else C_BORDER
        card.line.width = Pt(1.5) if i==0 else Pt(1.0)
        tf = card.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        r = p.add_run()
        r.text = ph_step
        set_font(r, size=Pt(11), bold=True, color=C_ACCENT if i==0 else C_SECONDARY, font_name=FONT_EN)
        
        p = tf.add_paragraph()
        r = p.add_run()
        r.text = ph_title
        set_font(r, size=Pt(13), bold=True, color=C_PRIMARY, font_name=FONT_KO)
        
        p = tf.add_paragraph()
        r = p.add_run()
        r.text = f"\n{ph_desc}"
        set_font(r, size=Pt(11), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    add_footer(s8)

    # ==========================================
    # SLIDE 9: Traction
    # ==========================================
    s9 = prs.slides.add_slide(blank_layout)
    add_header(s9, "09", "현재까지의 성과 (Traction)", "실현가능성 (30점)")
    
    tractions = [
        ("💻 작동 가능한 MVP 개발 완료", "• 브라우저 Canvas 기반 고속 프레임 캡처 및 TensorFlow.js / 픽셀 분석 엔진 탑재\n• 실시간 다중 객체 추적(ByteTrack) 및 위험구역 체류시간(Tau), 속도(km/h) 산출 Tracking Engine 자체 구축"),
        ("📊 국가 공공데이터 10대 재해 매트릭스", "• 고용노동부 과거 1년 통계(추락 34.8%, 사다리 14.2%, 굴착기 충돌 11.5% 등) 10대 규칙 바인딩 완료\n• 현장 여건에 따른 조건 On/Off 선택 및 커스텀 맞춤 규칙 동적 추가 기능 완비"),
        ("⚖️ 지식재산권 및 실증 협력 네트워크", "• 특허 출원 1건: '엣지 비전 AI 기반 가상 지오펜싱 및 동적 위험 추적 시스템'\n• 수도권 플랜트 토목 현장 2개소와 현장 테스트베드 실증 협의 진행 중")
    ]
    lefts = [0.8, 4.75, 8.7]
    for i, (t_title, t_desc) in enumerate(tractions):
        card = s9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(lefts[i]), Inches(1.5), Inches(3.8), Inches(5.2))
        card.fill.solid()
        card.fill.fore_color.rgb = C_CARD_BG
        card.line.color.rgb = C_BORDER
        tf = card.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        r = p.add_run()
        r.text = f"Traction Proof 0{i+1}"
        set_font(r, size=Pt(11), bold=True, color=C_SECONDARY, font_name=FONT_EN)
        
        p = tf.add_paragraph()
        r = p.add_run()
        r.text = t_title
        set_font(r, size=Pt(13), bold=True, color=C_PRIMARY, font_name=FONT_KO)
        
        p = tf.add_paragraph()
        r = p.add_run()
        r.text = f"\n{t_desc}"
        set_font(r, size=Pt(11), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    add_footer(s9)

    # ==========================================
    # SLIDE 10: The Team
    # ==========================================
    s10 = prs.slides.add_slide(blank_layout)
    add_header(s10, "10", "문제를 해결할 최적의 팀 (The Team)", "팀구성 (20점)")
    
    # 시각 1: 대표자 프로필
    card1 = s10.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.5), Inches(6.5), Inches(5.2))
    card1.fill.solid()
    card1.fill.fore_color.rgb = C_CARD_BG
    card1.line.color.rgb = C_SECONDARY
    card1.line.width = Pt(1.5)
    tf1 = card1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    r = p.add_run()
    r.text = "👤 대표자: 최병억 (CEO & Project Director)"
    set_font(r, size=Pt(15), bold=True, color=C_SECONDARY, font_name=FONT_KO)
    
    p = tf1.add_paragraph()
    r = p.add_run()
    r.text = "\n[핵심 경력 및 도메인 전문성]\n"
    set_font(r, size=Pt(12), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    
    rep_details = [
        "SK에코플랜트 플랜트/에너지 프로젝트 관리(PM) 핵심 경력",
        "대규모 복합 플랜트 현장의 공정, 안전 관리 프로세스, 하청 노무 구조의 생리를 꿰뚫고 있는 현장 최고 전문가",
        "단순 개발자가 모르는 '현장 소장과 안전관리자가 왜 장비를 끄는지', '고용노동부 조사관이 어떤 서류를 요구하는지' 완벽 이해",
        "현장 도메인 지식과 최정예 비전 AI 기술을 융합하는 강력한 사업화 리더십 보유"
    ]
    for d in rep_details:
        p = tf1.add_paragraph()
        r = p.add_run()
        r.text = f"• {d}"
        set_font(r, size=Pt(11), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    # 시각 2: 엔지니어링 팀 & 자문단
    card2 = s10.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(7.6), Inches(1.5), Inches(4.933), Inches(5.2))
    card2.fill.solid()
    card2.fill.fore_color.rgb = RGBColor(248, 250, 252)
    card2.line.color.rgb = C_BORDER
    tf2 = card2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    r = p.add_run()
    r.text = "👥 엔지니어링 팀 & 외부 자문단"
    set_font(r, size=Pt(14), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    
    teams = [
        ("AI / 컴퓨터 비전 연구팀", "온디바이스 엣지 AI 최적화 및 고속 프레임 픽셀 분석 엔진 전담 연구"),
        ("3D 가상 시뮬레이션 연구팀", "물리엔진 기반 3D 가상 재난(충돌/끼임) 합성 데이터셋 파이프라인 개발"),
        ("공학 안전 자문단", "건설안전기술사, 안전보건공단 출신 자문위원과의 밀착 감수 네트워크 구축")
    ]
    for t_title, t_desc in teams:
        p = tf2.add_paragraph()
        r1 = p.add_run()
        r1.text = f"\n• {t_title}\n"
        set_font(r1, size=Pt(11), bold=True, color=C_SECONDARY, font_name=FONT_KO)
        r2 = p.add_run()
        r2.text = f"  {t_desc}"
        set_font(r2, size=Pt(10), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    add_footer(s10)

    # ==========================================
    # SLIDE 11: Financials & The Ask
    # ==========================================
    s11 = prs.slides.add_slide(blank_layout)
    add_header(s11, "11", "현실적인 재무 계획 (Financials & Ask)", "예산 집행 계획")
    
    # 시각 1: 정부 지원금 예산 배분
    card1 = s11.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.5), Inches(6.5), Inches(5.2))
    card1.fill.solid()
    card1.fill.fore_color.rgb = C_CARD_BG
    card1.line.color.rgb = C_BORDER
    tf1 = card1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    r = p.add_run()
    r.text = "💵 정부 지원금 집행 계획 (8,000만 원 기준)"
    set_font(r, size=Pt(14), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    
    budgets = [
        ("시제품 엣지 AI 게이트웨이 제작", "3,200만 원 (40%)", "산업용 내구성 하드웨어 보드 및 초지향성 사운드 모듈 3세트 제작"),
        ("3D 가상 재난 합성 데이터셋 고도화", "2,000만 원 (25%)", "플랜트 중장비 충돌·끼임 50만 컷 정밀 3D 렌더링 라이브러리 구축"),
        ("현장 실증 테스트베드 운용비", "1,600만 원 (20%)", "3개 실증 현장 통신 가설비, 설치 공사비, 모니터링 클라우드 서버비"),
        ("공인 시험성적서 및 특허 등록", "1,200만 원 (15%)", "KTL/KCL 오탐률·응답속도 시험성적서 1건, 핵심 특허 2건 등록")
    ]
    for b_title, b_val, b_desc in budgets:
        p = tf1.add_paragraph()
        r1 = p.add_run()
        r1.text = f"\n• {b_title}: "
        set_font(r1, size=Pt(11), bold=True, color=C_PRIMARY, font_name=FONT_KO)
        r2 = p.add_run()
        r2.text = f"{b_val}\n"
        set_font(r2, size=Pt(11), bold=True, color=C_ACCENT, font_name=FONT_KO)
        r3 = p.add_run()
        r3.text = f"  {b_desc}"
        set_font(r3, size=Pt(10), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    # 시각 2: The Ask (자금의 명확한 성격)
    card2 = s11.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(7.6), Inches(1.5), Inches(4.933), Inches(5.2))
    card2.fill.solid()
    card2.fill.fore_color.rgb = RGBColor(238, 242, 255)
    card2.line.color.rgb = C_SECONDARY
    card2.line.width = Pt(1.5)
    tf2 = card2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    r = p.add_run()
    r.text = "🎯 지원금의 명확한 성격 (The Ask)"
    set_font(r, size=Pt(14), bold=True, color=C_SECONDARY, font_name=FONT_KO)
    
    p = tf2.add_paragraph()
    r = p.add_run()
    r.text = "\n\"본 지원금은 회사의 막연한 일반 운영비가 아닌, '1차년도 현장 실증(PoC) 완성 및 공인 레퍼런스 확보'라는 단 하나의 마일스톤에 100% 집중 투입됩니다.\""
    set_font(r, size=Pt(12), bold=True, color=C_PRIMARY, font_name=FONT_KO)
    
    p = tf2.add_paragraph()
    r = p.add_run()
    r.text = "\n[과제 종료 후 후속 성과 목표]\n• 1,000시간 무사고 연속 가동 레퍼런스 확보\n• 안전보건공단 스마트 안전장비 공식 공급기업 등록\n• 2차년도 민간 투자(TIPS) 연계 및 자체 매출 흑자 전환"
    set_font(r, size=Pt(11), bold=False, color=C_SUBTEXT, font_name=FONT_KO)

    add_footer(s11)

    # ==========================================
    # SLIDE 12: 부록 Q&A 방어 매트릭스
    # ==========================================
    s12 = prs.slides.add_slide(blank_layout)
    add_header(s12, "부록", "심사위원 예상 질의응답 (Q&A Defense)", "평가위원 Q&A 대응")
    
    qnas = [
        ("Q1. 대기업 통신사 솔루션과의 차별점은?", "대기업은 날씨 좋은 날 '안전모 착용' 확인 수준입니다. 당사는 흙먼지·진동 속 중장비 반경에 특화되어 3D 가상 재난 데이터로 오탐 95%를 줄인 유일한 엣지 솔루션입니다."),
        ("Q2. 8천만 원 예산으로 실증까지 가능한가?", "당사는 이미 MVP 알고리즘 개발을 마쳤습니다. 백지상태 R&D가 아니라, 완성된 모델을 엣지 보드에 포팅하고 3개 현장 실증에만 100% 집중 투입하므로 충분히 완결됩니다."),
        ("Q3. 대표자가 비IT 전공인데 개발 리더십은?", "산업안전 AI는 코드보다 '현장 도메인 지식'이 성패를 가릅니다. SK에코플랜트 플랜트 PM 출신으로서 현장에서 진짜 통하는 기술이 되도록 철저히 검증하고 지휘합니다."),
        ("Q4. 현장 작업자의 개인정보 사생활 침해는?", "관공서/대외 보고서 출력 시 안면 및 신체 부위를 엣지에서 100% 자동 모자이크 처리하며, 0.2초 경보로 목숨을 살려주는 안전 장비임을 TBM 교육하여 자발적 수용성을 확보합니다.")
    ]
    
    positions = [
        (Inches(0.8), Inches(1.5), Inches(5.6), Inches(2.5)),
        (Inches(6.8), Inches(1.5), Inches(5.733), Inches(2.5)),
        (Inches(0.8), Inches(4.2), Inches(5.6), Inches(2.5)),
        (Inches(6.8), Inches(4.2), Inches(5.733), Inches(2.5))
    ]
    for i, (q_txt, a_txt) in enumerate(qnas):
        pos = positions[i]
        card = s12.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, pos[0], pos[1], pos[2], pos[3])
        card.fill.solid()
        card.fill.fore_color.rgb = C_CARD_BG
        card.line.color.rgb = C_BORDER
        tf = card.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        r = p.add_run()
        r.text = q_txt
        set_font(r, size=Pt(12), bold=True, color=C_ACCENT, font_name=FONT_KO)
        
        p = tf.add_paragraph()
        r = p.add_run()
        r.text = f"\n{a_txt}"
        set_font(r, size=Pt(10.5), bold=False, color=C_PRIMARY, font_name=FONT_KO)

    add_footer(s12)

    prs.save(output_path)
    print(f"Presentation successfully saved to: {output_path}")

if __name__ == "__main__":
    out_file = sys.argv[1] if len(sys.argv) > 1 else "BEPMC_AI_산업안전_정부지원사업_발표자료.pptx"
    create_deck(out_file)
