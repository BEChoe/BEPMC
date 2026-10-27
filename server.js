require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const dbService = require('./data/dbService');
const { isSupabaseConfigured } = require('./data/supabaseClient');
const publicApiService = require('./services/publicApiService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ---------------------------------------------------------------------
// 1. Auth & Session API
// ---------------------------------------------------------------------

// 내 정보 확인
app.get('/api/auth/me', (req, res) => {
  const dbType = isSupabaseConfigured() ? 'Supabase' : 'Local';
  if (!req.session.user) {
    return res.json({ isLoggedIn: false, user: null, mode: 'guest', dbType });
  }
  res.json({
    isLoggedIn: true,
    user: req.session.user,
    mode: req.session.user.role === 'admin' ? 'admin' : 'member',
    dbType
  });
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await dbService.findUserByUsername(username);

    if (!user || user.password !== password) {
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

    // 세션 저장
    req.session.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    };

    res.json({
      success: true,
      message: `${user.name}님 환영합니다. (${user.role === 'admin' ? '관리자 모드' : '회원 모드'})`,
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
    } else if (role === 'member') {
      targetUser = users.find(u => u.role === 'member' && u.status === 'approved');
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, message: '해당 권한의 사용자를 찾을 수 없습니다.' });
    }

    req.session.user = {
      id: targetUser.id,
      username: targetUser.username,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      status: targetUser.status
    };

    res.json({
      success: true,
      mode: role,
      message: `${targetUser.name}(으)로 전환되었습니다. (${role === 'admin' ? '관리자 모드' : '회원 모드'})`,
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

app.listen(PORT, () => {
  console.log(`Safety Portal Server running on http://localhost:${PORT}`);
});
