require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const app = express();

// 允许跨域请求
app.use(cors());
// 解析JSON请求体
app.use(express.json());
// 解析URL编码表单（兼容非multipart的简单表单提交）
app.use(express.urlencoded({ extended: true }));

// 调试中间件：记录所有请求
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// 提供静态文件服务
app.use('/images', express.static(path.join(__dirname, '../frontend/images')));

// 配置multer用于文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../frontend/images')); // 保存到frontend/images目录
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// PostgreSQL连接配置（从环境变量读取）
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        // 如果云端有地址，就用云端的（并且开启SSL）
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false,
        },
      }
    : {
        // 如果没有云端地址，就用本地的
        user: 'postgres',
        host: 'localhost',
        database: 'travel_footprint',
        password: '123456', // 这里的密码是你本地的，不用改
        port: 5432,
      }
);
// 测试数据库连接
pool.connect((err) => {
  if (err) {
    console.error('数据库连接失败:', err.stack);
    process.exit(1); // 如果数据库连接失败，退出程序
  } else {
    console.log('数据库连接成功');
  }
});

app.put('/api/footprints/:id', upload.single('image'), async (req, res) => {
  console.log('收到PUT /api/footprints/:id', req.params.id);
  const id = parseInt(req.params.id, 10);
  const fields = {};
  if (req.body.location) fields.location = req.body.location;
  if (req.body.date) fields.date = req.body.date;
  if (req.body.description !== undefined) fields.description = req.body.description;
  if (req.body.lat !== undefined) fields.latitude = parseFloat(req.body.lat);
  if (req.body.lng !== undefined) fields.longitude = parseFloat(req.body.lng);
  if (req.file) fields.image_url = `/images/${req.file.filename}`;
  const sets = [];
  const values = [];
  let idx = 1;
  Object.keys(fields).forEach(k => {
    sets.push(`${k} = $${idx++}`);
    values.push(fields[k]);
  });
  if (sets.length === 0) {
    return res.status(400).json({ error: '无更新字段' });
  }
  values.push(id);
  try {
    const result = await pool.query(
      `UPDATE footprints SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, user_id, location, latitude, longitude, date, description, image_url`
    , values);
    if (result.rows.length === 0) {
      console.log('未找到需要更新的足迹点', id);
      return res.status(404).json({ error: '未找到该足迹点' });
    }
    const row = result.rows[0];
    const updated = {
      id: row.id,
      userId: row.user_id,
      location: row.location,
      lat: row.latitude,
      lng: row.longitude,
      date: formatDateValue(row.date),
      description: row.description,
      image: row.image_url
    };
    res.json(updated);
  } catch (err) {
    console.error('更新足迹失败:', err);
    res.status(500).json({ error: '更新足迹失败' });
  }
});

app.delete('/api/footprints/:id', async (req, res) => {
  console.log('收到DELETE /api/footprints/:id', req.params.id);
  const id = parseInt(req.params.id, 10);
  try {
    const result = await pool.query('DELETE FROM footprints WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      console.log('未找到需要删除的足迹点', id);
      return res.status(404).json({ error: '未找到该足迹点' });
    }
    res.json({ success: true, id });
  } catch (err) {
    console.error('删除足迹失败:', err);
    res.status(500).json({ error: '删除足迹失败' });
  }
});
// 调试：检查路由注册
console.log('正在注册路由...');

// 日期格式化工具，兼容字符串或Date对象
function formatDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return String(value);
}

// API接口：获取所有用户
app.get('/api/users', async (req, res) => {
  console.log('收到GET /api/users请求');
  try {
    const result = await pool.query('SELECT id, name, avatar FROM users ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('获取用户失败:', err);
    res.status(500).json({ error: '获取用户数据失败' });
  }
});
// 新增用户
app.post('/api/users', upload.single('avatar'), async (req, res) => {
  const { name, avatarUrl } = req.body;
  if (!name) return res.status(400).json({ error: '姓名不能为空' });
  const avatar = req.file ? `/images/${req.file.filename}` : (avatarUrl || '');
  try {
    const result = await pool.query(
      'INSERT INTO users (name, avatar) VALUES ($1, $2) RETURNING id, name, avatar',
      [name, avatar]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('添加用户失败:', err);
    res.status(500).json({ error: '添加用户失败' });
  }
});
// 删除用户及其足迹
app.delete('/api/users/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: '无效用户ID' });
  try {
    await pool.query('DELETE FROM footprints WHERE user_id = $1', [id]);
    const delUser = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (delUser.rowCount === 0) return res.status(404).json({ error: '未找到该用户' });
    res.json({ success: true, id });
  } catch (err) {
    console.error('删除用户失败:', err);
    res.status(500).json({ error: '删除用户失败' });
  }
});

// API接口：获取指定用户的足迹
app.get('/api/footprints', async (req, res) => {
  console.log('收到GET /api/footprints请求');
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: '用户ID不能为空' });
  }
  
  try {
    const result = await pool.query(
      `SELECT id, user_id, location, latitude, longitude, date, description, image_url 
       FROM footprints 
       WHERE user_id = $1 
       ORDER BY date DESC`,
      [userId]
    );
    
    // 格式化返回数据
    const footprints = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      location: row.location,
      lat: row.latitude,
      lng: row.longitude,
      date: formatDateValue(row.date),
      description: row.description,
      image: row.image_url
    }));
    
    res.json(footprints);
  } catch (err) {
    console.error('获取足迹失败:', err);
    res.status(500).json({ error: '获取足迹数据失败' });
  }
});

// 获取所有成员的足迹（包含成员头像）
app.get('/api/footprints-all', async (req, res) => {
  console.log('收到GET /api/footprints-all请求');
  try {
    const result = await pool.query(
      `SELECT f.id, f.user_id, f.location, f.latitude, f.longitude, f.date, f.description, f.image_url,
              u.avatar
       FROM footprints f
       LEFT JOIN users u ON u.id = f.user_id
       ORDER BY f.user_id, f.date DESC`
    );
    const footprints = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      location: row.location,
      lat: row.latitude,
      lng: row.longitude,
      date: formatDateValue(row.date),
      description: row.description,
      image: row.image_url,
      avatar: row.avatar
    }));
    res.json(footprints);
  } catch (err) {
    console.error('获取全部足迹失败:', err);
    res.status(500).json({ error: '获取全部足迹失败' });
  }
});
// API接口：添加新足迹
app.post('/api/footprints', upload.single('image'), async (req, res) => {
  console.log('收到POST /api/footprints请求');
  console.log('Content-Type:', req.headers['content-type']);
  const { userId, location, date, description, lat, lng } = req.body;
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  const imageUrl = req.file ? `/images/${req.file.filename}` : '';
  console.log('解析后的数据:', { userId, location, date, description, lat: latitude, lng: longitude, imageUrl });
  if (!userId || !location || !date || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return res.status(400).json({ error: '必填字段不能为空或无效' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO footprints (user_id, location, latitude, longitude, date, description, image_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, user_id, location, latitude, longitude, date, description, image_url`,
      [parseInt(userId, 10), location, latitude, longitude, date, description || '', imageUrl]
    );
    const newFootprint = result.rows[0];
    const formattedFootprint = {
      id: newFootprint.id,
      userId: newFootprint.user_id,
      location: newFootprint.location,
      lat: newFootprint.latitude,
      lng: newFootprint.longitude,
      date: formatDateValue(newFootprint.date),
      description: newFootprint.description,
      image: newFootprint.image_url
    };
    res.status(201).json(formattedFootprint);
  } catch (err) {
    console.error('添加足迹失败:', err);
    res.status(500).json({ error: '添加足迹失败' });
  }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`后端服务器运行在 http://localhost:${PORT}`);
  console.log('路由注册完成');
});
