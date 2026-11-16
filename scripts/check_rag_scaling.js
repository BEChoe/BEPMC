/**
 * scripts/check_rag_scaling.js
 * BEPSMC RAG & Knowledge Graph (GraphRAG) 확장성 및 용량/지연시간 진단 도구
 * 
 * 실행:
 *   node scripts/check_rag_scaling.js
 */

const { getSystemRAGMetrics } = require('../services/ragService');

async function main() {
  console.log('================================================================');
  console.log('  BEPSMC RAG & Knowledge Graph (GraphRAG) 시스템 진단 및 확장 제안');
  console.log('================================================================');

  const metrics = getSystemRAGMetrics();
  const g = metrics.graph;

  console.log(`\n📊 1. 현재 RAG 인프라 가동 현황:`);
  console.log(`- 벡터 검색 엔진   : ${metrics.vectorEngine}`);
  console.log(`- 사내/공공 안전문서 : ${metrics.vectorDocsCount}건`);
  console.log(`- 지식그래프 엔진   : ${g.engine}`);
  console.log(`- Neo4j 원격 연결  : ${g.isNeo4jConnected ? '🟢 연결됨' : '⚪ 미설정 (로컬 내장 엔진 가동 중)'}`);
  console.log(`- 적재된 노드 수   : ${g.nodeCount}개 (소프트 임계치: ${g.nodeSoftLimit}개)`);
  console.log(`- 적재된 관계망 수 : ${g.relationshipCount}개`);
  console.log(`- 평균 탐색 지연   : ${g.avgLatencyMs} ms`);
  console.log(`- 메모리 점유      : 약 ${g.memoryKb} KB`);

  console.log(`\n🚦 2. 시스템 상태 및 진단 결과:`);
  if (g.status === 'OPTIMAL') {
    console.log(`- 상태: ✅ [최적 (OPTIMAL)]`);
    console.log(`- 진단: ${g.alertMessage}`);
  } else if (g.status === 'RECOMMENDED_AURA_FREE') {
    console.log(`- 상태: ⚡ [AuraDB 무료 전환 권고]`);
    console.log(`- 진단: ${g.alertMessage}`);
  } else {
    console.log(`- 상태: ⚠️ [확장 필요 (EXPANSION_NEEDED)]`);
    console.log(`- 진단: ${g.alertMessage}`);
  }

  console.log(`\n🚀 3. 향후 용량/속도 한계 도달 시 단계별 확장 선택지:`);
  g.expansionOptions.forEach((opt, idx) => {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${idx + 1}] ${opt.title}`);
    console.log(`    - 비용       : ${opt.cost}`);
    console.log(`    - 전환 시점   : ${opt.triggerCondition}`);
    console.log(`    - 수용 용량   : ${opt.capacity}`);
    console.log(`    - 주요 장점   : ${opt.pros}`);
    console.log(`    - 고려 사항   : ${opt.cons}`);
    console.log(`    - 조치 가이드 : \n${opt.actionGuide.split('\n').map(l => '        ' + l).join('\n')}`);
  });
  console.log(`\n================================================================`);
}

main().catch(console.error);
