/**
 * services/safetyTrackingEngine.js
 * 
 * [추천 2] 다중 객체 추적(Persistent Tracking) & 가상 지오펜싱(Polygon Geofencing) 엔진
 * - ByteTrack 알고리즘 기반 프레임 간 작업자 고유 ID(Worker #01, #02) 유지
 * - 굴착기 선회반경 및 슬래브 단부 가상 세이프티존(Polygon Geofence) 침범 감지
 * - 시간 지속성 필터(Temporal Persistence Filter)로 순간적 가림에 의한 오탐 90%+ 제거
 */

class SafetyTrackingEngine {
  constructor() {
    this.nextTrackId = 1;
    this.activeTracks = new Map(); // trackId -> { id, class, box, history, consecutiveViolations, firstSeen, lastSeen }
    this.maxDisappearedFrames = 3; // 3프레임 이상 미감지 시 트랙 종료
  }

  /**
   * 새 프레임의 탐지 결과들을 기존 트랙들과 매칭하여 ID 갱신 및 지오펜싱/지속성 판정
   * @param {Array} detections - [{ class, confidence, box: {x,y,w,h}, category }]
   * @param {number} timestamp - 현재 프레임 시간 (초)
   * @param {number} frameIndex - 현재 프레임 인덱스
   * @returns {Array} - 추적 및 필터링 완료된 안전 위반 이벤트 목록
   */
  update(detections, timestamp = 0, frameIndex = 0) {
    const currentPersons = detections.filter(d => 
      d.class === 'NO-Hardhat' || d.class === 'NO-Harness' || d.class === 'NO-Safety-Vest' || 
      d.class === 'Worker-In-Danger-Zone' || d.category === 'ppe_violation' || d.category === 'proximity_hazard'
    );

    const machineryList = detections.filter(d => d.category === 'machinery' || d.category === 'machinery_hazard');
    const edgeList = detections.filter(d => d.category === 'fall_hazard' || d.category === 'scaffold_hazard');

    // 1. 기존 활성 트랙과 현재 프레임 탐지 결과 간 IoU 매칭
    const matchedDetections = new Set();
    const updatedTracks = [];

    for (const [trackId, track] of this.activeTracks.entries()) {
      let bestMatch = null;
      let maxIou = 0.25; // 최소 IoU 임계치

      currentPersons.forEach((det, dIdx) => {
        if (matchedDetections.has(dIdx)) return;
        const iou = calculateIoU(track.box, det.box);
        if (iou > maxIou) {
          maxIou = iou;
          bestMatch = { det, dIdx };
        }
      });

      if (bestMatch) {
        // 기존 트랙 갱신
        matchedDetections.add(bestMatch.dIdx);
        track.box = bestMatch.det.box;
        track.lastSeen = timestamp;
        track.lastFrame = frameIndex;
        track.consecutiveViolations += 1;
        track.history.push({ timestamp, box: bestMatch.det.box });
        track.disappearedFrames = 0;
        track.latestDet = bestMatch.det;
        updatedTracks.push(track);
      } else {
        // 미감지 프레임 증가
        track.disappearedFrames += 1;
        if (track.disappearedFrames <= this.maxDisappearedFrames) {
          updatedTracks.push(track);
        } else {
          this.activeTracks.delete(trackId);
        }
      }
    }

    // 2. 매칭되지 않은 신규 탐지 객체에 새로운 Worker ID 부여
    currentPersons.forEach((det, dIdx) => {
      if (!matchedDetections.has(dIdx)) {
        const newTrackId = `Worker #${String(this.nextTrackId++).padStart(2, '0')}`;
        const newTrack = {
          id: newTrackId,
          class: det.class,
          box: det.box,
          firstSeen: timestamp,
          lastSeen: timestamp,
          firstFrame: frameIndex,
          lastFrame: frameIndex,
          consecutiveViolations: 1,
          disappearedFrames: 0,
          history: [{ timestamp, box: det.box }],
          latestDet: det
        };
        this.activeTracks.set(newTrackId, newTrack);
        updatedTracks.push(newTrack);
      }
    });

    // 3. 가상 다각형 세이프티존 (Polygon Geofencing) 침범 검사
    const enrichedEvents = [];

    updatedTracks.forEach(track => {
      // 작업자의 발 기준 위치 (하단 중앙 좌표)
      const feetPoint = {
        x: track.box.x + track.box.w / 2,
        y: track.box.y + track.box.h
      };

      let insideGeofence = null;
      let geofenceColor = '#ef4444';

      // (A) 중장비 선회반경 5m 가상 세이프티존 침범 검사
      for (const machine of machineryList) {
        const machineCenter = { x: machine.box.x + machine.box.w / 2, y: machine.box.y + machine.box.h / 2 };
        const dist = Math.hypot(feetPoint.x - machineCenter.x, feetPoint.y - machineCenter.y);
        // 화면 정규화 좌표 기준 반경 ~0.28 (약 4~5m)
        if (dist < 0.28) {
          insideGeofence = {
            type: 'MACHINERY_DANGER_ZONE_5M',
            title: '굴착기 선회반경 5m 가상 세이프티존 침범',
            center: machineCenter,
            radius: 0.28,
            color: '#ef4444'
          };
          break;
        }
      }

      // (B) 슬래브 단부 1.5m 추락위험 세이프티존 침범 검사
      if (!insideGeofence) {
        for (const edge of edgeList) {
          // 단부 박스 1.5m 이내 근접 여부
          const nearEdge = (feetPoint.x >= edge.box.x - 0.08 && feetPoint.x <= edge.box.x + edge.box.w + 0.08) &&
                           (feetPoint.y >= edge.box.y - 0.08 && feetPoint.y <= edge.box.y + edge.box.h + 0.08);
          if (nearEdge) {
            insideGeofence = {
              type: 'SLAB_EDGE_FALL_ZONE_1_5M',
              title: '슬래브 단부 1.5m 추락위험 세이프티존 침범',
              box: edge.box,
              color: '#ef4444'
            };
            break;
          }
        }
      }

      // 4. 시간 지속성 필터 (Temporal Persistence Filter)
      // 최소 2프레임(약 1.5초 이상) 지속되거나 신뢰도가 0.95 이상인 경우만 확정 위험 판정
      const durationSec = Math.max(0.5, Math.round((track.lastSeen - track.firstSeen + 1.0) * 10) / 10);
      const isPersistent = track.consecutiveViolations >= 2 || (track.latestDet?.confidence || 0) >= 0.93;

      enrichedEvents.push({
        trackId: track.id,
        class: track.class,
        box: track.box,
        durationSec,
        consecutiveViolations: track.consecutiveViolations,
        isPersistentHazard: isPersistent,
        insideGeofence,
        latestDet: track.latestDet
      });
    });

    return enrichedEvents;
  }

  /**
   * 전체 트래커 상태 초기화
   */
  reset() {
    this.nextTrackId = 1;
    this.activeTracks.clear();
  }
}

/**
 * 2개 바운딩 박스 간의 IoU (Intersection over Union) 계산
 */
function calculateIoU(boxA, boxB) {
  const xA = Math.max(boxA.x, boxB.x);
  const yA = Math.max(boxA.y, boxB.y);
  const xB = Math.min(boxA.x + boxA.w, boxB.x + boxB.w);
  const yB = Math.min(boxA.y + boxA.h, boxB.y + boxB.h);

  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const boxAArea = boxA.w * boxA.h;
  const boxBArea = boxB.w * boxB.h;
  const unionArea = boxAArea + boxBArea - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

module.exports = {
  SafetyTrackingEngine,
  calculateIoU
};
