// --- Global Variables ---
let gold = 0;
let subs = 0;
let totalViews = 0;
let date = 1;
let imageScore = 30; // Max 100, Min 0
let controversy = 0;
let staffDiscontent = 0;
let unpaidSalaryCount = 0;
let salaryMissed = 0; // 임금 체불 스택

let hasUploadedFirst = false;
let hasMonetized = false;
let isModalOpen = false;
let automationIntervalId;

// Cooldown tracking for popups
let lastShootCd = 5000;
let lastEditCd = 5000;
let lastUploadCd = 5000;

// Modal queue to prevent overlaps
let modalQueue = [];
let activeIntervals = [];
let activeTimeouts = [];

// Stacks
let shootStack = 0;
let editStack = 0;
let uploadStack = 0;

// Status logic
let isShooting = false;
let isEditing = false;
let isUploading = false;

// Shop
let shopCamLvl = 0;
let shopCamCost = 1000;
let shopAppLvl = 0;
let shopAppCost = 5000;
let shopCollabLvl = 0;
let shopCollabCost = 10000;

let staffShoot = false; // 10,000 (50,000 / 30days)
let staffEdit = false; // 50,000 (100,000 / 30days)
let staffUpload = false; // 100,000 (150,000 / 30days)

let consecutiveAds = 0;
let totalAds = 0;

const milestones = [300, 500, 1000, 2000, 3000, 5000, 8000, 10000];
let passedMilestones = [];
let pendingMilestoneEvent = false;
let currentContentType = 'normal';

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    updateUI();
    showOpening();
    
    // Bind buttons
    document.getElementById("btn-shoot").addEventListener("click", startShoot);
    document.getElementById("shop-btn").addEventListener("click", openShop);
    document.getElementById("shop-close").addEventListener("click", closeShop);
    
    // Automation loop (every 100ms)
    automationIntervalId = setInterval(automationLoop, 100);
});

// --- UI Updates ---
function updateUI() {
    document.getElementById("stat-date").innerText = date;
    document.getElementById("stat-sub").innerText = subs;
    document.getElementById("stat-view").innerText = totalViews;
    document.getElementById("stat-gold").innerText = gold;
    
    // 뱃지 업데이트
    document.getElementById("badge-shoot").innerText = `x${shootStack}`;
    document.getElementById("badge-edit").innerText = `x${editStack}`;
    document.getElementById("badge-upload").innerText = `x${uploadStack}`;
    
    // 드래그 영역 활성화/비활성화
    const stackShoot = document.getElementById("stack-shoot");
    if(shootStack > 0 && !isEditing) {
        stackShoot.setAttribute("draggable", "true");
        stackShoot.style.cursor = "grab";
    } else {
        stackShoot.setAttribute("draggable", "false");
        stackShoot.style.cursor = "default";
    }
    
    const stackEdit = document.getElementById("stack-edit");
    if(editStack > 0 && !isUploading) {
        stackEdit.setAttribute("draggable", "true");
        stackEdit.style.cursor = "grab";
    } else {
        stackEdit.setAttribute("draggable", "false");
        stackEdit.style.cursor = "default";
    }

    // 감정 상태
    let emo = "😐";
    if (imageScore >= 70) emo = "😁";
    else if (controversy >= 80 || imageScore <= 20) emo = "😱";
    else if (controversy >= 50) emo = "😰";
    document.getElementById("player-emotion").innerText = emo;

    checkEnding();
}

function newsFeed(msg) {
    document.getElementById("news-text").innerText = `최근 소식: ${msg}`;
}

// --- Modals ---
// --- Modals (Queue system to prevent overlap and pause automation) ---
function showOverlay(title, desc, btnText, callback) {
    modalQueue.push({ type: 'overlay', title, desc, btnText, callback });
    processModalQueue();
}

function showModal(title, desc, options) {
    modalQueue.push({ type: 'modal', title, desc, options });
    processModalQueue();
}

function processModalQueue() {
    if (isModalOpen || modalQueue.length === 0) return;
    
    isModalOpen = true;
    const item = modalQueue.shift();
    
    if (item.type === 'overlay') {
        const ov = document.getElementById("overlay-screen");
        document.getElementById("overlay-title").innerText = item.title;
        document.getElementById("overlay-desc").innerText = item.desc;
        const btn = document.getElementById("overlay-btn");
        btn.innerText = item.btnText;
        btn.onclick = () => {
            ov.classList.add("hidden");
            isModalOpen = false;
            if (item.callback) item.callback();
            processModalQueue();
        };
        ov.classList.remove("hidden");
    } else if (item.type === 'modal') {
        const modal = document.getElementById("event-modal");
        document.getElementById("modal-title").innerText = item.title;
        document.getElementById("modal-desc").innerText = item.desc;
        
        const optsDiv = document.getElementById("modal-options");
        optsDiv.innerHTML = "";
        
        item.options.forEach(opt => {
            const btn = document.createElement("button");
            btn.className = "retro-btn";
            btn.innerText = opt.text;
            btn.onclick = () => {
                modal.classList.add("hidden");
                isModalOpen = false;
                if (opt.action) opt.action();
                processModalQueue();
            };
            optsDiv.appendChild(btn);
        });
        
        modal.classList.remove("hidden");
    }
}

function showOpening() {
    showOverlay("유튜버 키우기", "딱 1년(365일)만 해보는 거야! 세계 최고의 크리에이터가 되기 위한 대여정이 시작됩니다. 당신만의 결말을 확인해보세요!", "게임 시작", () => {
        newsFeed("신규 유튜버, 첫 영상 촬영을 준비 중!");
    });
}

// --- Cooldown Logic ---
// 6단계 순차적/계단식 쿨타임 감소 (슬롯별 독립)
// 1단계: 구독자 5,000명 → [촬영] 5초→4초
// 2단계: 구독자 30,000명 → [편집] 5초→4초
// 3단계: 구독자 100,000명 → [업로드] 5초→4초
// 4단계: 구독자 500,000명 → [촬영] 4초→3초
// 5단계: 구독자 1,000,000명 → [편집] 4초→3초
// 6단계: 구독자 5,000,000명 → [업로드] 4초→3초
// 이후 500만 이상: 장비·자동화와 맞물려 0초 수렴
function getCooldown(type) {
    if(type === 'shoot') {
        // 1단계(5천→4초), 4단계(50만→3초), 이후 수렴
        if(subs >= 10000000) return 0;
        if(subs >= 7000000)  return 1000;
        if(subs >= 5000000)  return 2000;
        if(subs >= 500000)   return 3000;
        if(subs >= 5000)     return 4000;
        return 5000;
    }
    if(type === 'edit') {
        // 2단계(3만→4초), 5단계(100만→3초), 이후 수렴
        if(subs >= 10000000) return 0;
        if(subs >= 7000000)  return 1000;
        if(subs >= 5000000)  return 2000;
        if(subs >= 1000000)  return 3000;
        if(subs >= 30000)    return 4000;
        return 5000;
    }
    if(type === 'upload') {
        // 3단계(10만→4초), 6단계(500만→3초), 이후 수렴
        if(subs >= 10000000) return 0;
        if(subs >= 7000000)  return 1000;
        if(subs >= 5000000)  return 3000;
        if(subs >= 100000)   return 4000;
        return 5000;
    }
    return 5000;
}

// 쿨타임 값→해당 마일스톤 구독자 수 역매핑 (팝업용)
function getCooldownMilestoneForSlot(type, cd) {
    if (type === 'shoot') {
        if (cd === 0)    return 10000000;
        if (cd === 1000) return 7000000;
        if (cd === 2000) return 5000000;
        if (cd === 3000) return 500000;
        if (cd === 4000) return 5000;
    }
    if (type === 'edit') {
        if (cd === 0)    return 10000000;
        if (cd === 1000) return 7000000;
        if (cd === 2000) return 5000000;
        if (cd === 3000) return 1000000;
        if (cd === 4000) return 30000;
    }
    if (type === 'upload') {
        if (cd === 0)    return 10000000;
        if (cd === 1000) return 7000000;
        if (cd === 3000) return 5000000;
        if (cd === 4000) return 100000;
    }
    return 0;
}

function runProgress(id, timeId, duration, callback) {
    const fill = document.getElementById(id);
    const timeText = document.getElementById(timeId);

    if(duration <= 0) {
        fill.style.width = "100%";
        if(timeText) timeText.innerText = "완료!";
        let t = setTimeout(() => { 
            fill.style.width = "0%"; 
            if(timeText) timeText.innerText = "대기중";
            callback(); 
        }, 50);
        activeTimeouts.push(t);
        return;
    }
    
    fill.style.transition = `width ${duration}ms linear`;
    fill.style.width = "100%";
    
    let remain = duration;
    if(timeText) timeText.innerText = (remain / 1000).toFixed(1) + "초";
    
    let interval = setInterval(() => {
        remain -= 100;
        if(remain <= 0) {
            clearInterval(interval);
            if(timeText) timeText.innerText = "완료!";
        } else {
            if(timeText) timeText.innerText = (remain / 1000).toFixed(1) + "초";
        }
    }, 100);
    activeIntervals.push(interval);

    let t = setTimeout(() => {
        fill.style.transition = "none";
        fill.style.width = "0%";
        if(timeText) timeText.innerText = "대기중";
        callback();
    }, duration);
    activeTimeouts.push(t);
}

// --- Game Actions ---
function startShoot() {
    if(isGameOver || isShooting) return;
    isShooting = true;
    document.getElementById("btn-shoot").disabled = true;
    
    let cd = getCooldown('shoot');
    runProgress("prog-shoot", "time-shoot", cd, () => {
        shootStack++;
        isShooting = false;
        document.getElementById("btn-shoot").disabled = false;
        updateUI();
    });
}

function startEdit() {
    if(isGameOver || isEditing || shootStack <= 0) return;
    shootStack--;
    isEditing = true;
    updateUI();
    
    let cd = getCooldown('edit');
    runProgress("prog-edit", "time-edit", cd, () => {
        editStack++;
        isEditing = false;
        updateUI();
    });
}

function startUpload() {
    if(isGameOver || isUploading || editStack <= 0) return;
    
    // Check Milestone first
    let hitMilestone = milestones.find(m => subs >= m && !passedMilestones.includes(m));
    if(hitMilestone) {
        passedMilestones.push(hitMilestone);
        pendingMilestoneEvent = true;
        showContentSelectionModal(() => {
            executeUploadProcess();
        });
    } else {
        currentContentType = 'normal';
        executeUploadProcess();
    }
}

function executeUploadProcess() {
    if(isGameOver) return;
    editStack--;
    isUploading = true;
    updateUI();
    
    let cd = getCooldown('upload');
    runProgress("prog-upload", "time-upload", cd, () => {
        uploadStack++; // Optional visual
        uploadStack--;
        isUploading = false;
        
        processUploadResult();
        checkDailyEvents();
        date++;
        
        if (date > 365 && !isGameOver) {
            checkEnding(); // Trigger end game at exactly day 366
        } else if (!isGameOver) {
            checkSalary();
            updateUI();
        }
    });
}

function showContentSelectionModal(callback) {
    let options = [
        { text: "어그로 썸네일 자극적 영상", action: () => { currentContentType = 'aggro'; callback(); } },
        { text: "시청자와 소통 방송", action: () => { currentContentType = 'communicate'; callback(); } },
        { text: "건전한 교육 방송", action: () => { currentContentType = 'education'; callback(); } },
        { text: "평소와 같은 일반 영상", action: () => { currentContentType = 'normal'; callback(); } }
    ];
    
    if (subs >= 600) {
        options.splice(2, 0, { text: "💰 광고 PPL 영상 계약", action: () => { currentContentType = 'ad'; callback(); } });
    }
    
    showModal("기념 영상 콘텐츠 선택", "어떤 기획으로 영상을 찍을까요?", options);
}

function processUploadResult() {
    // 1. 튜토리얼 (첫 영상)
    if(!hasUploadedFirst) {
        hasUploadedFirst = true;
        subs += 50;
        showOverlay("시작이 좋습니다!", "좋아, 세계 최고의 유튜버가 되겠어!\n(구독자 50명, 조회수 100 획득)", "확인", null);
        updateUI();
        return;
    }
    
    let currentAdReward = 0;
    let wasAd = (currentContentType === 'ad');
    
    // 2. 확률 분기
    let r = Math.random();
    let baseView = 0;
    let baseSub = 0;
    
    if(r < 0.05) { // 폭망
        baseView = Math.floor(Math.random()*10) + 1;
        baseSub = 10;
        newsFeed("최근 영상 반응 싸늘해...");
    } else if(r < 0.10) { // 떡상
        baseView = 500;
        baseSub = Math.floor(Math.random()*201) + 100;
        newsFeed("영상 알고리즘 떡상! 화제 집중!");
    } else { // 평범
        baseView = Math.floor(Math.random()*91) + 10;
        baseSub = Math.floor(Math.random()*21) + 10;
    }
    
    // 3. 아이템 배수
    let itemMult = 1;
    if (shopCamLvl > 0) itemMult *= 2 * Math.pow(2, shopCamLvl - 1);
    if (shopAppLvl > 0) itemMult *= 5 * Math.pow(2, shopAppLvl - 1);
    if (shopCollabLvl > 0) itemMult *= 10 * Math.pow(2, shopCollabLvl - 1);
    
    // 4. 콘텐츠 선택지에 따른 변동
    let contentMult = 1;
    let viewMod = 1.0;
    
    if (currentContentType === 'aggro') {
        contentMult = 10;
        controversy += 10;
        imageScore += (Math.random() < 0.5 ? 5 : -5);
        consecutiveAds = 0;
    } else if (currentContentType === 'communicate') {
        contentMult = 1;
        imageScore += 20;
        controversy -= 10;
        consecutiveAds = 0;
    } else if (currentContentType === 'ad') {
        contentMult = 1;
        controversy += 10;
        imageScore -= 5;
        let adReward = Math.floor(Math.random()*90001) + 10000;
        currentAdReward = adReward;
        gold += adReward;
        
        consecutiveAds++;
        totalAds++;
        
        if (totalAds % 3 === 0 && totalAds > 0) {
            imageScore -= 50;
            let subLoss = Math.floor(subs * 0.30);
            subs -= subLoss;
            newsFeed("⚠️ 광고 남발 논란! 대규모 구독 취소 사태 발생!");
            showModal("경고!", "광고를 총 3번 올려서 시청자들이 대거 이탈했습니다!", [{text: "확인", action: null}]);
            consecutiveAds = 0; // 초기화
        } else if (consecutiveAds >= 2) {
            imageScore -= 20;
            let subLoss = Math.floor(subs * 0.05);
            subs -= subLoss;
            newsFeed("광고 연속 등록으로 구독자들이 실망했습니다.");
        }
    } else if (currentContentType === 'education') {
        viewMod = 0.8;
        imageScore += 10;
        controversy -= 20;
        consecutiveAds = 0;
    } else if (currentContentType === 'normal') {
        contentMult = 2;
        controversy -= 10;
        imageScore += (Math.random() < 0.5 ? 10 : -10);
        consecutiveAds = 0;
    }
    
    // Limits
    if(imageScore > 100) imageScore = 100;
    if(imageScore < 0) imageScore = 0;
    if(controversy < 0) controversy = 0;
    
    // Calculate final (10의 배수 배율이면 소수점 버림 후 곱해 뒷자리 보정)
    let finalView;
    if (itemMult % 10 === 0) {
        finalView = Math.floor(baseView * contentMult * viewMod) * itemMult;
    } else {
        finalView = Math.floor(baseView * itemMult * contentMult * viewMod);
    }

    // 조회수 비례 구독자 유입 공식
    let totalSub = Math.floor(baseSub + (finalView * 0.005));
    subs += totalSub;
    totalViews += finalView;
    
    // 5. 수익 창출
    if(subs >= 100) {
        if (!hasMonetized) {
            hasMonetized = true;
            showOverlay("📢 수익 창출 승인!", "📢 이제 구독자 100명을 달성하여 수익 창출이 가능합니다! 지금부터 업로드되는 영상은 기본 수익으로 [조회수 1회당 1원]이 정산됩니다.", "확인", null);
        }
        gold += finalView;
    }
    
    // 6. 쿨타임 감소 체크 (6단계 순차적/계단식)
    let currentShootCd = getCooldown('shoot');
    let currentEditCd = getCooldown('edit');
    let currentUploadCd = getCooldown('upload');
    
    if (currentShootCd < lastShootCd) {
        let xVal = getCooldownMilestoneForSlot('shoot', currentShootCd);
        let cdLabel = currentShootCd === 0 ? '0초 (무제한!)' : `${currentShootCd/1000}초`;
        showOverlay(`🎉 구독자 ${xVal.toLocaleString()}명 달성!`, `대중의 관심이 폭발하면서 [촬영] 쿨타임이 ${cdLabel}로 감소했습니다!`, "확인", null);
        lastShootCd = currentShootCd;
    }
    if (currentEditCd < lastEditCd) {
        let xVal = getCooldownMilestoneForSlot('edit', currentEditCd);
        let cdLabel = currentEditCd === 0 ? '0초 (무제한!)' : `${currentEditCd/1000}초`;
        showOverlay(`🎉 구독자 ${xVal.toLocaleString()}명 달성!`, `대중의 관심이 폭발하면서 [편집] 쿨타임이 ${cdLabel}로 감소했습니다!`, "확인", null);
        lastEditCd = currentEditCd;
    }
    if (currentUploadCd < lastUploadCd) {
        let xVal = getCooldownMilestoneForSlot('upload', currentUploadCd);
        let cdLabel = currentUploadCd === 0 ? '0초 (무제한!)' : `${currentUploadCd/1000}초`;
        showOverlay(`🎉 구독자 ${xVal.toLocaleString()}명 달성!`, `대중의 관심이 폭발하면서 [업로드] 쿨타임이 ${cdLabel}로 감소했습니다!`, "확인", null);
        lastUploadCd = currentUploadCd;
    }
    
    if (wasAd) {
        if (r < 0.05) {
            newsFeed(`💸 [광고 뉴스] PPL 영상 알고리즘 폭락 (${finalView.toLocaleString()}회)... 광고 수익 ${currentAdReward.toLocaleString()}원 획득에 그쳐.`);
        } else {
            newsFeed(`🔥 [광고 뉴스] PPL 영상 조회수 대박 폭발 (${finalView.toLocaleString()}회)!! 광고 수익 ${currentAdReward.toLocaleString()}원 대량 획득!`);
        }
    } else {
        newsFeed(`최근 영상의 조회수: ${finalView.toLocaleString()}회 | 최근 영상으로 증가한 구독자 수: ${totalSub.toLocaleString()}명`);
    }
    
    // Reset type
    currentContentType = 'normal';
}

// --- Daily & Random Events ---
function checkDailyEvents() {
    if(controversy >= 100) {
        triggerExposeEvent();
    } else if (controversy >= 50 && controversy <= 99) {
        if(Math.random() < 0.1) triggerExposeEvent();
    }
    
    if(imageScore <= 0) {
        newsFeed("채널에 악플이 쏟아지고 있습니다!");
        subs -= Math.floor(subs * 0.02); // 악플 테러 패널티
    }
    
    if(subs >= 5000 && imageScore >= 40 && Math.random() < 0.05) {
        showModal("대기업 광고 제안", "고단가 광고 제안이 들어왔습니다!", [
            { text: "수락한다 (이미지 -10, 거액 획득)", action: () => { gold += 150000; imageScore -= 10; updateUI(); } },
            { text: "거절한다 (이미지 +5)", action: () => { imageScore += 5; updateUI(); } }
        ]);
    }
}

function triggerExposeEvent() {
    controversy = 0; // 초기화
    showOverlay("긴급 속보!", "유튜버 논란 폭로! 채널에 큰 타격이 발생했습니다.", "확인", () => {
        checkEnding();
    });
}

function checkSalary() {
    if(date % 30 === 0 && date > 0) {
        let totalCost = 0;
        if(staffShoot) totalCost += 50000;
        if(staffEdit) totalCost += 100000;
        if(staffUpload) totalCost += 150000;
        
        if(totalCost > 0) {
            showModal("📅 월급 정산일", `📅 직원이 일한 지 30일이 지났습니다. 직원에게 월급(${totalCost.toLocaleString()}원)을 주시겠습니까?`, [
                {
                    text: "예", action: () => {
                        if(gold >= totalCost) {
                            gold -= totalCost;
                            newsFeed("직원들 월급이 정상 지급되었습니다.");
                        } else {
                            handleUnpaidSalary();
                        }
                    }
                },
                {
                    text: "아니오", action: () => {
                        handleUnpaidSalary();
                    }
                }
            ]);
        }
    }
}

function handleUnpaidSalary() {
    unpaidSalaryCount++;
    salaryMissed++;
    staffDiscontent += 30;
    showModal("월급 미지급!", "자금이 부족하거나 거절하여 직원 월급을 주지 못했습니다. 불만이 쌓입니다.", [{
        text:"확인", action: () => {
            if(unpaidSalaryCount >= 3) {
                showOverlay("갑질 논란 폭로!", "직원들의 임금 체불 폭로 기사가 터졌습니다!", "확인", () => {
                    triggerExposeEvent();
                });
            }
        }
    }]);
}

// --- Automation ---
function automationLoop() {
    if (isGameOver || isModalOpen) return;
    
    if(staffShoot && !isShooting) {
        startShoot();
    }
    if(staffEdit && shootStack > 0 && !isEditing) {
        startEdit();
    }
    if(staffUpload && editStack > 0 && !isUploading) {
        startUpload();
    }
}

// --- Shop ---
const MAX_ITEM_LVL = 5;

function openShop() {
    if (isGameOver) return;

    const camBtn = document.getElementById("buy-cam");
    if (shopCamLvl >= MAX_ITEM_LVL) {
        camBtn.innerText = "🔒 카메라 만렙 달성 (구매 불가)";
        camBtn.disabled = true;
    } else {
        let nextMult = 2 * Math.pow(2, shopCamLvl);
        camBtn.innerText = `🎥 카메라 Lv.${shopCamLvl + 1} (${nextMult}배) 구매 (${shopCamCost.toLocaleString()}원)`;
        camBtn.disabled = false;
    }

    const appBtn = document.getElementById("buy-app");
    if (shopAppLvl >= MAX_ITEM_LVL) {
        appBtn.innerText = "🔒 편집어플 만렙 달성 (구매 불가)";
        appBtn.disabled = true;
    } else {
        let nextMult = 5 * Math.pow(2, shopAppLvl);
        appBtn.innerText = `💻 편집어플 Lv.${shopAppLvl + 1} (${nextMult}배) 구매 (${shopAppCost.toLocaleString()}원)`;
        appBtn.disabled = false;
    }

    const collabBtn = document.getElementById("buy-collab");
    if (shopCollabLvl >= MAX_ITEM_LVL) {
        collabBtn.innerText = "🔒 합방권 만렙 달성 (구매 불가)";
        collabBtn.disabled = true;
    } else {
        let nextMult = 10 * Math.pow(2, shopCollabLvl);
        collabBtn.innerText = `🤝 합방권 Lv.${shopCollabLvl + 1} (${nextMult}배) 구매 (${shopCollabCost.toLocaleString()}원)`;
        collabBtn.disabled = false;
    }

    document.getElementById("shop-modal").classList.remove("hidden");
}
function closeShop() {
    document.getElementById("shop-modal").classList.add("hidden");
}

function buyItem(item) {
    if (isGameOver) return;
    if(item === 'cam' && shopCamLvl < MAX_ITEM_LVL && gold >= shopCamCost) { 
        gold -= shopCamCost; 
        shopCamLvl++; 
        shopCamCost *= 2; 
    }
    else if(item === 'app' && shopAppLvl < MAX_ITEM_LVL && gold >= shopAppCost) { 
        gold -= shopAppCost; 
        shopAppLvl++; 
        shopAppCost *= 2; 
    }
    else if(item === 'collab' && shopCollabLvl < MAX_ITEM_LVL && gold >= shopCollabCost) { 
        gold -= shopCollabCost; 
        shopCollabLvl++; 
        shopCollabCost *= 2; 
    }
    else if(item === 'staff_shoot' && !staffShoot && gold >= 10000) { gold -= 10000; staffShoot = true; document.getElementById("hire-shoot").disabled = true; }
    else if(item === 'staff_edit' && !staffEdit && gold >= 50000) { gold -= 50000; staffEdit = true; document.getElementById("hire-edit").disabled = true; }
    else if(item === 'staff_upload' && !staffUpload && gold >= 100000) { gold -= 100000; staffUpload = true; document.getElementById("hire-upload").disabled = true; }
    else {
        alert("돈이 부족하거나 이미 구매했습니다!");
        return;
    }
    openShop();
    updateUI();
}

// --- Drag and Drop ---
function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev, type) {
    ev.dataTransfer.setData("type", type);
    ev.target.style.opacity = '0.5';
}

function dragEnter(ev) {
    ev.preventDefault();
    ev.currentTarget.classList.add("drag-over");
}

function dragLeave(ev) {
    ev.currentTarget.classList.remove("drag-over");
}

function dragEnd(ev) {
    ev.target.style.opacity = '1';
}

function drop(ev, target) {
    ev.preventDefault();
    ev.currentTarget.classList.remove("drag-over");
    let type = ev.dataTransfer.getData("type");
    
    if(type === 'shoot' && target === 'edit') {
        startEdit();
    }
    else if(type === 'edit' && target === 'upload') {
        startUpload();
    }
}

// --- Endings ---
let isGameOver = false;

function checkEnding() {
    if (isGameOver) return;
    if (date <= 365) return;
    
    isGameOver = true;
    clearInterval(automationIntervalId);
    activeIntervals.forEach(clearInterval);
    activeTimeouts.forEach(clearTimeout);
    activeIntervals = [];
    activeTimeouts = [];

    document.getElementById("btn-shoot").disabled = true;
    document.getElementById("shop-btn").disabled = true;
    document.getElementById("stack-shoot").setAttribute("draggable", "false");
    document.getElementById("stack-edit").setAttribute("draggable", "false");

    const restartAction = () => { resetGame(); };

    let title = "";
    let desc = "";

    if(subs >= 10000000 && gold >= 50000000 && imageScore >= 70) {
        title = "엔딩 1: 진정한 성공 (다이아 버튼)"; desc = `구독자 ${subs.toLocaleString()}명! 막대한 부와 명성, 그리고 깨끗한 이미지까지 모두 챙긴 국민 유튜버가 되었습니다!`;
    } else if(subs < 5000000 && imageScore >= 90) {
        title = "엔딩 2: 소박한 행복 (힐링 채널)"; desc = "채널 규모는 작지만 진성 팬들과 따뜻하게 소통하며 진정한 행복을 찾았습니다.";
    } else if(gold >= 50000000 && imageScore <= 50) {
        title = "엔딩 3: 고독한 부자 (기업형 유튜버)"; desc = "돈은 원 없이 벌었지만, 구독자들은 당신을 비즈니스로만 대하고 아무도 곁에 남지 않았습니다.";
    } else if(imageScore <= 35) {
        title = "엔딩 4: 사회적 매장 (영구 정지)"; desc = "도를 넘은 어그로와 지나친 광고 도배로 결국 채널이 영구 정지당하며 사회적으로 매장되었습니다...";
    } else {
        title = "엔딩 5: 평범한 유튜버 (골드 버튼)"; desc = "당신의 유튜버 생활 1년이 끝났습니다. 평범하지만 소중한 기록으로 남을 것입니다.";
    }

    showModal(title, desc, [
        { text: "처음부터 다시 하기", action: restartAction }
    ]);
}

function resetGame() {
    gold = 0;
    subs = 50;
    totalViews = 0;
    date = 1;
    imageScore = 30;
    controversy = 0;
    staffDiscontent = 0;
    unpaidSalaryCount = 0;
    salaryMissed = 0;
    hasUploadedFirst = true;
    hasMonetized = false;
    isModalOpen = false;
    modalQueue = [];
    shootStack = 0;
    editStack = 0;
    uploadStack = 0;
    isShooting = false;
    isEditing = false;
    isUploading = false;
    shopCamLvl = 0;
    shopCamCost = 1000;
    shopAppLvl = 0;
    shopAppCost = 5000;
    shopCollabLvl = 0;
    shopCollabCost = 10000;
    staffShoot = false;
    staffEdit = false;
    staffUpload = false;
    consecutiveAds = 0;
    totalAds = 0;
    passedMilestones = [];
    pendingMilestoneEvent = false;
    currentContentType = 'normal';
    isGameOver = false;
    lastShootCd = 5000;
    lastEditCd = 5000;
    lastUploadCd = 5000;

    clearInterval(automationIntervalId);
    activeIntervals.forEach(clearInterval);
    activeTimeouts.forEach(clearTimeout);
    activeIntervals = [];
    activeTimeouts = [];

    document.getElementById("btn-shoot").disabled = false;
    document.getElementById("shop-btn").disabled = false;
    document.getElementById("stack-shoot").setAttribute("draggable", "false");
    document.getElementById("stack-edit").setAttribute("draggable", "false");

    automationIntervalId = setInterval(automationLoop, 100);
    
    // Reset Shop buttons (직원)
    document.getElementById("hire-shoot").disabled = false;
    document.getElementById("hire-edit").disabled = false;
    document.getElementById("hire-upload").disabled = false;

    // Reset Shop buttons (장비 - 만렙 비활성화 해제)
    const camBtn = document.getElementById("buy-cam");
    camBtn.disabled = false;
    camBtn.innerText = "🎥 카메라 Lv.1 (2배) 구매 (1,000원)";

    const appBtn = document.getElementById("buy-app");
    appBtn.disabled = false;
    appBtn.innerText = "💻 편집어플 Lv.1 (5배) 구매 (5,000원)";

    const collabBtn = document.getElementById("buy-collab");
    collabBtn.disabled = false;
    collabBtn.innerText = "🤝 합방권 Lv.1 (10배) 구매 (10,000원)";
    
    // Reset progress bars
    document.getElementById("prog-shoot").style.width = "0%";
    document.getElementById("prog-shoot").style.transition = "none";
    document.getElementById("time-shoot").innerText = "대기중";
    
    document.getElementById("prog-edit").style.width = "0%";
    document.getElementById("prog-edit").style.transition = "none";
    document.getElementById("time-edit").innerText = "대기중";
    
    document.getElementById("prog-upload").style.width = "0%";
    document.getElementById("prog-upload").style.transition = "none";
    document.getElementById("time-upload").innerText = "대기중";

    updateUI();
    showOpening();
}

const originalTriggerExposeEvent = triggerExposeEvent;
triggerExposeEvent = function() {
    controversy = 0;
    showOverlay("긴급 속보!", "유튜버 논란 폭로! 채널에 큰 타격이 발생했습니다.", "확인", () => {
        imageScore -= 20;
        let subLoss = Math.floor(subs * 0.1);
        subs -= subLoss;
        updateUI();
    });
};
