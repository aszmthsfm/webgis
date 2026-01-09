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

// 打印请求日志
app.use((req, res, next) => {
  console.log(`[请求] ${req.method} ${req.url}`);
  next();
});

// ================= 1. 静态文件托管 (修正路径) =================

// 修正：主页在 backend 的上一级，不是上一级再加 travelFootprint
// 你的结构是: travelFootprint/backend/server.js 和 travelFootprint/home.html
const mainSiteDir = path.join(__dirname, '../'); 
const mapAppDir = path.join(__dirname, '../frontend');

console.log('-------------------------------------------');
console.log('静态资源目录检查:');
console.log('👉 主页目录:', mainSiteDir);
console.log('👉 地图目录:', mapAppDir);
console.log('-------------------------------------------');

// 挂载主页
app.use('/', express.static(mainSiteDir));
// 挂载地图应用
app.use('/app', express.static(mapAppDir));

// ================= 2. 文件上传配置 =================
const uploadDir = path.join(mapAppDir, 'images');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, uploadDir); },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// ================= 3. 数据库配置 (关键！) =================
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  // ⚠️⚠️⚠️ 请确认这里！你之前代码里是 'travel_footprint' 还是 'webgis_db'？
  // 请打开 pgAdmin 确认左侧 Databases 列表里的名字
  database: 'travel_footprint', 
  
  // ⚠️⚠️⚠️ 请确认这里！必须是你安装 PostgreSQL 时设置的密码
  // 如果不知道，请尝试 '123456' 或 'postgres'
  password: '123456',   
  port: 5432,
});

// 🔥 新增：启动时立即测试数据库连接
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌❌❌ 致命错误：数据库连接失败！');
    console.error('错误信息:', err.message);
    console.error('请检查 server.js 里的 password 和 database 字段是否正确！');
  } else {
    console.log('✅✅✅ 数据库连接成功！一切正常！');
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
    console.error('获取用户失败:', err.message); // 打印详细错误
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
    
    // 修正图片路径，增加 /app 前缀
    const data = result.rows.map(row => {
        let img = row.image_url;
        // 如果图片路径不包含 http 也不包含 /app，手动加上
        if (img && !img.startsWith('/app') && !img.startsWith('http')) {
            // 比如 "images/123.jpg" -> "/app/images/123.jpg"
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

// 添加足迹
app.post('/api/footprints', upload.single('image'), async (req, res) => {
  const { userId, location, date, description, lat, lng } = req.body;
  const imageUrl = req.file ? `images/${req.file.filename}` : ''; 
  
  try {
    const result = await pool.query(
      `INSERT INTO footprints (user_id, location, latitude, longitude, date, description, image_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, location, lat, lng, date, description, imageUrl]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('添加足迹失败:', err.message);
    res.status(500).json({ error: 'Save failed' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 服务器运行中: http://localhost:${PORT}`);
});