
// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
  // 平滑滚动效果
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      
      const targetId = this.getAttribute('href');
      const targetElement = document.querySelector(targetId);
      
      if (targetElement) {
        window.scrollTo({
          top: targetElement.offsetTop - 80, // 考虑导航栏高度
          behavior: 'smooth'
        });
      }
    });
  });
  
  // 欢迎页按钮动画效果（仅在欢迎页生效）
  const enterBtn = document.querySelector('.enter-btn');
  if (enterBtn) {
    // 添加按钮脉冲动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      .pulse {
        animation: pulse 1s ease-in-out;
      }
    `;
    document.head.appendChild(style);
    
    // 定时触发脉冲动画
    setInterval(() => {
      enterBtn.classList.add('pulse');
      setTimeout(() => {
        enterBtn.classList.remove('pulse');
      }, 1000);
    }, 3000);
  }
  
  // 元素进入视口时的动画配置
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };
  
  // 观察到元素进入视口时，添加动画（轻微上浮）
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.transform = 'translateY(-10px)'; // 进入时上浮
        observer.unobserve(entry.target); // 只执行一次动画
      }
    });
  }, observerOptions);
  
  // 为元素设置默认可见状态，并添加动画过渡效果
  document.querySelectorAll('.member-card, .course-category').forEach(el => {
    el.style.opacity = '1'; // 默认可见
    el.style.transform = 'translateY(0)'; // 默认位置
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease'; // 过渡动画
    observer.observe(el); // 监听元素是否进入视口
  });

  const addMemberBtn = document.getElementById('addMemberBtn');
  const addMemberModal = document.getElementById('addMemberModal');
  if (addMemberBtn && addMemberModal) {
    const openModal = () => {
      addMemberModal.style.display = 'flex';
    };
    const closeModal = () => {
      addMemberModal.style.display = 'none';
      document.getElementById('newMemberForm').reset();
    };
    addMemberBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal();
    });
    document.getElementById('closeAddMember').addEventListener('click', closeModal);
    document.getElementById('cancelAddMember').addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    });
    addMemberModal.addEventListener('click', (e) => {
      if (e.target === addMemberModal) closeModal();
    });
    document.getElementById('newMemberForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('nmName').value.trim();
      const role = document.getElementById('nmRole').value.trim();
      const intro = document.getElementById('nmIntro').value.trim();
      const email = document.getElementById('nmEmail').value.trim();
      const phone = document.getElementById('nmPhone').value.trim();
      const avatarUrlInput = document.getElementById('nmAvatarUrl').value.trim();
      const avatarFileInput = document.getElementById('nmAvatarFile');
      let avatarSrc = avatarUrlInput;
      if (!avatarSrc && avatarFileInput.files[0]) {
        avatarSrc = URL.createObjectURL(avatarFileInput.files[0]);
      }
      if (!name || !role || !intro || !email || !phone || !avatarSrc) {
        alert('请完整填写信息并提供头像图片（上传文件或URL）。');
        return;
      }
      const container = document.querySelector('.members-container');
      const addContainer = document.querySelector('.add-member-container');
      const newCard = document.createElement('div');
      newCard.className = 'member-card uniform-border extra-member';
      newCard.innerHTML = `
        <div class="member-avatar">
          <img src="${avatarSrc}" alt="${name}头像">
        </div>
        <div class="member-info">
          <h3 class="member-name">${name} <i class="fas fa-arrow-right"></i></h3>
          <p class="member-desc">${role}</p>
          <div class="member-contact">
            <p><i class="fas fa-envelope"></i> ${email}</p>
            <p><i class="fas fa-phone"></i> ${phone}</p>
          </div>
          <span class="click-hint">${intro}</span>
        </div>
      `;
      newCard.addEventListener('contextmenu', (evt) => {
        evt.preventDefault();
        const ok = confirm('确定要删除该成员吗？');
        if (ok) {
          newCard.remove();
        }
      });
      if (container && addContainer) {
        container.insertBefore(newCard, addContainer);
      } else {
        container.appendChild(newCard);
      }
      closeModal();
    });
  }
});	
