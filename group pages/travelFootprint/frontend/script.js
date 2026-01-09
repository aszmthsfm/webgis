// ==========================================
// 全局变量
// ==========================================
let map;
let currentUser = null;
let markers = [];
let polyline = null;
let users = [];
let footprints = []; 
let allFootprints = []; 
let isAddingFootprint = false;
let contextMenuEl = null;
let currentEditFootprint = null;
let allMode = false;

// 动画相关变量
let isAnimating = false;
let animationPolyline = null;
let animationMarker = null;
let animationFrameId = null; // 用于取消动画帧

// 工具栏状态与模式变量
let isToolbarOpen = false;
let currentMode = 'view'; // 'view' | 'edit' | 'delete'

// 省份映射数据
const PROVINCES = ['北京','天津','上海','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','海南','四川','贵州','云南','西藏','陕西','甘肃','青海','台湾','内蒙古','广西','宁夏','新疆','香港','澳门'];
const CITY_TO_PROVINCE = {
  '北京':'北京','上海':'上海','天津':'天津','重庆':'重庆',
  '武汉':'湖北','孝感':'湖北','宜昌':'湖北','黄冈':'湖北','荆州':'湖北','襄阳':'湖北','黄石':'湖北','十堰':'湖北','恩施':'湖北','咸宁':'湖北','鄂州':'湖北',
  '长沙':'湖南','株洲':'湖南','衡阳':'湖南','永州':'湖南','张家界':'湖南','岳阳':'湖南','郴州':'湖南','怀化':'湖南','湘潭':'湖南',
  '成都':'四川','峨眉山':'四川','绵阳':'四川','德阳':'四川','乐山':'四川',
  '洛阳':'河南','郑州':'河南','开封':'河南','新乡':'河南',
  '保定':'河北','石家庄':'河北','唐山':'河北',
  '杭州':'浙江','宁波':'浙江','温州':'浙江','嘉兴':'浙江',
  '南京':'江苏','苏州':'江苏','无锡':'江苏',
  '广州':'广东','深圳':'广东','珠海':'广东','佛山':'广东',
  '厦门':'福建','福州':'福建','武夷山':'福建',
  '南昌':'江西','九江':'江西','庐山':'江西',
  '青岛':'山东','济南':'山东',
  '西安':'陕西','太原':'山西','沈阳':'辽宁','长春':'吉林','哈尔滨':'黑龙江',
  '海口':'海南','贵阳':'贵州','昆明':'云南','拉萨':'西藏','兰州':'甘肃','西宁':'青海','呼和浩特':'内蒙古','南宁':'广西','银川':'宁夏','乌鲁木齐':'新疆','香港':'香港','澳门':'澳门','台北':'台湾'
};

// 后端API地址
const API_BASE_URL = 'http://localhost:3000/api';

// ==========================================
// 地图初始化与核心逻辑
// ==========================================
function initMap() {
  // 1. 初始化地图配置 (回归基础配置，去掉导致模糊的maxNativeZoom)
  map = L.map('map', { 
    zoomControl: false,
    zoomSnap: 0.1, 
    zoomDelta: 0.5,
    fadeAnimation: true,
    markerZoomAnimation: true
  }).setView([35.8617, 104.1954], 4);
  
  // 2. 添加底图
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    // 只保留这两个最稳健的防闪烁参数
    updateWhenZooming: false, 
    updateWhenIdle: true
  }).addTo(map);
  
  L.control.scale().addTo(map);

  // 鹰眼 (MiniMap) 初始化
  try {
    if (L.Control.MiniMap) {
      const miniMapLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        minZoom: 0,
        maxZoom: 13,
        attribution: ''
      });
      new L.Control.MiniMap(miniMapLayer, { 
        toggleDisplay: true, 
        minimized: false, 
        position: 'topright',
        width: 150,
        height: 150
      }).addTo(map);
    } else {
      console.warn('鹰眼插件未加载，跳过初始化。');
    }
  } catch (e) {
    console.error('鹰眼初始化失败:', e);
  }
  
  // 地图点击事件
  map.on('click', function(e) {
    if (isAddingFootprint) {
      document.getElementById('map').style.cursor = '';
      
      const modal = document.getElementById('addFootprintModal');
      const content = document.getElementById('addModalContent');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
      }, 10);
      
      document.getElementById('latInput').value = e.latlng.lat.toFixed(6);
      document.getElementById('lngInput').value = e.latlng.lng.toFixed(6);
      
      document.getElementById('locationInput').value = '';
      document.getElementById('dateInput').value = '';
      document.getElementById('descriptionInput').value = '';
      document.getElementById('imageInput').value = '';
      
      isAddingFootprint = false;
      resetMode(); 
    }
  });
  
  // 绑定左上角自定义控制按钮
  const zoomInBtn = document.getElementById('zoomIn');
  const zoomOutBtn = document.getElementById('zoomOut');
  const centerBtn = document.getElementById('centerMap');

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => map.zoomIn());
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => map.zoomOut());
  if (centerBtn) centerBtn.addEventListener('click', () => {
    if (markers.length > 0) {
      const group = new L.featureGroup(markers);
      map.fitBounds(group.getBounds(), { padding: [50, 50] });
    } else {
      map.setView([35.8617, 104.1954], 4);
    }
  });
  
  loadUsers();
}

// ==========================================
// 用户与数据加载
// ==========================================

async function loadUsers() {
  try {
    const userListEl = document.getElementById('userList');
    userListEl.innerHTML = '<div class="text-center py-4"><span class="loading"></span> 加载用户中...</div>';
    
    const response = await fetch(`${API_BASE_URL}/users`);
    if (!response.ok) throw new Error('网络响应异常');
    
    users = await response.json();
    renderUserList();

    const urlParams = new URLSearchParams(window.location.search);
    const userIdParam = urlParams.get('userId');
    if (userIdParam) {
      const targetUser = users.find(u => u.id == userIdParam);
      if (targetUser) selectUser(targetUser);
    }
  } catch (error) {
    console.error('加载用户失败:', error);
    document.getElementById('userList').innerHTML = `<div class="text-center text-red-500 py-4">加载用户失败</div>`;
  }
}

function renderUserList() {
  const userListEl = document.getElementById('userList');
  userListEl.innerHTML = '';
  
  if (users.length === 0) {
    userListEl.innerHTML = '<div class="text-center text-gray-500 py-4">暂无成员数据</div>';
    return;
  }
  
  const allEl = document.createElement('div');
  allEl.className = `flex items-center p-3 rounded-lg cursor-pointer hover:bg-gray-100 transition-custom ${allMode ? 'bg-primary/10 border-l-4 border-primary' : ''}`;
  allEl.innerHTML = `
    <div class="flex items-center justify-between w-full">
      <div class="flex items-center">
        <img src="https://picsum.photos/id/1011/200" alt="所有成员" class="w-10 h-10 rounded-full object-cover mr-3">
        <span class="font-medium">所有成员</span>
      </div>
      <button id="stats-all" class="px-2 py-1 text-gray-600 hover:text-primary"><i class="fa fa-ellipsis-h"></i></button>
    </div>
  `;
  allEl.addEventListener('click', () => selectAllMembers());
  userListEl.appendChild(allEl);
  document.getElementById('stats-all').addEventListener('click', (ev) => {
    ev.stopPropagation();
    showAllStats();
  });
  
  users.forEach(user => {
    const userEl = document.createElement('div');
    userEl.className = `flex items-center p-3 rounded-lg cursor-pointer hover:bg-gray-100 transition-custom ${currentUser?.id === user.id ? 'bg-primary/10 border-l-4 border-primary' : ''}`;
    userEl.innerHTML = `
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center">
          <img src="${user.avatar || 'https://picsum.photos/id/1000/200'}" alt="${user.name}" class="w-10 h-10 rounded-full object-cover mr-3">
          <span class="font-medium">${user.name}</span>
        </div>
        <button id="stats-${user.id}" class="px-2 py-1 text-gray-600 hover:text-primary"><i class="fa fa-ellipsis-h"></i></button>
      </div>
    `;
    userEl.addEventListener('click', () => selectUser(user));
    userEl.addEventListener('contextmenu', async (ev) => {
      ev.preventDefault();
      if(confirm('删除该成员及其所有足迹？')) {
        try {
          await deleteUser(user.id);
          if (currentUser?.id === user.id) {
            currentUser = null;
            footprints = [];
            allFootprints = [];
            clearMapMarkers();
            renderFootprints();
          }
          await loadUsers();
        } catch(e) { alert('删除失败'); }
      }
    });
    userListEl.appendChild(userEl);
    
    document.getElementById(`stats-${user.id}`).addEventListener('click', (ev) => {
      ev.stopPropagation();
      showUserStats(user);
    });
  });
}

async function selectAllMembers() {
  currentUser = null;
  allMode = true;
  renderUserList();
  clearMapMarkers();
  resetMode();
  
  const footprintInfoEl = document.getElementById('footprintInfo');
  footprintInfoEl.innerHTML = '<div class="text-center py-8"><span class="loading"></span> 加载全部足迹中...</div>';
  
  try {
    const response = await fetch(`${API_BASE_URL}/footprints-all`);
    if (!response.ok) throw new Error('网络响应异常');
    const data = await response.json();
    
    allFootprints = data;
    footprints = data;
    
    renderFootprints();
    addMarkersToMap();
  } catch (error) {
    console.error('加载失败:', error);
    footprintInfoEl.innerHTML = `<div class="text-center text-red-500 py-8">加载失败</div>`;
  }
}

async function selectUser(user) {
  console.log('正在选中用户:', user.name, 'ID:', user.id);
  currentUser = user;
  allMode = false;
  
  const searchInput = document.getElementById('searchInput');
  if(searchInput) searchInput.value = ''; 
  
  renderUserList();
  clearMapMarkers();
  resetMode();
  
  const footprintInfoEl = document.getElementById('footprintInfo');
  footprintInfoEl.innerHTML = '<div class="text-center py-8"><span class="loading"></span> 加载足迹中...</div>';
  
  try {
    if (!user.id) throw new Error("用户ID无效");
    
    const response = await fetch(`${API_BASE_URL}/footprints?userId=${user.id}`);
    if (!response.ok) throw new Error('后端接口报错');
    
    let data = await response.json();
    console.log('后端返回足迹数据:', data);
    
    if (!data || data.length === 0) {
      footprintInfoEl.innerHTML = `
        <div class="text-center text-gray-500 py-8">
          <i class="fa fa-map-o text-2xl mb-2"></i>
          <p>该成员还没有上传足迹哦</p>
        </div>
      `;
      return;
    }

    data = data.map(fp => ({ ...fp, avatar: currentUser.avatar }));
    
    allFootprints = data;
    footprints = data;
    
    renderFootprints();
    addMarkersToMap();
  } catch (error) {
    console.error('加载失败:', error);
    footprintInfoEl.innerHTML = `<div class="text-center text-red-500 py-8">加载失败: ${error.message}</div>`;
  }
}

function renderFootprints(listToRender = null) {
  const list = listToRender || footprints;
  const footprintInfoEl = document.getElementById('footprintInfo');
  footprintInfoEl.innerHTML = '';
  
  if (list.length === 0) {
    footprintInfoEl.innerHTML = `
      <div class="text-center text-gray-500 py-8">
        <i class="fa fa-map-o text-2xl mb-2"></i>
        <p>${listToRender ? '没有找到匹配的足迹' : '暂无足迹记录'}</p>
      </div>
    `;
    return;
  }
  
  const sorted = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  sorted.forEach(footprint => {
    const el = document.createElement('div');
    el.className = 'bg-gray-50 rounded-lg p-4 hover:shadow-md transition-custom cursor-pointer';
    el.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <h3 class="font-bold">${footprint.location}</h3>
        <span class="text-sm text-gray-500">${formatDate(footprint.date)}</span>
      </div>
      <p class="text-gray-700 text-sm line-clamp-2">${footprint.description || '无描述'}</p>
    `;
    el.addEventListener('click', () => {
      showFootprintDetail(footprint);
      map.setView([footprint.lat, footprint.lng], 12);
    });
    footprintInfoEl.appendChild(el);
  });
}

// ==========================================
// 地图标记与交互
// ==========================================

function addMarkersToMap() {
  if (footprints.length === 0) return;
  
  const coordinates = [];
  
  footprints.forEach(footprint => {
    if (isNaN(parseFloat(footprint.lat)) || isNaN(parseFloat(footprint.lng))) return;

    const customIcon = allMode
      ? L.icon({
          iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.7.1/dist/images/marker-icon.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34]
        })
      : L.icon({
          iconUrl: footprint.avatar || 'https://picsum.photos/id/1000/200',
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -28],
          className: 'rounded-full border border-white shadow'
        });
    
    const marker = L.marker([footprint.lat, footprint.lng], { icon: customIcon })
      .addTo(map)
      .bindPopup(`<b>${footprint.location}</b><br>${formatDate(footprint.date)}`);
      
    marker.on('click', () => {
      if (currentMode === 'delete') {
        if (confirm(`确定要删除位于 "${footprint.location}" 的足迹吗？`)) {
          deleteFootprint(footprint.id);
        }
      } else if (currentMode === 'edit') {
        openEditFootprintModal(footprint);
        resetMode();
      } else {
        showFootprintDetail(footprint);
      }
    });
    
    marker.on('contextmenu', (e) => showMarkerContextMenu(e, marker, footprint));
    
    markers.push(marker);
    coordinates.push([footprint.lat, footprint.lng]);
  });
  
  if (!allMode && coordinates.length > 1) {
    polyline = L.polyline(coordinates, {
      color: '#3B82F6', weight: 3, opacity: 0.7, dashArray: '10, 10', lineJoin: 'round'
    }).addTo(map);
  }
  
  if (allMode) {
    const byUser = {};
    footprints.forEach(fp => {
      if (!byUser[fp.userId]) byUser[fp.userId] = [];
      byUser[fp.userId].push(fp);
    });
    Object.values(byUser).forEach(list => {
      const sorted = list.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      const coords = sorted.map(fp => [fp.lat, fp.lng]).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
      if (coords.length > 1) {
        allPolylines.push(L.polyline(coords, { color: '#3B82F6', weight: 2, opacity: 0.7 }).addTo(map));
      }
    });
  }
  
  if (markers.length > 1) {
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds(), { padding: [50, 50] });
  } else if (coordinates.length === 1) {
    map.setView(coordinates[0], 10);
  }
}

function clearMapMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  if (polyline) { map.removeLayer(polyline); polyline = null; }
  stopRouteAnimation();
}

// ==========================================
// 辅助功能：模式管理与搜索
// ==========================================

function resetMode() {
  currentMode = 'view';
  document.getElementById('map').style.cursor = '';
  document.getElementById('btnDelete')?.classList.remove('btn-active-red');
  document.getElementById('btnEdit')?.classList.remove('btn-active-orange');
  document.getElementById('btnAdd')?.classList.remove('btn-active');
  map.dragging.enable();
}

// ==========================================
// 事件绑定 (DOMContentLoaded)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('closeStats').addEventListener('click', closeStatsModal);
  document.getElementById('cancelAdd').addEventListener('click', closeAddFootprintModal);
  document.getElementById('addFootprintForm').addEventListener('submit', submitAddFootprint);
  document.getElementById('cancelEdit').addEventListener('click', closeEditFootprintModal);
  document.getElementById('editFootprintForm').addEventListener('submit', submitEditFootprint);
  
  const membersLink = document.getElementById('members-link');
  const membersDropdown = document.getElementById('members-dropdown');
  membersLink.addEventListener('click', (e) => {
    e.preventDefault();
    membersDropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!membersLink.contains(e.target) && !membersDropdown.contains(e.target)) {
      membersDropdown.classList.add('hidden');
    }
  });

  document.getElementById('addUserBtn').addEventListener('click', () => {
    const modal = document.getElementById('addUserModal');
    const content = document.getElementById('addUserModalContent');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
      content.classList.remove('scale-95', 'opacity-0');
      content.classList.add('scale-100', 'opacity-100');
    }, 10);
  });
  document.getElementById('cancelAddUser').addEventListener('click', () => {
    const modal = document.getElementById('addUserModal');
    modal.classList.add('hidden');
    document.getElementById('addUserForm').reset();
  });
  document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('userNameInput').value.trim();
    const avatarUrl = document.getElementById('avatarUrlInput').value.trim();
    const avatarFile = document.getElementById('avatarFileInput').files[0];
    if (!name) return alert('请输入姓名');
    try {
      await createUser(name, avatarFile, avatarUrl);
      await loadUsers();
      document.getElementById('cancelAddUser').click();
    } catch(err) { alert('创建失败'); }
  });

  document.getElementById('animateRoute').addEventListener('click', () => {
    isAnimating ? stopRouteAnimation() : startRouteAnimation();
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (isAnimating) stopRouteAnimation();
    }
    if (e.key === 'Escape') {
      resetMode();
      closeModal();
      closeAddFootprintModal();
      closeEditFootprintModal();
    }
  });
  
  const toggleBtn = document.getElementById('toolbarToggle');
  const toolbarIcon = document.getElementById('toolbarIcon');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isToolbarOpen = !isToolbarOpen;
      const container = toggleBtn.parentElement;
      if (isToolbarOpen) {
        container.classList.add('toolbar-expanded');
        toolbarIcon.classList.remove('fa-bars');
        toolbarIcon.classList.add('fa-times');
        toolbarIcon.style.transform = 'rotate(90deg)';
      } else {
        container.classList.remove('toolbar-expanded');
        toolbarIcon.classList.remove('fa-times');
        toolbarIcon.classList.add('fa-bars');
        toolbarIcon.style.transform = 'rotate(0deg)';
        resetMode(); 
      }
    });
  }

  const btnAdd = document.getElementById('btnAdd');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      if (!currentUser) return alert('请先选择一位成员');
      resetMode();
      openAddFootprintModal();
    });
  }

  const btnDelete = document.getElementById('btnDelete');
  if (btnDelete) {
    btnDelete.addEventListener('click', () => {
      if (currentMode === 'delete') {
        resetMode();
      } else {
        resetMode();
        currentMode = 'delete';
        btnDelete.classList.add('btn-active-red');
        document.getElementById('map').style.cursor = 'not-allowed';
        alert('进入删除模式：请点击地图上的标记点进行删除');
      }
    });
  }

  const btnEdit = document.getElementById('btnEdit');
  if (btnEdit) {
    btnEdit.addEventListener('click', () => {
      if (currentMode === 'edit') {
        resetMode();
      } else {
        resetMode();
        currentMode = 'edit';
        btnEdit.classList.add('btn-active-orange');
        document.getElementById('map').style.cursor = 'context-menu';
        alert('进入编辑模式：请点击地图上的标记点进行修改');
      }
    });
  }

  const btnQuery = document.getElementById('btnQuery');
  const searchInput = document.getElementById('searchInput');
  const searchIcon = document.getElementById('searchIcon');
  if (btnQuery && searchInput) {
    btnQuery.addEventListener('click', () => {
      resetMode();
      if (searchInput.classList.contains('hidden')) {
        searchInput.classList.remove('hidden');
        searchIcon.classList.remove('hidden');
        searchInput.focus();
        btnQuery.classList.add('btn-active');
      } else {
        searchInput.classList.add('hidden');
        searchIcon.classList.add('hidden');
        btnQuery.classList.remove('btn-active');
        searchInput.value = '';
        footprints = [...allFootprints];
        renderFootprints();
      }
    });

    searchInput.addEventListener('input', (e) => {
      const keyword = e.target.value.toLowerCase().trim();
      if (!keyword) {
        footprints = [...allFootprints];
      } else {
        footprints = allFootprints.filter(fp => 
          (fp.location && fp.location.toLowerCase().includes(keyword)) ||
          (fp.description && fp.description.toLowerCase().includes(keyword)) ||
          (fp.date && fp.date.includes(keyword))
        );
      }
      renderFootprints();
    });
  }
});

// ==========================================
// 业务逻辑函数 (API与具体操作)
// ==========================================

async function createUser(name, avatarFile, avatarUrl) {
  const fd = new FormData();
  fd.append('name', name);
  if (avatarFile) fd.append('avatar', avatarFile);
  if (avatarUrl) fd.append('avatarUrl', avatarUrl);
  const resp = await fetch(`${API_BASE_URL}/users`, { method: 'POST', body: fd });
  if (!resp.ok) throw new Error('网络响应异常');
  return await resp.json();
}

async function deleteUser(id) {
  const resp = await fetch(`${API_BASE_URL}/users/${id}`, { method: 'DELETE' });
  if (!resp.ok) throw new Error('网络响应异常');
  return true;
}

function openAddFootprintModal() {
  if (!currentUser) { alert('请先选择一位成员'); return; }
  isAddingFootprint = true;
  alert('请在地图上点击位置以添加足迹');
  document.getElementById('map').style.cursor = 'crosshair';
}

function closeAddFootprintModal() {
  isAddingFootprint = false;
  document.getElementById('map').style.cursor = '';
  const content = document.getElementById('addModalContent');
  content.classList.remove('scale-100', 'opacity-100');
  content.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    document.getElementById('addFootprintModal').classList.remove('flex');
    document.getElementById('addFootprintModal').classList.add('hidden');
  }, 300);
}

async function submitAddFootprint(e) {
  e.preventDefault();
  const location = document.getElementById('locationInput').value;
  const date = document.getElementById('dateInput').value;
  const description = document.getElementById('descriptionInput').value;
  const lat = parseFloat(document.getElementById('latInput').value);
  const lng = parseFloat(document.getElementById('lngInput').value);
  const imageFile = document.getElementById('imageInput').files[0];
  
  if (!location || !date || isNaN(lat)) { alert('请填写完整并在地图选点'); return; }
  
  try {
    const fd = new FormData();
    fd.append('userId', currentUser.id);
    fd.append('location', location);
    fd.append('date', date);
    fd.append('description', description || '');
    fd.append('lat', lat);
    fd.append('lng', lng);
    if (imageFile) fd.append('image', imageFile);
    
    const res = await fetch(`${API_BASE_URL}/footprints`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Failed');
    
    const newFp = await res.json();
    newFp.avatar = currentUser.avatar; 
    
    allFootprints.push(newFp);
    footprints = [...allFootprints];
    
    renderFootprints();
    addMarkersToMap();
    closeAddFootprintModal();
    alert('添加成功');
  } catch(e) { alert('添加失败: ' + e.message); }
}

function openEditFootprintModal(footprint) {
  currentEditFootprint = footprint;
  document.getElementById('editId').value = footprint.id;
  document.getElementById('editLocation').value = footprint.location || '';
  document.getElementById('editDate').value = footprint.date || '';
  document.getElementById('editDescription').value = footprint.description || '';
  
  const modal = document.getElementById('editFootprintModal');
  const content = document.getElementById('editModalContent');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => {
    content.classList.remove('scale-95', 'opacity-0');
    content.classList.add('scale-100', 'opacity-100');
  }, 10);
}

function closeEditFootprintModal() {
  const modal = document.getElementById('editFootprintModal');
  const content = document.getElementById('editModalContent');
  content.classList.remove('scale-100', 'opacity-100');
  content.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
    document.getElementById('editImage').value = '';
    currentEditFootprint = null;
  }, 300);
}

async function submitEditFootprint(e) {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const location = document.getElementById('editLocation').value;
  const date = document.getElementById('editDate').value;
  const description = document.getElementById('editDescription').value;
  const imageFile = document.getElementById('editImage').files[0];
  
  try {
    const fd = new FormData();
    fd.append('location', location);
    fd.append('date', date);
    fd.append('description', description || '');
    if (imageFile) fd.append('image', imageFile);
    
    const res = await fetch(`${API_BASE_URL}/footprints/${id}`, { method: 'PUT', body: fd });
    if (!res.ok) throw new Error('Failed');
    const updated = await res.json();
    if (currentEditFootprint) updated.avatar = currentEditFootprint.avatar;
    
    allFootprints = allFootprints.map(f => f.id == id ? updated : f);
    footprints = footprints.map(f => f.id == id ? updated : f);
    
    clearMapMarkers();
    renderFootprints();
    addMarkersToMap();
    closeEditFootprintModal();
    alert('修改成功');
  } catch(e) { alert('修改失败'); }
}

async function deleteFootprint(id) {
  try {
    const res = await fetch(`${API_BASE_URL}/footprints/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed');
    
    allFootprints = allFootprints.filter(f => f.id !== id);
    footprints = footprints.filter(f => f.id !== id);
    
    clearMapMarkers();
    renderFootprints();
    addMarkersToMap();
    alert('已删除');
  } catch(e) { alert('删除失败'); }
}

function showFootprintDetail(footprint) {
  const modal = document.getElementById('footprintModal');
  const modalContent = document.getElementById('modalContent');
  
  document.getElementById('modalTitle').textContent = footprint.location;
  document.getElementById('modalDate').textContent = formatDate(footprint.date);
  document.getElementById('modalDescription').textContent = footprint.description || '无详细描述';
  document.getElementById('modalCoordinates').textContent = `${footprint.lat}, ${footprint.lng}`;
  document.getElementById('modalImage').src = footprint.image || 'https://picsum.photos/id/1015/800/500';
  
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => {
    modalContent.classList.remove('scale-95', 'opacity-0');
    modalContent.classList.add('scale-100', 'opacity-100');
  }, 10);
}

function closeModal() {
  const modal = document.getElementById('footprintModal');
  const modalContent = document.getElementById('modalContent');
  modalContent.classList.remove('scale-100', 'opacity-100');
  modalContent.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  }, 300);
}

// ==========================================
// 动画与统计工具 (核心修改：固定缩放级别)
// ==========================================

// 生成两点之间的贝塞尔曲线路径点 (不计算Zoom了)
function generateCurvePath(start, end, numPoints = 150) { 
  const points = [];
  const startLat = parseFloat(start.lat);
  const startLng = parseFloat(start.lng);
  const endLat = parseFloat(end.lat);
  const endLng = parseFloat(end.lng);

  // 贝塞尔曲线控制点
  const curveFactor = 0.2; 
  const midLat = (startLat + endLat) / 2;
  const midLng = (startLng + endLng) / 2;
  const offsetLat = (endLng - startLng) * curveFactor;
  const offsetLng = -(endLat - startLat) * curveFactor;
  const controlLat = midLat + offsetLat;
  const controlLng = midLng + offsetLng;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    
    // 坐标插值 (二次贝塞尔)
    const lat = (1 - t) * (1 - t) * startLat + 2 * (1 - t) * t * controlLat + t * t * endLat;
    const lng = (1 - t) * (1 - t) * startLng + 2 * (1 - t) * t * controlLng + t * t * endLng;
    
    points.push({ lat, lng });
  }
  return points;
}

// 修改后的 startRouteAnimation 函数 (支持头像动画 + 固定Zoom)
function startRouteAnimation() {
  if (allMode) { alert('请先选择单成员'); return; }
  
  // 1. 数据清洗
  const validFootprints = footprints.filter(fp => {
    const lat = parseFloat(fp.lat);
    const lng = parseFloat(fp.lng);
    return !isNaN(lat) && !isNaN(lng) && lat !== null && lng !== null;
  });

  if (validFootprints.length < 2) { alert('有效足迹点不足(少于2个)，无法播放'); return; }
  
  // 先停止可能正在运行的动画
  stopRouteAnimation();
  
  // 暂时隐藏蓝色的静态足迹和连线
  markers.forEach(m => m.remove()); 
  if (polyline) polyline.remove();
  
  const sorted = validFootprints.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // 计算全局固定Zoom
  const bounds = L.latLngBounds(sorted.map(fp => [fp.lat, fp.lng]));
  map.fitBounds(bounds, { padding: [50, 50] });
  const fixedZoom = map.getZoom(); 

  const targetFPS = 60;  
  const pointsPerSegment = 150; 

  // 生成路径点
  let fullPathPoints = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    const curve = generateCurvePath(start, end, pointsPerSegment);
    if (i > 0) curve.shift(); 
    fullPathPoints = fullPathPoints.concat(curve);
  }

  if (fullPathPoints.length === 0) return;

  // 2. 初始化地图元素
  // 红线
  animationPolyline = L.polyline([], { 
    color: '#EF4444', 
    weight: 4, 
    opacity: 0.9,
    lineCap: 'round'
  }).addTo(map);

  // === 【核心修改：使用用户头像作为移动图标】 ===
  // 获取当前用户的头像，如果没头像就用默认图
  const avatarUrl = currentUser?.avatar || 'https://picsum.photos/id/1000/200';
  
  // 创建一个自定义的 DivIcon，内容是圆形头像
  const avatarIcon = L.divIcon({
    className: 'custom-avatar-marker', // 这是一个自定义类名，你可以不用管CSS，直接写内联样式
    html: `<img src="${avatarUrl}" style="width: 40px; height: 40px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); object-fit: cover;">`,
    iconSize: [40, 40], // 图标大小
    iconAnchor: [20, 20] // 锚点设在中心 (40/2 = 20)
  });

  animationMarker = L.marker([fullPathPoints[0].lat, fullPathPoints[0].lng], {
    icon: avatarIcon,
    zIndexOffset: 1000 
  }).addTo(map);
  // ===========================================

  let currentStep = 0;
  isAnimating = true;
  document.getElementById('animateRoute').classList.add('bg-accent', 'text-white');

  let lastTime = 0;
  const interval = 1000 / targetFPS; 

  function animate(timestamp) {
    if (!isAnimating) return; 

    if (currentStep >= fullPathPoints.length) {
      stopRouteAnimation(); 
      return;
    }

    const elapsed = timestamp - lastTime;
    
    if (elapsed > interval) {
        lastTime = timestamp - (elapsed % interval);

        const pointData = fullPathPoints[currentStep];
        const latlng = [pointData.lat, pointData.lng];
        
        animationPolyline.addLatLng(latlng);
        animationMarker.setLatLng(latlng);
        
        map.setView(latlng, fixedZoom, { animate: false });

        currentStep++;
    }

    animationFrameId = requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
function stopRouteAnimation() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  // 清理红色动画元素
  if (animationPolyline) { map.removeLayer(animationPolyline); animationPolyline = null; }
  if (animationMarker) { map.removeLayer(animationMarker); animationMarker = null; }
  
  isAnimating = false;
  document.getElementById('animateRoute')?.classList.remove('bg-accent', 'text-white');

  // === 【新增】播放结束/停止：恢复显示蓝色的静态足迹和连线 ===
  // 注意：markers 是全局变量，如果在此期间切换了用户，markers 已经被清空，这里就不会错误地恢复旧数据
  if (markers && markers.length > 0) {
    markers.forEach(m => m.addTo(map));
  }
  if (polyline) {
    polyline.addTo(map);
  }
  // =========================================================
}

function mapToProvince(text) {
  const t = String(text || '').toLowerCase();
  for (const prov of PROVINCES) {
    if (t.includes(prov.toLowerCase())) return prov;
  }
  for (const city in CITY_TO_PROVINCE) {
    if (t.includes(city.toLowerCase())) return CITY_TO_PROVINCE[city];
  }
  return null;
}

function computeProvinceStats(list) {
  const set = new Set();
  list.forEach(fp => {
    const p = mapToProvince(fp.location);
    if (p) set.add(p);
  });
  const provinces = Array.from(set).sort();
  const count = provinces.length;
  const percent = Math.round((count / 34) * 1000) / 10;
  return { provinces, count, percent };
}

function openStatsModal(title, provinces, count, percent) {
  const modal = document.getElementById('statsModal');
  const content = document.getElementById('statsModalContent');
  document.getElementById('statsTitle').textContent = title;
  document.getElementById('statsSummary').textContent = `覆盖省份：${count} 个，覆盖率：${percent}%`;
  document.getElementById('statsList').innerHTML = provinces.length ? provinces.map(p => `<div>• ${p}</div>`).join('') : '<div class="text-gray-500">未识别到省份</div>';
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => {
    content.classList.remove('scale-95', 'opacity-0');
    content.classList.add('scale-100', 'opacity-100');
  }, 10);
}

function closeStatsModal() {
  const modal = document.getElementById('statsModal');
  const content = document.getElementById('statsModalContent');
  content.classList.remove('scale-100', 'opacity-100');
  content.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  }, 300);
}

async function showUserStats(user) {
  let list = allFootprints; 
  if (!list.length || currentUser?.id !== user.id) {
    const resp = await fetch(`${API_BASE_URL}/footprints?userId=${user.id}`);
    list = await resp.json();
  }
  const { provinces, count, percent } = computeProvinceStats(list);
  openStatsModal(`${user.name}的足迹统计`, provinces, count, percent);
}

async function showAllStats() {
  const resp = await fetch(`${API_BASE_URL}/footprints-all`);
  const list = await resp.json();
  const { provinces, count, percent } = computeProvinceStats(list);
  openStatsModal('所有成员足迹统计', provinces, count, percent);
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function showMarkerContextMenu(e, marker, footprint) {
  if (contextMenuEl) { contextMenuEl.remove(); contextMenuEl = null; }
  
  const menu = document.createElement('div');
  menu.className = 'fixed z-50 bg-white shadow-lg rounded-md border text-sm py-1';
  menu.style.left = `${e.originalEvent.clientX}px`;
  menu.style.top = `${e.originalEvent.clientY}px`;
  
  menu.innerHTML = `
    <div class="px-4 py-2 hover:bg-gray-100 cursor-pointer" id="ctx-edit"><i class="fa fa-pencil mr-2"></i>编辑</div>
    <div class="px-4 py-2 hover:bg-gray-100 cursor-pointer text-red-600" id="ctx-delete"><i class="fa fa-trash mr-2"></i>删除</div>
  `;
  document.body.appendChild(menu);
  contextMenuEl = menu;
  
  document.addEventListener('click', () => {
    if (contextMenuEl) { contextMenuEl.remove(); contextMenuEl = null; }
  }, { once: true });
  
  document.getElementById('ctx-delete').addEventListener('click', () => {
    if(confirm('删除此足迹？')) deleteFootprint(footprint.id);
  });
  document.getElementById('ctx-edit').addEventListener('click', () => {
    openEditFootprintModal(footprint);
  });
}