/* ============================================
   旅行手帐 — App
   ============================================ */

const App = {

  /* ===== state ===== */
  api: null,
  entries: [],
  photo: null,         // base64 data URL or null
  transcript: '',      // voice recognition result
  generated: null,     // latest AI result
  recognizing: false,
  recognition: null,
  detailIdx: -1,
  editPhoto: null,
  searchQuery: '',

  /* ===== init ===== */
  async init() {
    const s = await Storage.getSettings();
    const key = s.apiKey || '35219dd3b6f441a5873d6d0c28b1de4e.r8Lb9LtVYFUa2U1j';
    this.api = new AIClient(s.provider || 'zhipu', key);
    this.entries = await Storage.getEntries();
    this.bind();
    this.renderList();
  },

  /* ===== event binding ===== */
  bind() {
    $('#fab').addEventListener('click', () => this.openNew());
    $('#closeNewBtn').addEventListener('click', () => this.closeNew());
    $('#cameraBtn').addEventListener('click', () => this.openCamera());
    $('#camSnapBtn').addEventListener('click', () => this.snapPhoto());
    $('#camCancelBtn').addEventListener('click', () => this.closeCamera());
    $('#skipPhotoBtn').addEventListener('click', () => this.skipPhoto());
    $('#retakeBtn').addEventListener('click', () => this.retake());
    $('#usePhotoBtn').addEventListener('click', () => this.goVoice());

    // Record button: mouse + touch
    const rb = $('#recordBtn');
    rb.addEventListener('mousedown', () => this.startMic());
    rb.addEventListener('mouseup', () => this.stopMic());
    rb.addEventListener('mouseleave', () => { if (this.recognizing) this.stopMic(); });
    rb.addEventListener('touchstart', (e) => { e.preventDefault(); this.startMic(); });
    rb.addEventListener('touchend', (e) => { e.preventDefault(); this.stopMic(); });

    $('#textInput').addEventListener('input', () => this.checkGenBtn());
    $('#aiGenBtn').addEventListener('click', () => this.generate());
    $('#directSaveBtn').addEventListener('click', () => this.directSave());
    $('#saveBtn').addEventListener('click', () => this.save());
    $('#discardBtn').addEventListener('click', () => this.directSave());
    $('#regenBtn').addEventListener('click', () => this.generate());
    $('#retryBtn').addEventListener('click', () => this.generate());

    // Detail
    $('#closeDetailBtn').addEventListener('click', () => this.closeDetail());
    $('#editBtn').addEventListener('click', () => this.editMode());
    $('#cancelEditBtn').addEventListener('click', () => this.cancelEdit());
    $('#saveEditBtn').addEventListener('click', () => this.saveEdit());
    $('#editPhotoInput').addEventListener('change', (e) => this.gotEditPhoto(e));
    $('#deleteBtn').addEventListener('click', () => this.deleteEntry());
    // Settings
    $('#settingsBtn').addEventListener('click', () => this.openSettings());
    $('#closeSettingsBtn').addEventListener('click', () => this.closeSettings());
    $('#showCustomKeyBtn').addEventListener('click', () => { $('#customKeyBox').classList.remove('hidden'); $('#showCustomKeyBtn').classList.add('hidden'); });
    $('#resetKeyBtn').addEventListener('click', () => this.resetKey());
    $('#saveKeyBtn').addEventListener('click', () => this.saveKey());

    // Search
    $('#searchInput').addEventListener('input', () => this.onSearch());
    $('#clearSearchBtn').addEventListener('click', () => this.clearSearch());

  },

  /* ===== list ===== */
  async renderList() {
    this.entries = await Storage.getEntries();
    $('#countBadge').textContent = `${this.entries.length} 篇`;
    const list = $('#entryList');
    const emp = $('#emptyHint');
    const q = this.searchQuery.trim().toLowerCase();

    let filtered = this.entries;
    if (q) {
      filtered = this.entries.filter(e =>
        (e.title||'').toLowerCase().includes(q) ||
        (e.journal||'').toLowerCase().includes(q) ||
        (e.transcript||'').toLowerCase().includes(q) ||
        (e.tags||[]).some(t => t.toLowerCase().includes(q)) ||
        (e.poem||'').toLowerCase().includes(q) ||
        (e.mood||'').toLowerCase().includes(q)
      );
    }

    if (!filtered.length) {
      emp.classList.remove('hidden');
      list.innerHTML = '';
      return;
    }
    emp.classList.add('hidden');
    list.innerHTML = filtered.map(e => {
      const origIdx = this.entries.indexOf(e);
      return `
      <div class="card" data-idx="${origIdx}">
        <div class="card-img" style="${e.photo ? `background-image:url(${e.photo})` : 'background:linear-gradient(135deg,#fdf2e9,#f5e6d3)'}"></div>
        <div class="card-body">
          <div class="card-head">
            <span class="card-mood">${this.moodIcon(e.mood)}</span>
            <span class="card-date">${this.fmtDate(e.date)}</span>
          </div>
          <h3 class="card-title">${this.esc(e.title)}</h3>
          <p class="card-preview">${this.esc(e.journal).substring(0,60)}...</p>
          ${e.poem ? `<p class="card-poem">「${this.esc(e.poem)}」</p>` : ''}
          <div class="tags">${(e.tags||[]).map(t=>`<span class="tag">#${this.esc(t)}</span>`).join('')}</div>
        </div>
      </div>
    `}).join('');

    list.querySelectorAll('.card').forEach(c => {
      c.addEventListener('click', () => this.openDetail(parseInt(c.dataset.idx)));
    });
  },

  /* ===== new entry flow ===== */
  openNew() {
    if (!this.api) { this.openSettings(); return; }
    $('#newOverlay').classList.add('on');
    this.resetNew();
  },

  closeNew() {
    this.closeCamera();
    this.stopMic();
    $('#newOverlay').classList.remove('on');
    this.resetNew();
  },

  resetNew() {
    this.closeCamera();
    this.photo = null;
    this.transcript = '';
    this.generated = null;
    this.stopMic();
    $('.photo-pick').style.display = '';
    $('#photoStep').classList.remove('hidden');
    $('#voiceStep').classList.add('hidden');
    $('#resultStep').classList.add('hidden');
    $('#photoPreviewBox').classList.add('hidden');
    $('#miniPhoto').classList.add('hidden');
    $('#transcriptBox').textContent = '';
    $('#micHint').classList.remove('hidden');
    $('#textInput').value = '';
    $('#aiGenBtn').disabled = true;
    $('#directSaveBtn').disabled = true;
  },

  /* photo */
  gotPhoto(e) {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      this.photo = ev.target.result;
      $('.photo-pick').style.display = 'none';
      this.showPreview();
    };
    r.readAsDataURL(f);
    e.target.value = '';
  },

  skipPhoto() {
    this.closeCamera();
    this.photo = null;
    $('#miniPhoto').classList.add('hidden');
    this.goVoice();
  },

  async openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      this._camStream = stream;
      $('#camVideo').srcObject = stream;
      $('.photo-pick').style.display = 'none';
      $('#cameraView').classList.remove('hidden');
    } catch (e) {
      // Fallback: use file input with capture to trigger system camera
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.setAttribute('capture', 'environment');
      inp.onchange = (ev) => this.gotPhoto(ev);
      inp.click();
    }
  },

  snapPhoto() {
    const video = $('#camVideo');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    canvas.getContext('2d').drawImage(video, 0, 0);
    this.photo = canvas.toDataURL('image/jpeg', 0.85);
    this.closeCamera();
    this.showPreview();
  },

  closeCamera() {
    if (this._camStream) {
      this._camStream.getTracks().forEach(t => t.stop());
      this._camStream = null;
    }
    $('#cameraView').classList.add('hidden');
  },

  showPreview() {
    $('#previewImg').src = this.photo;
    $('#miniPhotoImg').src = this.photo;
    $('#miniPhoto').classList.remove('hidden');
    $('#photoPreviewBox').classList.remove('hidden');
  },

  retake() {
    this.closeCamera();
    this.photo = null;
    $('#photoPreviewBox').classList.add('hidden');
    $('.photo-pick').style.display = '';
    document.querySelectorAll('.file-overlay').forEach(inp => inp.value = '');
  },

  goVoice() {
    $('#photoStep').classList.add('hidden');
    $('#voiceStep').classList.remove('hidden');
    this.checkGenBtn();
  },

  /* voice */
  startMic() {
    if (this.recognizing) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      $('#micHint').textContent = '当前浏览器不支持语音，请使用文字输入';
      $('#micHint').classList.remove('hidden');
      return;
    }
    this.recognition = new SR();
    this.recognition.lang = 'zh-CN';
    this.recognition.interimResults = true;
    this.recognition.continuous = true;

    this.recognition.onresult = (e) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      this.transcript = t;
      $('#transcriptBox').textContent = t;
      $('#micHint').classList.add('hidden');
      this.checkGenBtn();
    };

    this.recognition.onerror = (e) => {
      const h = $('#micHint');
      if (e.error === 'not-allowed') h.innerHTML = '麦克风权限未开启<br><small>请在浏览器设置中允许，或使用文字输入</small>';
      else if (e.error === 'no-speech') h.textContent = '未检测到语音，请再试或使用文字输入';
      else h.textContent = '语音识别失败，请使用文字输入';
      h.classList.remove('hidden');
      this.recognizing = false;
      this.updateMicBtn();
    };

    this.recognition.onend = () => {
      this.recognizing = false;
      this.updateMicBtn();
    };

    try {
      this.recognition.start();
      this.recognizing = true;
      this.updateMicBtn();
    } catch (err) {
      $('#micHint').textContent = '语音启动失败，请使用文字输入';
      $('#micHint').classList.remove('hidden');
    }
  },

  stopMic() {
    if (!this.recognizing || !this.recognition) return;
    this.recognition.stop();
    this.recognizing = false;
    this.updateMicBtn();
  },

  updateMicBtn() {
    const btn = $('#recordBtn');
    if (this.recognizing) {
      btn.classList.add('on');
      btn.querySelector('.mic-icon').textContent = '🎙️';
    } else {
      btn.classList.remove('on');
      btn.querySelector('.mic-icon').textContent = '🎤';
    }
  },

  checkGenBtn() {
    const v = this.transcript.trim();
    const m = $('#textInput').value.trim();
    const ok = !!(v || m);
    $('#aiGenBtn').disabled = !ok;
    $('#directSaveBtn').disabled = !ok;
  },

  /* generate */
  async generate() {
    const txt = [this.transcript.trim(), $('#textInput').value.trim()].filter(Boolean).join('，');
    if (!txt) return;

    $('#photoStep').classList.add('hidden');
    $('#voiceStep').classList.add('hidden');
    $('#resultStep').classList.remove('hidden');
    $('#loadingBox').classList.remove('hidden');
    $('#resultBox').classList.add('hidden');
    $('#errorBox').classList.add('hidden');

    try {
      const b64 = this.photo ? this.photo.split(',')[1] : null;
      const r = await this.api.generateJournal(b64, txt);
      this.generated = r;

      $('#loadingBox').classList.add('hidden');
      $('#resultBox').classList.remove('hidden');
      $('#resTitle').textContent = r.title;
      $('#resJournal').textContent = r.journal;
      $('#resPoem').textContent = r.poem ? `「${r.poem}」` : '';
      $('#resMood').textContent = `${this.moodIcon(r.mood)} ${r.mood}`;
      $('#resTags').innerHTML = (r.tags||[]).map(t=>`<span class="tag">#${this.esc(t)}</span>`).join('');
    } catch (e) {
      $('#loadingBox').classList.add('hidden');
      $('#errorBox').classList.remove('hidden');
      $('#errMsg').textContent = e.message;
    }
  },

  /* direct save (录入文案 — skip AI) */
  directSave() {
    const txt = this.transcript.trim();
    const text = $('#textInput').value.trim();
    const combined = [txt, text].filter(Boolean).join('，');
    const body = combined || '记录这一刻';
    const title = combined.substring(0, 20) || '此刻';
    const moodMap = {'开心':'开心','平静':'平静','感动':'感动','兴奋':'兴奋','治愈':'治愈','疲惫':'疲惫','感恩':'感恩'};

    this.generated = {
      title: title,
      journal: body,
      mood: '平静',
      tags: ['日常'],
      poem: ''
    };
    this.save();
  },

  /* save */
  async save() {
    if (!this.generated) return;
    const entry = {
      id: Date.now().toString(36)+Math.random().toString(36).substring(2,6),
      date: new Date().toISOString(),
      photo: this.photo,
      transcript: this.transcript,
      title: this.generated.title,
      journal: this.generated.journal,
      mood: this.generated.mood,
      tags: this.generated.tags,
      poem: this.generated.poem
    };
    try { await Storage.saveEntry(entry); } catch (e) { alert(e.message); }
    this.closeNew();
    await this.renderList();
    setTimeout(() => {
      const top = $('#entryList').firstElementChild;
      if (top) top.scrollIntoView({behavior:'smooth'});
    }, 300);
  },

  /* ===== detail ===== */
  openDetail(i) {
    const e = this.entries[i];
    if (!e) return;
    this.detailIdx = i;
    this.editPhoto = null;
    this.viewMode();
    this.fillDetail(e);
    $('#detailOverlay').classList.add('on');
  },

  fillDetail(e) {
    const dp = $('#detailPhoto');
    if (e.photo) { dp.style.backgroundImage = `url(${e.photo})`; dp.classList.remove('no-img'); }
    else { dp.style.backgroundImage = ''; dp.classList.add('no-img'); }
    $('#detailDate').textContent = this.fmtDate(e.date, true);
    $('#detailMood').textContent = `${this.moodIcon(e.mood)} ${e.mood}`;
    $('#detailTitle').textContent = e.title;
    $('#detailBody').textContent = e.journal;
    $('#detailPoem').textContent = e.poem ? `「${e.poem}」` : '';
    $('#detailTranscript').textContent = e.transcript;
    $('#detailTags').innerHTML = (e.tags||[]).map(t=>`<span class="tag">#${this.esc(t)}</span>`).join('');
  },

  viewMode() {
    $$('#detailTitle,#detailBody').forEach(el=>el.classList.remove('hidden'));
    $$('#editTitleInput,#editBodyInput,#editPhotoBtn').forEach(el=>el.classList.add('hidden'));
    $('#viewActions').classList.remove('hidden');
    $('#editActions').classList.add('hidden');
  },

  editMode() {
    const e = this.entries[this.detailIdx];
    if (!e) return;
    $$('#detailTitle,#detailBody').forEach(el=>el.classList.add('hidden'));
    $$('#editTitleInput,#editBodyInput,#editPhotoBtn').forEach(el=>el.classList.remove('hidden'));
    $('#viewActions').classList.add('hidden');
    $('#editActions').classList.remove('hidden');
    $('#editTitleInput').value = e.title || '';
    $('#editBodyInput').value = e.journal || '';
  },

  cancelEdit() {
    const e = this.entries[this.detailIdx];
    if (!e) return;
    this.editPhoto = null;
    this.viewMode();
    this.fillDetail(e);
  },

  gotEditPhoto(e) {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      this.editPhoto = ev.target.result;
      $('#detailPhoto').style.backgroundImage = `url(${this.editPhoto})`;
      $('#detailPhoto').classList.remove('no-img');
    };
    r.readAsDataURL(f);
  },

  async saveEdit() {
    const e = this.entries[this.detailIdx];
    if (!e) return;
    e.title = $('#editTitleInput').value.trim() || e.title;
    e.journal = $('#editBodyInput').value.trim() || e.journal;
    if (this.editPhoto) e.photo = this.editPhoto;
    await Storage.saveEntry(e);
    this.entries = await Storage.getEntries();
    this.editPhoto = null;
    this.viewMode();
    this.fillDetail(e);
    await this.renderList();
  },

  closeDetail() {
    $('#detailOverlay').classList.remove('on');
    this.editPhoto = null;
    this.viewMode();
  },

  async deleteEntry() {
    const e = this.entries[this.detailIdx];
    if (!e) return;
    if (!confirm('确定删除这篇手账吗？')) return;
    await Storage.deleteEntry(e.id);
    this.closeDetail();
    await this.renderList();
  },

  /* ===== search ===== */
  onSearch() {
    this.searchQuery = $('#searchInput').value;
    if (this.searchQuery.trim()) {
      $('#clearSearchBtn').classList.remove('hidden');
    } else {
      $('#clearSearchBtn').classList.add('hidden');
    }
    this.renderList();
  },

  clearSearch() {
    this.searchQuery = '';
    $('#searchInput').value = '';
    $('#clearSearchBtn').classList.add('hidden');
    this.renderList();
  },

  /* ===== settings ===== */
  async openSettings() {
    const s = await Storage.getSettings();
    $('#providerSelect').value = s.provider || 'zhipu';
    $('#apiKeyInput').value = '';
    $('#customKeyBox').classList.add('hidden');
    $('#showCustomKeyBtn').classList.remove('hidden');
    $('#settingsOverlay').classList.add('on');
  },

  closeSettings() { $('#settingsOverlay').classList.remove('on'); },

  async resetKey() {
    await Storage.saveSettings({ provider: 'zhipu', apiKey: '' });
    this.api = new AIClient('zhipu', '35219dd3b6f441a5873d6d0c28b1de4e.r8Lb9LtVYFUa2U1j');
    $('#customKeyBox').classList.add('hidden');
    $('#showCustomKeyBtn').classList.remove('hidden');
    $('#apiKeyInput').value = '';
  },

  async saveKey() {
    const provider = $('#providerSelect').value;
    const key = $('#apiKeyInput').value.trim();
    if (!key) { alert('请输入 API Key'); return; }
    const btn = $('#saveKeyBtn');
    btn.disabled = true; btn.textContent = '验证中...';
    try { await AIClient.testConnection(provider, key); }
    catch (e) { alert('API Key 验证失败: '+e.message); btn.disabled=false; btn.textContent='保存自定义 Key'; return; }
    await Storage.saveSettings({ provider, apiKey: key });
    this.api = new AIClient(provider, key);
    btn.disabled = false; btn.textContent = '保存自定义 Key';
    this.closeSettings();
  },

  /* ===== util ===== */
  moodIcon(m) {
    const map = {'开心':'😊','平静':'😌','感动':'🥹','兴奋':'🤩','治愈':'🌿','疲惫':'😮‍💨','感恩':'🙏'};
    return map[m] || '📝';
  },

  fmtDate(iso, full) {
    const d = new Date(iso);
    const opts = full
      ? {year:'numeric',month:'long',day:'numeric',weekday:'long',hour:'2-digit',minute:'2-digit'}
      : {month:'numeric',day:'numeric'};
    return d.toLocaleDateString('zh-CN', opts);
  },

  esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
};

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

document.addEventListener('DOMContentLoaded', () => App.init());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
