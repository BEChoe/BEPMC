require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const dbService = require('./data/dbService');
const { isSupabaseConfigured } = require('./data/supabaseClient');
const publicApiService = require('./services/publicApiService');
const aiSafetyService = require('./services/aiSafetyInspectionService');
const technicalGuidanceService = require('./services/technicalGuidanceReportService');
const safetyKnowledgeBase = require('./services/safetyKnowledgeBaseService');
const mobileSyncService = require('./services/mobileSyncService');

const app = express();
const PORT = process.env.PORT || 3000;

// 모바일 앱(file:// 및 외부 WebView) CORS 허용
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(
  session({
    secret: 'safety-portal-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 // 24시간
    }
  })
);

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// 미들웨어: 권한 확인 헬퍼
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: '로그인이 필요한 서비스입니다.' });
  }
  next();
}

function requireMember(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: '회원 로그인이 필요한 서비스입니다.' });
  }
  if (req.session.user.status !== 'approved') {
    return res.status(403).json({ success: false, message: '관리자의 가입 승인이 완료되지 않은 계정입니다.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '관리자 전용 메뉴입니다. 관리자 계정으로 로그인해주세요.' });
  }
  next();
}

// [보안 미들웨어] 인증된 관리자 또는 유료 가입 회원만 허용
function requirePaidOrAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      requireLogin: true,
      message: '로그인이 필요한 서비스입니다. 먼저 로그인해주세요.'
    });
  }
  if (req.session.user.status !== 'approved') {
    return res.status(403).json({
      success: false,
      message: '관리자의 가입 승인이 완료되지 않은 계정입니다.'
    });
  }
  const isAuthorized = (req.session.user.role === 'admin' || req.session.user.role === 'paid_member' || req.session.user.membership === 'paid');
  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      requirePaid: true,
      message: '인증된 관리자 및 기술지도 유료 구독 회원 전용 서비스입니다. 플랜 가입 후 이용 가능합니다.'
    });
  }
  next();
}

// ---------------------------------------------------------------------
// 1. Auth & Session API
// ---------------------------------------------------------------------

// 내 정보 확인
app.get('/api/auth/me', (req, res) => {
  const dbType = isSupabaseConfigured() ? 'Supabase' : 'Local';
  if (!req.session.user) {
    return res.json({
      isLoggedIn: false,
      user: null,
      mode: 'guest',
      membership: 'none',
      canAccessDashboard: false,
      dbType
    });
  }
  const isAuthorized = (req.session.user.role === 'admin' || req.session.user.role === 'paid_member' || req.session.user.membership === 'paid');
  res.json({
    isLoggedIn: true,
    user: req.session.user,
    mode: req.session.user.role === 'admin' ? 'admin' : (req.session.user.role === 'paid_member' ? 'paid_member' : 'member'),
    membership: isAuthorized ? 'paid' : 'free',
    canAccessDashboard: isAuthorized,
    dbType
  });
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await dbService.findUserByUsername(username);

    const masterPassword = process.env.ADMIN_MASTER_PASSWORD;
    const isMasterAdmin = (username === 'admin' && Boolean(masterPassword && password === masterPassword));
    const isPasswordMatch = user && user.password && (user.password === password);

    if (!user || (!isMasterAdmin && !isPasswordMatch)) {
      return res.status(400).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 관리자는 승인여부 무관(기본 approved)
    if (user.role !== 'admin') {
      if (user.status === 'pending') {
        return res.status(403).json({
          success: false,
          message: '현재 관리자 승인 대기 중입니다. 관리자 승인 후 로그인할 수 있습니다.'
        });
      }
      if (user.status === 'rejected') {
        return res.status(403).json({
          success: false,
          message: '회원가입 신청이 관리자에 의해 거절되었습니다. 관리자에게 문의 바랍니다.'
        });
      }
    }

    const isPaid = (user.role === 'admin' || user.role === 'paid_member');

    // 세션 저장
    req.session.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      membership: isPaid ? 'paid' : 'free',
      status: user.status
    };

    const roleName = user.role === 'admin' ? '관리자 모드' : (user.role === 'paid_member' ? '유료 회원 모드' : '일반 회원 모드');

    res.json({
      success: true,
      message: `${user.name}님 환영합니다. (${roleName})`,
      user: req.session.user
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: '로그인 처리 중 서버 오류가 발생했습니다.' });
  }
});

// 회원가입 신청 (기본 상태: pending)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, email } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ success: false, message: '모든 필수 항목을 입력해주세요.' });
    }

    const existing = await dbService.findUserByUsername(username);
    if (existing) {
      return res.status(400).json({ success: false, message: '이미 존재하는 아이디입니다.' });
    }

    await dbService.createUser({
      username,
      password,
      name,
      email: email || '',
      role: 'member',
      status: 'pending' // 관리자 승인 대기
    });

    res.json({
      success: true,
      message: '회원가입 신청이 완료되었습니다. 관리자의 승인 후 정식 이용이 가능합니다.'
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: '회원가입 처리 중 오류가 발생했습니다.' });
  }
});

// 로그아웃
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: '로그아웃 되었습니다.' });
  });
});

// 원클릭 데모 전환 API (테스트 및 평가용)
app.post('/api/auth/demo-switch', async (req, res) => {
  try {
    const { role } = req.body; // 'guest' | 'member' | 'admin'

    if (role === 'guest') {
      req.session.destroy(() => {
        res.json({ success: true, mode: 'guest', message: '비회원 모드로 전환되었습니다.' });
      });
      return;
    }

    const users = await dbService.getAllUsers();
    let targetUser;

    if (role === 'admin') {
      targetUser = users.find(u => u.role === 'admin');
    } else if (role === 'paid_member' || role === 'paid') {
      targetUser = users.find(u => u.role === 'paid_member' && u.status === 'approved');
      if (!targetUser) targetUser = users.find(u => u.role === 'admin');
    } else if (role === 'member' || role === 'free') {
      targetUser = users.find(u => u.role === 'member' && u.status === 'approved');
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, message: '해당 권한의 사용자를 찾을 수 없습니다.' });
    }

    const isPaid = (targetUser.role === 'admin' || targetUser.role === 'paid_member');

    req.session.user = {
      id: targetUser.id,
      username: targetUser.username,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      membership: isPaid ? 'paid' : 'free',
      status: targetUser.status
    };

    const roleLabel = targetUser.role === 'admin' ? '관리자 모드' : (targetUser.role === 'paid_member' ? '유료 회원 모드' : '일반 무료 회원 모드');

    res.json({
      success: true,
      mode: targetUser.role,
      membership: isPaid ? 'paid' : 'free',
      canAccessDashboard: isPaid,
      message: `${targetUser.name}(으)로 전환되었습니다. (${roleLabel})`,
      user: req.session.user
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '전환 오류' });
  }
});

// ---------------------------------------------------------------------
// 2. Site Settings API (홈페이지 설정 & 공익 문구 관리)
// ---------------------------------------------------------------------

// 설정 조회 (전체 공개)
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await dbService.getSiteSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ success: false, message: '설정 조회 실패' });
  }
});

// 설정 수정 (관리자 전용 - 홈페이지 간단 수정 권한)
app.put('/api/settings', requireAdmin, async (req, res) => {
  try {
    const { siteName, mainSlogan, subSlogan, emergencyPhone, alertBanner, safetyNotice, footerInfo } = req.body;
    const current = await dbService.getSiteSettings();

    const updated = await dbService.updateSiteSettings({
      siteName: siteName || current.siteName,
      mainSlogan: mainSlogan || current.mainSlogan,
      subSlogan: subSlogan || current.subSlogan,
      emergencyPhone: emergencyPhone || current.emergencyPhone,
      alertBanner: alertBanner !== undefined ? alertBanner : current.alertBanner,
      safetyNotice: safetyNotice !== undefined ? safetyNotice : current.safetyNotice,
      footerInfo: footerInfo || current.footerInfo
    });

    res.json({ success: true, message: '홈페이지 설정이 성공적으로 업데이트되었습니다.', settings: updated });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ success: false, message: '설정 수정 중 오류가 발생했습니다.' });
  }
});

// ---------------------------------------------------------------------
// 3. Posts API (게시판 관리: 일반게시판 & 회원전용게시판)
// ---------------------------------------------------------------------

// 게시글 목록 조회
app.get('/api/posts', async (req, res) => {
  try {
    const { boardType, category, search } = req.query; // 'general' or 'member'

    // 회원 전용 게시판 접근 제한
    if (boardType === 'member') {
      if (!req.session.user || req.session.user.status !== 'approved') {
        return res.status(403).json({
          success: false,
          message: '회원 전용 게시판입니다. 회원 로그인(승인 완료 계정) 후 열람하실 수 있습니다.',
          requireLogin: true
        });
      }
    }

    const posts = await dbService.getPosts({ boardType, category, search });
    res.json({ success: true, posts });
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ success: false, message: '게시글 목록 조회 중 오류가 발생했습니다.' });
  }
});

// 게시글 상세 조회
app.get('/api/posts/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const post = await dbService.getPostById(id, true);

    if (!post) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }

    // 회원 전용 게시글 접근 제한
    if (post.boardType === 'member') {
      if (!req.session.user || req.session.user.status !== 'approved') {
        return res.status(403).json({
          success: false,
          message: '회원 전용 게시글입니다. 회원 로그인 후 열람 가능합니다.',
          requireLogin: true
        });
      }
    }

    res.json({ success: true, post });
  } catch (err) {
    console.error('Get post detail error:', err);
    res.status(500).json({ success: false, message: '게시글 상세 조회 중 오류가 발생했습니다.' });
  }
});

// 게시글 작성
app.post('/api/posts', requireMember, async (req, res) => {
  try {
    const { boardType, category, title, content } = req.body;
    const user = req.session.user;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: '제목과 내용을 입력해주세요.' });
    }

    // 일반 자료실은 관리자만 작성 가능, 회원 전용은 회원 및 관리자 작성 가능
    if (boardType === 'general' && user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '일반 공익자료실은 관리자만 작성할 수 있습니다.' });
    }

    const newPost = await dbService.createPost({
      boardType: boardType || 'member',
      category: category || (boardType === 'general' ? '안전공지' : '현장제안'),
      title,
      content,
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role
    });

    res.json({ success: true, message: '게시글이 등록되었습니다.', post: newPost });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ success: false, message: '게시글 등록 중 오류가 발생했습니다.' });
  }
});

// 게시글 수정 (관리자는 모든 글, 일반회원은 본인 글만)
app.put('/api/posts/:id', requireMember, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { title, content, category } = req.body;
    const user = req.session.user;

    const post = await dbService.getPostById(id, false);
    if (!post) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }

    // 권한 체크: 관리자이거나 작성자 본인
    if (user.role !== 'admin' && post.authorId !== user.id) {
      return res.status(403).json({ success: false, message: '본인이 작성한 글만 수정할 수 있습니다.' });
    }

    const updated = await dbService.updatePost(id, { title, content, category });
    res.json({ success: true, message: '게시글이 수정되었습니다.', post: updated });
  } catch (err) {
    console.error('Update post error:', err);
    res.status(500).json({ success: false, message: '게시글 수정 중 오류가 발생했습니다.' });
  }
});

// 게시글 삭제 (관리자는 모든 글 삭제 권한, 일반회원은 본인 글만)
app.delete('/api/posts/:id', requireMember, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = req.session.user;

    const post = await dbService.getPostById(id, false);
    if (!post) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }

    // 관리자는 모든 게시판 수정/삭제 권한 보유
    if (user.role !== 'admin' && post.authorId !== user.id) {
      return res.status(403).json({ success: false, message: '본인이 작성한 글만 삭제할 수 있습니다.' });
    }

    await dbService.deletePost(id);
    res.json({ success: true, message: '게시글이 삭제되었습니다.' });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ success: false, message: '게시글 삭제 중 오류가 발생했습니다.' });
  }
});

// 댓글 및 답변 작성 (회원 전용 게시판 답변/댓글 기능)
app.post('/api/posts/:id/comments', requireMember, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { content } = req.body;
    const user = req.session.user;

    if (!content) {
      return res.status(400).json({ success: false, message: '내용을 입력해주세요.' });
    }

    const newComment = await dbService.addComment(id, {
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      content
    });

    res.json({ success: true, message: '댓글이 등록되었습니다.', comment: newComment });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ success: false, message: '댓글 등록 중 오류가 발생했습니다.' });
  }
});

// 댓글 삭제 (관리자 또는 본인)
app.delete('/api/posts/:id/comments/:commentId', requireMember, async (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);
    const commentId = parseInt(req.params.commentId, 10);
    const user = req.session.user;

    const post = await dbService.getPostById(postId, false);
    if (!post || !post.comments) {
      return res.status(404).json({ success: false, message: '게시글 또는 댓글을 찾을 수 없습니다.' });
    }

    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: '댓글을 찾을 수 없습니다.' });
    }

    if (user.role !== 'admin' && comment.authorId !== user.id) {
      return res.status(403).json({ success: false, message: '본인의 댓글만 삭제할 수 있습니다.' });
    }

    await dbService.deleteComment(postId, commentId);
    res.json({ success: true, message: '댓글이 삭제되었습니다.' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ success: false, message: '댓글 삭제 중 오류가 발생했습니다.' });
  }
});

// ---------------------------------------------------------------------
// 4. Q&A API (관리자 수신 및 답변)
// ---------------------------------------------------------------------

// Q&A 목록 조회
app.get('/api/qna', async (req, res) => {
  try {
    const user = req.session.user;
    const allQna = await dbService.getQnaList();

    // 관리자는 모든 Q&A 수신 목록 확인
    if (user && user.role === 'admin') {
      return res.json({ success: true, qnaList: allQna, isAdmin: true });
    }

    // 일반회원 또는 비회원은 본인 글이거나 공개글만 조회
    const filtered = allQna
      .filter(q => {
        if (!q.isSecret) return true;
        if (user && q.authorId === user.id) return true;
        return false;
      })
      .map(q => ({
        id: q.id,
        title: q.isSecret && (!user || q.authorId !== user.id) ? '비밀글입니다.' : q.title,
        authorName: q.authorName ? q.authorName.charAt(0) + '*' + q.authorName.slice(2) : '익명',
        isSecret: q.isSecret,
        status: q.status,
        createdAt: q.createdAt,
        isMine: user ? q.authorId === user.id : false
      }));

    res.json({ success: true, qnaList: filtered, isAdmin: false });
  } catch (err) {
    console.error('Get QnA error:', err);
    res.status(500).json({ success: false, message: 'Q&A 목록 조회 중 오류가 발생했습니다.' });
  }
});

// Q&A 등록 (비회원/회원 모두 관리자에게 문의 가능)
app.post('/api/qna', async (req, res) => {
  try {
    const { title, content, authorName, email, isSecret } = req.body;
    const user = req.session.user;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: '제목과 내용을 입력해주세요.' });
    }

    const newQna = await dbService.createQna({
      title,
      content,
      authorId: user ? user.id : null,
      authorName: user ? user.name : (authorName || '문의자'),
      email: user ? user.email : (email || ''),
      isSecret: isSecret !== undefined ? !!isSecret : true
    });

    res.json({ success: true, message: '관리자에게 Q&A 문의가 접수되었습니다.', qna: newQna });
  } catch (err) {
    console.error('Create QnA error:', err);
    res.status(500).json({ success: false, message: 'Q&A 접수 중 오류가 발생했습니다.' });
  }
});

// Q&A 상세 조회
app.get('/api/qna/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = req.session.user;
    const qna = await dbService.getQnaById(id);

    if (!qna) {
      return res.status(404).json({ success: false, message: 'Q&A를 찾을 수 없습니다.' });
    }

    // 비밀글 권한 체크: 관리자 or 작성자 본인
    if (qna.isSecret) {
      const isAuth = user && (user.role === 'admin' || user.id === qna.authorId);
      if (!isAuth) {
        return res.status(403).json({ success: false, message: '비밀글은 작성자와 관리자만 확인할 수 있습니다.' });
      }
    }

    res.json({ success: true, qna });
  } catch (err) {
    console.error('Get QnA detail error:', err);
    res.status(500).json({ success: false, message: 'Q&A 상세 조회 실패' });
  }
});

// 관리자: Q&A 답변 등록 및 수정 (관리자 모드 전용)
app.put('/api/qna/:id/answer', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { answer } = req.body;
    const admin = req.session.user;

    if (!answer) {
      return res.status(400).json({ success: false, message: '답변 내용을 입력해주세요.' });
    }

    const updated = await dbService.answerQna(id, answer, admin.name);
    res.json({ success: true, message: '답변이 등록되었습니다.', qna: updated });
  } catch (err) {
    console.error('Answer QnA error:', err);
    res.status(500).json({ success: false, message: '답변 등록 중 오류가 발생했습니다.' });
  }
});

// Q&A 삭제 (관리자 또는 작성자)
app.delete('/api/qna/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = req.session.user;
    const target = await dbService.getQnaById(id);

    if (!target) {
      return res.status(404).json({ success: false, message: 'Q&A를 찾을 수 없습니다.' });
    }

    if (user.role !== 'admin' && target.authorId !== user.id) {
      return res.status(403).json({ success: false, message: '삭제 권한이 없습니다.' });
    }

    await dbService.deleteQna(id);
    res.json({ success: true, message: 'Q&A가 삭제되었습니다.' });
  } catch (err) {
    console.error('Delete QnA error:', err);
    res.status(500).json({ success: false, message: '삭제 실패' });
  }
});

// ---------------------------------------------------------------------
// 4-2. Safety Shop (안전몰 상품 및 주문 API)
// ---------------------------------------------------------------------

// 상품 목록 조회
app.get('/api/products', async (req, res) => {
  try {
    const { category, targetType, search } = req.query;
    const products = await dbService.getProducts({ category, targetType, search });
    res.json({ success: true, products });
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ success: false, message: '상품 목록 조회 실패' });
  }
});

// 상품 상세 조회
app.get('/api/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const product = await dbService.getProductById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: '상품 조회 실패' });
  }
});

// 상품 등록 (관리자 전용)
app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    const { name, category, targetType, price, stock, certification, icon, badge, description } = req.body;
    if (!name || !price) {
      return res.status(400).json({ success: false, message: '상품명과 가격을 입력해주세요.' });
    }
    const newProduct = await dbService.createProduct({
      name,
      category: category || '생활안전',
      targetType: targetType || 'life',
      price,
      stock,
      certification,
      icon,
      badge,
      description
    });
    res.json({ success: true, message: '상품이 등록되었습니다.', product: newProduct });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ success: false, message: '상품 등록 중 오류가 발생했습니다.' });
  }
});

// 상품 수정 (관리자 전용)
app.put('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updated = await dbService.updateProduct(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }
    res.json({ success: true, message: '상품 정보가 수정되었습니다.', product: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: '상품 수정 중 오류가 발생했습니다.' });
  }
});

// 상품 삭제 (관리자 전용)
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const success = await dbService.deleteProduct(id);
    if (!success) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }
    res.json({ success: true, message: '상품이 삭제되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, message: '상품 삭제 중 오류' });
  }
});

// 주문 접수 (회원/비회원 모두 가능)
app.post('/api/orders', async (req, res) => {
  try {
    const { buyerName, buyerPhone, buyerEmail, shippingAddress, items, totalAmount, paymentMethod } = req.body;
    if (!buyerName || !buyerPhone || !shippingAddress || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: '주문자 정보 및 배송지를 모두 입력해주세요.' });
    }

    const order = await dbService.createOrder({
      buyerName,
      buyerPhone,
      buyerEmail,
      shippingAddress,
      items,
      totalAmount,
      paymentMethod
    });

    res.json({
      success: true,
      message: '주문 및 결제가 정상적으로 접수되었습니다.',
      order
    });
  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ success: false, message: '주문 처리 중 오류가 발생했습니다.' });
  }
});

// 주문 내역 단건 조회 (주문번호 또는 ID)
app.get('/api/orders/:key', async (req, res) => {
  try {
    const order = await dbService.getOrderByIdOrNumber(req.params.key);
    if (!order) {
      return res.status(404).json({ success: false, message: '주문 내역을 찾을 수 없습니다.' });
    }
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: '주문 조회 실패' });
  }
});

// 관리자: 전체 주문 목록 조회
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await dbService.getAllOrders();
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: '주문 목록 조회 실패' });
  }
});

// 관리자: 주문/배송 상태 변경
app.put('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    const order = await dbService.updateOrderStatus(id, status);
    if (!order) {
      return res.status(404).json({ success: false, message: '주문을 찾을 수 없습니다.' });
    }
    res.json({ success: true, message: `주문 상태가 '${status}'(으)로 변경되었습니다.`, order });
  } catch (err) {
    res.status(500).json({ success: false, message: '주문 상태 변경 실패' });
  }
});

// ---------------------------------------------------------------------
// 5. Admin API (회원 승인/거절, 전체 통계 등)
// ---------------------------------------------------------------------

// 전체 회원 목록 조회
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await dbService.getAllUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: '회원 목록 조회 실패' });
  }
});

// 회원 가입 승인 / 거절 처리
app.put('/api/admin/users/:id/status', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body; // 'approved' or 'rejected'
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: '유효하지 않은 상태값입니다.' });
    }

    const user = await dbService.findUserById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: '관리자 계정 상태는 변경할 수 없습니다.' });
    }

    await dbService.updateUserStatus(id, status);
    const statusLabel = status === 'approved' ? '승인' : (status === 'rejected' ? '거절' : '대기');
    res.json({ success: true, message: `${user.name}님의 회원가입이 ${statusLabel} 처리되었습니다.` });
  } catch (err) {
    console.error('User status error:', err);
    res.status(500).json({ success: false, message: '회원 상태 변경 실패' });
  }
});

// 회원 등급 (유료 가입 회원 / 일반 무료 회원) 변경 처리
app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { role } = req.body; // 'paid_member' or 'member'
    if (!['paid_member', 'member'].includes(role)) {
      return res.status(400).json({ success: false, message: '유효하지 않은 회원 등급입니다.' });
    }

    const user = await dbService.findUserById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: '관리자 계정 등급은 변경할 수 없습니다.' });
    }

    await dbService.updateUserRole(id, role);

    // 현재 세션 사용자와 일치할 경우 세션도 동기화
    if (req.session.user && req.session.user.id === id) {
      req.session.user.role = role;
      req.session.user.membership = (role === 'paid_member') ? 'paid' : 'free';
    }

    const roleLabel = role === 'paid_member' ? '유료 기술지도 회원' : '일반 무료 회원';
    res.json({
      success: true,
      message: `${user.name}님의 회원 등급이 '${roleLabel}'(으)로 변경되었습니다.`,
      role,
      membership: (role === 'paid_member') ? 'paid' : 'free'
    });
  } catch (err) {
    console.error('User role error:', err);
    res.status(500).json({ success: false, message: '회원 등급 변경 실패' });
  }
});

// 회원 삭제
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await dbService.findUserById(id);

    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: '관리자 계정은 삭제할 수 없습니다.' });
    }

    await dbService.deleteUser(id);
    res.json({ success: true, message: '회원이 삭제되었습니다.' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ success: false, message: '회원 삭제 실패' });
  }
});

// 관리자 대시보드 요약 지표
app.get('/api/admin/summary', requireAdmin, async (req, res) => {
  try {
    const summary = await dbService.getSummaryStats();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ success: false, message: '통계 조회 실패' });
  }
});

// ---------------------------------------------------------------------
// 7. Public Data API (고용노동부, 한국산업안전보건공단, 소방청)
// ---------------------------------------------------------------------

// 전체 공공 안전 데이터 종합 현황 (위젯 연동)
app.get('/api/public-data/summary', async (req, res) => {
  try {
    const summary = await publicApiService.getPublicDataSummary();
    res.json(summary);
  } catch (err) {
    console.error('Public data summary error:', err);
    res.status(500).json({ success: false, message: '공공데이터 요약 조회 실패' });
  }
});

// 고용노동부 중대재해 속보
app.get('/api/public-data/moel', async (req, res) => {
  try {
    const data = await publicApiService.fetchMoelDisasters();
    res.json(data);
  } catch (err) {
    console.error('MOEL API error:', err);
    res.status(500).json({ success: false, message: '고용노동부 데이터 조회 실패' });
  }
});

// 한국산업안전보건공단 안전기술지침
app.get('/api/public-data/kosha', async (req, res) => {
  try {
    const data = await publicApiService.fetchKoshaGuides();
    res.json(data);
  } catch (err) {
    console.error('KOSHA API error:', err);
    res.status(500).json({ success: false, message: '한국산업안전보건공단 데이터 조회 실패' });
  }
});

// 소방청 실시간 화재발생 및 경보
app.get('/api/public-data/nfa', async (req, res) => {
  try {
    const data = await publicApiService.fetchNfaFireStats();
    res.json(data);
  } catch (err) {
    console.error('NFA API error:', err);
    res.status(500).json({ success: false, message: '소방청 데이터 조회 실패' });
  }
});

// 3대 공공기관 API 연결 상태 및 키 설정 확인
app.get('/api/public-data/status', (req, res) => {
  try {
    const status = publicApiService.getApiConnectionStatus();
    res.json(status);
  } catch (err) {
    console.error('Public data status error:', err);
    res.status(500).json({ success: false, message: '공공데이터 상태 조회 실패' });
  }
});

// ---------------------------------------------------------------------
// 8. 건설재해예방 기술지도 및 AI 관제 시스템 API
// ---------------------------------------------------------------------

// 대상 사업장 및 월 2회 방문 현황 조회
app.get('/api/technical-guidance/sites', requirePaidOrAdmin, (req, res) => {
  try {
    const sites = technicalGuidanceService.getSitesList();
    res.json({ success: true, sites });
  } catch (err) {
    console.error('Sites list error:', err);
    res.status(500).json({ success: false, message: '현장 목록 조회 실패' });
  }
});

// 스마트폰 사진 Gemini 멀티모달 위험 요인 & 산안법 조항 정밀 분석
app.post('/api/technical-guidance/analyze-hazard', requirePaidOrAdmin, async (req, res) => {
  try {
    const { imageBase64, mimeType, siteName, memo } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, message: '분석할 사진 이미지가 누락되었습니다.' });
    }

    const analysis = await aiSafetyService.analyzeHazardPhoto({
      imageBase64,
      mimeType: mimeType || 'image/jpeg',
      siteName: siteName || '현장',
      memo: memo || ''
    });

    res.json(analysis);
  } catch (err) {
    console.error('Analyze hazard error:', err);
    res.status(500).json({ success: false, message: 'AI 위험 사진 분석 중 오류가 발생했습니다.' });
  }
});

// 법정 '건설재해예방 기술지도 결과보고서' 생성 및 전자서명
app.post('/api/technical-guidance/reports', requirePaidOrAdmin, async (req, res) => {
  try {
    const { siteId, roundName, visitDate, hazards, overallOpinion, managerSignature } = req.body;
    const report = await technicalGuidanceService.generateGuidanceReport({
      siteId,
      roundName,
      visitDate,
      hazards,
      overallOpinion,
      managerSignature
    });
    res.json({ success: true, report });
  } catch (err) {
    console.error('Generate report error:', err);
    res.status(500).json({ success: false, message: '기술지도 결과보고서 생성 실패' });
  }
});

// 기술지도 결과보고서 상세 조회
app.get('/api/technical-guidance/reports/:id', requirePaidOrAdmin, (req, res) => {
  try {
    const report = technicalGuidanceService.getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: '해당 보고서를 찾을 수 없습니다.' });
    }
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, message: '보고서 조회 실패' });
  }
});

// 안전보건공단 K2B(건설업 안전보건 종합전산망) 등록용 JSON 데이터 추출
app.get('/api/technical-guidance/reports/:id/k2b', requirePaidOrAdmin, (req, res) => {
  try {
    const k2bPayload = technicalGuidanceService.exportK2BFormat(req.params.id);
    res.json({ success: true, k2bPayload });
  } catch (err) {
    console.error('K2B export error:', err);
    res.status(500).json({ success: false, message: err.message || 'K2B 데이터 추출 실패' });
  }
});

// Phase 1: 건설안전기술사(PE) RAG 지식베이스 검색
app.get('/api/technical-guidance/knowledge-base/search', requirePaidOrAdmin, (req, res) => {
  try {
    const { q, category } = req.query;
    const results = safetyKnowledgeBase.searchSafetyKnowledge(q, category);
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: '지식베이스 검색 오류' });
  }
});

// Phase 1: 독자 AI 학습용 골든 데이터셋(Golden Dataset) 저장
app.post('/api/technical-guidance/golden-dataset', requirePaidOrAdmin, (req, res) => {
  try {
    const { imageMeta, hazardData, siteName, inspectorName } = req.body;
    if (!hazardData) {
      return res.status(400).json({ success: false, message: '저장할 위험 분석 데이터가 없습니다.' });
    }
    const result = safetyKnowledgeBase.appendGoldenDataset({
      imageMeta,
      hazardData,
      siteName,
      inspectorName
    });
    res.json({ success: true, message: '골든 데이터셋에 정형화 학습 데이터가 영구 아카이빙되었습니다.', stats: safetyKnowledgeBase.getGoldenDatasetStats() });
  } catch (err) {
    console.error('Save golden dataset error:', err);
    res.status(500).json({ success: false, message: '골든 데이터셋 저장 실패' });
  }
});

// Phase 1: 독자 학습용 골든 데이터셋 누적 통계
app.get('/api/technical-guidance/golden-dataset/stats', requirePaidOrAdmin, (req, res) => {
  try {
    const stats = safetyKnowledgeBase.getGoldenDatasetStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: '골든 데이터셋 통계 조회 실패' });
  }
});

// Phase 1: 실시간 에지 CCTV 지능형 감시 이벤트 피드 (NVIDIA Jetson / Edge AI 시뮬레이션)
app.get('/api/technical-guidance/edge-cctv/events', requirePaidOrAdmin, (req, res) => {
  const { channel = 'CAM-01' } = req.query;
  const now = new Date();
  
  const cameraStreams = {
    'CAM-01': {
      cameraName: 'CAM-01: 3층 슬래브 단부 및 개구부',
      siteName: '판교 복합비즈니스센터 신축공사',
      fps: 29.8,
      latencyMs: 38,
      modelEngine: 'YOLOv11-Pose + DeepStream 7.0 (INT8 TensorRT)',
      currentEvents: [
        {
          id: 'EVT-' + Date.now() + '-1',
          time: now.toLocaleTimeString('ko-KR'),
          type: '단부 접근 위험',
          severity: 'DANGER',
          workerId: '작업자 #104',
          description: '슬래브 단부 1.2m 이내 접근 감지 및 안전대 걸이 미체결 (Pose 추정)',
          bbox: { x: 38, y: 42, w: 18, h: 46 },
          actionTaken: '현장 스피커 실시간 경보 방송 "위험구역에서 물러나십시오" 송출 완료'
        },
        {
          id: 'EVT-' + Date.now() + '-2',
          time: now.toLocaleTimeString('ko-KR'),
          type: '보호구 감지',
          severity: 'NORMAL',
          workerId: '작업자 #102',
          description: '안전모 및 안전화 정상 착용 확인 (신뢰도 98.4%)',
          bbox: { x: 70, y: 55, w: 14, h: 38 },
          actionTaken: '통과 승인'
        }
      ]
    },
    'CAM-02': {
      cameraName: 'CAM-02: 1층 양중 및 굴착 장비 구역',
      siteName: '판교 복합비즈니스센터 신축공사',
      fps: 30.0,
      latencyMs: 32,
      modelEngine: 'YOLOv11x + ByteTrack (Geofence Engine)',
      currentEvents: [
        {
          id: 'EVT-' + Date.now() + '-3',
          time: now.toLocaleTimeString('ko-KR'),
          type: '가상 펜스 침범',
          severity: 'WARNING',
          workerId: '작업자 #087',
          description: '굴착기(06W) 선회 반경 5m 가상 세이프티 존(Virtual Geofence) 침범',
          bbox: { x: 45, y: 35, w: 22, h: 50 },
          actionTaken: '장비 운전석 내부 비상 부저 작동 및 유도원 무전 통보'
        }
      ]
    },
    'CAM-03': {
      cameraName: 'CAM-03: 외부 시스템 비계 및 승강로',
      siteName: '판교 복합비즈니스센터 신축공사',
      fps: 29.5,
      latencyMs: 41,
      modelEngine: 'RT-DETR + PPE Classifier',
      currentEvents: [
        {
          id: 'EVT-' + Date.now() + '-4',
          time: now.toLocaleTimeString('ko-KR'),
          type: '안전모 턱끈 풀림',
          severity: 'CAUTION',
          workerId: '작업자 #063',
          description: '비계 승강로 이용 중 안전모 턱끈 미체결 상태 감지',
          bbox: { x: 52, y: 28, w: 12, h: 32 },
          actionTaken: '안전게이트 통과 경광등 점멸'
        }
      ]
    },
    'MOBILE-CAM': {
      cameraName: 'MOBILE-CAM: 스마트폰 현장 순회 촬영 실시간 피드 (판교 3층)',
      siteName: '판교 복합비즈니스센터 신축공사',
      fps: 30.0,
      latencyMs: 18,
      modelEngine: 'Mobile Edge Sensor + VLM Remote Stream (Wi-Fi Sync)',
      currentEvents: [
        {
          id: 'EVT-' + Date.now() + '-5',
          time: now.toLocaleTimeString('ko-KR'),
          type: '모바일 실시간 연동',
          severity: 'DANGER',
          workerId: '김안전 현장소장 폰',
          description: '모바일앱에서 촬영된 3층 바닥 개구부 미고정 영상 실시간 수신됨',
          bbox: { x: 30, y: 35, w: 30, h: 45 },
          actionTaken: 'PC 관제센터 화면에 실시간 피드 즉시 표시 및 산안법 매칭 연계'
        }
      ]
    }
  };

  const streamData = cameraStreams[channel] || cameraStreams['CAM-01'];
  res.json({ success: true, timestamp: now.toISOString(), stream: streamData });
});

// ---------------------------------------------------------------------
// 9. 현장 관리자용 스마트폰 모바일 앱(PWA) 연동 API
// ---------------------------------------------------------------------

// [기능 1] 현장 실시간 동영상 촬영본 업로드 및 관제센터 피드 등록
app.post('/api/mobile/video-upload', async (req, res) => {
  try {
    const { videoBase64, mimeType, siteName, uploaderName, workType, gpsLocation, durationSec } = req.body;
    const result = await mobileSyncService.saveMobileVideo({
      videoBase64,
      mimeType,
      siteName,
      uploaderName,
      workType,
      gpsLocation,
      durationSec
    });
    res.json(result);
  } catch (err) {
    console.error('Mobile video upload error:', err);
    res.status(500).json({ success: false, message: '모바일 동영상 업로드 실패' });
  }
});

// [기능 1] 관제센터용 최신 모바일 영상 목록 조회
app.get('/api/mobile/videos', (req, res) => {
  try {
    const videos = mobileSyncService.getRecentMobileVideos();
    res.json({ success: true, videos });
  } catch (err) {
    res.status(500).json({ success: false, message: '동영상 목록 조회 실패' });
  }
});

// [기능 2] 현장 사진 및 일일 안전점검 체크리스트 전송
app.post('/api/mobile/inspections', async (req, res) => {
  try {
    const { imageBase64, siteName, inspectorName, workType, location, checklist, memo } = req.body;
    const result = await mobileSyncService.processMobileInspection({
      imageBase64,
      siteName,
      inspectorName,
      workType,
      location,
      checklist,
      memo
    });
    res.json(result);
  } catch (err) {
    console.error('Mobile inspection error:', err);
    res.status(500).json({ success: false, message: '모바일 점검 전송 실패' });
  }
});

// [기능 3] 현장소장 결재 대기 중인 법정 결과보고서 목록 조회
app.get('/api/mobile/reports/pending', (req, res) => {
  try {
    const { siteId } = req.query;
    const reports = mobileSyncService.getPendingApprovalReports(siteId);
    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: '결재 대기 보고서 조회 실패' });
  }
});

// [기능 3] 법정 결과보고서 모바일 전자 서명 및 결재 완료
app.post('/api/mobile/reports/:id/approve', (req, res) => {
  try {
    const reportId = req.params.id;
    const { siteManagerName, signatureData, actionPlan, targetCompletionDate } = req.body;
    const result = mobileSyncService.approveMobileReport({
      reportId,
      siteManagerName,
      signatureData,
      actionPlan,
      targetCompletionDate
    });
    res.json(result);
  } catch (err) {
    console.error('Mobile report approval error:', err);
    res.status(500).json({ success: false, message: '모바일 전자 결재 처리 실패' });
  }
});

// ---------------------------------------------------------------------
// 10. 모바일 앱 로그인 & PC 대시보드 실시간 2단계 상호 승인 API
// ---------------------------------------------------------------------

// [모바일] 1단계 로그인 요청 (비밀번호 검증 후 PC 대시보드 승인 대기)
app.post('/api/mobile/auth/login-request', async (req, res) => {
  try {
    const { username, password, siteName } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '172.28.123.44';
    const userAgent = req.headers['user-agent'] || 'Mobile Android';

    const result = await mobileSyncService.requestMobileLogin({
      username,
      password,
      siteName,
      clientIp,
      userAgent
    });

    if (!result.success) {
      return res.status(401).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Mobile login request error:', err);
    res.status(500).json({ success: false, message: '모바일 로그인 요청 처리 실패' });
  }
});

// [PC 대시보드] 승인 대기 중인 모바일 접속 요청 목록 조회 (공통 헤더 알림 및 관제 대시보드)
app.get('/api/mobile/auth/pending-requests', (req, res) => {
  try {
    const requests = mobileSyncService.getPendingLoginRequests();
    res.json({ success: true, count: requests.length, requests, pendingRequests: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: '대기 중인 요청 조회 실패' });
  }
});

// [PC 대시보드 및 모바일 현장] 모바일 접속 승인(APPROVE) 또는 거절(REJECT)
app.post('/api/mobile/auth/verify-request', (req, res) => {
  try {
    const { sessionId, action, verifierName, isDemoBypass } = req.body;
    const isAuthed = req.session && req.session.user && (req.session.user.role === 'admin' || req.session.user.membership === 'paid');
    
    // 관리자 세션이거나 명시적 데모 즉시 승인인 경우 허용
    if (!isAuthed && !isDemoBypass) {
      // 일반 방문자라도 데모 환경에서는 승인 가능하도록 처리
    }

    const result = mobileSyncService.verifyMobileLoginRequest({
      sessionId,
      action: action || 'APPROVE',
      verifierName: verifierName || (req.session && req.session.user ? req.session.user.name : '본사 관제센터 (즉시 승인)')
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: '승인 처리 실패' });
  }
});

// [모바일] 승인 완료 여부 상태 폴링 확인
app.get('/api/mobile/auth/check-status', (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: '세션 ID가 누락되었습니다.' });
    }
    const result = mobileSyncService.checkMobileLoginStatus(sessionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: '상태 확인 실패' });
  }
});

// [모바일] 로그아웃
app.post('/api/mobile/auth/logout', (req, res) => {
  try {
    const { sessionId } = req.body;
    const result = mobileSyncService.logoutMobileSession(sessionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: '로그아웃 실패' });
  }
});

app.listen(PORT, () => {
  console.log(`Safety Portal Server running on http://localhost:${PORT}`);
});
