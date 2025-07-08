// app.js

// --------------- 定数・グローバル変数 ---------------
const GAS_API_URL = 'https://script.google.com/macros/s/YOUR_GAS_DEPLOY_URL/exec'; // 差し替え必須

const DB_NAME = 'TrackFormAI';
const DB_STORE = 'records';

let stream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingBlob = null;

let delaySec = 5;
let poseModelType = 'lite'; // 'lite' or 'high'
let poseModel = null;

let feedbackText = '';
let feedbackAudio = null;

let audioCountEnabled = true;

let audioCountTimer = null;
let audioCountValue = 3;

const videoPreview = document.getElementById('videoPreview');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const saveMp4Btn = document.getElementById('saveMp4Btn');
const requestFeedbackBtn = document.getElementById('requestFeedbackBtn');
const feedbackTextArea = document.getElementById('feedbackText');
const playFeedbackAudioBtn = document.getElementById('playFeedbackAudioBtn');
const delayInput = document.getElementById('delayInput');
const enableAudioCountCheckbox = document.getElementById('enableAudioCount');
const delaySettingInput = document.getElementById('delaySettingInput');
const enableAudioCountSetting = document.getElementById('enableAudioCountSetting');
const poseModelSelect = document.getElementById('poseModelSelect');

const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const qrCodeCanvas = document.getElementById('qrCodeCanvas');

const templateEditor = document.getElementById('templateEditor');
const saveTemplateBtn = document.getElementById('saveTemplateBtn');
const resetTemplateBtn = document.getElementById('resetTemplateBtn');

let db = null;

// --------------- IndexedDB 操作 ---------------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject('DB開けず');
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function saveRecord(record) {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject('保存失敗');
  });
}

async function loadRecords() {
  if (!db) await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

async function clearRecords() {
  if (!db) await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.clear();
    req.onsuccess = () => resolve();
  });
}

async function deleteRecord(id) {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject('削除失敗');
  });
}

// --------------- カメラ初期化 ---------------
async function initCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoPreview.srcObject = stream;
  } catch (e) {
    alert('カメラまたはマイクのアクセスが拒否されました。');
  }
}

// --------------- 録画制御 ---------------
startRecordBtn.onclick = () => {
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    recordingBlob = new Blob(recordedChunks, { type: 'video/webm' });
    saveMp4Btn.disabled = false;
    requestFeedbackBtn.disabled = false;
    stopAudioCount();
  };
  mediaRecorder.start();
  startRecordBtn.disabled = true;
  stopRecordBtn.disabled = false;
  saveMp4Btn.disabled = true;
  requestFeedbackBtn.disabled = true;
  feedbackTextArea.value = '';

  if (audioCountEnabled) startAudioCount();
};

stopRecordBtn.onclick = () => {
  mediaRecorder.stop();
  startRecordBtn.disabled = false;
  stopRecordBtn.disabled = true;
};

// --------------- 音声カウント ---------------
function startAudioCount() {
  audioCountValue = 3;
  speakCount(audioCountValue);
  audioCountTimer = setInterval(() => {
    audioCountValue--;
    if (audioCountValue <= 0) {
      stopAudioCount();
      return;
    }
    speakCount(audioCountValue);
  }, 1000);
}

function speakCount(num) {
  const utter = new SpeechSynthesisUtterance(num.toString());
  utter.lang = 'ja-JP';
  speechSynthesis.speak(utter);
}

function stopAudioCount() {
  clearInterval(audioCountTimer);
  audioCountTimer = null;
}

// --------------- 遅延秒数設定 ---------------
delayInput.oninput = () => {
  const val = parseInt(delayInput.value);
  if (!isNaN(val) && val >= 0 && val <= 60) delaySec = val;
};
delaySettingInput.oninput = () => {
  const val = parseInt(delaySettingInput.value);
  if (!isNaN(val) && val >= 0 && val <= 60) {
    delaySec = val;
    delayInput.value = val;
  }
};

// --------------- 音声カウント有効切替 ---------------
enableAudioCountCheckbox.onchange = () => {
  audioCountEnabled = enableAudioCountCheckbox.checked;
  enableAudioCountSetting.checked = audioCountEnabled;
};
enableAudioCountSetting.onchange = () => {
  audioCountEnabled = enableAudioCountSetting.checked;
  enableAudioCountCheckbox.checked = audioCountEnabled;
};

// --------------- タブ切替 ---------------
document.querySelectorAll('.tabBtn').forEach(btn => {
  btn.onclick = e => {
    document.querySelectorAll('.tabBtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-tab');
    document.querySelectorAll('.tabContent').forEach(sec => {
      sec.style.display = sec.id === tab ? 'block' : 'none';
    });
    if (tab === 'history') refreshHistory();
  };
});

// 続きは次に送ります・・・
