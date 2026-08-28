import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Configuration Architecture Setup
const SUPABASE_URL = window.ENV?.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export class VibraApp {
  constructor() {
    this.currentUser = null;
    this.currentView = 'feed';
    this.realtimeChannels = {};
    this.init();
  }

  async init() {
    // 1. Authenticate Session Check
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await this.loadUserProfile(session.user.id);
      this.setupRealtimeListeners();
    } else {
      this.renderAuthScreen();
    }

    // 2. Auth State Change Listener
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        await this.loadUserProfile(session.user.id);
        this.setupRealtimeListeners();
        this.navigateTo('feed');
      } else if (event === 'SIGNED_OUT') {
        this.currentUser = null;
        this.renderAuthScreen();
      }
    });

    this.bindGlobalEvents();
  }

  async loadUserProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching profile:', error);
      return;
    }

    this.currentUser = data;
  }

  // Real-time Subscriptions Setup
  setupRealtimeListeners() {
    if (!this.currentUser) return;

    // Listen to Direct Messages
    this.realtimeChannels.messages = supabase
      .channel('public:messages')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages' 
      }, payload => {
        this.handleIncomingMessage(payload.new);
      })
      .subscribe();

    // Listen to Notifications
    this.realtimeChannels.notifications = supabase
      .channel('public:notifications')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `recipient_id=eq.${this.currentUser.id}`
      }, payload => {
        this.showNotificationToast(payload.new);
      })
      .subscribe();
  }

  // Real Authentication - Phone/Email OTP Router
  async sendOTP(contact, type = 'email') {
    if (type === 'email') {
      const { error } = await supabase.auth.signInWithOtp({ email: contact });
      if (error) throw error;
    } else if (type === 'phone') {
      const { error } = await supabase.auth.signInWithOtp({ phone: contact });
      if (error) throw error;
    }
  }

  async verifyOTP(contact, token, type = 'email') {
    const { data, error } = await supabase.auth.verifyOtp({
      email: type === 'email' ? contact : undefined,
      phone: type === 'phone' ? contact : undefined,
      token,
      type: 'magiclink'
    });
    if (error) throw error;
    return data;
  }

  // Complete Post Creation Pipeline with Media Upload
  async createPost({ files, caption, location, altText }) {
    if (!this.currentUser) return;

    // 1. Create Post Record
    const { data: post, error: postErr } = await supabase
      .from('posts')
      .insert({
        user_id: this.currentUser.id,
        caption,
        location,
        alt_text: altText
      })
      .select()
      .single();

    if (postErr) throw postErr;

    // 2. Upload Media Files
    const mediaInserts = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = file.name.split('.').pop();
      const filePath = `posts/${post.id}/${i}.${fileExt}`;

      const { error: uploadErr } = await supabase.storage
        .from('media')
        .upload(filePath, file);

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      mediaInserts.push({
        post_id: post.id,
        media_url: publicUrl,
        media_type: file.type.startsWith('video') ? 'video' : 'image',
        order_index: i
      });
    }

    await supabase.from('post_media').insert(mediaInserts);

    // 3. Process Hashtags
    const hashtags = caption.match(/#[a-zA-Z0-9_]+/g);
    if (hashtags) {
      for (let tag of hashtags) {
        const cleanTag = tag.replace('#', '').toLowerCase();
        let { data: tagRecord } = await supabase
          .from('hashtags')
          .select('id')
          .eq('name', cleanTag)
          .single();

        if (!tagRecord) {
          const { data: newTag } = await supabase
            .from('hashtags')
            .insert({ name: cleanTag })
            .select()
            .single();
          tagRecord = newTag;
        }

        if (tagRecord) {
          await supabase.from('post_hashtags').insert({
            post_id: post.id,
            hashtag_id: tagRecord.id
          });
        }
      }
    }

    return post;
  }

  // Navigation & View Routing Engine
  navigateTo(view, params = {}) {
    this.currentView = view;
    const appContainer = document.getElementById('view-container');
    
    // UI Loading State Transition
    appContainer.innerHTML = `
      <div class="glass-panel" style="padding: 40px; text-align: center; margin: 40px auto; max-width: 400px;">
        <div class="spinner"></div>
        <p style="margin-top: 15px; color: var(--text-muted);">Loading VIBRA Experience...</p>
      </div>
    `;

    setTimeout(() => {
      switch (view) {
        case 'feed':
          this.renderFeed(appContainer);
          break;
        case 'explore':
          this.renderExplore(appContainer);
          break;
        case 'create':
          this.renderCreatePost(appContainer);
          break;
        case 'profile':
          this.renderProfile(appContainer, params.userId);
          break;
        default:
          this.renderFeed(appContainer);
      }
    }, 200);
  }

  handleIncomingMessage(msg) {
    this.showToast(`New message received`);
  }

  showNotificationToast(notif) {
    this.showToast(`New interaction on VIBRA ✨`);
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'glass-panel';
    toast.style.cssText = `
      position: fixed; bottom: 80px; right: 20px; z-index: 2000;
      padding: 12px 24px; border-color: var(--accent-cyan);
      box-shadow: var(--shadow-glow); animation: slideIn 0.3s forwards;
    `;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  bindGlobalEvents() {
    document.addEventListener('click', (e) => {
      const navTarget = e.target.closest('[data-nav]');
      if (navTarget) {
        e.preventDefault();
        this.navigateTo(navTarget.dataset.nav);
      }
    });
  }

  renderAuthScreen() {
    document.getElementById('app').innerHTML = `
      <div class="glass-panel" style="max-width: 420px; margin: 80px auto; padding: 40px; text-align: center;">
        <h1 style="font-size: 36px; background: linear-gradient(to right, var(--accent-cyan), var(--accent-pink)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">VIBRA</h1>
        <p style="color: var(--text-muted); margin-bottom: 24px;">Connect. Share. Vibe.</p>
        
        <input type="text" id="auth-contact" class="glass-input" placeholder="Email or Phone (+1...)" style="margin-bottom: 16px;">
        <button id="btn-send-otp" class="btn-primary" style="width: 100%;">Send Verification Code</button>

        <div id="otp-section" style="display: none; margin-top: 20px;">
          <input type="text" id="auth-otp" class="glass-input" placeholder="Enter 6-digit Code" style="margin-bottom: 16px;">
          <button id="btn-verify-otp" class="btn-primary" style="width: 100%;">Verify & Enter</button>
        </div>
      </div>
    `;

    document.getElementById('btn-send-otp').addEventListener('click', async () => {
      const contact = document.getElementById('auth-contact').value;
      const isEmail = contact.includes('@');
      try {
        await this.sendOTP(contact, isEmail ? 'email' : 'phone');
        document.getElementById('otp-section').style.display = 'block';
        this.showToast('Verification code dispatched!');
      } catch (err) {
        alert(err.message);
      }
    });

    document.getElementById('btn-verify-otp')?.addEventListener('click', async () => {
      const contact = document.getElementById('auth-contact').value;
      const code = document.getElementById('auth-otp').value;
      const isEmail = contact.includes('@');
      try {
        await this.verifyOTP(contact, code, isEmail ? 'email' : 'phone');
      } catch (err) {
        alert(err.message);
      }
    });
  }

  async renderFeed(container) {
    container.innerHTML = `
      <div style="padding: 20px;">
        <div style="display: flex; gap: 16px; overflow-x: auto; padding-bottom: 15px; margin-bottom: 20px;">
          <div style="text-align: center;">
            <div class="story-ring"><img src="https://via.placeholder.com/60" style="border-radius: 50%; width: 60px; height: 60px; display: block;"></div>
            <span style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: block;">Your Story</span>
          </div>
        </div>

        <div id="feed-posts" style="display: flex; flex-direction: column; gap: 24px;">
          <div class="glass-panel" style="padding: 20px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <img src="https://via.placeholder.com/40" style="border-radius: 50%; width: 40px; height: 40px;">
              <div>
                <h4 style="font-size: 14px;">vibra_official ✨</h4>
                <p style="font-size: 11px; color: var(--text-dim);">Metropolis • Just now</p>
              </div>
            </div>
            <div style="width: 100%; height: 300px; background: rgba(0,0,0,0.5); border-radius: 12px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; color: var(--text-dim);">
              [ High Resolution Post Asset ]
            </div>
            <p style="font-size: 14px; margin-bottom: 8px;">Welcome to the future of interaction. Experience ultra-fast updates and dark glass aesthetics. #VIBRA #NextGen</p>
          </div>
        </div>
      </div>
    `;
  }
}

// Initialize Application Context
window.addEventListener('DOMContentLoaded', () => {
  window.VIBRA = new VibraApp();
});
