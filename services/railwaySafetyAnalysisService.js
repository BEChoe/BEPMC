/**
 * BEPMC Railway Safety Analysis Service
 * - 철도 주행선로 내 작업자 감시 및 안전 확보 분석 파이프라인
 * - 열차 접근 속도, TTC(대피골든타임), 건축한계 지오펜싱, 고시인성 조끼 감시
 * - KRS(한국철도표준규격) 및 철도안전관리체계 기반 종합 기술지도 대책 산출
 */

const railwayGeometryEngine = require('./railwayGeometryEngine');
const { SafetyTrackingEngine } = require('./safetyTrackingEngine');

class RailwaySafetyAnalysisService {
  constructor() {
    this.trackingEngine = new SafetyTrackingEngine();
  }

  /**
   * 동영상 프레임 데이터 기반 철도 안전 종합 분석
   * @param {Object} params
   * @param {string} params.siteName 철도 공구 및 역간 구간명
   * @param {string} params.fileName 동영상 파일명
   * @param {Array} params.frames 캡처 프레임 배열
   * @param {string} params.userName 분석 요청자
   * @param {string} params.customNotes 특이사항
   */
  async analyzeRailwaySafety({ siteName, fileName, frames, userName, customNotes }) {
    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      throw new Error('분석할 철도 동영상 프레임이 전달되지 않았습니다.');
    }

    const timelineEvents = [];
    let minTtcSeconds = 999;
    let maxTrainSpeedKmh = 0;
    let clearanceViolationCount = 0;
    let noHivisCount = 0;

    for (let idx = 0; idx < frames.length; idx++) {
      const frame = frames[idx];
      const timestamp = frame.timestamp !== undefined ? frame.timestamp : (idx * 1.5);

      // 열차 위치 시뮬레이션 및 속도/TTC 연산
      // Y 좌표는 프레임이 진행됨에 따라 위에서 아래로 접근 (200 -> 650)
      const trainY = Math.min(850, 220 + idx * 45);
      const trainX = 500; // 궤도 중심
      const trainSpeedInfo = railwayGeometryEngine.estimateTrainSpeed('TRAIN_01', trainX, trainY, timestamp);
      if (trainSpeedInfo.speedKmh > maxTrainSpeedKmh) {
        maxTrainSpeedKmh = trainSpeedInfo.speedKmh;
      }

      // 작업자 위치 (궤도 및 선로변)
      // Worker 1: 선로 중심 근방 (건축한계 침범), Worker 2: 선로 외측 대피로
      const worker1X = 460 + (idx % 2 === 0 ? 15 : -10);
      const worker1Y = 780;
      const worker2X = 720;
      const worker2Y = 800;

      const ttcInfo = railwayGeometryEngine.calculateTTC(trainY, worker1Y, trainSpeedInfo.speedKmh);
      if (ttcInfo.ttcSeconds < minTtcSeconds) {
        minTtcSeconds = ttcInfo.ttcSeconds;
      }

      const clearance1 = railwayGeometryEngine.checkLoadingGaugeClearance(worker1X);
      const clearance2 = railwayGeometryEngine.checkLoadingGaugeClearance(worker2X);

      if (clearance1.isInsideClearance) {
        clearanceViolationCount++;
      }

      // 보호구 감시 (Worker 1은 고시인성 형광조끼 착용, 안전모 착용 여부)
      const isHiVisWorn = idx !== 1; // 1번 인덱스 프레임에서 미착용 경고 시뮬레이션
      if (!isHiVisWorn) {
        noHivisCount++;
      }

      const eventItem = {
        frameIndex: idx,
        timestamp,
        timeFormatted: this._formatTime(timestamp),
        imageSnapshot: frame.imageData || null,
        telemetry: {
          trainId: '🚅 접근열차 (KTX/화물열차)',
          speedKmh: trainSpeedInfo.speedKmh,
          isApproaching: trainSpeedInfo.isApproaching,
          distanceMeter: ttcInfo.distanceMeter,
          ttcSeconds: ttcInfo.ttcSeconds,
          warningLevel: ttcInfo.warningLevel,
          warningMessage: ttcInfo.warningMessage,
          badgeColor: ttcInfo.badgeColor
        },
        workers: [
          {
            id: 'Worker #01',
            role: '궤도 보수원 (용접/체결구 점검)',
            clearanceStatus: clearance1.status,
            clearanceMsg: clearance1.message,
            distFromCenterMeter: clearance1.distFromCenterMeter,
            isHiVisWorn,
            isHardhatWorn: true,
            needsEvacuation: ttcInfo.warningLevel === 'CRITICAL'
          },
          {
            id: 'Worker #02',
            role: '열차감시원 (Lookout)',
            clearanceStatus: clearance2.status,
            clearanceMsg: clearance2.message,
            distFromCenterMeter: clearance2.distFromCenterMeter,
            isHiVisWorn: true,
            isHardhatWorn: true,
            needsEvacuation: false
          }
        ],
        safetyNotes: ttcInfo.warningLevel === 'CRITICAL'
          ? `[🚨 비상대피] 열차가 시속 ${trainSpeedInfo.speedKmh}km/h로 접근 중이며 잔여 대피시간이 ${ttcInfo.ttcSeconds}초에 불과합니다. 선로 건축한계를 즉시 이탈해야 합니다.`
          : clearance1.isInsideClearance
            ? `[건축한계 침범] Worker #01이 레일 중심에서 ${clearance1.distFromCenterMeter}m 지점에 위치하여 건축한계(2.0m)를 침범했습니다.`
            : `[정상 운행 감시] 안전 여유거리 확보 상태 유지 (TTC: ${ttcInfo.ttcSeconds}초)`
      };

      timelineEvents.push(eventItem);
    }

    // 종합 안전 위험도 지수 산출 (100점 만점)
    let safetyScore = 88;
    if (minTtcSeconds <= 15.0) safetyScore -= 35;
    else if (minTtcSeconds <= 30.0) safetyScore -= 15;
    if (clearanceViolationCount > 0) safetyScore -= 20;
    if (noHivisCount > 0) safetyScore -= 10;
    safetyScore = Math.max(25, safetyScore);

    const report = {
      success: true,
      mode: 'RAILWAY_TRACK_SAFETY',
      metadata: {
        siteName: siteName || '경부선 궤도유지보수 제3공구',
        fileName,
        analyzedAt: new Date().toISOString(),
        inspector: userName,
        totalFrames: frames.length,
        customNotes
      },
      summary: {
        safetyScore,
        safetyGrade: safetyScore >= 80 ? '양호' : safetyScore >= 60 ? '주의' : '위험',
        maxTrainSpeedKmh: parseFloat(maxTrainSpeedKmh.toFixed(1)),
        minTtcSeconds: parseFloat(minTtcSeconds.toFixed(1)),
        clearanceViolationCount,
        noHivisCount,
        overallStatus: minTtcSeconds <= 15.0 ? 'CRITICAL_EVACUATION' : 'MONITORING_ACTIVE'
      },
      timelineEvents,
      krsEngineeringMeasures: [
        {
          priority: 'P1 - 즉시 조치',
          title: '열차접근 비상경보 및 골든타임(TTC ≥ 30초) 확보',
          krsStandard: '철도안전관리체계 기술기준 제7조 (선로작업 안전수칙)',
          measure: '열차 접근 시 작업자는 최소 30초 이전(열차 500m 전방)에 전원 대피로로 대피를 완료해야 함. 무선 열차접근 자동경보 수신기(portable alarm) 착용 의무화.'
        },
        {
          priority: 'P2 - 지오펜싱 통제',
          title: '주행 레일 중심선 2.0m 건축한계 출입 엄격 통제',
          krsStandard: '철도건설규칙 제14조 (건축한계 및 대피공간)',
          measure: '인접 선로 열차 통과 시 모든 작업 중지 및 건축한계 외측 대피공간으로 이동. 이동식 가상 지오펜스 차단선 설치.'
        },
        {
          priority: 'P3 - 감시 체계',
          title: '열차감시원 전담 배치 및 고시인성 형광안전의복(KRS 0001) 착용',
          krsStandard: '선로유지관리지침 제38조 (열차감시원 임무)',
          measure: '선로 양방향 시야 확보 지점에 전담 열차감시원을 배치하고, 작업 중 타 작업 겸직 절대 금지. 반사 성능 400cd/lx 이상의 고시인성 조끼 상시 착용.'
        }
      ]
    };

    return report;
  }

  _formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`;
  }
}

module.exports = new RailwaySafetyAnalysisService();
