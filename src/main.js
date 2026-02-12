/**
 * 秘密共享 Offline-First SPA
 * 逻辑与 vault.py 一致：AES-GCM 加密 + Shamir 拆分会话密钥，Blob 格式兼容。
 */
import { split as shamirSplit, combine as shamirCombine } from 'shamir-secret-sharing';
import './style.css';

const UTF8 = new TextEncoder();
const UTF8_DECODE = new TextDecoder('utf-8');

function bytesToBase64(u8) {
  let binary = '';
  u8.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const u8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
  return u8;
}

function bytesToHex(u8) {
  return Array.from(u8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const u8 = new Uint8Array(hex.length / 2);
  for (let i = 0; i < u8.length; i++) u8[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return u8;
}

/** AES-GCM 加密：key 16 字节，返回 { nonce, tag, ciphertext } 均为 base64 */
async function encryptAES(key, plaintext) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const keyObj = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    keyObj,
    plaintext
  );
  const cipherU8 = new Uint8Array(cipher);
  const tag = cipherU8.slice(-16);
  const ciphertext = cipherU8.slice(0, -16);
  return {
    nonce: bytesToBase64(nonce),
    tag: bytesToBase64(tag),
    ciphertext: bytesToBase64(ciphertext),
  };
}

/** AES-GCM 解密 */
async function decryptAES(key, nonceB64, tagB64, ciphertextB64) {
  const nonce = base64ToBytes(nonceB64);
  const tag = base64ToBytes(tagB64);
  const ciphertext = base64ToBytes(ciphertextB64);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);
  const keyObj = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    keyObj,
    combined
  );
}

/**
 * 拆分：加密原文并拆分会话密钥，返回与 vault.py 兼容的 shares（idx:hex）和 blob JSON。
 */
async function doSplit(secretUtf8, threshold, total) {
  const plaintext = UTF8.encode(secretUtf8);
  const sessionKey = crypto.getRandomValues(new Uint8Array(16));
  const blob = await encryptAES(sessionKey, plaintext);
  const shares = await shamirSplit(sessionKey, total, threshold);
  const formatted = shares.map((s, i) => `${i + 1}:${bytesToHex(s)}`);
  return { shares: formatted, blob: JSON.stringify(blob) };
}

/**
 * 还原：从 share 行（每行 idx:hex 或仅 hex）和 blob JSON 还原原文。
 */
async function doCombine(shareLines, blobJson) {
  const blob = JSON.parse(blobJson);
  const parseOne = (line) => {
    const t = line.trim();
    if (!t) return null;
    const colon = t.indexOf(':');
    const hex = colon >= 0 ? t.slice(colon + 1).trim() : t;
    return hexToBytes(hex);
  };
  const shares = shareLines.map(parseOne).filter(Boolean);
  if (shares.length < 2) throw new Error('至少需要 2 个密钥片段');
  const sessionKey = await shamirCombine(shares);
  const plaintext = await decryptAES(
    sessionKey,
    blob.nonce,
    blob.tag,
    blob.ciphertext
  );
  return UTF8_DECODE.decode(plaintext);
}

// ——— UI ———
function show(el, visible = true) {
  el.hidden = !visible;
}

function selectPanel(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.panel === name);
    t.setAttribute('aria-selected', t.dataset.panel === name);
  });
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.toggle('active', p.id === `panel-${name}`);
  });
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => selectPanel(btn.dataset.panel));
});

document.getElementById('formSplit').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const secret = form.secret.value;
  const threshold = parseInt(form.threshold.value, 10);
  const total = parseInt(form.total.value, 10);
  if (threshold > total || threshold < 2 || total < 2) {
    alert('门限 k 至少为 2，且 k ≤ n');
    return;
  }
  const resultEl = document.getElementById('splitResult');
  try {
    const { shares, blob } = await doSplit(secret, threshold, total);
    document.getElementById('splitMeta').textContent = `${threshold} / ${total}`;
    document.getElementById('splitShares').value = shares.join('\n');
    document.getElementById('splitBlob').value = blob;
    show(resultEl);
  } catch (err) {
    alert('拆分失败: ' + err.message);
  }
});

document.getElementById('formCombine').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const blob = form.blob.value.trim();
  const shareLines = form.shares.value.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const resultEl = document.getElementById('combineResult');
  try {
    const plain = await doCombine(shareLines, blob);
    document.getElementById('combinePlain').value = plain;
    show(resultEl);
  } catch (err) {
    alert('还原失败: ' + err.message);
  }
});

// Service Worker 注册（Offline-First）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// 离线状态
const offlineBadge = document.getElementById('offlineBadge');
function updateOnline() {
  offlineBadge.classList.toggle('on', !navigator.onLine);
}
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();
