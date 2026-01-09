require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// =================配置开始=================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 打印请求日志，方便调试
app.use((req, res, next) => {
  console.log(`[请求] ${req.method} ${req.url}`);
  next();
});

// ================= 1. 静态文件托管 (核心修复) =================

// 🔍 路径修正说明：
// __dirname 是当前 server.js 所在的目录 (backend)
// ../  是上一级 (travelFootprint)
// ../../ 是再上一级 (group pages)，也就是 home.html 所在的位置

const mainSiteDir = path.join(__dirname, '../../');  // 👈 关键修改：往上找两层
const mapAppDir = path.join(__dirname, '../frontend'); // 地图应用在隔壁 frontend 文件夹

console.log('-------------------------------------------');
console.log('📂 静态资源目录检查:');
console.log('🏠 主页目录 (Main):', mainSiteDir);
console.log('🗺️ 地图目录 (App): ', mapAppDir);
console.log('-------------------------------------------');

// 1. 挂载主页 (访问 http://localhost:3000/ 时)
// 这样 server 就能找到 ../../ 下面的 home.html, member1.html, member images 等
app.use('/', express.static(mainSiteDir));

// 2. 挂载地图应用 (访问 http://localhost:3000/app/ 时)
app.use('/app', express.static(mapAppDir));


// ================= 2. 文件上传配置 =================
// 图片统一存到 frontend/images 文件夹里
const uploadDir = path.join(mapAppDir, 'images');
// 如果文件夹不存在，自动创建
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); 
  },
  filename: (req, file, cb) => {
    // 防止文件名重复或中文乱码，使用时间戳命名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });


// ================= 3. 数据库配置 =================
// 关键修改：优先使用环境变量 DATABASE_URL (云端)，没有才用 localhost (本地)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL 
    ? process.env.DATABASE_URL 
    : `postgresql://postgres:你的本地密码@localhost:5432/travel_footprint`,
  
  // 云端数据库通常需要 SSL 连接，本地不需要
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// 启动时立即测试数据库连接
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ 数据库连接失败:', err.message);
  } else {
    console.log('✅ 数据库连接成功');
    release(); // 释放连接
  }
});
// 启动时立即测试数据库连接
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ 数据库连接失败！请检查密码或数据库名。');
    console.error('错误详情:', err.message);
  } else {
    console.log('✅ 数据库连接成功！');
    release();
  }
});


// ================= 4. API 接口 =================

// 获取所有用户
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('获取用户失败:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// 获取足迹
app.get('/api/footprints', async (req, res) => {
  const { userId } = req.query;
  try {
    let query = 'SELECT * FROM footprints';
    let params = [];
    if (userId) {
      query += ' WHERE user_id = $1';
      params.push(userId);
    }
    query += ' ORDER BY date DESC';
    
    const result = await pool.query(query, params);
    
    // 修正图片路径，增加 /app 前缀，确保前端能访问到
    const data = result.rows.map(row => {
        let img = row.image_url;
        // 如果图片路径不包含 http 也不包含 /app，手动加上
        if (img && !img.startsWith('/app') && !img.startsWith('http')) {
            // 例如 "images/123.jpg" -> "/app/images/123.jpg"
            img = '/app/' + img.replace(/^\//, ''); 
        }
        return {
            ...row,
            lat: parseFloat(row.latitude),
            lng: parseFloat(row.longitude),
            image: img
        };
    });
    res.json(data);
  } catch (err) {
    console.error('获取足迹失败:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// 获取所有足迹 (用于全览模式)
app.get('/api/footprints-all', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, u.avatar 
      FROM footprints f 
      LEFT JOIN users u ON f.user_id = u.id 
      ORDER BY f.date DESC
    `);
    
    const data = result.rows.map(row => {
        let img = row.image_url;
        if (img && !img.startsWith('/app') && !img.startsWith('http')) {
            img = '/app/' + img.replace(/^\//, ''); 
        }
        return {
            ...row,
            lat: parseFloat(row.latitude),
            lng: parseFloat(row.longitude),
            image: img,
            avatar: row.avatar
        };
    });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取全部足迹失败' });
  }
});

// 添加足迹
app.post('/api/footprints', upload.single('image'), async (req, res) => {
  const { userId, location, date, description, lat, lng } = req.body;
  // 存入数据库时只存相对路径，例如 images/xxx.jpg
  const imageUrl = req.file ? `images/${req.file.filename}` : ''; 
  
  try {
    const result = await pool.query(
      `INSERT INTO footprints (user_id, location, latitude, longitude, date, description, image_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, location, lat, lng, date, description, imageUrl]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('保存失败:', err.message);
    res.status(500).json({ error: 'Save failed' });
  }
});

// 删除足迹
app.delete('/api/footprints/:id', async (req, res) => {
    const id = req.params.id;
    try {
        await pool.query('DELETE FROM footprints WHERE id = $1', [id]);
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        console.error('删除失败:', err);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// 修改足迹
app.put('/api/footprints/:id', upload.single('image'), async (req, res) => {
  const id = req.params.id;
  const { location, date, description } = req.body;
  
  try {
    let query, params;
    if (req.file) {
      // 如果上传了新图片
      const imageUrl = `images/${req.file.filename}`;
      query = `UPDATE footprints SET location=$1, date=$2, description=$3, image_url=$4 WHERE id=$5 RETURNING *`;
      params = [location, date, description, imageUrl, id];
    } else {
      // 如果没换图片，就不改 image_url 字段
      query = `UPDATE footprints SET location=$1, date=$2, description=$3 WHERE id=$4 RETURNING *`;
      params = [location, date, description, id];
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('更新失败:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// ================= 5. 启动服务 =================
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 本地服务器已启动: http://localhost:${PORT}`);
  console.log(`👉 主页入口: http://localhost:${PORT}/home.html`);
  console.log(`👉 地图入口: http://localhost:${PORT}/app/travelFootprint.html`);
});