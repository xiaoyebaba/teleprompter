const storageKey = "video-prompter-v2";

const sampleScript = `大家好，欢迎来到今天的视频。

今天我们用三分钟讲清楚一个问题：
为什么同样一份脚本，有的人念出来像聊天，有的人念出来像背稿？

关键不是把每个字都读完，而是让每一段都有一个明确的重音、停顿和转向。

第一，先把长句拆短。
第二，把数字、结论和行动建议放慢。
第三，每讲完一个观点，给镜头半秒钟。

最后，用一句话收住：
脚本不是为了限制表达，而是为了让表达更稳定。`;

const defaults = {
  script: sampleScript,
  speed: 48,
  fontSize: 56,
  lineHeight: 1.45,
  theme: "dark",
  mirror: false,
  guide: true,
  wake: false,
  focusMode: true,
  countdown: 0,
  autoSegment: true,
  ttsRate: 1,
  voiceURI: "",
  ttsExpanded: false,
  ttsDockX: null,
  ttsDockY: null,
};

const elements = {
  teleprompter: document.querySelector("#teleprompter"),
  countdownOverlay: document.querySelector("#countdownOverlay"),
  scriptOutput: document.querySelector("#scriptOutput"),
  scriptInput: document.querySelector("#scriptInput"),
  playPause: document.querySelector("#playPause"),
  playIcon: document.querySelector("#playIcon"),
  resetScroll: document.querySelector("#resetScroll"),
  jumpBack: document.querySelector("#jumpBack"),
  jumpForward: document.querySelector("#jumpForward"),
  fullscreenToggle: document.querySelector("#fullscreenToggle"),
  progressFill: document.querySelector("#progressFill"),
  activeParagraphLabel: document.querySelector("#activeParagraphLabel"),
  progressLabel: document.querySelector("#progressLabel"),
  remainingLabel: document.querySelector("#remainingLabel"),
  progressInput: document.querySelector("#progressInput"),
  speedInput: document.querySelector("#speedInput"),
  speedValue: document.querySelector("#speedValue"),
  fontSizeInput: document.querySelector("#fontSizeInput"),
  fontSizeValue: document.querySelector("#fontSizeValue"),
  lineHeightInput: document.querySelector("#lineHeightInput"),
  lineHeightValue: document.querySelector("#lineHeightValue"),
  countdownValue: document.querySelector("#countdownValue"),
  mirrorToggle: document.querySelector("#mirrorToggle"),
  guideToggle: document.querySelector("#guideToggle"),
  wakeToggle: document.querySelector("#wakeToggle"),
  focusToggle: document.querySelector("#focusToggle"),
  autoSegmentToggle: document.querySelector("#autoSegmentToggle"),
  loadSample: document.querySelector("#loadSample"),
  clearScript: document.querySelector("#clearScript"),
  fileInput: document.querySelector("#fileInput"),
  downloadScript: document.querySelector("#downloadScript"),
  mobilePanelToggle: document.querySelector("#mobilePanelToggle"),
  controlPanel: document.querySelector("#controlPanel"),
  stage: document.querySelector(".stage"),
  themeButtons: [...document.querySelectorAll("[data-theme]")],
  countdownButtons: [...document.querySelectorAll("[data-countdown]")],
  charCountValue: document.querySelector("#charCountValue"),
  paragraphCountValue: document.querySelector("#paragraphCountValue"),
  durationValue: document.querySelector("#durationValue"),
  ttsStatusValue: document.querySelector("#ttsStatusValue"),
  ttsParagraphLabel: document.querySelector("#ttsParagraphLabel"),
  ttsDock: document.querySelector("#ttsDock"),
  ttsFloat: document.querySelector("#ttsFloat"),
  ttsBubbleToggle: document.querySelector("#ttsBubbleToggle"),
  ttsCollapse: document.querySelector("#ttsCollapse"),
  ttsDragHandle: document.querySelector("#ttsDragHandle"),
  speakCurrent: document.querySelector("#speakCurrent"),
  stopSpeaking: document.querySelector("#stopSpeaking"),
  ttsPrevParagraph: document.querySelector("#ttsPrevParagraph"),
  ttsNextParagraph: document.querySelector("#ttsNextParagraph"),
  voiceSelect: document.querySelector("#voiceSelect"),
  ttsRateInput: document.querySelector("#ttsRateInput"),
  ttsPreview: document.querySelector("#ttsPreview"),
  ttsSupportNote: document.querySelector("#ttsSupportNote"),
};

const state = { ...defaults, ...loadState() };
const speechSynthesisApi = window.speechSynthesis;

let isPlaying = false;
let frameId = null;
let lastFrameTime = 0;
let wakeLock = null;
let lastTapTime = 0;
let lastTapY = 0;
let suppressDblClickUntil = 0;
let countdownTimer = null;
let countdownPending = false;
let isScrubbing = false;
let activeParagraphIndex = -1;
let availableVoices = [];
let currentUtterance = null;
let selectedTtsParagraphIndex = -1;
let dockDrag = null;

hydrateControls();
renderScript();
applySettings();
updateProgress();
bindEvents();
hydrateVoices();
applyDockState();
registerServiceWorker();

function bindEvents() {
  elements.scriptInput.addEventListener("input", () => {
    state.script = elements.scriptInput.value;
    renderScript();
    saveState();
    updateProgress();
  });

  elements.playPause.addEventListener("click", togglePlayback);
  elements.resetScroll.addEventListener("click", resetScroll);
  elements.jumpBack.addEventListener("click", () => jumpBy(-160));
  elements.jumpForward.addEventListener("click", () => jumpBy(160));
  elements.fullscreenToggle.addEventListener("click", toggleFullscreen);
  elements.teleprompter.addEventListener("scroll", updateProgress, { passive: true });
  elements.progressInput.addEventListener("input", handleProgressInput);
  elements.progressInput.addEventListener("change", handleProgressCommit);
  elements.scriptOutput.addEventListener("dblclick", handleScriptJump);
  elements.scriptOutput.addEventListener("pointerup", handleScriptTap);

  elements.mobilePanelToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.controlPanel.classList.toggle("open");
  });

  elements.stage.addEventListener("click", () => elements.controlPanel.classList.remove("open"));
  elements.controlPanel.addEventListener("click", (event) => event.stopPropagation());

  elements.speedInput.addEventListener("input", () => updateNumberSetting("speed", elements.speedInput.value));
  elements.fontSizeInput.addEventListener("input", () => updateNumberSetting("fontSize", elements.fontSizeInput.value));
  elements.lineHeightInput.addEventListener("input", () => updateNumberSetting("lineHeight", elements.lineHeightInput.value));

  elements.mirrorToggle.addEventListener("change", () => updateBooleanSetting("mirror", elements.mirrorToggle.checked));
  elements.guideToggle.addEventListener("change", () => updateBooleanSetting("guide", elements.guideToggle.checked));
  elements.focusToggle.addEventListener("change", () => updateBooleanSetting("focusMode", elements.focusToggle.checked));
  elements.wakeToggle.addEventListener("change", () => updateWakeSetting(elements.wakeToggle.checked));
  elements.autoSegmentToggle.addEventListener("change", () => {
    state.autoSegment = elements.autoSegmentToggle.checked;
    renderScript();
    saveState();
    updateProgress();
  });

  elements.themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.theme = button.dataset.theme;
      applySettings();
      saveState();
    });
  });

  elements.countdownButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.countdown = Number(button.dataset.countdown);
      applySettings();
      saveState();
    });
  });

  elements.loadSample.addEventListener("click", () => {
    state.script = sampleScript;
    elements.scriptInput.value = state.script;
    renderScript();
    resetScroll();
    saveState();
  });

  elements.clearScript.addEventListener("click", () => {
    state.script = "";
    elements.scriptInput.value = "";
    renderScript();
    resetScroll();
    saveState();
  });

  elements.fileInput.addEventListener("change", importScript);
  elements.downloadScript.addEventListener("click", downloadScript);
  elements.ttsBubbleToggle.addEventListener("click", () => setTtsExpanded(true));
  elements.ttsCollapse.addEventListener("click", () => setTtsExpanded(false));
  elements.speakCurrent.addEventListener("click", speakActiveParagraph);
  elements.stopSpeaking.addEventListener("click", stopSpeaking);
  elements.ttsPrevParagraph.addEventListener("click", () => shiftTtsParagraph(-1));
  elements.ttsNextParagraph.addEventListener("click", () => shiftTtsParagraph(1));
  elements.voiceSelect.addEventListener("change", () => {
    state.voiceURI = elements.voiceSelect.value;
    saveState();
  });
  elements.ttsRateInput.addEventListener("input", () => {
    state.ttsRate = Number(elements.ttsRateInput.value);
    saveState();
  });

  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("fullscreenchange", () => elements.controlPanel.classList.remove("open"));
  document.addEventListener("visibilitychange", handleVisibilityChange);
  elements.ttsDragHandle.addEventListener("pointerdown", startDockDrag);
  window.addEventListener("pointermove", handleDockDrag);
  window.addEventListener("pointerup", endDockDrag);
}

function hydrateControls() {
  elements.scriptInput.value = state.script;
  elements.speedInput.value = state.speed;
  elements.fontSizeInput.value = state.fontSize;
  elements.lineHeightInput.value = state.lineHeight;
  elements.mirrorToggle.checked = state.mirror;
  elements.guideToggle.checked = state.guide;
  elements.focusToggle.checked = state.focusMode;
  elements.wakeToggle.checked = state.wake;
  elements.autoSegmentToggle.checked = state.autoSegment;
  elements.ttsRateInput.value = String(state.ttsRate);
}

function renderScript() {
  elements.scriptOutput.replaceChildren();
  activeParagraphIndex = -1;
  selectedTtsParagraphIndex = -1;

  const script = state.script.trim();
  if (!script) {
    const empty = document.createElement("p");
    empty.className = "empty-line";
    empty.textContent = "脚本为空";
    elements.scriptOutput.append(empty);
    updateStats();
    return;
  }

  getDisplayParagraphs(state.script).forEach((block) => {
    const paragraph = document.createElement("p");
    block.split(/\n/).forEach((line, index) => {
      if (index > 0) paragraph.append(document.createElement("br"));
      paragraph.append(document.createTextNode(line));
    });
    elements.scriptOutput.append(paragraph);
  });

  updateStats();
}

function applySettings() {
  elements.teleprompter.style.setProperty("--script-size", `${state.fontSize}px`);
  elements.teleprompter.style.setProperty("--script-line", state.lineHeight);
  elements.teleprompter.style.setProperty("--mirror", state.mirror ? -1 : 1);
  elements.teleprompter.classList.toggle("hide-guide", !state.guide);
  elements.teleprompter.classList.toggle("focus-mode", state.focusMode);

  document.body.classList.toggle("theme-paper", state.theme === "paper");
  document.body.classList.toggle("theme-studio", state.theme === "studio");

  elements.themeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === state.theme);
  });

  elements.countdownButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.countdown) === state.countdown);
  });

  elements.speedValue.textContent = String(state.speed);
  elements.fontSizeValue.textContent = String(state.fontSize);
  elements.lineHeightValue.textContent = Number(state.lineHeight).toFixed(2);
  elements.countdownValue.textContent = state.countdown === 0 ? "关闭" : `${state.countdown} 秒`;
}

function applyDockState() {
  elements.ttsDock.classList.toggle("collapsed", !state.ttsExpanded);
  elements.ttsDock.classList.toggle("expanded", state.ttsExpanded);
  elements.ttsFloat.hidden = !state.ttsExpanded;
  elements.ttsBubbleToggle.hidden = state.ttsExpanded;

  if (Number.isFinite(state.ttsDockX) && Number.isFinite(state.ttsDockY)) {
    elements.ttsDock.style.left = `${state.ttsDockX}px`;
    elements.ttsDock.style.top = `${state.ttsDockY}px`;
    elements.ttsDock.style.right = "auto";
    elements.ttsDock.style.bottom = "auto";
  } else {
    elements.ttsDock.style.left = "";
    elements.ttsDock.style.top = "";
    elements.ttsDock.style.right = "";
    elements.ttsDock.style.bottom = "";
  }
}

function setTtsExpanded(expanded) {
  state.ttsExpanded = expanded;
  applyDockState();
  saveState();
}

function updateNumberSetting(key, value) {
  state[key] = Number(value);
  applySettings();
  saveState();
  updateProgress();
}

function updateBooleanSetting(key, value) {
  state[key] = value;
  applySettings();
  saveState();
}

async function updateWakeSetting(enabled) {
  state.wake = enabled;
  saveState();

  if (!enabled) {
    await releaseWakeLock();
    return;
  }

  const locked = await requestWakeLock();
  if (!locked) {
    state.wake = false;
    elements.wakeToggle.checked = false;
    saveState();
  }
}

function togglePlayback() {
  if (isPlaying || countdownPending) {
    pausePlayback();
    return;
  }
  startPlaybackWithCountdown();
}

async function startPlaybackWithCountdown(forceImmediate = false) {
  if (!forceImmediate && state.countdown > 0) {
    await runCountdown();
    return;
  }
  await startPlayback();
}

async function startPlayback() {
  if (isPlaying) return;
  clearCountdown();
  isPlaying = true;
  lastFrameTime = performance.now();
  elements.playPause.setAttribute("aria-label", "暂停滚动");
  elements.playIcon.textContent = "Ⅱ";
  if (state.wake) await requestWakeLock();
  frameId = requestAnimationFrame(step);
}

function pausePlayback() {
  clearCountdown();
  isPlaying = false;
  elements.playPause.setAttribute("aria-label", "开始滚动");
  elements.playIcon.textContent = "▶";
  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
}

function step(now) {
  if (!isPlaying) return;

  const elapsed = Math.min((now - lastFrameTime) / 1000, 0.08);
  lastFrameTime = now;
  elements.teleprompter.scrollTop += state.speed * elapsed;

  if (isAtBottom()) {
    pausePlayback();
    updateProgress();
    return;
  }

  updateProgress();
  frameId = requestAnimationFrame(step);
}

function handleScriptTap(event) {
  if (event.pointerType === "mouse") return;

  const paragraph = event.target.closest("#scriptOutput p");
  if (!paragraph) return;

  const now = Date.now();
  const isDoubleTap = now - lastTapTime < 340 && Math.abs(event.clientY - lastTapY) < 48;
  lastTapTime = now;
  lastTapY = event.clientY;

  if (isDoubleTap) {
    event.preventDefault();
    startFromPoint(event.clientY, paragraph);
    suppressDblClickUntil = Date.now() + 420;
    lastTapTime = 0;
    lastTapY = 0;
  }
}

function handleScriptJump(event) {
  const paragraph = event.target.closest("#scriptOutput p");
  if (!paragraph) return;
  event.preventDefault();
  if (Date.now() < suppressDblClickUntil) return;
  startFromPoint(event.clientY, paragraph);
}

function startFromPoint(clientY, paragraph) {
  if (paragraph.classList.contains("empty-line")) return;

  pausePlayback();
  const containerRect = elements.teleprompter.getBoundingClientRect();
  const clickedContentY = elements.teleprompter.scrollTop + clientY - containerRect.top;
  const guideY = elements.teleprompter.clientHeight * 0.46;
  elements.teleprompter.scrollTop = Math.max(0, clickedContentY - guideY);
  updateProgress();
  flashTarget(paragraph);
  startPlaybackWithCountdown(true);
}

function flashTarget(paragraph) {
  paragraph.classList.remove("jump-target");
  void paragraph.offsetWidth;
  paragraph.classList.add("jump-target");
}

function resetScroll() {
  pausePlayback();
  elements.teleprompter.scrollTop = 0;
  updateProgress();
}

function jumpBy(amount) {
  elements.teleprompter.scrollTop += amount;
  updateProgress();
}

function updateProgress() {
  updateActiveParagraph();

  const maxScroll = Math.max(1, elements.teleprompter.scrollHeight - elements.teleprompter.clientHeight);
  const progress = Math.min(100, Math.max(0, (elements.teleprompter.scrollTop / maxScroll) * 100));
  elements.progressFill.style.width = `${progress}%`;
  elements.progressLabel.textContent = `${Math.round(progress)}%`;

  if (!isScrubbing) {
    elements.progressInput.value = String(Math.round((progress / 100) * 1000));
  }

  const remainingPx = Math.max(0, maxScroll - elements.teleprompter.scrollTop);
  const remainingSeconds = state.speed > 0 ? remainingPx / state.speed : 0;
  elements.remainingLabel.textContent = `剩余 ${formatDuration(remainingSeconds)}`;
}

function handleProgressInput(event) {
  isScrubbing = true;
  const maxScroll = Math.max(1, elements.teleprompter.scrollHeight - elements.teleprompter.clientHeight);
  const target = (Number(event.target.value) / 1000) * maxScroll;
  elements.teleprompter.scrollTop = target;
  updateProgress();
}

function handleProgressCommit() {
  isScrubbing = false;
  updateProgress();
}

function isAtBottom() {
  return elements.teleprompter.scrollTop + elements.teleprompter.clientHeight >= elements.teleprompter.scrollHeight - 2;
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  await elements.stage.requestFullscreen();
}

function handleKeydown(event) {
  const activeTag = document.activeElement?.tagName;
  if (activeTag === "TEXTAREA" || activeTag === "INPUT") return;

  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    nudgeSpeed(4);
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    nudgeSpeed(-4);
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    jumpBy(-120);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    jumpBy(120);
  }
  if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    toggleFullscreen();
  }
  if (event.key === "Escape") {
    pausePlayback();
    elements.controlPanel.classList.remove("open");
    if (state.ttsExpanded) {
      setTtsExpanded(false);
    }
  }
}

function nudgeSpeed(delta) {
  const min = Number(elements.speedInput.min);
  const max = Number(elements.speedInput.max);
  state.speed = Math.min(max, Math.max(min, state.speed + delta));
  elements.speedInput.value = String(state.speed);
  applySettings();
  saveState();
  updateProgress();
}

function importScript(event) {
  const [file] = event.target.files;
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.script = String(reader.result || "");
    elements.scriptInput.value = state.script;
    renderScript();
    resetScroll();
    saveState();
    elements.fileInput.value = "";
  });
  reader.readAsText(file);
}

function downloadScript() {
  const blob = new Blob([state.script], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "video-script.txt";
  link.click();
  URL.revokeObjectURL(url);
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return false;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    return true;
  } catch {
    return false;
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try {
    await wakeLock.release();
  } finally {
    wakeLock = null;
  }
}

async function handleVisibilityChange() {
  if (document.hidden) {
    pausePlayback();
    await releaseWakeLock();
    return;
  }
  if (state.wake) await requestWakeLock();
}

async function runCountdown() {
  if (countdownPending || isPlaying || state.countdown <= 0) return;

  countdownPending = true;
  elements.countdownOverlay.hidden = false;
  elements.countdownOverlay.textContent = String(state.countdown);

  await new Promise((resolve) => {
    let current = state.countdown;
    countdownTimer = window.setInterval(() => {
      current -= 1;
      if (current > 0) {
        elements.countdownOverlay.textContent = String(current);
        return;
      }

      window.clearInterval(countdownTimer);
      countdownTimer = null;
      elements.countdownOverlay.textContent = "开始";
      window.setTimeout(resolve, 320);
    }, 1000);
  });

  if (!countdownPending) return;

  countdownPending = false;
  elements.countdownOverlay.hidden = true;
  await startPlayback();
}

function clearCountdown() {
  countdownPending = false;
  if (countdownTimer) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
  elements.countdownOverlay.hidden = true;
}

function updateStats() {
  const paragraphs = getDisplayParagraphs(state.script);
  const normalizedText = paragraphs.join("").replace(/\s+/g, "");
  const charCount = normalizedText.length;
  const paragraphCount = paragraphs.length;
  const estimatedSeconds = charCount > 0 ? (charCount / 240) * 60 : 0;

  elements.charCountValue.textContent = String(charCount);
  elements.paragraphCountValue.textContent = String(paragraphCount);
  elements.durationValue.textContent = formatDuration(estimatedSeconds);
}

function updateActiveParagraph() {
  const paragraphs = [...elements.scriptOutput.querySelectorAll("p:not(.empty-line)")];
  const total = paragraphs.length;

  if (total === 0) {
    activeParagraphIndex = -1;
    elements.activeParagraphLabel.textContent = "第 0 / 0 段";
    elements.ttsParagraphLabel.textContent = "第 0 / 0 段";
    elements.ttsPreview.textContent = "当前没有可朗读的段落";
    return;
  }

  const guideY = elements.teleprompter.scrollTop + elements.teleprompter.clientHeight * 0.46;
  let nearestIndex = 0;
  let smallestDistance = Number.POSITIVE_INFINITY;

  paragraphs.forEach((paragraph, index) => {
    const paragraphCenter = paragraph.offsetTop + paragraph.offsetHeight / 2;
    const distance = Math.abs(paragraphCenter - guideY);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      nearestIndex = index;
    }
  });

  if (nearestIndex !== activeParagraphIndex) {
    paragraphs.forEach((paragraph, index) => {
      paragraph.classList.toggle("active-paragraph", index === nearestIndex);
      paragraph.classList.toggle("past-paragraph", index < nearestIndex);
      paragraph.classList.toggle("tts-selected", index === getTtsParagraphIndex(total));
    });
    activeParagraphIndex = nearestIndex;
  }

  elements.activeParagraphLabel.textContent = `第 ${nearestIndex + 1} / ${total} 段`;
  updateTtsSelectionUI(paragraphs);
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || typeof saved !== "object") return {};
    return {
      script: typeof saved.script === "string" ? saved.script : defaults.script,
      speed: clampNumber(saved.speed, 12, 180, defaults.speed),
      fontSize: clampNumber(saved.fontSize, 28, 104, defaults.fontSize),
      lineHeight: clampNumber(saved.lineHeight, 1.1, 2, defaults.lineHeight),
      theme: ["dark", "paper", "studio"].includes(saved.theme) ? saved.theme : defaults.theme,
      mirror: Boolean(saved.mirror),
      guide: saved.guide !== false,
      wake: Boolean(saved.wake),
      focusMode: saved.focusMode !== false,
      countdown: [0, 3, 5].includes(Number(saved.countdown)) ? Number(saved.countdown) : defaults.countdown,
      autoSegment: saved.autoSegment !== false,
      ttsRate: clampNumber(saved.ttsRate, 0.7, 1.4, defaults.ttsRate),
      voiceURI: typeof saved.voiceURI === "string" ? saved.voiceURI : defaults.voiceURI,
      ttsExpanded: Boolean(saved.ttsExpanded),
      ttsDockX: Number.isFinite(Number(saved.ttsDockX)) ? Number(saved.ttsDockX) : defaults.ttsDockX,
      ttsDockY: Number.isFinite(Number(saved.ttsDockY)) ? Number(saved.ttsDockY) : defaults.ttsDockY,
    };
  } catch {
    return {};
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch {
    // Service workers require HTTPS or localhost.
  }
}

function hydrateVoices() {
  if (!speechSynthesisApi) {
    elements.ttsStatusValue.textContent = "不可用";
    elements.voiceSelect.disabled = true;
    elements.speakCurrent.disabled = true;
    elements.stopSpeaking.disabled = true;
    elements.ttsPrevParagraph.disabled = true;
    elements.ttsNextParagraph.disabled = true;
    elements.ttsSupportNote.hidden = false;
    return;
  }

  loadVoices();
  speechSynthesisApi.addEventListener("voiceschanged", loadVoices);
}

function loadVoices() {
  if (!speechSynthesisApi) return;

  availableVoices = speechSynthesisApi.getVoices();
  elements.voiceSelect.replaceChildren();

  if (availableVoices.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "系统语音加载中";
    elements.voiceSelect.append(option);
    elements.voiceSelect.disabled = true;
    return;
  }

  const preferredVoices = [...availableVoices].sort((left, right) => {
    const leftScore = scoreVoice(left);
    const rightScore = scoreVoice(right);
    return rightScore - leftScore;
  });

  preferredVoices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} · ${voice.lang}${voice.default ? " · 默认" : ""}`;
    elements.voiceSelect.append(option);
  });

  elements.voiceSelect.disabled = false;
  const preferred = preferredVoices.find((voice) => voice.voiceURI === state.voiceURI) || preferredVoices[0];
  state.voiceURI = preferred?.voiceURI || "";
  elements.voiceSelect.value = state.voiceURI;
  saveState();
}

function scoreVoice(voice) {
  const lang = String(voice.lang || "").toLowerCase();
  let score = 0;

  if (lang.startsWith("zh")) score += 4;
  if (lang.startsWith("en")) score += 3;
  if (voice.default) score += 2;
  if (/natural|neural|premium/i.test(voice.name)) score += 1;

  return score;
}

function getActiveParagraphText() {
  const paragraphs = [...elements.scriptOutput.querySelectorAll("p:not(.empty-line)")];
  if (paragraphs.length === 0) return "";

  const safeIndex = getTtsParagraphIndex(paragraphs.length);
  return paragraphs[safeIndex]?.textContent?.trim() || "";
}

function speakActiveParagraph() {
  if (!speechSynthesisApi) {
    elements.ttsStatusValue.textContent = "不可用";
    return;
  }

  const text = getActiveParagraphText();
  if (!text) {
    elements.ttsStatusValue.textContent = "无内容";
    return;
  }

  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(text);
  const selectedVoice = availableVoices.find((voice) => voice.voiceURI === state.voiceURI);

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  }

  utterance.rate = Number(state.ttsRate) || 1;
  utterance.onstart = () => {
    elements.ttsStatusValue.textContent = "朗读中";
  };
  utterance.onend = () => {
    currentUtterance = null;
    elements.ttsStatusValue.textContent = "待机";
  };
  utterance.onerror = () => {
    currentUtterance = null;
    elements.ttsStatusValue.textContent = "失败";
  };

  currentUtterance = utterance;
  speechSynthesisApi.speak(utterance);
}

function stopSpeaking() {
  if (!speechSynthesisApi) return;
  speechSynthesisApi.cancel();
  currentUtterance = null;
  elements.ttsStatusValue.textContent = "待机";
}

function startDockDrag(event) {
  if (!state.ttsExpanded) return;
  const rect = elements.ttsDock.getBoundingClientRect();
  dockDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
  elements.ttsDragHandle.setPointerCapture?.(event.pointerId);
}

function handleDockDrag(event) {
  if (!dockDrag || event.pointerId !== dockDrag.pointerId) return;

  const maxX = Math.max(8, window.innerWidth - elements.ttsDock.offsetWidth - 8);
  const maxY = Math.max(8, window.innerHeight - elements.ttsDock.offsetHeight - 8);
  state.ttsDockX = Math.min(maxX, Math.max(8, event.clientX - dockDrag.offsetX));
  state.ttsDockY = Math.min(maxY, Math.max(8, event.clientY - dockDrag.offsetY));
  applyDockState();
}

function endDockDrag(event) {
  if (!dockDrag || event.pointerId !== dockDrag.pointerId) return;
  dockDrag = null;
  saveState();
}

function shiftTtsParagraph(delta) {
  const paragraphs = [...elements.scriptOutput.querySelectorAll("p:not(.empty-line)")];
  if (paragraphs.length === 0) return;

  const currentIndex = getTtsParagraphIndex(paragraphs.length);
  selectedTtsParagraphIndex = Math.min(paragraphs.length - 1, Math.max(0, currentIndex + delta));
  updateTtsSelectionUI(paragraphs);
}

function getTtsParagraphIndex(total) {
  if (selectedTtsParagraphIndex >= 0 && selectedTtsParagraphIndex < total) {
    return selectedTtsParagraphIndex;
  }
  if (activeParagraphIndex >= 0 && activeParagraphIndex < total) {
    return activeParagraphIndex;
  }
  return 0;
}

function updateTtsSelectionUI(paragraphs = [...elements.scriptOutput.querySelectorAll("p:not(.empty-line)")]) {
  const total = paragraphs.length;

  if (total === 0) {
    elements.ttsParagraphLabel.textContent = "第 0 / 0 段";
    elements.ttsPreview.textContent = "当前没有可朗读的段落";
    return;
  }

  const selectedIndex = getTtsParagraphIndex(total);
  paragraphs.forEach((paragraph, index) => {
    paragraph.classList.toggle("tts-selected", index === selectedIndex);
  });
  elements.ttsParagraphLabel.textContent = `第 ${selectedIndex + 1} / ${total} 段`;
  elements.ttsPreview.textContent = paragraphs[selectedIndex]?.textContent?.trim() || "当前没有可朗读的段落";
}

function getDisplayParagraphs(script) {
  const normalized = String(script || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const baseBlocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!state.autoSegment) {
    return baseBlocks;
  }

  return baseBlocks.flatMap((block) => splitIntoSentenceParagraphs(block));
}

function splitIntoSentenceParagraphs(block) {
  const lines = block
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const merged = lines.join(" ");
  const sentences = [];
  let buffer = "";

  for (let index = 0; index < merged.length; index += 1) {
    const char = merged[index];
    const prevChar = merged[index - 1] || "";
    const nextChar = merged[index + 1] || "";

    buffer += char;

    if (!isSentenceBoundary(char, prevChar, nextChar, buffer)) {
      continue;
    }

    const sentence = buffer.trim();
    if (sentence) {
      sentences.push(sentence);
    }
    buffer = "";
  }

  const tail = buffer.trim();
  if (tail) {
    sentences.push(tail);
  }

  return sentences.length > 0 ? sentences : [merged];
}

function isSentenceBoundary(char, prevChar, nextChar, buffer) {
  if ("。！？；".includes(char)) {
    return true;
  }

  if (char === "…" && nextChar !== "…") {
    return true;
  }

  if (!".?!;".includes(char)) {
    return false;
  }

  if (char === "." && /\d/.test(prevChar) && /\d/.test(nextChar)) {
    return false;
  }

  if (char === ".") {
    const abbreviationMatch = buffer.match(/(?:\b[A-Za-z]\.){1,}$/);
    if (abbreviationMatch && /[A-Za-z]/.test(nextChar)) {
      return false;
    }
  }

  return true;
}
