import { supabase } from '../app.js';

export class ReelsViewer {
  constructor(container, currentUser) {
    this.container = container;
    this.currentUser = currentUser;
    this.reels = [];
    this.currentIndex = 0;
    this.touchStartY = 0;
    this.touchEndY = 0;
    this.isDragging = false;
    this.init();
  }

  async init() {
    this.renderLayout();
    await this.fetchReels();
    if (this.reels.length > 0) {
      this.renderReelsQueue();
      this.setupObserversAndGestureHandlers();
    } else {
      this.renderEmptyState();
    }
  }

  renderLayout() {
    this.container.innerHTML = `
      <div id="reels-viewport" style="
        position: relative;
        width: 100%;
        height: calc(100vh - 80px);
        max-width: 480px;
        margin: 0 auto;
        overflow-y: scroll;
        scroll-snap-type: y mandatory;
        scrollbar-width: none;
        -ms-overflow-style: none;
        background: #000;
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-card);
      ">
      </div>
      <style>
        #reels-viewport::-webkit-scrollbar { display: none; }
        @keyframes rotateAudioDisk {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes marqueeText {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .audio-disk-spinning {
          animation: rotateAudioDisk 4s linear infinite;
        }
        .reel-heart-anim {
          animation: heartPulse 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes heartPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.4); }
          100% { transform: scale(1); }
        }
      </style>
    `;
  }

  async fetchReels() {
    // Query posts flagged as reels or containing video media
    const { data, error } = await supabase
      .from('posts')
      .select(`
        id,
        caption,
        location,
        created_at,
        is_reel,
        profiles (id, username, full_name, avatar_url),
        post_media (id, media_url, media_type),
        likes (user_id),
        saved_posts (user_id)
      `)
      .eq('is_reel', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading reels:', error);
      return;
    }

    // Filter to ensure media exists
    this.reels = (data || []).filter(post => post.post_media && post.post_media.length > 0);
  }

  renderEmptyState() {
    const viewport = this.container.querySelector('#reels-viewport');
    viewport.innerHTML = `
      <div class="glass-panel" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 40px;
        text-align: center;
      ">
        <i class="fa-solid fa-clapperboard" style="font-size: 48px; color: var(--accent-cyan); margin-bottom: 16px;"></i>
        <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">No Reels Yet</h3>
        <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 20px;">Be the first creator to share a short video vibe on VIBRA!</p>
        <button class="btn-primary" data-nav="create">
          <i class="fa-solid fa-plus"></i> Create Reel
        </button>
      </div>
    `;
  }

  renderReelsQueue() {
    const viewport = this.container.querySelector('#reels-viewport');
    viewport.innerHTML = '';

    this.reels.forEach((reel, index) => {
      const isLiked = reel.likes?.some(l => l.user_id === this.currentUser?.id);
      const isSaved = reel.saved_posts?.some(s => s.user_id === this.currentUser?.id);
      const videoMedia = reel.post_media.find(m => m.media_type === 'video') || reel.post_media[0];

      const reelCard = document.createElement('div');
      reelCard.className = 'reel-slide';
      reelCard.dataset.index = index;
      reelCard.dataset.postId = reel.id;
      reelCard.style.cssText = `
        position: relative;
        width: 100%;
        height: 100%;
        scroll-snap-align: start;
        scroll-snap-stop: always;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #000;
      `;

      reelCard.innerHTML = `
        <!-- Main Video Element -->
        <video 
          src="${videoMedia.media_url}" 
          loop 
          playsinline 
          preload="metadata"
          style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
        ></video>

        <!-- Play/Pause Touch Feedback Indicator -->
        <div class="play-pause-overlay" style="
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
        ">
          <div style="
            width: 70px; height: 70px;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(10px);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <i class="fa-solid fa-play" style="font-size: 28px; color: #fff; margin-left: 4px;"></i>
          </div>
        </div>

        <!-- Gradient Dark Overlay for Metadata Contrast -->
        <div style="
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 30%, transparent 60%);
          pointer-events: none;
        "></div>

        <!-- Creator & Audio Info Overlay (Bottom Left) -->
        <div style="
          position: absolute;
          bottom: 24px;
          left: 16px;
          right: 80px;
          z-index: 10;
          display: flex;
          flex-direction: column;
          gap: 10px;
        ">
          <!-- User Profile & Follow Button -->
          <div style="display: flex; align-items: center; gap: 10px;">
            <img 
              src="${reel.profiles?.avatar_url || 'https://via.placeholder.com/40'}" 
              style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid var(--accent-cyan); object-fit: cover;"
            >
            <span style="font-weight: 700; font-size: 14px; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
              @${reel.profiles?.username || 'vibra_user'}
            </span>
            <button class="btn-follow" style="
              padding: 4px 12px;
              font-size: 12px;
              font-weight: 600;
              border-radius: 20px;
              background: rgba(255, 255, 255, 0.15);
              backdrop-filter: blur(8px);
              border: 1px solid rgba(255, 255, 255, 0.2);
              color: #fff;
              cursor: pointer;
            ">Follow</button>
          </div>

          <!-- Caption & Hashtags -->
          <p style="
            font-size: 13px;
            line-height: 1.4;
            color: #fff;
            margin: 0;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-shadow: 0 1px 2px rgba(0,0,0,0.8);
          ">
            ${this.formatCaption(reel.caption || '')}
          </p>

          <!-- Audio Metadata & Ticker -->
          <div style="display: flex; align-items: center; gap: 8px; width: 100%; overflow: hidden;">
            <i class="fa-solid fa-music" style="font-size: 12px; color: var(--accent-cyan);"></i>
            <div style="overflow: hidden; white-space: nowrap; width: 180px;">
              <div style="display: inline-block; animation: marqueeText 8s linear infinite; font-size: 12px; color: var(--text-muted);">
                Original Audio — @${reel.profiles?.username || 'vibra'} ✨ VIBRA Sound
              </div>
            </div>
          </div>
        </div>

        <!-- Action Overlay Buttons (Bottom Right) -->
        <div style="
          position: absolute;
          bottom: 24px;
          right: 16px;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        ">
          <!-- Like Button -->
          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
            <button class="btn-like-reel" style="
              background: rgba(0, 0, 0, 0.4);
              backdrop-filter: blur(10px);
              border: 1px solid var(--border-glass);
              width: 48px; height: 48px;
              border-radius: 50%;
              color: ${isLiked ? 'var(--accent-pink)' : '#fff'};
              font-size: 20px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: var(--transition-fast);
            ">
              <i class="${isLiked ? 'fa-solid fa-heart reel-heart-anim' : 'fa-regular fa-heart'}"></i>
            </button>
            <span class="like-count" style="font-size: 11px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">
              ${reel.likes?.length || 0}
            </span>
          </div>

          <!-- Comment Button -->
          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
            <button class="btn-comment-reel" style="
              background: rgba(0, 0, 0, 0.4);
              backdrop-filter: blur(10px);
              border: 1px solid var(--border-glass);
              width: 48px; height: 48px;
              border-radius: 50%;
              color: #fff;
              font-size: 20px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <i class="fa-regular fa-comment"></i>
            </button>
            <span style="font-size: 11px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">Reply</span>
          </div>

          <!-- Save Button -->
          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
            <button class="btn-save-reel" style="
              background: rgba(0, 0, 0, 0.4);
              backdrop-filter: blur(10px);
              border: 1px solid var(--border-glass);
              width: 48px; height: 48px;
              border-radius: 50%;
              color: ${isSaved ? 'var(--accent-cyan)' : '#fff'};
              font-size: 20px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <i class="${isSaved ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'}"></i>
            </button>
            <span style="font-size: 11px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">Save</span>
          </div>

          <!-- Share Button -->
          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
            <button class="btn-share-reel" style="
              background: rgba(0, 0, 0, 0.4);
              backdrop-filter: blur(10px);
              border: 1px solid var(--border-glass);
              width: 48px; height: 48px;
              border-radius: 50%;
              color: #fff;
              font-size: 18px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <i class="fa-solid fa-paper-plane"></i>
            </button>
            <span style="font-size: 11px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">Share</span>
          </div>

          <!-- Rotating Audio Album Disk -->
          <div class="audio-disk audio-disk-spinning" style="
            width: 38px; height: 38px;
            border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.6);
            overflow: hidden;
            margin-top: 6px;
            box-shadow: 0 0 10px rgba(0,242,254,0.4);
          ">
            <img src="${reel.profiles?.avatar_url || 'https://via.placeholder.com/40'}" style="width: 100%; height: 100%; object-fit: cover;">
          </div>
        </div>
      `;

      this.bindReelActions(reelCard, reel);
      viewport.appendChild(reelCard);
    });
  }

  setupObserversAndGestureHandlers() {
    const viewport = this.container.querySelector('#reels-viewport');

    // 1. IntersectionObserver to play active reel and pause hidden ones
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target.querySelector('video');
        const disk = entry.target.querySelector('.audio-disk');

        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          video?.play().catch(() => {
            // Autoplay restricted fallback - mute & play
            if (video) {
              video.muted = true;
              video.play();
            }
          });
          disk?.classList.add('audio-disk-spinning');
        } else {
          video?.pause();
          disk?.classList.remove('audio-disk-spinning');
        }
      });
    }, {
      root: viewport,
      threshold: 0.6
    });

    viewport.querySelectorAll('.reel-slide').forEach(slide => observer.observe(slide));

    // 2. Touch & Drag Swipe Detection for Mobile/Desktop
    viewport.addEventListener('touchstart', (e) => {
      this.touchStartY = e.touches[0].clientY;
      this.isDragging = true;
    }, { passive: true });

    viewport.addEventListener('touchend', (e) => {
      if (!this.isDragging) return;
      this.touchEndY = e.changedTouches[0].clientY;
      this.handleSwipeGesture(viewport);
      this.isDragging = false;
    }, { passive: true });
  }

  handleSwipeGesture(viewport) {
    const deltaY = this.touchStartY - this.touchEndY;
    const threshold = 50; // Minimum drag distance to register swipe

    if (Math.abs(deltaY) > threshold) {
      const slideHeight = viewport.clientHeight;
      if (deltaY > 0) {
        // Swipe Up -> Next Video
        viewport.scrollBy({ top: slideHeight, behavior: 'smooth' });
      } else {
        // Swipe Down -> Previous Video
        viewport.scrollBy({ top: -slideHeight, behavior: 'smooth' });
      }
    }
  }

  bindReelActions(slideEl, reel) {
    const video = slideEl.querySelector('video');
    const overlay = slideEl.querySelector('.play-pause-overlay');
    const likeBtn = slideEl.querySelector('.btn-like-reel');
    const likeCountEl = slideEl.querySelector('.like-count');
    const saveBtn = slideEl.querySelector('.btn-save-reel');
    const shareBtn = slideEl.querySelector('.btn-share-reel');

    // Tap Video to Toggle Play/Pause
    video.addEventListener('click', () => {
      if (video.paused) {
        video.play();
        overlay.style.opacity = '0';
      } else {
        video.pause();
        overlay.innerHTML = `<div style="width:70px; height:70px; background:rgba(0,0,0,0.6); backdrop-filter:blur(10px); border-radius:50%; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-pause" style="font-size:28px; color:#fff;"></i></div>`;
        overlay.style.opacity = '1';
        setTimeout(() => { overlay.style.opacity = '0'; }, 800);
      }
    });

    // Toggle Like Persistence
    likeBtn.addEventListener('click', async () => {
      if (!this.currentUser) return;

      const heartIcon = likeBtn.querySelector('i');
      const isLiked = heartIcon.classList.contains('fa-solid');
      let currentLikes = parseInt(likeCountEl.innerText) || 0;

      if (isLiked) {
        // Unlike
        heartIcon.className = 'fa-regular fa-heart';
        likeBtn.style.color = '#fff';
        likeCountEl.innerText = Math.max(0, currentLikes - 1);

        await supabase
          .from('likes')
          .delete()
          .eq('post_id', reel.id)
          .eq('user_id', this.currentUser.id);
      } else {
        // Like
        heartIcon.className = 'fa-solid fa-heart reel-heart-anim';
        likeBtn.style.color = 'var(--accent-pink)';
        likeCountEl.innerText = currentLikes + 1;

        await supabase
          .from('likes')
          .insert({ post_id: reel.id, user_id: this.currentUser.id });
      }
    });

    // Toggle Save Persistence
    saveBtn.addEventListener('click', async () => {
      if (!this.currentUser) return;

      const bookmarkIcon = saveBtn.querySelector('i');
      const isSaved = bookmarkIcon.classList.contains('fa-solid');

      if (isSaved) {
        bookmarkIcon.className = 'fa-regular fa-bookmark';
        saveBtn.style.color = '#fff';

        await supabase
          .from('saved_posts')
          .delete()
          .eq('post_id', reel.id)
          .eq('user_id', this.currentUser.id);
      } else {
        bookmarkIcon.className = 'fa-solid fa-bookmark';
        saveBtn.style.color = 'var(--accent-cyan)';

        await supabase
          .from('saved_posts')
          .insert({ post_id: reel.id, user_id: this.currentUser.id });
      }
    });

    // Share Drawer / Clipboard
    shareBtn.addEventListener('click', () => {
      const shareUrl = `${window.location.origin}/#reel-${reel.id}`;
      if (navigator.share) {
        navigator.share({
          title: 'VIBRA Reel',
          text: reel.caption,
          url: shareUrl
        }).catch(() => {});
      } else {
        navigator.clipboard.writeText(shareUrl);
        window.VIBRA?.showToast('Reel link copied to clipboard! 🚀');
      }
    });
  }

  formatCaption(caption) {
    return caption.replace(/(#[a-zA-Z0-9_]+)/g, '<span style="color: var(--accent-cyan); font-weight: 600;">$1</span>');
  }
}
