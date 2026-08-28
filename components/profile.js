import { supabase } from '../app.js';

export class ProfileView {
  constructor(container, currentUser, targetUserId = null) {
    this.container = container;
    this.currentUser = currentUser;
    // View own profile if targetUserId is null or matches logged-in user
    this.userId = targetUserId || currentUser?.id;
    this.isOwnProfile = this.currentUser && (this.userId === this.currentUser.id);
    this.profileData = null;
    this.activeTab = 'posts'; // 'posts' | 'reels' | 'saved'
    this.init();
  }

  async init() {
    this.renderSkeleton();
    await this.fetchProfileData();
    if (this.profileData) {
      this.renderProfile();
      this.fetchUserGridContent();
    } else {
      this.renderErrorState();
    }
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div style="max-width: 935px; margin: 0 auto; padding: 24px 16px;">
        <div class="glass-panel" style="padding: 32px; text-align: center;">
          <div class="spinner" style="margin: 0 auto;"></div>
          <p style="margin-top: 16px; color: var(--text-muted); font-size: 14px;">Loading VIBRA Identity...</p>
        </div>
      </div>
    `;
  }

  async fetchProfileData() {
    try {
      // 1. Fetch Profile Info
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', this.userId)
        .single();

      if (error) throw error;
      this.profileData = profile;

      // 2. Fetch Aggregated Stats
      const [postsCount, followersCount, followingCount] = await Promise.all([
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', this.userId),
        supabase.from('followers').select('follower_id', { count: 'exact', head: true }).eq('following_id', this.userId).eq('status', 'accepted'),
        supabase.from('followers').select('following_id', { count: 'exact', head: true }).eq('follower_id', this.userId).eq('status', 'accepted')
      ]);

      this.stats = {
        posts: postsCount.count || 0,
        followers: followersCount.count || 0,
        following: followingCount.count || 0
      };

      // 3. Check Follow Relationship (if viewing another user)
      if (!this.isOwnProfile && this.currentUser) {
        const { data: followRel } = await supabase
          .from('followers')
          .select('status')
          .eq('follower_id', this.currentUser.id)
          .eq('following_id', this.userId)
          .single();

        this.followStatus = followRel ? followRel.status : 'none'; // 'none' | 'pending' | 'accepted'
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  }

  renderProfile() {
    const p = this.profileData;
    this.container.innerHTML = `
      <div style="max-width: 935px; margin: 0 auto; padding: 24px 16px 80px 16px;">
        
        <!-- Header Profile Card -->
        <div class="glass-panel" style="padding: 32px; margin-bottom: 24px; position: relative; overflow: hidden;">
          <!-- Glowing Subtle Background Radial -->
          <div style="position: absolute; -top: 50px; -right: 50px; width: 200px; height: 200px; background: radial-gradient(circle, var(--accent-cyan) 0%, transparent 70%); opacity: 0.15; pointer-events: none;"></div>

          <div style="display: flex; flex-direction: column; @media(min-width: 600px){ flex-direction: row; } gap: 32px; align-items: center;">
            
            <!-- Avatar Section with Story Gradient Ring -->
            <div style="position: relative;">
              <div class="story-ring" style="padding: 4px;">
                <img id="profile-avatar" src="${p.avatar_url || 'https://via.placeholder.com/150'}" style="width: 130px; height: 130px; border-radius: 50%; object-fit: cover; display: block; background: #000;">
              </div>
              ${p.is_verified ? `<i class="fa-solid fa-circle-check" style="position: absolute; bottom: 8px; right: 8px; color: var(--accent-cyan); font-size: 24px; background: #000; border-radius: 50%;"></i>` : ''}
            </div>

            <!-- Profile Info & Actions -->
            <div style="flex: 1; width: 100%; text-align: center; @media(min-width: 600px){ text-align: left; }">
              <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; @media(min-width: 600px){ justify-content: flex-start; } gap: 16px; margin-bottom: 16px;">
                <h2 style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">@${p.username}</h2>
                <div id="action-buttons-container" style="display: flex; gap: 10px;"></div>
              </div>

              <!-- Stats Row -->
              <div style="display: flex; justify-content: center; @media(min-width: 600px){ justify-content: flex-start; } gap: 32px; margin-bottom: 20px;">
                <div><strong style="font-size: 16px; color: #fff;">${this.stats.posts}</strong> <span style="font-size: 14px; color: var(--text-muted);">posts</span></div>
                <div><strong style="font-size: 16px; color: #fff;">${this.stats.followers}</strong> <span style="font-size: 14px; color: var(--text-muted);">followers</span></div>
                <div><strong style="font-size: 16px; color: #fff;">${this.stats.following}</strong> <span style="font-size: 14px; color: var(--text-muted);">following</span></div>
              </div>

              <!-- Bio & Metadata -->
              <div>
                <h3 style="font-size: 15px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">${p.full_name}</h3>
                <p style="font-size: 14px; color: var(--text-muted); line-height: 1.5; white-space: pre-wrap; margin-bottom: 8px;">${p.bio || 'No bio written yet.'}</p>
                ${p.website ? `<a href="${p.website}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-cyan); text-decoration: none; font-size: 13px; font-weight: 600;"><i class="fa-solid fa-link" style="margin-right: 6px;"></i>${p.website.replace(/^https?:\/\//, '')}</a>` : ''}
              </div>
            </div>

          </div>
        </div>

        <!-- Navigation Tabs -->
        <div style="display: flex; justify-content: center; gap: 40px; border-bottom: 1px solid var(--border-glass); margin-bottom: 20px;">
          <button class="profile-tab active" data-tab="posts" style="background: none; border: none; padding: 12px 16px; color: var(--accent-cyan); font-weight: 600; cursor: pointer; border-bottom: 2px solid var(--accent-cyan); transition: var(--transition-fast);">
            <i class="fa-solid fa-table-cells" style="margin-right: 8px;"></i> POSTS
          </button>
          <button class="profile-tab" data-tab="reels" style="background: none; border: none; padding: 12px 16px; color: var(--text-muted); font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; transition: var(--transition-fast);">
            <i class="fa-solid fa-clapperboard" style="margin-right: 8px;"></i> REELS
          </button>
          ${this.isOwnProfile ? `
            <button class="profile-tab" data-tab="saved" style="background: none; border: none; padding: 12px 16px; color: var(--text-muted); font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; transition: var(--transition-fast);">
              <i class="fa-regular fa-bookmark" style="margin-right: 8px;"></i> SAVED
            </button>
          ` : ''}
        </div>

        <!-- Grid Viewport -->
        <div id="profile-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;"></div>

        <!-- Dynamic Modal Mount Container -->
        <div id="settings-modal-mount"></div>
      </div>
    `;

    this.renderActionButtons();
    this.bindTabEvents();
  }

  renderActionButtons() {
    const btnContainer = this.container.querySelector('#action-buttons-container');
    btnContainer.innerHTML = '';

    if (this.isOwnProfile) {
      btnContainer.innerHTML = `
        <button id="btn-edit-profile" class="btn-primary" style="padding: 8px 16px; font-size: 13px; background: rgba(255,255,255,0.08); border: 1px solid var(--border-glass);">
          <i class="fa-solid fa-pen"></i> Edit Profile
        </button>
        <button id="btn-open-settings" class="btn-primary" style="padding: 8px 12px; font-size: 13px; background: rgba(255,255,255,0.08); border: 1px solid var(--border-glass);">
          <i class="fa-solid fa-gear"></i>
        </button>
      `;

      btnContainer.querySelector('#btn-edit-profile').addEventListener('click', () => this.openEditProfileModal());
      btnContainer.querySelector('#btn-open-settings').addEventListener('click', () => this.openSettingsModal());
    } else {
      let followBtnText = 'Follow';
      let followBtnStyle = 'background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple));';

      if (this.followStatus === 'accepted') {
        followBtnText = 'Following';
        followBtnStyle = 'background: rgba(255,255,255,0.1); border: 1px solid var(--border-glass);';
      } else if (this.followStatus === 'pending') {
        followBtnText = 'Requested';
        followBtnStyle = 'background: rgba(255,255,255,0.05); color: var(--text-muted);';
      }

      btnContainer.innerHTML = `
        <button id="btn-toggle-follow" class="btn-primary" style="padding: 8px 20px; font-size: 13px; ${followBtnStyle}">
          ${followBtnText}
        </button>
        <button id="btn-direct-msg" class="btn-primary" style="padding: 8px 16px; font-size: 13px; background: rgba(255,255,255,0.08); border: 1px solid var(--border-glass);">
          Message
        </button>
      `;

      btnContainer.querySelector('#btn-toggle-follow').addEventListener('click', () => this.handleFollowToggle());
    }
  }

  bindTabEvents() {
    const tabs = this.container.querySelectorAll('.profile-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => {
          t.style.color = 'var(--text-muted)';
          t.style.borderBottomColor = 'transparent';
          t.classList.remove('active');
        });
        const target = e.currentTarget;
        target.style.color = 'var(--accent-cyan)';
        target.style.borderBottomColor = 'var(--accent-cyan)';
        target.classList.add('active');
        
        this.activeTab = target.dataset.tab;
        this.fetchUserGridContent();
      });
    });
  }

  async fetchUserGridContent() {
    const gridEl = this.container.querySelector('#profile-grid');
    gridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;"><div class="spinner" style="margin:0 auto;"></div></div>';

    try {
      let query;
      if (this.activeTab === 'posts') {
        query = supabase
          .from('posts')
          .select('id, is_reel, post_media(media_url, media_type)')
          .eq('user_id', this.userId)
          .eq('is_reel', false)
          .order('created_at', { ascending: false });
      } else if (this.activeTab === 'reels') {
        query = supabase
          .from('posts')
          .select('id, is_reel, post_media(media_url, media_type)')
          .eq('user_id', this.userId)
          .eq('is_reel', true)
          .order('created_at', { ascending: false });
      } else if (this.activeTab === 'saved') {
        query = supabase
          .from('saved_posts')
          .select('posts(id, is_reel, post_media(media_url, media_type))')
          .eq('user_id', this.currentUser.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const items = this.activeTab === 'saved' ? data.map(d => d.posts).filter(Boolean) : data;

      if (!items || items.length === 0) {
        gridEl.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
            <i class="fa-regular fa-image" style="font-size: 40px; margin-bottom: 12px; color: var(--text-dim);"></i>
            <p>No ${this.activeTab} to show yet.</p>
          </div>
        `;
        return;
      }

      gridEl.innerHTML = '';
      items.forEach(item => {
        const firstMedia = item.post_media?.[0];
        if (!firstMedia) return;

        const tile = document.createElement('div');
        tile.className = 'glass-panel';
        tile.style.cssText = 'position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 8px; cursor: pointer;';
        
        tile.innerHTML = `
          ${firstMedia.media_type === 'video' 
            ? `<video src="${firstMedia.media_url}" style="width:100%; height:100%; object-fit:cover;"></video>` 
            : `<img src="${firstMedia.media_url}" style="width:100%; height:100%; object-fit:cover;">`}
          ${item.is_reel ? `<i class="fa-solid fa-clapperboard" style="position: absolute; top: 8px; right: 8px; color: #fff; text-shadow: 0 0 4px rgba(0,0,0,0.8);"></i>` : ''}
        `;
        gridEl.appendChild(tile);
      });
    } catch (err) {
      gridEl.innerHTML = `<p style="grid-column: 1/-1; color: var(--text-muted); text-align: center;">Error loading content grid.</p>`;
    }
  }

  // --- FOLLOW ENGINE TOGGLE ---
  async handleFollowToggle() {
    if (!this.currentUser) return;

    if (this.followStatus === 'accepted' || this.followStatus === 'pending') {
      // Unfollow
      await supabase
        .from('followers')
        .delete()
        .eq('follower_id', this.currentUser.id)
        .eq('following_id', this.userId);

      this.followStatus = 'none';
      this.stats.followers = Math.max(0, this.stats.followers - 1);
    } else {
      // Follow (Handle Private Account Pending Status)
      const targetStatus = this.profileData.is_private ? 'pending' : 'accepted';
      await supabase
        .from('followers')
        .insert({
          follower_id: this.currentUser.id,
          following_id: this.userId,
          status: targetStatus
        });

      this.followStatus = targetStatus;
      if (targetStatus === 'accepted') this.stats.followers += 1;
    }

    this.renderProfile();
    this.fetchUserGridContent();
  }

  // --- EDIT PROFILE MODAL ---
  openEditProfileModal() {
    const p = this.profileData;
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.8); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; padding: 20px;';
    
    modal.innerHTML = `
      <div class="glass-panel" style="max-width: 500px; width: 100%; padding: 28px; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h3 style="font-size: 18px; font-weight: 700;">Edit Profile</h3>
          <button id="close-modal" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer;">&times;</button>
        </div>

        <form id="edit-profile-form" style="display: flex; flex-direction: column; gap: 16px;">
          
          <!-- Avatar Upload -->
          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 8px;">
            <img id="edit-avatar-preview" src="${p.avatar_url || 'https://via.placeholder.com/60'}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
            <label class="btn-primary" style="padding: 6px 14px; font-size: 12px; cursor: pointer;">
              Change Photo
              <input type="file" id="avatar-file-input" accept="image/*" style="display: none;">
            </label>
          </div>

          <div>
            <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 4px;">Full Name</label>
            <input type="text" id="edit-full-name" class="glass-input" value="${p.full_name || ''}" required>
          </div>

          <div>
            <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 4px;">Username</label>
            <input type="text" id="edit-username" class="glass-input" value="${p.username || ''}" required>
          </div>

          <div>
            <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 4px;">Bio</label>
            <textarea id="edit-bio" class="glass-input" rows="3">${p.bio || ''}</textarea>
          </div>

          <div>
            <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 4px;">Website</label>
            <input type="url" id="edit-website" class="glass-input" value="${p.website || ''}" placeholder="https://">
          </div>

          <button type="submit" class="btn-primary" style="margin-top: 10px;">Save Changes ✨</button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const fileInput = modal.querySelector('#avatar-file-input');
    let pendingAvatarFile = null;

    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        pendingAvatarFile = e.target.files[0];
        modal.querySelector('#edit-avatar-preview').src = URL.createObjectURL(pendingAvatarFile);
      }
    });

    modal.querySelector('#close-modal').addEventListener('click', () => modal.remove());

    modal.querySelector('#edit-profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.innerText = 'Updating...';
      btn.disabled = true;

      try {
        let avatarUrl = p.avatar_url;

        // Process Avatar File Upload to Supabase Bucket if changed
        if (pendingAvatarFile) {
          const fileExt = pendingAvatarFile.name.split('.').pop();
          const filePath = `avatars/${p.id}.${fileExt}`;

          const { error: uploadErr } = await supabase.storage
            .from('media')
            .upload(filePath, pendingAvatarFile, { upsert: true });

          if (uploadErr) throw uploadErr;

          const { data: publicUrlData } = supabase.storage
            .from('media')
            .getPublicUrl(filePath);

          avatarUrl = publicUrlData.publicUrl;
        }

        // Update Profiles Database Row
        const updates = {
          full_name: modal.querySelector('#edit-full-name').value,
          username: modal.querySelector('#edit-username').value.toLowerCase().trim(),
          bio: modal.querySelector('#edit-bio').value,
          website: modal.querySelector('#edit-website').value,
          avatar_url: avatarUrl,
          updated_at: new Date()
        };

        const { error: updateErr } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', p.id);

        if (updateErr) throw updateErr;

        Object.assign(this.profileData, updates);
        modal.remove();
        window.VIBRA?.showToast('Profile updated successfully! ✨');
        this.renderProfile();
        this.fetchUserGridContent();
      } catch (err) {
        alert(`Update failed: ${err.message}`);
        btn.innerText = 'Save Changes ✨';
        btn.disabled = false;
      }
    });
  }

  // --- SECURITY & PRIVACY SETTINGS MODAL ---
  openSettingsModal() {
    const p = this.profileData;
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,0.8); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; padding: 20px;';

    modal.innerHTML = `
      <div class="glass-panel" style="max-width: 460px; width: 100%; padding: 28px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="font-size: 18px; font-weight: 700;">Security & Privacy</h3>
          <button id="close-settings" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer;">&times;</button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px;">
          
          <!-- Private Account Toggle -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h4 style="font-size: 15px; font-weight: 600;">Private Account</h4>
              <p style="font-size: 12px; color: var(--text-muted);">Only approved followers can view your feed & stories.</p>
            </div>
            <label class="toggle-switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
              <input type="checkbox" id="toggle-privacy" ${p.is_private ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
              <span style="position: absolute; cursor: pointer; inset: 0; background-color: rgba(255,255,255,0.2); border-radius: 24px; transition: 0.3s;" class="slider"></span>
            </label>
          </div>

          <hr style="border: none; border-top: 1px solid var(--border-glass);">

          <!-- Account Security Actions -->
          <button id="btn-reset-pass" class="btn-primary" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-glass); justify-content: flex-start;">
            <i class="fa-solid fa-key" style="color: var(--accent-cyan);"></i> Reset Password via Email
          </button>

          <button id="btn-logout" class="btn-primary" style="background: rgba(255, 0, 85, 0.15); border: 1px solid rgba(255, 0, 85, 0.3); color: #ff3366; justify-content: flex-start;">
            <i class="fa-solid fa-right-from-bracket"></i> Sign Out of VIBRA
          </button>
        </div>
      </div>
      <style>
        .toggle-switch input:checked + .slider { background-color: var(--accent-cyan) !important; }
        .toggle-switch input:checked + .slider:before { transform: translateX(20px); }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; border-radius: 50%; transition: 0.3s; }
      </style>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-settings').addEventListener('click', () => modal.remove());

    // Toggle Private Account status immediately
    modal.querySelector('#toggle-privacy').addEventListener('change', async (e) => {
      const isPrivate = e.target.checked;
      this.profileData.is_private = isPrivate;
      
      await supabase
        .from('profiles')
        .update({ is_private: isPrivate })
        .eq('id', p.id);

      window.VIBRA?.showToast(`Account set to ${isPrivate ? 'Private 🔒' : 'Public 🌐'}`);
    });

    // Handle Password Reset Trigger
    modal.querySelector('#btn-reset-pass').addEventListener('click', async () => {
      if (!p.email) return;
      const { error } = await supabase.auth.resetPasswordForEmail(p.email);
      if (error) {
        alert(error.message);
      } else {
        window.VIBRA?.showToast('Password recovery email dispatched!');
      }
    });

    // Logout Trigger
    modal.querySelector('#btn-logout').addEventListener('click', async () => {
      modal.remove();
      await supabase.auth.signOut();
    });
  }

  renderErrorState() {
    this.container.innerHTML = `
      <div class="glass-panel" style="max-width: 400px; margin: 60px auto; padding: 40px; text-align: center;">
        <i class="fa-solid fa-user-slash" style="font-size: 40px; color: var(--text-dim); margin-bottom: 16px;"></i>
        <h3 style="font-size: 18px; font-weight: 700;">Profile Not Found</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 8px;">The requested user identity does not exist on VIBRA.</p>
      </div>
    `;
  }
}
