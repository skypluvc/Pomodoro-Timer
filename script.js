// ===== State =====
let mode = 'focus';          // 'focus' | 'break'
let isRunning = false;
let remainingSeconds = 25 * 60;
let timerInterval = null;
let totalSeconds = 25 * 60;

// ===== DOM =====
const timerDisplay = document.getElementById('timerDisplay');
const statusText = document.getElementById('statusText');
const modeLabel = document.getElementById('modeLabel');
const startBtn = document.getElementById('startBtn');
const btnFocus = document.getElementById('btnFocus');
const btnBreak = document.getElementById('btnBreak');
const focusInput = document.getElementById('focusInput');
const breakInput = document.getElementById('breakInput');
const progressBar = document.getElementById('progressBar');
const notifBtn = document.getElementById('notifBtn');

// ===== Audio Context =====
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Helper: mainkan satu nada
function playTone(freq, startTime, duration, type = 'sine', volume = 0.5) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

// 🔔 Suara saat FOKUS habis 
function playBreakAlarm() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  // C5 → E5 → G5 → C6 (akor mayor naik = "horee, istirahat!")
  playTone(523.25, now + 0.00, 0.22, 'sine', 0.45);
  playTone(659.25, now + 0.25, 0.22, 'sine', 0.45);
  playTone(783.99, now + 0.50, 0.22, 'sine', 0.45);
  playTone(1046.50, now + 0.75, 0.45, 'sine', 0.5);
}

// ⏰ Suara saat ISTIRAHAT habis
function playFocusAlarm() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  // G5 → E5 → C5, nada terakhir panjang + waveform tegas
  playTone(783.99, now + 0.00, 0.18, 'square', 0.28);
  playTone(659.25, now + 0.22, 0.18, 'square', 0.28);
  playTone(523.25, now + 0.44, 0.55, 'sawtooth', 0.28);

  // Ketukan tegas tambahan sebagai "alarm"
  playTone(523.25, now + 1.15, 0.15, 'square', 0.3);
  playTone(523.25, now + 1.45, 0.15, 'square', 0.3);
}

// Getaran (jika didukung)
function vibrate() {
  if ('vibrate' in navigator) {
    navigator.vibrate([300, 150, 300, 150, 500]);
  }
}

// ===== Notifikasi Desktop =====
function isNotifSupported() {
  return 'Notification' in window;
}

function updateNotifButton() {
  if (!isNotifSupported()) {
    notifBtn.textContent = '🔕 Notifikasi desktop tidak didukung';
    notifBtn.classList.add('denied');
    notifBtn.disabled = true;
    return;
  }

  const perm = Notification.permission;
  notifBtn.classList.remove('granted', 'denied');

  if (perm === 'granted') {
    notifBtn.textContent = '🔔 Notifikasi aktif';
    notifBtn.classList.add('granted');
    notifBtn.disabled = true;
  } else if (perm === 'denied') {
    notifBtn.textContent = '🔕 Notifikasi diblokir (aktifkan di pengaturan browser)';
    notifBtn.classList.add('denied');
    notifBtn.disabled = true;
  } else {
    notifBtn.textContent = '🔔 Aktifkan Notifikasi';
    notifBtn.disabled = false;
  }
}

async function requestNotifPermission() {
  if (!isNotifSupported()) return;
  if (Notification.permission === 'granted') return;

  try {
    const result = await Notification.requestPermission();
    updateNotifButton();
    if (result === 'granted') {
      showNotification(
        'Notifikasi aktif 🎉',
        'Kamu akan diberi tahu saat waktu fokus/istirahat selesai.'
      );
    }
  } catch (err) {
    // Fallback untuk browser lama (callback-based API)
    Notification.requestPermission((result) => {
      updateNotifButton();
      if (result === 'granted') {
        showNotification(
          'Notifikasi aktif 🎉',
          'Kamu akan diberi tahu saat waktu fokus/istirahat selesai.'
        );
      }
    });
  }
}

function showNotification(title, body) {
  if (!isNotifSupported() || Notification.permission !== 'granted') return;

  try {
    const notif = new Notification(title, {
      body,
      tag: 'focus-timer',
      renotify: true,
      requireInteraction: true,
    });

    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch (err) {
    console.warn('Gagal menampilkan notifikasi:', err);
  }
}

// Gabungan alarm: pilih suara berdasarkan TUJUAN mode berikutnya
// 'break' → menuju istirahat (fokus habis)
// 'focus' → menuju fokus (istirahat habis)
function notifyAlarm(nextMode, title, body) {
  initAudio();
  if (nextMode === 'break') {
    playBreakAlarm();
  } else {
    playFocusAlarm();
  }
  vibrate();
  showNotification(title, body);
}

// ===== Helper format waktu =====
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ===== Update tampilan =====
function updateDisplay() {
  timerDisplay.textContent = formatTime(remainingSeconds);
  document.title = `${formatTime(remainingSeconds)} - ${mode === 'focus' ? 'Fokus' : 'Istirahat'}`;

  // Progress bar
  const pct = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;
  progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;

  if (mode === 'focus') {
    modeLabel.textContent = 'Waktu Fokus';
    statusText.textContent = isRunning ? 'Tetap semangat, jangan menyerah!' : 'Siap untuk fokus!';
  } else {
    modeLabel.textContent = 'Waktu Istirahat';
    statusText.textContent = isRunning ? 'Santai dulu, isi energi!' : 'Siap untuk istirahat!';
  }
}

// ===== Set mode =====
function setMode(newMode) {
  if (mode === newMode) return;

  if (isRunning) {
    clearInterval(timerInterval);
    isRunning = false;
    startBtn.textContent = 'Mulai';
  }

  mode = newMode;
  document.body.classList.toggle('break-mode', mode === 'break');

  btnFocus.classList.toggle('active', mode === 'focus');
  btnBreak.classList.toggle('active', mode === 'break');

  totalSeconds = getDurationForMode(mode);
  remainingSeconds = totalSeconds;
  timerDisplay.classList.remove('pulse');
  updateDisplay();
}

// ===== Ambil durasi sesuai input =====
function getDurationForMode(m) {
  if (m === 'focus') {
    let val = parseInt(focusInput.value, 10);
    if (isNaN(val) || val < 1) val = 25;
    if (val > 120) val = 120;
    focusInput.value = val;
    return val * 60;
  } else {
    let val = parseInt(breakInput.value, 10);
    if (isNaN(val) || val < 1) val = 5;
    if (val > 60) val = 60;
    breakInput.value = val;
    return val * 60;
  }
}

// ===== Toggle timer =====
function toggleTimer() {
  initAudio();

  if (isRunning) {
    clearInterval(timerInterval);
    isRunning = false;
    startBtn.textContent = 'Lanjut';
    statusText.textContent = 'Timer dijeda';
    return;
  }

  // Minta izin notif otomatis pada interaksi pertama
  if (isNotifSupported() && Notification.permission === 'default') {
    requestNotifPermission();
  }

  isRunning = true;
  startBtn.textContent = 'Jeda';
  timerDisplay.classList.remove('pulse');

  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateDisplay();

    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      isRunning = false;
      startBtn.textContent = 'Mulai';
      handleTimerEnd();
    }
  }, 1000);

  updateDisplay();
}

// ===== Saat waktu habis =====
function handleTimerEnd() {
  if (mode === 'focus') {
    // Fokus habis → menuju istirahat (suara NAIK)
    notifyAlarm(
      'break',
      '✅ Waktu fokus selesai!',
      'Saatnya istirahat. Kamu sudah bekerja dengan baik.'
    );

    mode = 'break';
    document.body.classList.add('break-mode');
    btnFocus.classList.remove('active');
    btnBreak.classList.add('active');

    totalSeconds = getDurationForMode('break');
    remainingSeconds = totalSeconds;
    updateDisplay();

    statusText.textContent = 'Waktu fokus selesai! Saatnya istirahat.';
    timerDisplay.classList.add('pulse');
  } else {
    // Istirahat habis → kembali fokus (suara TURUN)
    notifyAlarm(
      'focus',
      '⏰ Istirahat selesai!',
      'Ayo lanjutkan tugasmu!'
    );

    mode = 'focus';
    document.body.classList.remove('break-mode');
    btnBreak.classList.remove('active');
    btnFocus.classList.add('active');

    totalSeconds = getDurationForMode('focus');
    remainingSeconds = totalSeconds;
    updateDisplay();

    statusText.textContent = 'Istirahat selesai! Ayo lanjutkan tugas.';
    timerDisplay.classList.add('pulse');
  }

  isRunning = false;
  startBtn.textContent = 'Mulai';
}

// ===== Reset timer =====
function resetTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  startBtn.textContent = 'Mulai';

  totalSeconds = getDurationForMode(mode);
  remainingSeconds = totalSeconds;
  timerDisplay.classList.remove('pulse');
  updateDisplay();

  statusText.textContent = mode === 'focus' ? 'Siap untuk fokus!' : 'Siap untuk istirahat!';
}

// ===== Event: ubah durasi =====
focusInput.addEventListener('change', () => {
  if (mode === 'focus' && !isRunning) {
    totalSeconds = getDurationForMode('focus');
    remainingSeconds = totalSeconds;
    updateDisplay();
  }
});

breakInput.addEventListener('change', () => {
  if (mode === 'break' && !isRunning) {
    totalSeconds = getDurationForMode('break');
    remainingSeconds = totalSeconds;
    updateDisplay();
  }
});

// ===== Keyboard shortcut: spasi = start/pause =====
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
    e.preventDefault();
    toggleTimer();
  }
});

// ===== Inisialisasi =====
updateDisplay();
updateNotifButton();