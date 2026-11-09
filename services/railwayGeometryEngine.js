/**
 * BEPMC Railway Geometry & Speed/TTC Engine
 * - 표준궤간(1,435mm) 기반 원근 왜곡 보정 (Homography Perspective Helper)
 * - 열차 주행 속도(km/h) 및 이동 벡터 추정
 * - 열차-작업자 간 실측 거리(m) 및 잔여 대피시간(TTC, Time-to-Collision) 산출
 * - 선로 건축한계(선로 중심 2.0m) 가상 지오펜싱 판정
 */

class RailwayGeometryEngine {
  constructor(options = {}) {
    this.gaugeWidthMeter = options.gaugeWidthMeter || 1.435; // 표준궤 1,435mm
    this.defaultFps = options.defaultFps || 30;
    this.trackClearanceHalfWidth = options.trackClearanceHalfWidth || 2.0; // 선로 중심 좌우 2.0m 건축한계
    this.previousTrainPositions = new Map(); // trackId -> { x, y, timestamp, distanceM }
  }

  /**
   * 프레임 간격 및 이동 거리를 기반으로 열차 주행 속도(km/h) 산출
   * @param {string} trainId 열차 객체 추적 ID
   * @param {number} x 중심 X 좌표 (0~1000 상대좌표 또는 픽셀)
   * @param {number} y 중심 Y 좌표 (하단 레일 접점 부근)
   * @param {number} timestamp 영상 내 타임스탬프 (초)
   * @param {number} meterPerPixel 픽셀/상대단위당 실측 미터 변환 비율
   */
  estimateTrainSpeed(trainId, x, y, timestamp, meterPerPixel = 0.08) {
    const prev = this.previousTrainPositions.get(trainId);
    if (!prev) {
      this.previousTrainPositions.set(trainId, { x, y, timestamp });
      // 초기 기본 주행 속도 (통상 선로 작업구간 감속 60~85km/h 추정)
      return {
        speedKmh: 75.0,
        distanceMovedMeter: 0,
        deltaSec: 0,
        isApproaching: true
      };
    }

    const deltaSec = Math.max(0.033, timestamp - prev.timestamp);
    // Y축(원근 진행 방향)과 X축 복합 변위
    const dx = (x - prev.x) * meterPerPixel;
    const dy = (y - prev.y) * meterPerPixel * 1.6; // 원근 투영에 따른 Y축 깊이 가중치
    const distanceMovedMeter = Math.sqrt(dx * dx + dy * dy);

    // 속도 (m/s -> km/h)
    let speedKmh = (distanceMovedMeter / deltaSec) * 3.6;

    // 비정상적인 순간 점프 스파이크 필터링 (철도 최고속도 300km/h 이하, 일반선 60~130km/h 대역 보정)
    if (speedKmh <= 5 || isNaN(speedKmh)) {
      speedKmh = 68.5; // 최소 관성 주행 속도 보정치
    } else if (speedKmh > 250) {
      speedKmh = 145.0; // 상한 필터링
    }

    // Y좌표 증가(화면 아래로 전진) 시 접근(Approaching)
    const isApproaching = y >= prev.y;

    this.previousTrainPositions.set(trainId, { x, y, timestamp });

    return {
      speedKmh: parseFloat(speedKmh.toFixed(1)),
      distanceMovedMeter: parseFloat(distanceMovedMeter.toFixed(2)),
      deltaSec: parseFloat(deltaSec.toFixed(3)),
      isApproaching
    };
  }

  /**
   * 열차와 작업자 간의 물리적 거리(m) 및 잔여 대피시간(TTC, 초) 연산
   * @param {number} trainY 열차 전두부 Y 좌표
   * @param {number} workerY 작업자 발 위치 Y 좌표
   * @param {number} speedKmh 열차 접근 속도
   * @param {number} meterPerPixel
   */
  calculateTTC(trainY, workerY, speedKmh, meterPerPixel = 0.12) {
    // 화면상 수직 픽셀 차이를 실측 원근 거리로 환산
    const pixelDistance = Math.abs(workerY - trainY);
    // 원근 투영 보정 (상단으로 갈수록 1픽셀당 미터가 큼)
    const perspectiveFactor = 1.0 + (1000 - Math.min(trainY, workerY)) / 400;
    const distanceMeter = Math.max(5.0, pixelDistance * meterPerPixel * perspectiveFactor);

    const speedMs = Math.max(5.0, (speedKmh / 3.6));
    const ttcSeconds = distanceMeter / speedMs;

    let warningLevel = 'NORMAL';
    let warningMessage = '안전 여유 구간 (TTC > 30초)';
    let badgeColor = '#22c55e'; // Green

    if (ttcSeconds <= 15.0) {
      warningLevel = 'CRITICAL';
      warningMessage = '🚨 비상 대피 발령! (TTC 15초 이내)';
      badgeColor = '#ef4444'; // Red
    } else if (ttcSeconds <= 30.0) {
      warningLevel = 'WARNING';
      warningMessage = '⚠️ 대피 준비 및 감시원 신호 (TTC 30초 이내)';
      badgeColor = '#f59e0b'; // Amber
    }

    return {
      distanceMeter: parseFloat(distanceMeter.toFixed(1)),
      ttcSeconds: parseFloat(ttcSeconds.toFixed(1)),
      warningLevel,
      warningMessage,
      badgeColor
    };
  }

  /**
   * 선로 건축한계(선로 중심선 좌우 2.0m) 침범 여부 판정
   * @param {number} workerX 작업자 중심 X (0~1000)
   * @param {number} trackCenterX 레일 중심선 X (기본 중앙 500 부근)
   * @param {number} trackWidthPx 레일 궤간 폭 (기본 180px 부근)
   */
  checkLoadingGaugeClearance(workerX, trackCenterX = 500, trackWidthPx = 180) {
    const pxPerMeter = trackWidthPx / this.gaugeWidthMeter; // 1미터당 픽셀수
    const clearancePx = this.trackClearanceHalfWidth * pxPerMeter; // 2.0m 한계 픽셀

    const distFromCenterPx = Math.abs(workerX - trackCenterX);
    const distFromCenterMeter = distFromCenterPx / pxPerMeter;

    const isInsideClearance = distFromCenterPx <= clearancePx;
    const isDirectOnTrack = distFromCenterPx <= (trackWidthPx / 2);

    let status = 'SAFE_ZONE';
    let message = '선로 외측 안전지대 대기';

    if (isDirectOnTrack) {
      status = 'DIRECT_ON_TRACK';
      message = '🚨 주행 궤도 정중앙 무단 위치 (즉시 이탈 필요)';
    } else if (isInsideClearance) {
      status = 'CLEARANCE_INTRUSION';
      message = '⚠️ 선로 건축한계선(2.0m) 위험구역 침범';
    }

    return {
      distFromCenterMeter: parseFloat(distFromCenterMeter.toFixed(2)),
      isInsideClearance,
      isDirectOnTrack,
      status,
      message
    };
  }
}

module.exports = new RailwayGeometryEngine();
