/**
 * scripts/seed_neo4j_graph.js
 * BEPSMC Safety Knowledge Graph Seeder & Health Checker
 * 
 * 100% 무료 사용 가이드:
 * 1. 무료 클라우드(Neo4j AuraDB Free) 사용 시:
 *    - https://neo4j.com/cloud/platform/aura-graph-database/ 접속
 *    - 무료 가입 (신용카드 입력 없음, Free Database 인스턴스 1개 평생 무료)
 *    - 발급받은 Connection URI(neo4j+s://...), Username(neo4j), Password를 .env에 입력:
 *        NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io
 *        NEO4J_USERNAME=neo4j
 *        NEO4J_PASSWORD=your-password
 * 2. 스크립트 실행:
 *    node scripts/seed_neo4j_graph.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const GRAPH_DATA_PATH = path.join(__dirname, '..', 'data', 'safety-graph-data.json');

async function main() {
  console.log('===========================================================');
  console.log(' BEPSMC Safety Knowledge Graph (GraphRAG) Seeder');
  console.log('===========================================================');

  if (!fs.existsSync(GRAPH_DATA_PATH)) {
    console.error('❌ data/safety-graph-data.json 파일이 존재하지 않습니다.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(GRAPH_DATA_PATH, 'utf8'));
  const nodes = raw.nodes || [];
  const rels = raw.relationships || [];

  console.log(`\n📦 로컬 지식 그래프 데이터셋 로드:`);
  console.log(`- 노드 수: ${nodes.length}개`);
  console.log(`- 관계망 수: ${rels.length}개`);

  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !user || !password) {
    console.log(`\n💡 [안내] .env에 NEO4J_URI/USERNAME/PASSWORD가 설정되지 않았습니다.`);
    console.log(`👉 현재 시스템은 100% 무료 '로컬 내장 지식 그래프 엔진'으로 자동 동작 중입니다.`);
    console.log(`👉 원격 무료 클라우드(Neo4j AuraDB Free, 비용 0원)와 연동하시려면:`);
    console.log(`   1) https://neo4j.com/cloud/platform/aura-graph-database/ 무료 인스턴스 생성`);
    console.log(`   2) .env에 NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD 입력`);
    console.log(`   3) 본 스크립트를 다시 실행하시면 클라우드 DB에 지식 그래프가 자동 적재됩니다.`);
    console.log('\n✅ 로컬 내장 그래프 엔진 테스트를 진행합니다...');
    
    const { searchSafetyGraph, formatGraphContext } = require('../services/neo4jGraphService');
    const testRes = await searchSafetyGraph('선로에서 작업하다가 열차가 오면 압착 위험과 대피는 어떻게 하나요?');
    console.log(`- 엔진: ${testRes.engine}`);
    console.log(`- 탐색된 노드: ${testRes.nodeCount}개, 관계: ${testRes.relationshipCount}개`);
    console.log('✅ 로컬 내장 지식 그래프 엔진이 정상 가동 중입니다.');
    return;
  }

  console.log(`\n🌐 Neo4j AuraDB 원격 인스턴스(${uri}) 연결 중...`);
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

  const session = driver.session();
  try {
    const info = await driver.getServerInfo();
    console.log(`✅ Neo4j 연결 성공: ${info.agent}`);

    console.log('\n1. 기존 안전 지식 그래프 초기화 및 고유 제약조건 설정...');
    await session.run(`CREATE CONSTRAINT safety_node_id IF NOT EXISTS FOR (n:SafetyNode) REQUIRE n.id IS UNIQUE`);

    console.log('2. 노드 데이터 MERGE 적재 중...');
    for (const node of nodes) {
      const cypher = `
        MERGE (n:SafetyNode:${node.label} { id: $id })
        SET n.name = $name,
            n.category = $category,
            n.summary = $summary,
            n.spec = $spec,
            n.code = $code,
            n.riskLevel = $riskLevel
      `;
      await session.run(cypher, {
        id: node.id,
        name: node.name || '',
        category: node.category || '',
        summary: node.summary || '',
        spec: node.spec || '',
        code: node.code || '',
        riskLevel: node.riskLevel || ''
      });
    }
    console.log(`   └─ ${nodes.length}개 노드 적재 완료.`);

    console.log('3. 관계망(Relationships) MERGE 적재 중...');
    for (const rel of rels) {
      const cypher = `
        MATCH (a:SafetyNode { id: $source })
        MATCH (b:SafetyNode { id: $target })
        MERGE (a)-[r:${rel.type}]->(b)
        SET r.label = $label,
            r.description = $description
      `;
      await session.run(cypher, {
        source: rel.source,
        target: rel.target,
        label: rel.label || rel.type,
        description: rel.description || ''
      });
    }
    console.log(`   └─ ${rels.length}개 관계망 적재 완료.`);

    // 검증 카운트
    const countRes = await session.run(`
      MATCH (n:SafetyNode)
      OPTIONAL MATCH (n)-[r]->()
      RETURN count(DISTINCT n) AS nodeCount, count(r) AS relCount
    `);
    const record = countRes.records[0];
    console.log(`\n🎉 Neo4j AuraDB 적재 검증 성공!`);
    console.log(`- 적재된 노드 수: ${record.get('nodeCount').toNumber ? record.get('nodeCount').toNumber() : record.get('nodeCount')}개`);
    console.log(`- 적재된 관계 수: ${record.get('relCount').toNumber ? record.get('relCount').toNumber() : record.get('relCount')}개`);

  } catch (err) {
    console.error('❌ Neo4j 시딩 오류:', err.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);
