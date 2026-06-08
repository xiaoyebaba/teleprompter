const storageKey = "video-prompter-v1";

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
};

const elements = {
  appShell: document.querySelector(".app-shell"),
  stage: document.querySelector(".stage"),
  teleprompter: document.querySelector("#teleprompter"),
  scriptOutput: document.querySelector("#scriptOutput"),
  scriptInput: document.querySelector("#scriptInput"),
  playPause: document.querySelector("#playPause"),
  playIcon: document.querySelector("#playIcon"),
  resetScroll: document.querySelector("#resetScroll"),
  jumpBack: document.querySelector("#jumpBack"),
  jumpForward: document.querySelector("#jumpForward"),
  fullscreenToggle: document.querySelector("#fullscreenToggle"),
  progressFill: document.querySelector("#progressFill"),
  progressLabel: document.querySelector("#progressLabel"),
  speedInput: document.querySelector("#speedInput"),
  speedValue: document.querySelector("#speedValue"),
  fontSizeInput: document.querySelector("#fontSizeInput"),
  fontSizeValue: document.querySelector("#fontSizeValue"),
  lineHeightInput: document.querySelector("#lineHeightInput"),
  lineHeightValue: document.querySelector("#lineHeightValue"),
  mirrorToggle: document.querySelector("#mirrorToggle"),
  guideToggle: document.querySelector("#guideToggle"),
  wakeToggle: document.querySelector("#wakeToggle"),
  loadSample: document.querySelector("#loadSample"),
  clearScript: document.querySelector("#clearScript"),
  fileInput: document.querySelector("#fileInput"),
  downloadScript: document.querySelector("#downloadScript"),
  mobilePanelToggle: document.querySelector("#mobilePanelToggle"),
  controlPanel: document.querySelector("#controlPanel"),
  themeButtons: [...document.querySelectorAll("[data-theme]")],
};

const state = { ...defaults, ...loadState() };
let isPlaying = false;
let frameId = null;
let lastFrameTime = 0;
let wakeLock = null;
let lastTapTime = 0;
let lastTapY = 0;
let suppressDblClickUntil = 0;

hydrateControls();
renderScript();
applySettings();
updateProgress();
bindEvents();
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
  elements.wakeToggle.addEventListener("change", () => updateWakeSetting(elements.wakeToggle.checked));

  elements.themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.theme = button.dataset.theme;
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
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("fullscreenchange", () => elements.controlPanel.classList.remove("open"));
  document.addEventListener("visibilitychange", handleVisibilityChange);
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
  startPlayback();
}

function flashTarget(paragraph) {
  paragraph.classList.remove("jump-target");
  void paragraph.offsetWidth;
  paragraph.classList.add("jump-target");
}

function hydrateControls() {
  elements.scriptInput.value = state.script;
  elements.speedInput.value = state.speed;
  elements.fontSizeInput.value = state.fontSize;
  elements.lineHeightInput.value = state.lineHeight;
  elements.mirrorToggle.checked = state.mirror;
  elements.guideToggle.checked = state.guide;
  elements.wakeToggle.checked = state.wake;
}

function renderScript() {
  elements.scriptOutput.replaceChildren();

  const script = state.script.trim();
  if (!script) {
    const empty = document.createElement("p");
    empty.className = "empty-line";
    empty.textContent = "脚本为空";
    elements.scriptOutput.append(empty);
    return;
  }

  script.split(/\n{2,}/).forEach((block) => {
    const paragraph = document.createElement("p");
    block.split(/\n/).forEach((line, index) => {
      if (index > 0) paragraph.append(document.createElement("br"));
      paragraph.append(document.createTextNode(line));
    });
    elements.scriptOutput.append(paragraph);
  });
}

function applySettings() {
  elements.teleprompter.style.setProperty("--script-size", `${state.fontSize}px`);
  elements.teleprompter.style.setProperty("--script-line", state.lineHeight);
  elements.teleprompter.style.setProperty("--mirror", state.mirror ? -1 : 1);
  elements.teleprompter.classList.toggle("hide-guide", !state.guide);

  document.body.classList.toggle("theme-paper", state.theme === "paper");
  document.body.classList.toggle("theme-studio", state.theme === "studio");

  elements.themeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === state.theme);
  });

  elements.speedValue.textContent = state.speed;
  elements.fontSizeValue.textContent = state.fontSize;
  elements.lineHeightValue.textContent = Number(state.lineHeight).toFixed(2);
}

function updateNumberSetting(key, value) {
  state[key] = Number(value);
  applySettings();
  saveState();
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
  if (isPlaying) {
    pausePlayback();
    return;
  }
  startPlayback();
}

async function startPlayback() {
  if (isPlaying) return;
  isPlaying = true;
  lastFrameTime = performance.now();
  elements.playPause.setAttribute("aria-label", "暂停滚动");
  elements.playIcon.textContent = "Ⅱ";
  if (state.wake) await requestWakeLock();
  frameId = requestAnimationFrame(step);
}

function pausePlayback() {
  isPlaying = false;
  elements.playPause.setAttribute("aria-label", "开始滚动");
  elements.playIcon.textContent = "▶";
  cancelAnimationFrame(frameId);
  frameId = null;
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
  const maxScroll = Math.max(1, elements.teleprompter.scrollHeight - elements.teleprompter.clientHeight);
  const progress = Math.min(100, Math.max(0, (elements.teleprompter.scrollTop / maxScroll) * 100));
  elements.progressFill.style.width = `${progress}%`;
  elements.progressLabel.textContent = `${Math.round(progress)}%`;
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
    elements.controlPanel.classList.remove("open");
  }
}

function nudgeSpeed(delta) {
  const min = Number(elements.speedInput.min);
  const max = Number(elements.speedInput.max);
  state.speed = Math.min(max, Math.max(min, state.speed + delta));
  elements.speedInput.value = state.speed;
  applySettings();
  saveState();
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
