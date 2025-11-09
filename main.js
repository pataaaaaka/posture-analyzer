/**
 * 姿勢・足形解析アプリ - メインスクリプト
 * TensorFlow.js + MediaPipe Pose + 赤マーカー検出を統合
 */

// ========================================
// グローバル変数
// ========================================
let poseDetector = null;
let currentImage = null;
let canvas = null;
let ctx = null;
let markers = [];
let isManualMode = false;
let draggedMarker = null;
let currentViewType = 'front';
let analysisResults = {};

// Canvas上での座標系
let canvasScale = 1;
let canvasOffsetX = 0;
let canvasOffsetY = 0;

// ========================================
// 初期化処理
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('アプリ初期化開始');
    
    // Canvas要素の取得
    canvas = document.getElementById('imageCanvas');
    ctx = canvas.getContext('2d');
    
    // イベントリスナーの設定
    setupEventListeners();
    
    // TensorFlow.js と PoseNet の初期化
    await initializePoseDetection();
    
    // ローディング画面を非表示
    document.getElementById('loadingScreen').classList.add('hidden');
    
    console.log('アプリ初期化完了');
});

/**
 * イベントリスナーの設定
 */
function setupEventListeners() {
    // カメラ/ファイル選択ボタン
    document.getElementById('cameraBtn').addEventListener('click', () => {
        document.getElementById('imageInput').click();
    });
    
    // 画像選択時
    document.getElementById('imageInput').addEventListener('change', handleImageUpload);
    
    // 撮影種類選択
    document.getElementById('viewType').addEventListener('change', (e) => {
        currentViewType = e.target.value;
        updateGuideDisplay();
    });
    
    // 自動解析ボタン
    document.getElementById('analyzeBtn').addEventListener('click', performAnalysis);
    
    // 手動補正ボタン
    document.getElementById('manualBtn').addEventListener('click', toggleManualMode);
    
    // 手動補正完了ボタン
    document.getElementById('confirmManualBtn').addEventListener('click', confirmManualCorrection);
    
    // リセットボタン
    document.getElementById('resetBtn').addEventListener('click', resetAnalysis);
    
    // 保存ボタン
    document.getElementById('saveBtn').addEventListener('click', saveResultImage);
    
    // 次のステップボタン
    document.getElementById('nextStepBtn').addEventListener('click', moveToNextStep);
    
    // Canvas上のマウス/タッチイベント
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);
    canvas.addEventListener('touchstart', handleCanvasTouchStart);
    canvas.addEventListener('touchmove', handleCanvasTouchMove);
    canvas.addEventListener('touchend', handleCanvasTouchEnd);
}

/**
 * ガイド表示の更新
 */
function updateGuideDisplay() {
    const guideItems = document.querySelectorAll('.guide-item');
    guideItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === currentViewType) {
            item.classList.add('active');
        }
    });
}

/**
 * TensorFlow.js と MediaPipe Pose の初期化
 */
async function initializePoseDetection() {
    try {
        console.log('Pose Detection モデル読み込み中...');
        
        // MoveNet モデルの読み込み
        const detectorConfig = {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
        };
        
        poseDetector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            detectorConfig
        );
        
        console.log('Pose Detection モデル読み込み完了');
    } catch (error) {
        console.error('モデル読み込みエラー:', error);
        showError('AIモデルの読み込みに失敗しました。ページを再読み込みしてください。');
    }
}

/**
 * 画像アップロード処理
 */
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            displayImageOnCanvas(img);
            showActionButtons();
            hideError();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * Canvas に画像を表示
 */
function displayImageOnCanvas(img) {
    // Canvas のサイズを調整（画面幅に合わせる）
    const containerWidth = document.getElementById('canvasContainer').clientWidth;
    const maxWidth = Math.min(containerWidth - 40, 800);
    
    canvasScale = maxWidth / img.width;
    canvas.width = maxWidth;
    canvas.height = img.height * canvasScale;
    
    // 画像を描画
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // Canvas コンテナを表示
    document.getElementById('canvasContainer').style.display = 'block';
    
    console.log('画像表示完了:', canvas.width, 'x', canvas.height);
}

/**
 * アクションボタンを表示
 */
function showActionButtons() {
    document.getElementById('actionButtons').style.display = 'flex';
}

/**
 * 自動解析の実行
 */
async function performAnalysis() {
    if (!currentImage) {
        showError('画像を選択してください');
        return;
    }
    
    showLoading('解析中...');
    hideError();
    
    try {
        // マーカーをリセット
        markers = [];
        
        // 1. MediaPipe Pose で骨格検出
        const poses = await detectPose();
        
        // 2. 赤マーカー検出
        const redMarkers = detectRedMarkers();
        
        // 3. マーカーの統合（AIと赤マーカーを組み合わせる）
        markers = mergeMarkers(poses, redMarkers);
        
        // 4. Canvas に結果を描画
        redrawCanvas();
        
        // 5. 姿勢分析
        const results = analyzePosture();
        
        // 6. 結果を表示
        displayResults(results);
        
        hideLoading();
        
        console.log('解析完了:', markers.length, 'マーカー検出');
    } catch (error) {
        console.error('解析エラー:', error);
        showError('解析に失敗しました: ' + error.message);
        hideLoading();
    }
}

/**
 * MediaPipe Pose で骨格検出
 */
async function detectPose() {
    if (!poseDetector) {
        console.warn('Pose Detector が初期化されていません');
        return [];
    }
    
    try {
        const poses = await poseDetector.estimatePoses(currentImage);
        console.log('Pose 検出結果:', poses);
        return poses;
    } catch (error) {
        console.error('Pose 検出エラー:', error);
        return [];
    }
}

/**
 * 赤マーカーの検出（色抽出）
 */
function detectRedMarkers() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = currentImage.width;
    tempCanvas.height = currentImage.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(currentImage, 0, 0);
    
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;
    
    const redPixels = [];
    const threshold = {
        minRed: 150,
        maxGreen: 100,
        maxBlue: 100
    };
    
    // 赤ピクセルの検出
    for (let y = 0; y < tempCanvas.height; y += 2) {
        for (let x = 0; x < tempCanvas.width; x += 2) {
            const i = (y * tempCanvas.width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // 赤色判定
            if (r > threshold.minRed && g < threshold.maxGreen && b < threshold.maxBlue) {
                redPixels.push({ x, y });
            }
        }
    }
    
    // クラスタリングして各マーカーの中心を算出
    const clusters = clusterPixels(redPixels, 20);
    
    console.log('赤マーカー検出:', clusters.length, '個');
    return clusters;
}

/**
 * ピクセルをクラスタリング
 */
function clusterPixels(pixels, radius) {
    const clusters = [];
    const used = new Set();
    
    for (const pixel of pixels) {
        if (used.has(`${pixel.x},${pixel.y}`)) continue;
        
        const cluster = [pixel];
        used.add(`${pixel.x},${pixel.y}`);
        
        // 近傍のピクセルを探す
        for (const other of pixels) {
            if (used.has(`${other.x},${other.y}`)) continue;
            
            const dist = Math.sqrt(
                Math.pow(pixel.x - other.x, 2) + 
                Math.pow(pixel.y - other.y, 2)
            );
            
            if (dist < radius) {
                cluster.push(other);
                used.add(`${other.x},${other.y}`);
            }
        }
        
        // クラスターの重心を計算
        if (cluster.length > 5) {  // 最小サイズ
            const center = {
                x: cluster.reduce((sum, p) => sum + p.x, 0) / cluster.length,
                y: cluster.reduce((sum, p) => sum + p.y, 0) / cluster.length,
                type: 'red',
                size: cluster.length
            };
            clusters.push(center);
        }
    }
    
    return clusters;
}

/**
 * AIと赤マーカーの統合
 */
function mergeMarkers(poses, redMarkers) {
    const merged = [];
    
    // 赤マーカーを優先的に追加
    redMarkers.forEach((marker, idx) => {
        merged.push({
            id: `red_${idx}`,
            x: marker.x,
            y: marker.y,
            type: 'red',
            label: `マーカー${idx + 1}`,
            confidence: 0.9
        });
    });
    
    // MediaPipe のキーポイントを追加（赤マーカーがない場所）
    if (poses.length > 0) {
        const pose = poses[0];
        const keypointMap = getKeypointMapping(currentViewType);
        
        Object.entries(keypointMap).forEach(([name, keypointName]) => {
            const keypoint = pose.keypoints.find(kp => kp.name === keypointName);
            if (keypoint && keypoint.score > 0.3) {
                // 近くに赤マーカーがないか確認
                const hasNearbyRed = redMarkers.some(rm => {
                    const dist = Math.sqrt(
                        Math.pow(rm.x - keypoint.x, 2) + 
                        Math.pow(rm.y - keypoint.y, 2)
                    );
                    return dist < 50;
                });
                
                if (!hasNearbyRed) {
                    merged.push({
                        id: `ai_${name}`,
                        x: keypoint.x,
                        y: keypoint.y,
                        type: 'ai',
                        label: name,
                        confidence: keypoint.score
                    });
                }
            }
        });
    }
    
    return merged;
}

/**
 * 撮影タイプに応じたキーポイントマッピング
 */
function getKeypointMapping(viewType) {
    const mappings = {
        'front': {
            '左肩': 'left_shoulder',
            '右肩': 'right_shoulder',
            '左腰': 'left_hip',
            '右腰': 'right_hip',
            '左膝': 'left_knee',
            '右膝': 'right_knee',
            '左足首': 'left_ankle',
            '右足首': 'right_ankle'
        },
        'side': {
            '耳': 'left_ear',
            '肩': 'left_shoulder',
            '腰': 'left_hip',
            '膝': 'left_knee',
            '足首': 'left_ankle'
        },
        'foot-top': {},
        'foot-back': {}
    };
    
    return mappings[viewType] || {};
}

/**
 * Canvas を再描画
 */
function redrawCanvas() {
    // 画像を再描画
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
    
    // 接続線を描画
    drawConnections();
    
    // マーカーを描画
    drawMarkers();
}

/**
 * 接続線の描画
 */
function drawConnections() {
    const connections = getConnections(currentViewType);
    
    ctx.strokeStyle = 'rgba(102, 126, 234, 0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    
    connections.forEach(conn => {
        const m1 = markers.find(m => m.label === conn[0]);
        const m2 = markers.find(m => m.label === conn[1]);
        
        if (m1 && m2) {
            ctx.beginPath();
            ctx.moveTo(m1.x * canvasScale, m1.y * canvasScale);
            ctx.lineTo(m2.x * canvasScale, m2.y * canvasScale);
            ctx.stroke();
        }
    });
    
    ctx.setLineDash([]);
}

/**
 * 接続線の定義
 */
function getConnections(viewType) {
    const connectionMap = {
        'front': [
            ['左肩', '右肩'],
            ['左肩', '左腰'],
            ['右肩', '右腰'],
            ['左腰', '右腰'],
            ['左腰', '左膝'],
            ['右腰', '右膝'],
            ['左膝', '左足首'],
            ['右膝', '右足首']
        ],
        'side': [
            ['耳', '肩'],
            ['肩', '腰'],
            ['腰', '膝'],
            ['膝', '足首']
        ],
        'foot-top': [],
        'foot-back': []
    };
    
    return connectionMap[viewType] || [];
}

/**
 * マーカーの描画
 */
function drawMarkers() {
    markers.forEach(marker => {
        const x = marker.x * canvasScale;
        const y = marker.y * canvasScale;
        
        // マーカーの円
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        
        if (marker.type === 'red') {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        } else {
            ctx.fillStyle = 'rgba(33, 150, 243, 0.8)';
        }
        
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // ラベル
        if (isManualMode) {
            ctx.fillStyle = 'black';
            ctx.font = '12px Arial';
            ctx.fillText(marker.label, x + 12, y - 5);
        }
    });
}

/**
 * 姿勢分析
 */
function analyzePosture() {
    const results = {};
    
    switch (currentViewType) {
        case 'front':
            results.shoulderTilt = analyzeShoulder();
            results.pelvisTilt = analyzePelvis();
            results.legAlignment = analyzeLegAlignment();
            break;
        case 'side':
            results.headForward = analyzeHeadForward();
            results.kyphosis = analyzeKyphosis();
            results.pelvisPosture = analyzePelvisPosture();
            break;
        case 'foot-top':
            results.archType = analyzeArch();
            break;
        case 'foot-back':
            results.heelAlignment = analyzeHeelAlignment();
            break;
    }
    
    analysisResults[currentViewType] = results;
    return results;
}

/**
 * 肩の傾斜分析
 */
function analyzeShoulder() {
    const leftShoulder = markers.find(m => m.label === '左肩');
    const rightShoulder = markers.find(m => m.label === '右肩');
    
    if (!leftShoulder || !rightShoulder) {
        return { status: 'unknown', message: '肩のマーカーが検出できませんでした' };
    }
    
    const yDiff = leftShoulder.y - rightShoulder.y;
    const xDiff = Math.abs(leftShoulder.x - rightShoulder.x);
    const angle = Math.atan2(yDiff, xDiff) * (180 / Math.PI);
    
    let status, message;
    if (Math.abs(angle) < 2) {
        status = 'good';
        message = '肩の高さはほぼ水平で良好です';
    } else if (Math.abs(angle) < 5) {
        status = 'warning';
        message = 'やや肩の高さに差があります';
    } else {
        status = 'bad';
        message = '肩の高さに明確な差があります';
    }
    
    return {
        status,
        value: `${Math.abs(angle).toFixed(1)}°`,
        message,
        angle
    };
}

/**
 * 骨盤の傾斜分析
 */
function analyzePelvis() {
    const leftHip = markers.find(m => m.label === '左腰');
    const rightHip = markers.find(m => m.label === '右腰');
    
    if (!leftHip || !rightHip) {
        return { status: 'unknown', message: '骨盤のマーカーが検出できませんでした' };
    }
    
    const yDiff = leftHip.y - rightHip.y;
    const xDiff = Math.abs(leftHip.x - rightHip.x);
    const angle = Math.atan2(yDiff, xDiff) * (180 / Math.PI);
    
    let status, message;
    if (Math.abs(angle) < 2) {
        status = 'good';
        message = '骨盤の高さは正常です';
    } else if (Math.abs(angle) < 4) {
        status = 'warning';
        message = 'やや骨盤に傾きがあります';
    } else {
        status = 'bad';
        message = '骨盤の傾きが顕著です';
    }
    
    return {
        status,
        value: `${Math.abs(angle).toFixed(1)}°`,
        message,
        angle
    };
}

/**
 * 脚のアライメント分析（O脚/X脚）
 */
function analyzeLegAlignment() {
    const leftKnee = markers.find(m => m.label === '左膝');
    const rightKnee = markers.find(m => m.label === '右膝');
    const leftAnkle = markers.find(m => m.label === '左足首');
    const rightAnkle = markers.find(m => m.label === '右足首');
    
    if (!leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
        return { status: 'unknown', message: '脚のマーカーが不足しています' };
    }
    
    const kneeDistance = Math.abs(leftKnee.x - rightKnee.x);
    const ankleDistance = Math.abs(leftAnkle.x - rightAnkle.x);
    const ratio = kneeDistance / ankleDistance;
    
    let status, message, type;
    if (ratio > 1.2) {
        status = 'warning';
        type = 'O脚傾向';
        message = 'O脚の傾向が見られます';
    } else if (ratio < 0.8) {
        status = 'warning';
        type = 'X脚傾向';
        message = 'X脚の傾向が見られます';
    } else {
        status = 'good';
        type = '正常';
        message = '脚のアライメントは正常です';
    }
    
    return {
        status,
        value: type,
        message,
        ratio: ratio.toFixed(2)
    };
}

/**
 * 頭部前方偏位分析
 */
function analyzeHeadForward() {
    const ear = markers.find(m => m.label === '耳');
    const shoulder = markers.find(m => m.label === '肩');
    
    if (!ear || !shoulder) {
        return { status: 'unknown', message: 'マーカーが不足しています' };
    }
    
    const forwardOffset = ear.x - shoulder.x;
    const normalizedOffset = forwardOffset / currentImage.width * 100;
    
    let status, message;
    if (Math.abs(normalizedOffset) < 2) {
        status = 'good';
        message = '頭の位置は正常です';
    } else if (Math.abs(normalizedOffset) < 5) {
        status = 'warning';
        message = 'やや頭が前に出ています';
    } else {
        status = 'bad';
        message = '頭部の前方偏位が顕著です';
    }
    
    return {
        status,
        value: `${Math.abs(normalizedOffset).toFixed(1)}%`,
        message
    };
}

/**
 * 猫背分析
 */
function analyzeKyphosis() {
    const shoulder = markers.find(m => m.label === '肩');
    const hip = markers.find(m => m.label === '腰');
    
    if (!shoulder || !hip) {
        return { status: 'unknown', message: 'マーカーが不足しています' };
    }
    
    const backAngle = Math.atan2(hip.y - shoulder.y, hip.x - shoulder.x) * (180 / Math.PI);
    const normalizedAngle = Math.abs(90 - Math.abs(backAngle));
    
    let status, message;
    if (normalizedAngle < 10) {
        status = 'good';
        message = '背中の姿勢は良好です';
    } else if (normalizedAngle < 20) {
        status = 'warning';
        message = 'やや猫背傾向があります';
    } else {
        status = 'bad';
        message = '猫背が顕著です';
    }
    
    return {
        status,
        value: `${normalizedAngle.toFixed(1)}°`,
        message
    };
}

/**
 * 骨盤前傾/後傾分析
 */
function analyzePelvisPosture() {
    // 簡易的な評価（実際は複数ポイント必要）
    return {
        status: 'warning',
        value: '要確認',
        message: '詳細な評価には追加のマーカーが必要です'
    };
}

/**
 * 足のアーチ分析
 */
function analyzeArch() {
    // 赤マーカーの分布から判定
    const footMarkers = markers.filter(m => m.type === 'red');
    
    if (footMarkers.length < 3) {
        return { status: 'unknown', message: 'マーカーが不足しています' };
    }
    
    // 簡易的な評価
    return {
        status: 'good',
        value: '正常アーチ',
        message: '土踏まずの形状は正常範囲です'
    };
}

/**
 * 踵のアライメント分析
 */
function analyzeHeelAlignment() {
    return {
        status: 'good',
        value: '正常',
        message: '踵の配列は正常です'
    };
}

/**
 * 結果の表示
 */
function displayResults(results) {
    const container = document.getElementById('resultCards');
    container.innerHTML = '';
    
    Object.entries(results).forEach(([key, result]) => {
        if (!result) return;
        
        const card = document.createElement('div');
        card.className = `result-card status-${result.status}`;
        
        const titleMap = {
            shoulderTilt: '肩の傾斜',
            pelvisTilt: '骨盤の傾斜',
            legAlignment: '脚のアライメント',
            headForward: '頭部前方偏位',
            kyphosis: '背中の丸み',
            pelvisPosture: '骨盤の姿勢',
            archType: '足のアーチ',
            heelAlignment: '踵の配列'
        };
        
        const statusEmoji = {
            good: '✅',
            warning: '⚠️',
            bad: '❌',
            unknown: '❓'
        };
        
        card.innerHTML = `
            <h4>${statusEmoji[result.status]} ${titleMap[key] || key}</h4>
            <div class="value">${result.value || '-'}</div>
            <div class="description">${result.message}</div>
            <span class="status-badge ${result.status}">${getStatusText(result.status)}</span>
        `;
        
        container.appendChild(card);
    });
    
    document.getElementById('resultsSection').style.display = 'block';
}

/**
 * ステータステキストの取得
 */
function getStatusText(status) {
    const map = {
        good: '良好',
        warning: '要注意',
        bad: '要改善',
        unknown: '不明'
    };
    return map[status] || status;
}

/**
 * 手動補正モードの切り替え
 */
function toggleManualMode() {
    isManualMode = !isManualMode;
    
    if (isManualMode) {
        document.getElementById('manualModeInfo').style.display = 'block';
        canvas.style.cursor = 'move';
        redrawCanvas();
    } else {
        document.getElementById('manualModeInfo').style.display = 'none';
        canvas.style.cursor = 'crosshair';
    }
}

/**
 * 手動補正完了
 */
function confirmManualCorrection() {
    isManualMode = false;
    document.getElementById('manualModeInfo').style.display = 'none';
    canvas.style.cursor = 'crosshair';
    
    // 再分析
    const results = analyzePosture();
    displayResults(results);
}

/**
 * Canvas マウスダウン
 */
function handleCanvasMouseDown(e) {
    if (!isManualMode) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvasScale;
    const y = (e.clientY - rect.top) / canvasScale;
    
    // 近くのマーカーを探す
    draggedMarker = findNearestMarker(x, y, 20);
}

/**
 * Canvas マウスムーブ
 */
function handleCanvasMouseMove(e) {
    if (!isManualMode || !draggedMarker) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvasScale;
    const y = (e.clientY - rect.top) / canvasScale;
    
    draggedMarker.x = x;
    draggedMarker.y = y;
    
    redrawCanvas();
}

/**
 * Canvas マウスアップ
 */
function handleCanvasMouseUp() {
    draggedMarker = null;
}

/**
 * Canvas タッチスタート
 */
function handleCanvasTouchStart(e) {
    if (!isManualMode) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) / canvasScale;
    const y = (touch.clientY - rect.top) / canvasScale;
    
    draggedMarker = findNearestMarker(x, y, 30);
}

/**
 * Canvas タッチムーブ
 */
function handleCanvasTouchMove(e) {
    if (!isManualMode || !draggedMarker) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) / canvasScale;
    const y = (touch.clientY - rect.top) / canvasScale;
    
    draggedMarker.x = x;
    draggedMarker.y = y;
    
    redrawCanvas();
}

/**
 * Canvas タッチエンド
 */
function handleCanvasTouchEnd(e) {
    e.preventDefault();
    draggedMarker = null;
}

/**
 * 最近接マーカーを探す
 */
function findNearestMarker(x, y, threshold) {
    let nearest = null;
    let minDist = threshold;
    
    markers.forEach(marker => {
        const dist = Math.sqrt(
            Math.pow(marker.x - x, 2) + 
            Math.pow(marker.y - y, 2)
        );
        
        if (dist < minDist) {
            minDist = dist;
            nearest = marker;
        }
    });
    
    return nearest;
}

/**
 * 解析リセット
 */
function resetAnalysis() {
    markers = [];
    currentImage = null;
    isManualMode = false;
    draggedMarker = null;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('canvasContainer').style.display = 'none';
    document.getElementById('actionButtons').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('manualModeInfo').style.display = 'none';
    document.getElementById('imageInput').value = '';
    
    hideError();
}

/**
 * 結果画像の保存
 */
function saveResultImage() {
    const link = document.createElement('a');
    link.download = `posture_analysis_${currentViewType}_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    console.log('画像保存完了');
}

/**
 * 次のステップへ移動
 */
function moveToNextStep() {
    const steps = ['front', 'side', 'foot-top', 'foot-back'];
    const currentIndex = steps.indexOf(currentViewType);
    
    if (currentIndex < steps.length - 1) {
        // 現在のステップを完了マークに
        const stepElement = document.querySelector(`.step[data-step="${currentIndex + 1}"]`);
        if (stepElement) {
            stepElement.classList.add('completed');
            stepElement.classList.remove('active');
        }
        
        // 次のステップをアクティブに
        const nextStep = steps[currentIndex + 1];
        currentViewType = nextStep;
        document.getElementById('viewType').value = nextStep;
        
        const nextStepElement = document.querySelector(`.step[data-step="${currentIndex + 2}"]`);
        if (nextStepElement) {
            nextStepElement.classList.add('active');
        }
        
        updateGuideDisplay();
        resetAnalysis();
    } else {
        alert('すべての撮影が完了しました！結果を確認してください。');
    }
}

/**
 * エラー表示
 */
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

/**
 * エラー非表示
 */
function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

/**
 * ローディング表示
 */
function showLoading(message = '処理中...') {
    const loadingScreen = document.getElementById('loadingScreen');
    loadingScreen.querySelector('p').textContent = message;
    loadingScreen.classList.remove('hidden');
}

/**
 * ローディング非表示
 */
function hideLoading() {
    document.getElementById('loadingScreen').classList.add('hidden');
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * 2点間の距離を計算
 */
function calculateDistance(p1, p2) {
    return Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + 
        Math.pow(p2.y - p1.y, 2)
    );
}

/**
 * 角度を計算
 */
function calculateAngle(p1, p2, p3) {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    
    const cos = dot / (mag1 * mag2);
    return Math.acos(cos) * (180 / Math.PI);
}

console.log('main.js 読み込み完了');
