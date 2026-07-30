/* ============================================
   声音手账 Voice Journal - Main App
   ============================================ */

const App = {
  api: null,
  entries: [],
  currentPhoto: null,
  currentTranscript: '',
  recognition: null,
  isRecording: false,
  currentDetailIndex: -1,
  editPhotoData: null,
  photoSelecting: false,

  /* ============ Init ============ */
  async init() {
    const settings = await Storage.getSettings();
    const apiKey = settings.apiKey || '35219dd3b6f441a5873d6d0c28b1de4e.r8Lb9LtVYFUa2U1j';
    this.api = new AIClient(settings.provider || 'zhipu', apiKey);
    this.entries = await Storage.getEntries();
    this.bindEvents();
    this.renderHome();
    this.checkSpeechSupport();
  },

  checkSpeechSupport() {
    // Web Speech API 支持检测，语音按钮始终显示，文字输入作为备选
  },

  /* ============ Event Binding ============ */
  bindEvents() {
    // FAB
    document.getElementById('fabBtn').addEventListener('click', () => this.openNewEntry());

    // Settings
    document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
    document.getElementById('closeSettingsBtn').addEventListener('click', () => this.closeSettings());
    document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
    document.getElementById('useCustomKeyBtn').addEventListener('click', () => this.showCustomKey());
    document.getElementById('useDefaultKeyBtn').addEventListener('click', () => this.useDefaultKey());

    // New entry flow
    document.getElementById('closeNewEntryBtn').addEventListener('click', () => this.closeNewEntry());
    document.getElementById('photoInput').addEventListener('change', (e) => this.handlePhoto(e));
    document.getElementById('retakePhotoBtn').addEventListener('click', () => this.retakePhoto());
    document.getElementById('usePhotoBtn').addEventListener('click', () => this.goToStep('voice'));
    document.getElementById('skipPhotoBtn').addEventListener('click', () => this.skipPhoto());
    document.getElementById('recordBtn').addEventListener('mousedown', () => this.startRecording());
    document.getElementById('recordBtn').addEventListener('mouseup', () => this.stopRecording());
    document.getElementById('recordBtn').addEventListener('touchstart', (e) => { e.preventDefault(); this.startRecording(); });
    document.getElementById('recordBtn').addEventListener('touchend', (e) => { e.preventDefault(); this.stopRecording(); });
    document.getElementById('recordBtn').addEventListener('mouseleave', () => { if (this.isRecording) this.stopRecording(); });
    document.getElementById('generateBtn').addEventListener('click', () => this.generateJournal());
    document.getElementById('saveJournalBtn').addEventListener('click', () => this.saveJournal());
    document.getElementById('discardJournalBtn').addEventListener('click', () => this.closeNewEntry());
    document.getElementById('retryGenerateBtn').addEventListener('click', () => this.generateJournal());
    document.getElementById('regenerateBtn').addEventListener('click', () => this.generateJournal());

    // Voice fallback
    document.getElementById('manualTextInput').addEventListener('input', () => {
      this.updateGenerateButton();
    });

    // Detail modal
    document.getElementById('closeDetailBtn').addEventListener('click', () => this.closeDetail());
    document.getElementById('editEntryBtn').addEventListener('click', () => this.enterEditMode());
    document.getElementById('cancelEditBtn').addEventListener('click', () => this.cancelEdit());
    document.getElementById('saveEditBtn').addEventListener('click', () => this.saveEdit());
    document.getElementById('editPhotoInput').addEventListener('change', (e) => this.handleEditPhoto(e));
    document.getElementById('deleteEntryBtn').addEventListener('click', () => this.deleteEntry());
  },

  /* ============ Rendering ============ */
  async renderHome() {
    const container = document.getElementById('entryList');
    const emptyState = document.getElementById('emptyState');
    const entryCount = document.getElementById('entryCount');

    this.entries = await Storage.getEntries();
    entryCount.textContent = `${this.entries.length} 篇手账`;

    if (this.entries.length === 0) {
      emptyState.classList.remove('hidden');
      container.innerHTML = '';
      return;
    }

    emptyState.classList.add('hidden');
    container.innerHTML = this.entries.map((entry, i) => `
      <div class="entry-card" data-index="${i}">
        <div class="card-photo" style="${entry.photo ? `background-image:url(${entry.photo})` : 'background: linear-gradient(135deg, #fdf2e9, #f5e6d3);'}"></div>
        <div class="card-body">
          <div class="card-header">
            <span class="card-mood">${this.moodEmoji(entry.mood)}</span>
            <span class="card-date">${this.formatDate(entry.date)}</span>
          </div>
          <h3 class="card-title">${this.esc(entry.title)}</h3>
          <p class="card-preview">${this.esc(entry.journal).substring(0, 60)}...</p>
          ${entry.poem ? `<p class="card-poem">「${this.esc(entry.poem)}」</p>` : ''}
          <div class="card-tags">
            ${(entry.tags || []).map((t) => `<span class="tag">#${this.esc(t)}</span>`).join(' ')}
          </div>
        </div>
      </div>
    `).join('');

    // Card click → detail
    container.querySelectorAll('.entry-card').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index);
        this.openDetail(idx);
      });
    });
  },

  /* ============ New Entry Flow ============ */
  openNewEntry() {
    if (!this.api) { this.openSettings(); return; }

    document.getElementById('newEntryOverlay').classList.add('active');
    this.resetNewEntry();
    document.getElementById('stepPhoto').classList.remove('hidden');
    document.getElementById('stepVoice').classList.add('hidden');
    document.getElementById('stepResult').classList.add('hidden');
  },

  closeNewEntry() {
    document.getElementById('newEntryOverlay').classList.remove('active');
    this.resetNewEntry();
  },

  resetNewEntry() {
    this.currentPhoto = null;
    this.currentTranscript = '';
    this.generatedJournal = null;
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('photoPlaceholder').classList.remove('hidden');
    document.getElementById('photoThumbWrapper').classList.add('hidden');
    document.getElementById('transcriptDisplay').textContent = '';
    document.getElementById('recordHint').classList.remove('hidden');
    document.getElementById('generateBtn').disabled = true;
    document.getElementById('manualTextInput').value = '';
  },

  /* --- Photo Step --- */
  handlePhoto(e) {
    // Prevent double-trigger on file picker dismiss
    if (this.photoSelecting) { e.target.value = ''; return; }
    const file = e.target.files[0];
    if (!file) { this.photoSelecting = false; return; }
    this.photoSelecting = true;

    const reader = new FileReader();
    reader.onload = (ev) => {
      this.currentPhoto = ev.target.result;
      document.getElementById('photoPreviewImg').src = this.currentPhoto;
      document.getElementById('photoThumb').src = this.currentPhoto;
      document.getElementById('photoThumbWrapper').classList.remove('hidden');
      document.getElementById('photoPreview').classList.remove('hidden');
      document.getElementById('photoPlaceholder').classList.add('hidden');
      setTimeout(() => { this.photoSelecting = false; }, 500);
    };
    reader.onerror = () => { this.photoSelecting = false; };
    reader.readAsDataURL(file);
    e.target.value = '';
  },

  skipPhoto() {
    this.currentPhoto = null;
    document.getElementById('photoThumbWrapper').classList.add('hidden');
    this.goToStep('voice');
  },

  retakePhoto() {
    const input = document.getElementById('photoInput');
    input.value = '';
    input.click();
  },

  /* --- Voice Step --- */
  startRecording() {
    if (this.isRecording) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      document.getElementById('recordHint').textContent = '当前浏览器不支持语音，请使用下方文字输入';
      document.getElementById('recordHint').classList.remove('hidden');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'zh-CN';
    this.recognition.interimResults = true;
    this.recognition.continuous = true;

    this.recognition.onresult = (e) => {
      let transcript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      this.currentTranscript = transcript;
      document.getElementById('transcriptDisplay').textContent = transcript;
      document.getElementById('recordHint').classList.add('hidden');
      this.updateGenerateButton();
    };

    this.recognition.onerror = (e) => {
      const hint = document.getElementById('recordHint');
      if (e.error === 'not-allowed') {
        hint.textContent = '麦克风权限未开启，请使用下方文字输入';
      } else if (e.error === 'no-speech') {
        hint.textContent = '未检测到语音，请再试一次或使用文字输入';
      } else {
        hint.textContent = '语音识别失败，请使用下方文字输入';
      }
      hint.classList.remove('hidden');
      this.isRecording = false;
      this.updateRecordButton();
    };

    this.recognition.onend = () => {
      this.isRecording = false;
      this.updateRecordButton();
    };

    try {
      this.recognition.start();
      this.isRecording = true;
    } catch (err) {
      const hint = document.getElementById('recordHint');
      hint.textContent = '语音启动失败，请使用下方文字输入';
      hint.classList.remove('hidden');
      this.isRecording = false;
      this.updateRecordButton();
    }
    this.updateRecordButton();
  },

  stopRecording() {
    if (!this.isRecording || !this.recognition) return;
    this.recognition.stop();
    this.isRecording = false;
    this.updateRecordButton();
  },

  updateRecordButton() {
    const btn = document.getElementById('recordBtn');
    const icon = btn.querySelector('.record-icon');
    if (this.isRecording) {
      btn.classList.add('recording');
      icon.textContent = '🎙️';
    } else {
      btn.classList.remove('recording');
      icon.textContent = '🎤';
    }
  },

  updateGenerateButton() {
    const voice = this.currentTranscript.trim();
    const manual = document.getElementById('manualTextInput').value.trim();
    document.getElementById('generateBtn').disabled = !(voice || manual);
  },

  goToStep(step) {
    document.getElementById('stepPhoto').classList.add('hidden');
    document.getElementById('stepVoice').classList.add('hidden');
    document.getElementById('stepResult').classList.add('hidden');

    if (step === 'voice') {
      document.getElementById('stepVoice').classList.remove('hidden');
    } else if (step === 'result') {
      document.getElementById('stepResult').classList.remove('hidden');
    }
  },

  /* --- Generate --- */
  async generateJournal() {
    const voice = this.currentTranscript.trim();
    const manual = document.getElementById('manualTextInput').value.trim();
    const combined = [voice, manual].filter(Boolean).join('，');
    if (!combined) return;

    this.goToStep('result');
    document.getElementById('resultLoading').classList.remove('hidden');
    document.getElementById('resultContent').classList.add('hidden');
    document.getElementById('resultError').classList.add('hidden');

    try {
      const base64 = this.currentPhoto ? this.currentPhoto.split(',')[1] : null;
      const result = await this.api.generateJournal(base64, combined);

      document.getElementById('resultLoading').classList.add('hidden');
      document.getElementById('resultContent').classList.remove('hidden');

      document.getElementById('resultTitle').textContent = result.title;
      document.getElementById('resultJournal').textContent = result.journal;
      document.getElementById('resultPoem').textContent = result.poem ? `「${result.poem}」` : '';
      document.getElementById('resultMood').textContent = `${this.moodEmoji(result.mood)} ${result.mood}`;
      document.getElementById('resultTags').innerHTML = (result.tags || [])
        .map((t) => `<span class="tag">#${this.esc(t)}</span>`).join(' ');

      this.generatedJournal = result;
    } catch (e) {
      document.getElementById('resultLoading').classList.add('hidden');
      document.getElementById('resultError').classList.remove('hidden');
      document.getElementById('errorMessage').textContent = e.message;
    }
  },

  /* --- Save --- */
  async saveJournal() {
    if (!this.generatedJournal) return;

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      date: new Date().toISOString(),
      photo: this.currentPhoto,
      transcript: this.currentTranscript,
      title: this.generatedJournal.title,
      journal: this.generatedJournal.journal,
      mood: this.generatedJournal.mood,
      tags: this.generatedJournal.tags,
      poem: this.generatedJournal.poem
    };

    try {
      await Storage.saveEntry(entry);
    } catch (e) {
      alert(e.message);
    }

    this.closeNewEntry();
    this.entries = await Storage.getEntries();
    this.renderHome();

    setTimeout(() => {
      const top = document.getElementById('entryList').firstElementChild;
      if (top) top.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  },

  /* ============ Detail ============ */
  openDetail(index) {
    const entry = this.entries[index];
    if (!entry) return;

    this.currentDetailIndex = index;
    this.editPhotoData = null;
    this.setDetailViewMode();
    this.renderDetailContent(entry);
    document.getElementById('detailModal').classList.add('active');
  },

  renderDetailContent(entry) {
    const dp = document.getElementById('detailPhoto');
    if (entry.photo) {
      dp.style.backgroundImage = `url(${entry.photo})`;
      dp.classList.remove('no-photo');
    } else {
      dp.style.backgroundImage = '';
      dp.classList.add('no-photo');
    }
    document.getElementById('detailDate').textContent = this.formatDate(entry.date, true);
    document.getElementById('detailMood').textContent = `${this.moodEmoji(entry.mood)} ${entry.mood}`;
    document.getElementById('detailTitle').textContent = entry.title;
    document.getElementById('detailJournal').textContent = entry.journal;
    document.getElementById('detailPoem').textContent = entry.poem ? `「${entry.poem}」` : '';
    document.getElementById('detailTranscript').textContent = entry.transcript;
    document.getElementById('detailTags').innerHTML = (entry.tags || [])
      .map((t) => `<span class="tag">#${this.esc(t)}</span>`).join(' ');
  },

  setDetailViewMode() {
    document.getElementById('detailTitle').classList.remove('hidden');
    document.getElementById('detailJournal').classList.remove('hidden');
    document.getElementById('editTitle').classList.add('hidden');
    document.getElementById('editJournal').classList.add('hidden');
    document.getElementById('editPhotoLabel').classList.add('hidden');
    document.getElementById('detailActionsView').classList.remove('hidden');
    document.getElementById('detailActionsEdit').classList.add('hidden');
  },

  enterEditMode() {
    const entry = this.entries[this.currentDetailIndex];
    if (!entry) return;

    document.getElementById('detailTitle').classList.add('hidden');
    document.getElementById('detailJournal').classList.add('hidden');
    document.getElementById('editTitle').classList.remove('hidden');
    document.getElementById('editJournal').classList.remove('hidden');
    document.getElementById('editPhotoLabel').classList.remove('hidden');
    document.getElementById('detailActionsView').classList.add('hidden');
    document.getElementById('detailActionsEdit').classList.remove('hidden');

    document.getElementById('editTitle').value = entry.title || '';
    document.getElementById('editJournal').value = entry.journal || '';
    this.editPhotoData = null;
  },

  cancelEdit() {
    const entry = this.entries[this.currentDetailIndex];
    if (!entry) return;
    this.editPhotoData = null;
    this.setDetailViewMode();
    this.renderDetailContent(entry);
  },

  handleEditPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      this.editPhotoData = ev.target.result;
      const dp = document.getElementById('detailPhoto');
      dp.style.backgroundImage = `url(${this.editPhotoData})`;
      dp.classList.remove('no-photo');
    };
    reader.readAsDataURL(file);
  },

  async saveEdit() {
    const entry = this.entries[this.currentDetailIndex];
    if (!entry) return;

    entry.title = document.getElementById('editTitle').value.trim() || entry.title;
    entry.journal = document.getElementById('editJournal').value.trim() || entry.journal;
    if (this.editPhotoData) {
      entry.photo = this.editPhotoData;
    }

    await Storage.saveEntry(entry);
    this.entries = await Storage.getEntries();
    this.editPhotoData = null;
    this.setDetailViewMode();
    this.renderDetailContent(entry);
    this.renderHome();
  },

  closeDetail() {
    document.getElementById('detailModal').classList.remove('active');
    this.editPhotoData = null;
    this.setDetailViewMode();
  },

  async deleteEntry() {
    const entry = this.entries[this.currentDetailIndex];
    if (!entry) return;
    if (!confirm('确定删除这篇手账吗？')) return;
    await Storage.deleteEntry(entry.id);
    this.closeDetail();
    await this.renderHome();
  },

  /* ============ Settings ============ */
  async openSettings() {
    const settings = await Storage.getSettings();
    document.getElementById('providerSelect').value = settings.provider || 'zhipu';
    document.getElementById('apiKeyInput').value = '';
    document.getElementById('customKeySection').classList.add('hidden');
    document.getElementById('useCustomKeyBtn').classList.remove('hidden');
    document.getElementById('settingsOverlay').classList.add('active');
  },

  showCustomKey() {
    document.getElementById('customKeySection').classList.remove('hidden');
    document.getElementById('useCustomKeyBtn').classList.add('hidden');
  },

  async useDefaultKey() {
    await Storage.saveSettings({ provider: 'zhipu', apiKey: '' });
    this.api = new AIClient('zhipu', '35219dd3b6f441a5873d6d0c28b1de4e.r8Lb9LtVYFUa2U1j');
    document.getElementById('customKeySection').classList.add('hidden');
    document.getElementById('useCustomKeyBtn').classList.remove('hidden');
    document.getElementById('apiKeyInput').value = '';
  },

  closeSettings() {
    document.getElementById('settingsOverlay').classList.remove('active');
  },

  async saveSettings() {
    const provider = document.getElementById('providerSelect').value;
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    if (!apiKey) { alert('请输入 API Key'); return; }

    const btn = document.getElementById('saveSettingsBtn');
    btn.disabled = true;
    btn.textContent = '验证中...';

    try {
      await AIClient.testConnection(provider, apiKey);
    } catch (e) {
      alert('API Key 验证失败: ' + e.message);
      btn.disabled = false;
      btn.textContent = '保存自定义 Key';
      return;
    }

    await Storage.saveSettings({ provider, apiKey });
    this.api = new AIClient(provider, apiKey);
    btn.disabled = false;
    btn.textContent = '保存自定义 Key';
    this.closeSettings();
  },

  /* ============ Utilities ============ */
  moodEmoji(mood) {
    const map = { '开心': '😊', '平静': '😌', '感动': '🥹', '兴奋': '🤩', '治愈': '🌿', '疲惫': '😮‍💨', '感恩': '🙏' };
    return map[mood] || '📝';
  },

  formatDate(iso, full = false) {
    const d = new Date(iso);
    const opts = full
      ? { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' }
      : { month: 'numeric', day: 'numeric' };
    return d.toLocaleDateString('zh-CN', opts);
  },

  esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
