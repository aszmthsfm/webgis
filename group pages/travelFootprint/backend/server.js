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

// ================= 核心：静态文件托管 (分路托管) =================

// 1. 定义文件夹路径 (根据你的截图结构)
// backend 往上一级是 group pages，再分别找 travelFootprint 和 frontend
const mainSiteDir = path.join(__dirname, '../travelFootprint'); 
const mapAppDir = path.join(__dirname, '../frontend');

console.log('主页目录:', mainSiteDir);
console.log('地图目录:', mapAppDir);

// 2. 挂载主页 (访问 / 时，去 travelFootprint 文件夹找)
app.use('/', express.static(mainSiteDir));

// 3. 挂载地图应用 (访问 /app 时，去 frontend 文件夹找)
// 这样 frontend 里的 style.css 访问路径就是 /app/style.css，不会冲突
app.use('/app', express.static(mapAppDir));

// ================= 文件上传配置 =================
// 图片统一存到 frontend/images 文件夹里
const uploadDir = path.join(mapAppDir, 'images');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); 
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// ================= 数据库配置 =================
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'webgis_db', // ⚠️请确认你本地数据库名
  password: '你的密码',   // ⚠️请填入密码
  port: 5432,
});

// ================= API 接口 =================

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
    
    // 修正图片路径：数据库如果存的是 "images/abc.jpg"
    // 前端访问时需要变成 "/app/images/abc.jpg"
    const data = result.rows.map(row => {
        let img = row.image_url;
        if (img && !img.startsWith('/app') && !img.startsWith('http')) {
            img = '/app/' + img.replace(/^\//, ''); // 加上 /app 前缀
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
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 添加足迹
app.post('/api/footprints', upload.single('image'), async (req, res) => {
  const { userId, location, date, description, lat, lng } = req.body;
  // 存入数据库时，保存相对路径 images/xxx.jpg
  const imageUrl = req.file ? `images/${req.file.filename}` : ''; 
  
  try {
    const result = await pool.query(
      `INSERT INTO footprints (user_id, location, latitude, longitude, date, description, image_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, location, lat, lng, date, description, imageUrl]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Save failed' });
  }
});

// 启动
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 本地服务器启动: http://localhost:${PORT}`);
  console.log(`👉 主页: http://localhost:${PORT}/home.html`);
  console.log(`👉 地图: http://localhost:${PORT}/app/travelFootprint.html`);
});