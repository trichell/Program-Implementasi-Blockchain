// Struktur setiap blok:
// { index, timestamp, data, prevHash, nonce, difficulty, hash }

const chain = [];
const $ = (id) => document.getElementById(id);

// ===== Helper =====
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function blockPayload(b) {
  return `${b.index}|${b.timestamp}|${b.data}|${b.prevHash}|${b.nonce}`;
}

function formatHash(hash, difficulty) {
  if (!hash) return '-';
  return `<span class="zeros">${hash.slice(0, difficulty)}</span>${hash.slice(difficulty)}`;
}

function showToast(message, type = 'info') {
  const el = $('appToast');
  el.className = `toast align-items-center border-0 text-bg-${type}`;
  $('toastBody').textContent = message;
  bootstrap.Toast.getOrCreateInstance(el, { delay: 2800 }).show();
}

const currentDifficulty = () => parseInt($('difficulty').value, 10);

// ===== Blockchain =====
async function mineBlock(block, onProgress) {
  const target = '0'.repeat(block.difficulty);
  let nonce = 0;
  while (true) {
    block.nonce = nonce;
    const hash = await sha256(blockPayload(block));
    if (hash.startsWith(target)) {
      block.hash = hash;
      return;
    }
    nonce++;
    if (nonce % 500 === 0) {
      onProgress(nonce);
      await new Promise((r) => setTimeout(r)); // beri napas ke UI
    }
  }
}

async function validateChain() {
  const result = [];
  let broken = false;
  for (let i = 0; i < chain.length; i++) {
    const b = chain[i];
    const recomputed = await sha256(blockPayload(b));
    let ok = recomputed === b.hash && b.hash.startsWith('0'.repeat(b.difficulty));
    if (i > 0 && b.prevHash !== chain[i - 1].hash) ok = false;
    if (!ok) broken = true;
    // setelah satu blok rusak, blok sesudahnya ikut tidak valid
    result.push({ ok: !broken, recomputed });
  }
  return result;
}

// ===== Render =====
function renderChain(newIndex = -1) {
  $('statBlocks').textContent = chain.length;

  $('chain').innerHTML = chain
    .map(
      (b, i) => `
            <div class="card block-card ${i === newIndex ? 'new' : ''}" id="block-${i}">
        <div class="card-body p-3">

          <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
            <span class="block-title">Blok #${b.index}</span>
            <span class="badge text-bg-success" id="badge-${i}">Valid</span>
          </div>

          <div class="mb-2">
            <div class="field-label">Timestamp</div>
            <div class="field-value" title="${escapeHtml(b.timestamp)}">${escapeHtml(new Date(b.timestamp).toLocaleString('id-ID'))}</div>
          </div>

          <div class="mb-2">
            <div class="field-label">Data</div>
            <input type="text" class="form-control form-control-sm" id="data-${i}" data-index="${i}" value="${escapeHtml(b.data).replace(/"/g, '&quot;')}">
          </div>

          <div class="mb-2">
            <div class="field-label">Prev. Hash</div>
            <div class="hash">${escapeHtml(b.prevHash)}</div>
          </div>

          <div class="mb-2">
            <div class="field-label">Nonce</div>
            <div class="field-value">${b.nonce}</div>
          </div>

          <div>
            <div class="field-label">Current Hash</div>
            <div class="hash">${formatHash(b.hash, b.difficulty)}</div>
            <div class="hash text-danger d-none mt-1" id="recomputed-${i}"></div>
          </div>

        </div>
      </div>`
    )
    .join('');

  updateStatus();

  // gulir otomatis agar blok terbaru terlihat
  if (newIndex > 0) {
    const el = $(`block-${newIndex}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Update status valid/tidak valid tanpa membangun ulang DOM (agar kursor di kotak Data tidak hilang)
async function updateStatus() {
  const validity = await validateChain();
  validity.forEach((v, i) => {
    const card = $(`block-${i}`);
    if (!card) return;
    card.classList.toggle('invalid', !v.ok);

    const badge = $(`badge-${i}`);
    badge.textContent = v.ok ? 'Valid' : 'Tidak valid';
    badge.className = `badge ${v.ok ? 'text-bg-success' : 'text-bg-danger'}`;

    const rec = $(`recomputed-${i}`);
    const mismatch = v.recomputed !== chain[i].hash;
    rec.classList.toggle('d-none', !mismatch);
    rec.textContent = mismatch ? `Dihitung ulang: ${v.recomputed}` : '';
  });

  const allValid = validity.every((v) => v.ok);
  $('statValid').innerHTML = allValid
    ? '<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>Valid</span>'
    : '<span class="text-danger"><i class="bi bi-x-circle-fill me-1"></i>Tidak valid</span>';
}

// ===== Event handlers =====
$('blockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = $('dataInput').value.trim();
  if (!data) {
    showToast('Isi Data terlebih dahulu.', 'warning');
    return;
  }

  const btn = $('btnMine');
  btn.disabled = true;
  $('mineProgress').classList.remove('d-none');

  const prev = chain[chain.length - 1];
  const block = {
    index: prev.index + 1,
    timestamp: new Date().toISOString(),
    data,
    prevHash: prev.hash,
    nonce: 0,
    difficulty: currentDifficulty(),
    hash: '',
  };

  const t0 = performance.now();
  await mineBlock(block, (n) => {
    $('mineStatus').textContent = `Mencari nonce... sudah mencoba ${n.toLocaleString('id-ID')}`;
  });
  const secs = ((performance.now() - t0) / 1000).toFixed(2);

  chain.push(block);
  $('dataInput').value = '';
  renderChain(block.index);

  $('mineProgress').classList.add('d-none');
  $('mineStatus').textContent = `Blok #${block.index} selesai (nonce ${block.nonce}, ${secs} detik).`;
  btn.disabled = false;
  showToast(`Blok #${block.index} berhasil di-mine!`, 'success');
});

// Edit data langsung di blok = simulasi manipulasi
$('chain').addEventListener('input', (e) => {
  const input = e.target.closest('input[data-index]');
  if (!input) return;
  chain[Number(input.dataset.index)].data = input.value;
  updateStatus();
});

$('btnReset').addEventListener('click', init);

// ===== Init =====
async function init() {
  const genesis = {
    index: 0,
    timestamp: new Date().toISOString(),
    data: 'Genesis Block',
    prevHash: '0'.repeat(64),
    nonce: 0,
    difficulty: currentDifficulty(),
    hash: '',
  };
  await mineBlock(genesis, () => {});
  chain.length = 0;
  chain.push(genesis);
  $('mineStatus').textContent = '';
  renderChain(0);
}

init();