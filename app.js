// app.js

// --------------- 定数・グローバル変数 ---------------
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycby3hf-Nl4Mr0aew5Sy5eH3dbT4sR5EMaC_EOi_wRLWHorAzmDQWPQQj62n_YsbtYF2t/exec'; // 差し替え必須

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

// ---------------- ffmpeg.wasm を使ったWebM→MP4変換＆保存 ----------------
async function saveMp4() {
  if (!recordingBlob) return alert('録画がありません');

  const { createFFmpeg, fetchFile } = FFmpeg;
  const ffmpeg = createFFmpeg({ log: true });
  try {
    await ffmpeg.load();
    ffmpeg.FS('writeFile', 'input.webm', await fetchFile(recordingBlob));
    await ffmpeg.run('-i', 'input.webm', '-c:v', 'copy', '-c:a', 'aac', 'output.mp4');
    const data = ffmpeg.FS('readFile', 'output.mp4');
    const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });

    // ダウンロードリンク生成
    const url = URL.createObjectURL(mp4Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `フォーム_${new Date().toISOString()}.mp4`;
    a.click();

    // IndexedDBにBase64形式で保存
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result;
      await saveRecord({
        type: 'video',
        date: new Date().toISOString(),
        blobBase64: base64,
        feedback: feedbackTextArea.value || '',
        poseModelType,
        delaySec,
      });
      alert('録画を保存しました');
      await refreshHistory();
    };
    reader.readAsDataURL(mp4Blob);

  } catch (e) {
    alert('変換エラー: ' + e.message);
  }
}

saveMp4Btn.onclick = saveMp4;

// ---------------- GAS API呼び出しによるAIフィードバック取得 ----------------
requestFeedbackBtn.onclick = async () => {
  if (!recordingBlob) return alert('録画してください');
  requestFeedbackBtn.disabled = true;
  feedbackTextArea.value = 'AIフィードバック生成中...';

  try {
    const formData = new FormData();
    formData.append('file', recordingBlob, 'recording.webm');

    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('通信エラー');
    const text = await res.text();
    feedbackTextArea.value = text;
    feedbackText = text;
    playFeedbackAudioBtn.disabled = false;
  } catch (e) {
    feedbackTextArea.value = 'エラー: ' + e.message;
  }
  requestFeedbackBtn.disabled = false;
};

// ---------------- 音声読み上げ制御 ----------------
playFeedbackAudioBtn.onclick = () => {
  if (!feedbackText) return;
  if (feedbackAudio) {
    speechSynthesis.cancel();
    feedbackAudio = null;
    playFeedbackAudioBtn.textContent = '音声読み上げ';
    return;
  }
  const utter = new SpeechSynthesisUtterance(feedbackText);
  utter.lang = 'ja-JP';
  utter.rate = 1.0;
  speechSynthesis.speak(utter);
  playFeedbackAudioBtn.textContent = '読み上げ中...';
  utter.onend = () => {
    playFeedbackAudioBtn.textContent = '音声読み上げ';
    feedbackAudio = null;
  };
  feedbackAudio = utter;
};

// ---------------- 履歴表示・管理 ----------------
async function refreshHistory() {
  const records = await loadRecords();
  historyList.innerHTML = '';
  if (records.length === 0) {
    historyList.textContent = '履歴なし';
    qrCodeCanvas.getContext('2d').clearRect(0, 0, qrCodeCanvas.width, qrCodeCanvas.height);
    return;
  }
  records.reverse().forEach(r => {
    const div = document.createElement('div');
    div.style.border = '1px solid #ddd';
    div.style.margin = '0.2rem 0';
    div.style.padding = '0.2rem';
    const d = new Date(r.date);
    div.innerHTML = `<strong>${d.toLocaleString()}</strong><br/>${r.feedback ? r.feedback.substring(0, 50) + '...' : '(フィードバックなし)'}<br/>` +
      `<button data-id="${r.id}" class="playRecordBtn">再生</button> ` +
      `<button data-id="${r.id}" class="shareRecordBtn">共有QR</button> ` +
      `<button data-id="${r.id}" class="deleteRecordBtn">削除</button>`;
    historyList.appendChild(div);
  });

  document.querySelectorAll('.playRecordBtn').forEach(btn => {
    btn.onclick = async e => {
      const id = Number(btn.getAttribute('data-id'));
      const rec = (await loadRecords()).find(r => r.id === id);
      if (!rec) return alert('レコード見つかりません');
      playBase64Video(rec.blobBase64);
    };
  });

  document.querySelectorAll('.shareRecordBtn').forEach(btn => {
    btn.onclick = async e => {
      const id = Number(btn.getAttribute('data-id'));
      const rec = (await loadRecords()).find(r => r.id === id);
      if (!rec) return alert('レコード見つかりません');
      generateQRCode(rec);
    };
  });

  document.querySelectorAll('.deleteRecordBtn').forEach(btn => {
    btn.onclick = async e => {
      const id = Number(btn.getAttribute('data-id'));
      if (!confirm('本当に削除しますか？')) return;
      await deleteRecord(id);
      await refreshHistory();
    };
  });
}

clearHistoryBtn.onclick = async () => {
  if (!confirm('履歴をすべて削除しますか？')) return;
  await clearRecords();
  await refreshHistory();
};

// ---------------- Base64動画再生 ----------------
function playBase64Video(base64) {
  const win = window.open('', '_blank');
  if (!win) return alert('ポップアップブロックが有効です');
  const html = `<video controls autoplay style="width:100%;height:auto;" src="${base64}"></video>`;
  win.document.write(html);
}

// ---------------- QRコード生成 ----------------
function generateQRCode(record) {
  const dataStr = JSON.stringify(record);
  QRCode.toCanvas(qrCodeCanvas, dataStr, { width: 150 }, function (error) {
    if (error) alert('QRコード生成エラー');
  });
}

// ---------------- テンプレート編集 ----------------
const DEFAULT_TEMPLATE = `{
  "スタート姿勢": {
    "肩の位置": "スタートラインの真上か？",
    "腰の高さ": "肩より低い位置か？",
    "膝の角度": "リラックスした角度か？"
  },
  "セット姿勢": {
    "腰の高さ": "肩より少し高いか？",
    "前足膝角度": "90〜110度？",
    "後足膝角度": "120〜130度？",
    "背中の角度": "前傾姿勢か？"
  }
}`;

function loadTemplate() {
  const saved = localStorage.getItem('feedbackTemplate');
  if (saved) return saved;
  return DEFAULT_TEMPLATE;
}
function saveTemplate() {
  localStorage.setItem('feedbackTemplate', templateEditor.value);
}

templateEditor.value = loadTemplate();

saveTemplateBtn.onclick = () => {
  try {
    JSON.parse(templateEditor.value);
    saveTemplate();
    alert('テンプレートを保存しました');
  } catch {
    alert('JSON形式が不正です');
  }
};

resetTemplateBtn.onclick = () => {
  templateEditor.value = DEFAULT_TEMPLATE;
  saveTemplate();
};

// ---------------- 姿勢推定モデル読み込み ----------------
async function loadPoseModel() {
  if (poseModelType === 'lite') {
    poseModel = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
    });
  } else {
    poseModel = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
    });
  }
  console.log('Pose model loaded:', poseModelType);
}

// ---------------- 姿勢推定＋描画 ---------------
const canvas = document.getElementById('poseCanvas');
const ctx = canvas.getContext('2d');

videoPreview.onloadedmetadata = () => {
  canvas.width = videoPreview.videoWidth;
  canvas.height = videoPreview.videoHeight;
};

async function detectPoseAndDraw() {
  if (!poseModel || videoPreview.readyState < 2) {
    requestAnimationFrame(detectPoseAndDraw);
    return;
  }

  const poses = await poseModel.estimatePoses(videoPreview);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(videoPreview, 0, 0, canvas.width, canvas.height);

  if (poses.length > 0) {
    drawSkeleton(poses[0].keypoints);
    analyzePose(poses[0].keypoints);
  }
  requestAnimationFrame(detectPoseAndDraw);
}

// 関節の線を描画
function drawSkeleton(keypoints) {
  const adjacentPairs = poseDetection.util.getAdjacentPairs(poseDetection.SupportedModels.MoveNet);
  ctx.strokeStyle = 'lime';
  ctx.lineWidth = 2;

  adjacentPairs.forEach(([i, j]) => {
    const kp1 = keypoints[i];
    const kp2 = keypoints[j];
    if (kp1.score > 0.5 && kp2.score > 0.5) {
      ctx.beginPath();
      ctx.moveTo(kp1.x * canvas.width, kp1.y * canvas.height);
      ctx.lineTo(kp2.x * canvas.width, kp2.y * canvas.height);
      ctx.stroke();
    }
  });

  // 各関節点
  keypoints.forEach(kp => {
    if (kp.score > 0.5) {
      ctx.fillStyle = 'red';
      ctx.beginPath();
      ctx.arc(kp.x * canvas.width, kp.y * canvas.height, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// --------------- 角度計算ユーティリティ ---------------
function calcAngle(A, B, C) {
  // 3点 A,B,C の座標は {x,y} オブジェクト
  const AB = { x: B.x - A.x, y: B.y - A.y };
  const CB = { x: B.x - C.x, y: B.y - C.y };

  const dot = AB.x * CB.x + AB.y * CB.y;
  const magAB = Math.sqrt(AB.x * AB.x + AB.y * AB.y);
  const magCB = Math.sqrt(CB.x * CB.x + CB.y * CB.y);
  if (magAB * magCB === 0) return 0;

  const angleRad = Math.acos(dot / (magAB * magCB));
  return (angleRad * 180) / Math.PI;
}

// ---------------- フォーム解析・フィードバック表示 ----------------
function analyzePose(keypoints) {
  // 例: 膝角度、腰高さなどの解析し、feedbackTextAreaにリアルタイム表示
  // ※詳細はテンプレート等を活用し拡張可能

  // 重要な関節の取得
  const getKp = name => keypoints.find(kp => kp.name === name) || { x: 0, y: 0, score: 0 };

  const hip = getKp('left_hip');
  const knee = getKp('left_knee');
  const ankle = getKp('left_ankle');
  const shoulder = getKp('left_shoulder');

  if (hip.score < 0.5 || knee.score < 0.5 || ankle.score < 0.5 || shoulder.score < 0.5) {
    // 関節検出が弱い場合は表示しない
    return;
  }

  // 膝の角度計算
  const kneeAngle = calcAngle(hip, knee, ankle);

  // 腰の高さ（肩とのy座標差）
  const hipHeight = hip.y;
  const shoulderHeight = shoulder.y;
  const hipShoulderDiff = (shoulderHeight - hipHeight) * canvas.height; // px差

  let feedbacks = [];

  if (kneeAngle < 90) feedbacks.push(`膝の角度が浅すぎます (${Math.round(kneeAngle)}°)`);
  else if (kneeAngle > 140) feedbacks.push(`膝の角度が深すぎます (${Math.round(kneeAngle)}°)`);
  else feedbacks.push(`膝の角度は適切です (${Math.round(kneeAngle)}°)`);

  if (hipShoulderDiff < 30) feedbacks.push('腰が低すぎます');
  else if (hipShoulderDiff > 80) feedbacks.push('腰が高すぎます');
  else feedbacks.push('腰の高さは適切です');

  feedbackTextArea.value = feedbacks.join('\n');
}

// ---------------- 初期化 ----------------
(async () => {
  await openDB();
  await initCamera();
  await loadPoseModel();
  detectPoseAndDraw();

  saveMp4Btn.disabled = true;
  stopRecordBtn.disabled = true;
  requestFeedbackBtn.disabled = true;
  playFeedbackAudioBtn.disabled = true;

  delayInput.value = delaySec;
  delaySettingInput.value = delaySec;
  enableAudioCountCheckbox.checked = audioCountEnabled;
  enableAudioCountSetting.checked = audioCountEnabled;
})();
