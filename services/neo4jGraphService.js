/**
 * services/neo4jGraphService.js
 * BEPSMC Safety Knowledge Graph (GraphRAG) Service
 * 
 * 100% 무료 사용 원칙(Zero-Cost Guarantee):
 *  1) 기본 모드: 로컬 내장 지식 그래프 엔진 (In-Memory Graph Engine)
 *     - 추가 서버/DB 비용 0원, 외부 네트워크 지연 없이 0ms 즉시 다단계(Multi-hop) 관계 탐색 수행
 *     - data/safety-graph-data.json 기반 (법규 ↔ 공학기준 ↔ 위험요인 ↔ 안전조치 ↔ 책임자 ↔ 벌칙)
 *  2) 확장 모드: Neo4j AuraDB Free Tier (평생 무료 티어, 신용카드 불필요)
 *     - .env에 NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD 입력 시 공식 Cypher 드라이버로 자동 전환
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const GRAPH_DATA_PATH = path.join(process.cwd(), 'data', 'safety-graph-data.json');

// Neo4j 설정 (AuraDB Free / 로컬 인스턴스)
const NEO4J_URI = process.env.NEO4J_URI || '';
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || '';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || '';

let neo4jDriver = null;
let isNeo4jConnected = false;

// Neo4j 드라이버 초기화 시도 (설정되어 있을 때만 실행)
if (NEO4J_URI && NEO4J_USERNAME && NEO4J_PASSWORD) {
  try {
    const neo4j = require('neo4j-driver');
    neo4jDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD), {
      maxConnectionPoolSize: 10,
      connectionTimeout: 5000
    });
    // 비동기 헬스체크
    neo4jDriver.getServerInfo()
      .then(info => {
        isNeo4jConnected = true;
        console.log(`[GraphRAG] Neo4j AuraDB/Instance connected (${info.agent})`);
      })
      .catch(err => {
        console.warn('[GraphRAG] Neo4j connect warning (using Local In-Memory Graph):', err.message);
        isNeo4jConnected = false;
      });
  } catch (err) {
    console.warn('[GraphRAG] neo4j-driver load warning:', err.message);
  }
}

// --------------------------------------------------------------------------
// 1. Local In-Memory Knowledge Graph Engine (100% 무료, 고성능)
// --------------------------------------------------------------------------
let localGraphCache = null;

function loadLocalGraph() {
  if (localGraphCache) return localGraphCache;

  if (!fs.existsSync(GRAPH_DATA_PATH)) {
    console.warn('[GraphRAG] Warning: safety-graph-data.json not found');
    return { nodes: [], relationships: [], index: {} };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(GRAPH_DATA_PATH, 'utf8'));
    const nodes = raw.nodes || [];
    const relationships = raw.relationships || [];

    const nodesById = new Map();
    nodes.forEach(n => nodesById.set(n.id, n));

    // 인접 리스트(Adjacency List) 구축
    const adj = new Map();
    nodes.forEach(n => adj.set(n.id, []));

    relationships.forEach(rel => {
      if (adj.has(rel.source)) {
        adj.get(rel.source).push({ targetId: rel.target, type: rel.type, label: rel.label, desc: rel.description, direction: 'OUT' });
      }
      if (adj.has(rel.target)) {
        adj.get(rel.target).push({ targetId: rel.source, type: rel.type, label: rel.label, desc: rel.description, direction: 'IN' });
      }
    });

    localGraphCache = { nodes, relationships, nodesById, adj };
    return localGraphCache;
  } catch (e) {
    console.warn('[GraphRAG] Local graph parse error:', e.message);
    return { nodes: [], relationships: [], nodesById: new Map(), adj: new Map() };
  }
}

// 질문에서 지식 그래프 시작 엔티티(Seed Nodes) 탐색
function findSeedNodes(query, nodes) {
  const q = query.toLowerCase();
  const scoredNodes = [];

  nodes.forEach(node => {
    let score = 0;
    const nameLower = (node.name || '').toLowerCase();
    const summaryLower = (node.summary || '').toLowerCase();
    const specLower = (node.spec || '').toLowerCase();
    const codeLower = (node.code || '').toLowerCase();

    // 1. 직접 명칭/코드 일치 (가장 높은 가중치)
    if (q.includes(nameLower) || (node.code && q.includes(codeLower))) {
      score += 10;
    }

    // 2. 도메인 핵심 키워드 매칭
    const keywords = [
      { kw: '철도', targets: ['철도', '선로', '궤간', '1435', '열차'] },
      { kw: '압착', targets: ['압착', '협착', '끼임', '교행', '차량한계'] },
      { kw: '전차선', targets: ['전차선', '전기', '감전', '25kv', '이격거리', '접지'] },
      { kw: '추락', targets: ['추락', '떨어짐', '안전난간', '안전대', '2m', '개구부'] },
      { kw: '질식', targets: ['질식', '밀폐', '산소', '유해가스', '환기', '황화수소'] },
      { kw: '처벌', targets: ['처벌', '벌칙', '벌금', '징역', '과태료', '책임'] },
      { kw: '책임자', targets: ['사업주', '도급인', '원청', '안전관리자', '감시원'] }
    ];

    keywords.forEach(group => {
      const queryHasKw = group.targets.some(t => q.includes(t));
      const nodeHasKw = group.targets.some(t => 
        nameLower.includes(t) || summaryLower.includes(t) || specLower.includes(t)
      );
      if (queryHasKw && nodeHasKw) {
        score += 3;
      }
    });

    if (score > 0) {
      scoredNodes.push({ node, score });
    }
  });

  scoredNodes.sort((a, b) => b.score - a.score);
  return scoredNodes.slice(0, 3).map(s => s.node);
}

// --------------------------------------------------------------------------
// 2. Multi-hop Graph Traversal (다단계 관계망 탐색)
// --------------------------------------------------------------------------
function traverseLocalGraph(query, options = {}) {
  const maxHops = options.maxHops || 2;
  const graph = loadLocalGraph();
  if (!graph.nodes || graph.nodes.length === 0) return null;

  const seeds = findSeedNodes(query, graph.nodes);
  if (seeds.length === 0) return null;

  const visitedNodeIds = new Set();
  const collectedNodes = [];
  const collectedRels = [];

  seeds.forEach(seed => {
    visitedNodeIds.add(seed.id);
    collectedNodes.push(seed);
  });

  // BFS로 1~2 Hop 이웃 노드 및 관계 수집
  let currentFrontier = seeds.map(s => s.id);
  for (let hop = 0; hop < maxHops; hop++) {
    const nextFrontier = [];
    currentFrontier.forEach(nodeId => {
      const neighbors = graph.adj.get(nodeId) || [];
      neighbors.forEach(edge => {
        if (!visitedNodeIds.has(edge.targetId)) {
          visitedNodeIds.add(edge.targetId);
          const targetNode = graph.nodesById.get(edge.targetId);
          if (targetNode) {
            collectedNodes.push(targetNode);
            nextFrontier.push(edge.targetId);
          }
        }
        // 관계 중복 방지
        const relKey = `${nodeId}->${edge.targetId}:${edge.type}`;
        if (!collectedRels.some(r => `${r.source}->${r.target}:${r.type}` === relKey)) {
          collectedRels.push({
            source: nodeId,
            target: edge.targetId,
            type: edge.type,
            label: edge.label,
            description: edge.desc
          });
        }
      });
    });
    currentFrontier = nextFrontier;
  }

  return {
    engine: 'Local In-Memory Knowledge Graph (100% Free)',
    seedCount: seeds.length,
    nodeCount: collectedNodes.length,
    relationshipCount: collectedRels.length,
    nodes: collectedNodes,
    relationships: collectedRels
  };
}

// --------------------------------------------------------------------------
// 3. Neo4j Cypher 원격 실행 (AuraDB Free 연동 시)
// --------------------------------------------------------------------------
async function queryNeo4jAura(query, options = {}) {
  if (!neo4jDriver || !isNeo4jConnected) {
    return traverseLocalGraph(query, options);
  }

  const session = neo4jDriver.session();
  try {
    // 키워드 기반 Cypher Multi-hop 쿼리 실행
    const cypher = `
      MATCH (n)
      WHERE any(word IN split(toLower($query), ' ') WHERE toLower(n.name) CONTAINS word OR toLower(n.summary) CONTAINS word)
      WITH n LIMIT 3
      MATCH path = (n)-[r*1..2]-(m)
      RETURN nodes(path) AS pathNodes, relationships(path) AS pathRels
      LIMIT 15
    `;

    const result = await session.run(cypher, { query });
    if (!result.records || result.records.length === 0) {
      return traverseLocalGraph(query, options);
    }

    const nodeMap = new Map();
    const rels = [];

    result.records.forEach(record => {
      const pNodes = record.get('pathNodes');
      const pRels = record.get('pathRels');
      pNodes.forEach(node => {
        if (!nodeMap.has(node.properties.id)) {
          nodeMap.set(node.properties.id, node.properties);
        }
      });
      pRels.forEach(rel => {
        rels.push({
          type: rel.type,
          label: rel.properties.label || rel.type,
          description: rel.properties.description || ''
        });
      });
    });

    return {
      engine: 'Neo4j AuraDB (Cloud Free Tier)',
      nodeCount: nodeMap.size,
      relationshipCount: rels.length,
      nodes: Array.from(nodeMap.values()),
      relationships: rels
    };
  } catch (err) {
    console.warn('[GraphRAG] Neo4j Cypher query failed, falling back to local graph:', err.message);
    return traverseLocalGraph(query, options);
  } finally {
    await session.close();
  }
}

// --------------------------------------------------------------------------
// 4. Graph Context Formatter (Gemini LLM 프롬프트 주입용)
// --------------------------------------------------------------------------
function formatGraphContext(graphResult) {
  if (!graphResult || !graphResult.nodes || graphResult.nodes.length === 0) {
    return '';
  }

  const nodes = graphResult.nodes;
  const rels = graphResult.relationships || [];

  // 카테고리별 분류
  const laws = nodes.filter(n => n.label === 'Law');
  const standards = nodes.filter(n => n.label === 'Standard');
  const hazards = nodes.filter(n => n.label === 'Hazard');
  const actions = nodes.filter(n => n.label === 'Action');
  const roles = nodes.filter(n => n.label === 'Role');
  const penalties = nodes.filter(n => n.label === 'Penalty');

  const lines = [
    `### 🕸️ 안전 지식 그래프 연계 정보 (${graphResult.engine})`,
    `> **안내**: 아래 정보는 BEPSMC 안전 규격 및 법규 관계망(Knowledge Graph)에서 다단계 탐색(Multi-hop)된 팩트 데이터입니다. 답변 작성 시 법률, 공학 수치, 처벌 조항, 책임 주체를 연계하여 정확히 안내하십시오.\n`
  ];

  if (laws.length > 0) {
    lines.push(`**[관련 법규 및 조항]**`);
    laws.forEach(l => lines.push(`- **${l.name}**: ${l.summary}`));
    lines.push('');
  }

  if (standards.length > 0) {
    lines.push(`**[핵심 공학/기술 기준치]**`);
    standards.forEach(s => lines.push(`- **${s.name}** (${s.spec}): ${s.summary}`));
    lines.push('');
  }

  if (hazards.length > 0) {
    lines.push(`**[중대 재해 위험요인]**`);
    hazards.forEach(h => lines.push(`- **${h.name}** [위험도: ${h.riskLevel || 'CRITICAL'}]: ${h.summary}`));
    lines.push('');
  }

  if (actions.length > 0) {
    lines.push(`**[필수 안전 예방조치]**`);
    actions.forEach(a => lines.push(`- **${a.name}**: ${a.summary}`));
    lines.push('');
  }

  if (roles.length > 0) {
    lines.push(`**[책임 및 이행 주체]**`);
    roles.forEach(r => lines.push(`- **${r.name}**: ${r.summary}`));
    lines.push('');
  }

  if (penalties.length > 0) {
    lines.push(`**[법적 처벌 및 행정처분]**`);
    penalties.forEach(p => lines.push(`- **${p.name}**: ${p.summary}`));
    lines.push('');
  }

  if (rels.length > 0) {
    lines.push(`**[개체 간 인과/규제 관계망 (Fact Paths)]**`);
    const nodeMap = new Map();
    nodes.forEach(n => nodeMap.set(n.id, n.name || n.id));
    rels.slice(0, 8).forEach(r => {
      const srcName = nodeMap.get(r.source) || r.source;
      const tgtName = nodeMap.get(r.target) || r.target;
      lines.push(`- (${srcName}) ──[${r.label || r.type}]──▶ (${tgtName}) : ${r.description || ''}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

// --------------------------------------------------------------------------
// 5. 통합 검색 API (Unified Graph Search) & 지연시간 기록
// --------------------------------------------------------------------------
const recentLatencies = [1.2, 0.8, 1.5]; // 초기 기준 지연시간(ms)

function recordLatency(ms) {
  recentLatencies.push(ms);
  if (recentLatencies.length > 50) recentLatencies.shift();
}

async function searchSafetyGraph(query, options = {}) {
  const start = performance.now();
  try {
    let result = null;
    if (isNeo4jConnected) {
      result = await queryNeo4jAura(query, options);
    } else {
      result = traverseLocalGraph(query, options);
    }
    const duration = Number((performance.now() - start).toFixed(2));
    recordLatency(duration);
    return result;
  } catch (err) {
    const duration = Number((performance.now() - start).toFixed(2));
    recordLatency(duration);
    console.warn('[GraphRAG] searchSafetyGraph error:', err.message);
    return null;
  }
}

// --------------------------------------------------------------------------
// 6. 시스템 진단 및 향후 확장 제안 모니터링 (Auto Scaling Advisory)
// --------------------------------------------------------------------------
function getGraphSystemMetrics() {
  const graph = loadLocalGraph();
  const nodeCount = graph.nodes ? graph.nodes.length : 0;
  const relCount = graph.relationships ? graph.relationships.length : 0;
  const avgLatency = recentLatencies.length > 0 
    ? Number((recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length).toFixed(2)) 
    : 1.0;

  let jsonSize = 0;
  try {
    if (fs.existsSync(GRAPH_DATA_PATH)) {
      jsonSize = fs.statSync(GRAPH_DATA_PATH).size;
    }
  } catch (e) {}
  const memoryKb = Number((jsonSize / 1024).toFixed(1));

  // 임계치 평가 (Thresholds)
  let status = 'OPTIMAL';
  let alertMessage = '현재 로컬 내장 지식 그래프 엔진으로 비용 없이 최적 운용 중입니다.';

  if (nodeCount >= 500 && !isNeo4jConnected) {
    status = 'RECOMMENDED_AURA_FREE';
    alertMessage = `노드 수(${nodeCount}개)가 500개를 초과했습니다. 시각화 및 안정적 관리를 위해 완전 무료인 Neo4j AuraDB Free 전환을 권장합니다.`;
  } else if (nodeCount >= 200000 || avgLatency > 150) {
    status = 'EXPANSION_NEEDED';
    alertMessage = `용량 또는 탐색 지연시간(${avgLatency}ms)이 무료 티어 임계치에 도달했습니다. 엔터프라이즈 또는 사내 온프레미스 확장이 권장됩니다.`;
  }

  const expansionOptions = [
    {
      id: 'option-1',
      tag: '추천 (비용 0원)',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      title: '옵션 1: [비용 0원] Neo4j AuraDB Free 클라우드 전환',
      cost: '₩0 / 평생 무료 (신용카드 등록 불필요)',
      triggerCondition: '노드 500개 초과 시 또는 브라우저 기반 GUI 그래프 시각화가 필요할 때',
      capacity: '노드 200,000개 / 관계망 400,000개 지원 (BEPSMC 기준 규정 수만 건 수용)',
      pros: '관리형 클라우드 인프라, 자동 백업, 대화형 시각화(Neo4j Browser & Bloom) 기본 제공',
      cons: '단일 인스턴스 제한, 30일간 접근 없을 시 일시 정지(Aura 콘솔에서 클릭 한 번으로 즉시 재개)',
      actionGuide: '1. https://neo4j.com/cloud/platform/aura-graph-database/ 접속 후 무료 계정 생성\n2. Free Database 인스턴스 1개 생성 및 비밀번호 발급\n3. .env 파일에 NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD 입력\n4. 터미널에서 node scripts/seed_neo4j_graph.js 실행 (자동 전환)'
    },
    {
      id: 'option-2',
      tag: '사내/보안 (비용 0원)',
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
      title: '옵션 2: [비용 0원] Neo4j Community 자체 호스팅 (사내 서버/폐쇄망)',
      cost: '₩0 (GPLv3 오픈소스 라이선스)',
      triggerCondition: '노드 20만 개 초과 대용량 데이터 적재 시 또는 철도/공공 보안 폐쇄망(사내 인트라넷) 운영 시',
      capacity: '사내 서버 디스크 및 RAM 한도 내 무제한 노드/관계망 저장',
      pros: '데이터 외부 유출을 원천 차단하는 사내 보안성, 용량 제한 완전 해제',
      cons: '자체 서버 리소스 필요 및 백업/보안 관리 사내 전담 필요',
      actionGuide: '사내 서버 또는 Docker 컨테이너에서 실행:\n$ docker run -d --name neo4j -p 7474:7474 -p 7687:7687 neo4j:community\n이후 .env의 NEO4J_URI를 사내 서버 IP(예: bolt://192.168.1.100:7687)로 지정'
    },
    {
      id: 'option-3',
      tag: '기업형 확장 (유료)',
      badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
      title: '옵션 3: [기업형 유료] Neo4j AuraDB Professional 클러스터',
      cost: '월 $65 ~ 인스턴스 규모별 종량 과금',
      triggerCondition: '전국 철도·건설 현장 수백만 건의 실시간 센서/위험 데이터 동기화 및 대규모 동시 접속자 발생 시',
      capacity: '수억 개 이상의 노드 및 페타바이트급 관계망 확장 가능',
      pros: '99.95% 가용성 보장(SLA), 다중 리전 복제 및 고가용성 클러스터, 전담 기술 지원',
      cons: '월간 유료 구독 비용 발생',
      actionGuide: 'AuraDB 콘솔에서 Free 인스턴스를 Professional 티어로 즉시 인플레이스(In-place) 업그레이드'
    }
  ];

  return {
    engine: isNeo4jConnected ? 'Neo4j AuraDB (Cloud Free Tier)' : 'Local In-Memory Knowledge Graph (100% Free)',
    isNeo4jConnected,
    neo4jConfigured: !!(NEO4J_URI && NEO4J_USERNAME && NEO4J_PASSWORD),
    nodeCount,
    relationshipCount: relCount,
    nodeSoftLimit: isNeo4jConnected ? 200000 : 500,
    avgLatencyMs: avgLatency,
    memoryKb,
    status,
    alertMessage,
    expansionOptions
  };
}

module.exports = {
  searchSafetyGraph,
  traverseLocalGraph,
  formatGraphContext,
  loadLocalGraph,
  getGraphSystemMetrics,
  isNeo4jConnected: () => isNeo4jConnected
};
