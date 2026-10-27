const { supabase, isSupabaseConfigured } = require('./supabaseClient');
const localStore = require('./store');

// ========================================================
// 1. 사이트 설정 (Site Settings)
// ========================================================
async function getSiteSettings() {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .eq('id', 1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Supabase getSiteSettings error:', error.message);
      }
      if (data) {
        // BEPMC 명칭 및 연락처 xxx-xxxx-xxxx 형식 자동 동기화
        let needUpdate = false;
        let siteName = data.site_name || "BEPMC (Project Management Consultancy)";
        let mainSlogan = data.main_slogan || "안전과 프로젝트 성공을 이끄는 신뢰의 파트너";
        let emergencyPhone = data.emergency_phone || "긴급구조 xxx-xxxx-xxxx | 산업안전보건 신고 xxx-xxxx-xxxx | 비상상황실 xxx-xxxx-xxxx";
        let footerInfo = data.footer_info || "BEPMC (Project Management Consultancy) | 주소: 서울특별시 강남구 테헤란로 152 | 대표: xxx-xxxx-xxxx";

        if (siteName.includes('대한안전포털')) {
          siteName = 'BEPMC (Project Management Consultancy)';
          mainSlogan = '안전과 프로젝트 성공을 이끄는 신뢰의 파트너';
          needUpdate = true;
        }

        if (emergencyPhone.includes('119') || emergencyPhone.includes('1588') || emergencyPhone.includes('02-555')) {
          emergencyPhone = '긴급구조 xxx-xxxx-xxxx | 산업안전보건 신고 xxx-xxxx-xxxx | 비상상황실 xxx-xxxx-xxxx';
          needUpdate = true;
        }

        if (footerInfo.includes('02-1234-5678') || footerInfo.includes('대한안전관리협의회')) {
          footerInfo = 'BEPMC (Project Management Consultancy) | 주소: 서울특별시 강남구 테헤란로 152 | 대표: xxx-xxxx-xxxx';
          needUpdate = true;
        }

        if (needUpdate) {
          try {
            await supabase
              .from('site_settings')
              .update({
                site_name: siteName,
                main_slogan: mainSlogan,
                emergency_phone: emergencyPhone,
                footer_info: footerInfo
              })
              .eq('id', 1);
          } catch (updateErr) {
            console.error('Supabase site_settings sync update error:', updateErr);
          }
        }

        return {
          siteName,
          mainSlogan,
          subSlogan: data.sub_slogan || "작업 전 10초 안전점검, 나와 가족과 동료를 지키는 가장 확실한 약속",
          emergencyPhone,
          alertBanner: data.alert_banner,
          safetyNotice: data.safety_notice,
          footerInfo
        };
      }
    } catch (e) {
      console.error('Supabase getSiteSettings exception:', e);
    }
  }

  // Fallback to local
  const db = localStore.getDb();
  return db.siteSettings;
}

async function updateSiteSettings(settings) {
  if (isSupabaseConfigured()) {
    try {
      const payload = {
        site_name: settings.siteName,
        main_slogan: settings.mainSlogan,
        sub_slogan: settings.subSlogan,
        emergency_phone: settings.emergencyPhone,
        alert_banner: settings.alertBanner,
        safety_notice: settings.safetyNotice,
        footer_info: settings.footerInfo,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('site_settings')
        .upsert({ id: 1, ...payload })
        .select()
        .single();

      if (error) throw error;
      return {
        siteName: data.site_name,
        mainSlogan: data.main_slogan,
        subSlogan: data.sub_slogan,
        emergencyPhone: data.emergency_phone,
        alertBanner: data.alert_banner,
        safetyNotice: data.safety_notice,
        footerInfo: data.footer_info
      };
    } catch (e) {
      console.error('Supabase updateSiteSettings exception:', e);
    }
  }

  // Fallback
  const db = localStore.getDb();
  db.siteSettings = { ...db.siteSettings, ...settings };
  localStore.saveDb(db);
  return db.siteSettings;
}

// ========================================================
// 2. 회원 관리 (Users & Auth)
// ========================================================
async function findUserByUsername(username) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Supabase findUserByUsername error:', error.message);
      }
      return data || null;
    } catch (e) {
      console.error('Supabase findUserByUsername exception:', e);
    }
  }

  const db = localStore.getDb();
  return db.users.find(u => u.username === username) || null;
}

async function findUserById(id) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (error) console.error('Supabase findUserById error:', error.message);
      return data || null;
    } catch (e) {
      console.error('Supabase findUserById exception:', e);
    }
  }

  const db = localStore.getDb();
  return db.users.find(u => u.id === Number(id)) || null;
}

async function createUser({ username, password, name, email, role = 'member', status = 'pending' }) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert([{ username, password, name, email, role, status }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('Supabase createUser exception:', e);
      throw e;
    }
  }

  const db = localStore.getDb();
  const newUser = {
    id: db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1,
    username,
    password,
    name,
    email: email || '',
    role,
    status,
    createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
  };
  db.users.push(newUser);
  localStore.saveDb(db);
  return newUser;
}

async function getAllUsers() {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, name, email, role, status, created_at')
        .order('id', { ascending: true });

      if (error) throw error;
      return data.map(u => ({
        id: u.id,
        username: u.username,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.created_at ? new Date(u.created_at).toISOString().replace('T', ' ').slice(0, 19) : ''
      }));
    } catch (e) {
      console.error('Supabase getAllUsers exception:', e);
    }
  }

  const db = localStore.getDb();
  return db.users.map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt
  }));
}

async function updateUserStatus(id, status) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('Supabase updateUserStatus exception:', e);
      throw e;
    }
  }

  const db = localStore.getDb();
  const target = db.users.find(u => u.id === Number(id));
  if (target) {
    target.status = status;
    localStore.saveDb(db);
  }
  return target;
}

async function deleteUser(id) {
  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Supabase deleteUser exception:', e);
      throw e;
    }
  }

  const db = localStore.getDb();
  const idx = db.users.findIndex(u => u.id === Number(id));
  if (idx !== -1) {
    db.users.splice(idx, 1);
    localStore.saveDb(db);
  }
  return true;
}

// ========================================================
// 3. 게시판 및 댓글 (Posts & Comments)
// ========================================================
async function getPosts({ boardType, category, search } = {}) {
  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('posts')
        .select('*, comments(id)')
        .order('id', { ascending: false });

      if (boardType) query = query.eq('board_type', boardType);
      if (category) query = query.eq('category', category);
      if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(p => ({
        id: p.id,
        boardType: p.board_type,
        category: p.category,
        title: p.title,
        content: p.content,
        authorId: p.author_id,
        authorName: p.author_name,
        authorRole: p.author_role,
        views: p.views || 0,
        commentCount: p.comments ? p.comments.length : 0,
        createdAt: p.created_at ? new Date(p.created_at).toISOString().replace('T', ' ').slice(0, 19) : ''
      }));
    } catch (e) {
      console.error('Supabase getPosts exception:', e);
    }
  }

  // Fallback
  const db = localStore.getDb();
  let list = db.posts;
  if (boardType) list = list.filter(p => p.boardType === boardType);
  if (category) list = list.filter(p => p.category === category);
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(p => p.title.toLowerCase().includes(s) || p.content.toLowerCase().includes(s));
  }
  return list.slice().reverse().map(p => ({
    id: p.id,
    boardType: p.boardType,
    category: p.category,
    title: p.title,
    authorName: p.authorName,
    authorRole: p.authorRole,
    views: p.views,
    commentCount: p.comments ? p.comments.length : 0,
    createdAt: p.createdAt
  }));
}

async function getPostById(id, incrementView = true) {
  if (isSupabaseConfigured()) {
    try {
      const { data: post, error } = await supabase
        .from('posts')
        .select('*, comments(*)')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!post) return null;

      if (incrementView) {
        await supabase
          .from('posts')
          .update({ views: (post.views || 0) + 1 })
          .eq('id', id);
        post.views = (post.views || 0) + 1;
      }

      // 댓글 정렬
      const sortedComments = (post.comments || []).sort((a, b) => a.id - b.id).map(c => ({
        id: c.id,
        postId: c.post_id,
        authorId: c.author_id,
        authorName: c.author_name,
        authorRole: c.author_role,
        content: c.content,
        createdAt: c.created_at ? new Date(c.created_at).toISOString().replace('T', ' ').slice(0, 19) : ''
      }));

      return {
        id: post.id,
        boardType: post.board_type,
        category: post.category,
        title: post.title,
        content: post.content,
        authorId: post.author_id,
        authorName: post.author_name,
        authorRole: post.author_role,
        views: post.views,
        createdAt: post.created_at ? new Date(post.created_at).toISOString().replace('T', ' ').slice(0, 19) : '',
        updatedAt: post.updated_at ? new Date(post.updated_at).toISOString().replace('T', ' ').slice(0, 19) : '',
        comments: sortedComments
      };
    } catch (e) {
      console.error('Supabase getPostById exception:', e);
    }
  }

  // Fallback
  const db = localStore.getDb();
  const post = db.posts.find(p => p.id === Number(id));
  if (post && incrementView) {
    post.views = (post.views || 0) + 1;
    localStore.saveDb(db);
  }
  return post || null;
}

async function createPost({ boardType, category, title, content, authorId, authorName, authorRole }) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('posts')
        .insert([{
          board_type: boardType,
          category,
          title,
          content,
          author_id: authorId || null,
          author_name: authorName,
          author_role: authorRole,
          views: 0
        }])
        .select()
        .single();

      if (error) throw error;
      return {
        id: data.id,
        boardType: data.board_type,
        category: data.category,
        title: data.title,
        content: data.content,
        authorId: data.author_id,
        authorName: data.author_name,
        authorRole: data.author_role,
        views: data.views,
        createdAt: data.created_at,
        comments: []
      };
    } catch (e) {
      console.error('Supabase createPost exception:', e);
      throw e;
    }
  }

  const db = localStore.getDb();
  const newPost = {
    id: db.posts.length > 0 ? Math.max(...db.posts.map(p => p.id)) + 1 : 1,
    boardType: boardType || 'member',
    category,
    title,
    content,
    authorId,
    authorName,
    authorRole,
    views: 0,
    createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    comments: []
  };
  db.posts.push(newPost);
  localStore.saveDb(db);
  return newPost;
}

async function updatePost(id, { title, content, category }) {
  if (isSupabaseConfigured()) {
    try {
      const updateData = { updated_at: new Date().toISOString() };
      if (title) updateData.title = title;
      if (content) updateData.content = content;
      if (category) updateData.category = category;

      const { data, error } = await supabase
        .from('posts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('Supabase updatePost exception:', e);
      throw e;
    }
  }

  const db = localStore.getDb();
  const post = db.posts.find(p => p.id === Number(id));
  if (post) {
    if (title) post.title = title;
    if (content) post.content = content;
    if (category) post.category = category;
    post.updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
    localStore.saveDb(db);
  }
  return post;
}

async function deletePost(id) {
  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Supabase deletePost exception:', e);
      throw e;
    }
  }

  const db = localStore.getDb();
  const idx = db.posts.findIndex(p => p.id === Number(id));
  if (idx !== -1) {
    db.posts.splice(idx, 1);
    localStore.saveDb(db);
  }
  return true;
}

async function addComment(postId, { authorId, authorName, authorRole, content }) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert([{
          post_id: postId,
          author_id: authorId || null,
          author_name: authorName,
          author_role: authorRole,
          content
        }])
        .select()
        .single();

      if (error) throw error;
      return {
        id: data.id,
        postId: data.post_id,
        authorId: data.author_id,
        authorName: data.author_name,
        authorRole: data.author_role,
        content: data.content,
        createdAt: data.created_at
      };
    } catch (e) {
      console.error('Supabase addComment exception:', e);
      throw e;
    }
  }

  const db = localStore.getDb();
  const post = db.posts.find(p => p.id === Number(postId));
  if (!post) throw new Error('Post not found');
  if (!post.comments) post.comments = [];

  const newComment = {
    id: post.comments.length > 0 ? Math.max(...post.comments.map(c => c.id)) + 1 : 1,
    authorId,
    authorName,
    authorRole,
    content,
    createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
  };
  post.comments.push(newComment);
  localStore.saveDb(db);
  return newComment;
}

async function deleteComment(postId, commentId) {
  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Supabase deleteComment exception:', e);
      throw e;
    }
  }

  const db = localStore.getDb();
  const post = db.posts.find(p => p.id === Number(postId));
  if (!post || !post.comments) return false;
  const idx = post.comments.findIndex(c => c.id === Number(commentId));
  if (idx !== -1) {
    post.comments.splice(idx, 1);
    localStore.saveDb(db);
    return true;
  }
  return false;
}

// ========================================================
// 4. Q&A 문의함 (QnA)
// ========================================================
async function getQnaList() {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('qna')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;
      return (data || []).map(q => ({
        id: q.id,
        title: q.title,
        content: q.content,
        authorId: q.author_id,
        authorName: q.author_name,
        email: q.email,
        isSecret: q.is_secret,
        status: q.status,
        answer: q.answer,
        answeredAt: q.answered_at ? new Date(q.answered_at).toISOString().replace('T', ' ').slice(0, 19) : null,
        answeredBy: q.answered_by,
        createdAt: q.created_at ? new Date(q.created_at).toISOString().replace('T', ' ').slice(0, 19) : ''
      }));
    } catch (e) {
      console.error('Supabase getQnaList exception:', e);
    }
  }

  const db = localStore.getDb();
  return db.qna.slice().reverse();
}

async function getQnaById(id) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('qna')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        title: data.title,
        content: data.content,
        authorId: data.author_id,
        authorName: data.author_name,
        email: data.email,
        isSecret: data.is_secret,
        status: data.status,
        answer: data.answer,
        answeredAt: data.answered_at ? new Date(data.answered_at).toISOString().replace('T', ' ').slice(0, 19) : null,
        answeredBy: data.answered_by,
        createdAt: data.created_at ? new Date(data.created_at).toISOString().replace('T', ' ').slice(0, 19) : ''
      };
    } catch (e) {
      console.error('Supabase getQnaById exception:', e);
    }
  }

  const db = localStore.getDb();
  return db.qna.find(q => q.id === Number(id)) || null;
}

async function createQna({ title, content, authorId, authorName, email, isSecret = true }) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('qna')
        .insert([{
          title,
          content,
          author_id: authorId || null,
          author_name: authorName,
          email,
          is_secret: Boolean(isSecret),
          status: 'pending'
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('Supabase createQna exception:', e);
      throw e;
    }
  }

  const db = localStore.getDb();
  const newQna = {
    id: db.qna.length > 0 ? Math.max(...db.qna.map(q => q.id)) + 1 : 1,
    title,
    content,
    authorId: authorId || null,
    authorName,
    email: email || '',
    isSecret: Boolean(isSecret),
    status: 'pending',
    answer: null,
    answeredAt: null,
    answeredBy: null,
    createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
  };
  db.qna.push(newQna);
  localStore.saveDb(db);
  return newQna;
}

async function answerQna(id, answer, answeredBy) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('qna')
        .update({
          answer,
          status: 'answered',
          answered_by: answeredBy,
          answered_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('Supabase answerQna exception:', e);
      throw e;
    }
  }

  const db = localStore.getDb();
  const qna = db.qna.find(q => q.id === Number(id));
  if (qna) {
    qna.answer = answer;
    qna.status = 'answered';
    qna.answeredBy = answeredBy;
    qna.answeredAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
    localStore.saveDb(db);
  }
  return qna;
}

async function deleteQna(id) {
  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase
        .from('qna')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Supabase deleteQna exception:', e);
      throw e;
    }
  }

  const db = localStore.getDb();
  const idx = db.qna.findIndex(q => q.id === Number(id));
  if (idx !== -1) {
    db.qna.splice(idx, 1);
    localStore.saveDb(db);
  }
  return true;
}

// ========================================================
// 5. 관리자 대시보드 통계 요약
// ========================================================
async function getSummaryStats() {
  if (isSupabaseConfigured()) {
    try {
      const [usersRes, postsRes, qnaRes] = await Promise.all([
        supabase.from('users').select('role, status'),
        supabase.from('posts').select('id', { count: 'exact', head: true }),
        supabase.from('qna').select('status')
      ]);

      const users = usersRes.data || [];
      const pendingUsers = users.filter(u => u.status === 'pending').length;
      const approvedMembers = users.filter(u => u.role === 'member' && u.status === 'approved').length;

      const qnaList = qnaRes.data || [];
      const pendingQna = qnaList.filter(q => q.status === 'pending').length;
      const totalQna = qnaList.length;

      const db = localStore.getDb();
      const totalOrders = (db.orders || []).length;
      const totalProducts = (db.products || []).length;

      return {
        pendingUsers,
        approvedMembers,
        totalPosts: postsRes.count || 0,
        pendingQna,
        totalQna,
        totalOrders,
        totalProducts,
        dbType: 'Supabase Cloud DB'
      };
    } catch (e) {
      console.error('Supabase getSummaryStats exception:', e);
    }
  }

  const db = localStore.getDb();
  return {
    pendingUsers: db.users.filter(u => u.status === 'pending').length,
    approvedMembers: db.users.filter(u => u.role === 'member' && u.status === 'approved').length,
    totalPosts: db.posts.length,
    pendingQna: db.qna.filter(q => q.status === 'pending').length,
    totalQna: db.qna.length,
    totalOrders: (db.orders || []).length,
    totalProducts: (db.products || []).length,
    dbType: 'Local JSON Store'
  };
}

// ========================================================
// 6. 안전몰 상품 (Products) & 주문 (Orders)
// ========================================================
async function getProducts({ category, targetType, search } = {}) {
  const db = localStore.getDb();
  let list = db.products || [];

  if (targetType && targetType !== 'all') {
    list = list.filter(p => p.targetType === targetType);
  }
  if (category) {
    list = list.filter(p => p.category === category);
  }
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(s) || (p.description && p.description.toLowerCase().includes(s)));
  }

  return list;
}

async function getProductById(id) {
  const db = localStore.getDb();
  return (db.products || []).find(p => p.id === Number(id)) || null;
}

async function createProduct({ name, category, targetType = 'life', price, stock = 100, certification, icon = '🛡️', badge, description }) {
  const db = localStore.getDb();
  if (!db.products) db.products = [];

  const newId = db.products.length > 0 ? Math.max(...db.products.map(p => p.id)) + 1 : 1;
  const newProduct = {
    id: newId,
    name,
    category,
    targetType,
    price: Number(price) || 0,
    stock: Number(stock) || 0,
    certification: certification || '공식 안전인증',
    icon: icon || '🛡️',
    badge: badge || (targetType === 'life' ? '생활안전' : '현장안전'),
    description: description || ''
  };

  db.products.push(newProduct);
  localStore.saveDb(db);
  return newProduct;
}

async function updateProduct(id, updateData) {
  const db = localStore.getDb();
  const prod = (db.products || []).find(p => p.id === Number(id));
  if (!prod) return null;

  if (updateData.name) prod.name = updateData.name;
  if (updateData.category) prod.category = updateData.category;
  if (updateData.targetType) prod.targetType = updateData.targetType;
  if (updateData.price !== undefined) prod.price = Number(updateData.price);
  if (updateData.stock !== undefined) prod.stock = Number(updateData.stock);
  if (updateData.certification) prod.certification = updateData.certification;
  if (updateData.icon) prod.icon = updateData.icon;
  if (updateData.badge !== undefined) prod.badge = updateData.badge;
  if (updateData.description !== undefined) prod.description = updateData.description;

  localStore.saveDb(db);
  return prod;
}

async function deleteProduct(id) {
  const db = localStore.getDb();
  if (!db.products) return false;
  const idx = db.products.findIndex(p => p.id === Number(id));
  if (idx !== -1) {
    db.products.splice(idx, 1);
    localStore.saveDb(db);
    return true;
  }
  return false;
}

// 주문 생성
async function createOrder({ buyerName, buyerPhone, buyerEmail, shippingAddress, items, totalAmount, paymentMethod }) {
  const db = localStore.getDb();
  if (!db.orders) db.orders = [];

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const orderNumber = `BEPMC-${dateStr}-${randNum}`;

  const newId = db.orders.length > 0 ? Math.max(...db.orders.map(o => o.id)) + 1 : 1;
  const newOrder = {
    id: newId,
    orderNumber,
    buyerName,
    buyerPhone,
    buyerEmail: buyerEmail || '',
    shippingAddress,
    items: items || [],
    totalAmount: Number(totalAmount) || 0,
    paymentMethod: paymentMethod || '신용카드',
    status: '결제완료', // '결제완료' | '배송준비' | '배송중' | '배송완료'
    createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
  };

  db.orders.push(newOrder);

  // 재고 차감 처리
  if (db.products && Array.isArray(items)) {
    items.forEach(item => {
      const prod = db.products.find(p => p.id === Number(item.productId));
      if (prod && prod.stock >= item.quantity) {
        prod.stock -= item.quantity;
      }
    });
  }

  localStore.saveDb(db);
  return newOrder;
}

async function getAllOrders() {
  const db = localStore.getDb();
  return (db.orders || []).slice().reverse();
}

async function getOrderByIdOrNumber(key) {
  const db = localStore.getDb();
  return (db.orders || []).find(o => o.orderNumber === key || o.id === Number(key)) || null;
}

async function updateOrderStatus(orderId, status) {
  const db = localStore.getDb();
  const order = (db.orders || []).find(o => o.id === Number(orderId));
  if (order) {
    order.status = status;
    localStore.saveDb(db);
    return order;
  }
  return null;
}

module.exports = {
  getSiteSettings,
  updateSiteSettings,
  findUserByUsername,
  findUserById,
  createUser,
  getAllUsers,
  updateUserStatus,
  deleteUser,
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  addComment,
  deleteComment,
  getQnaList,
  getQnaById,
  createQna,
  answerQna,
  deleteQna,
  getSummaryStats,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  createOrder,
  getAllOrders,
  getOrderByIdOrNumber,
  updateOrderStatus
};
