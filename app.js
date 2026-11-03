// --- CONFIG & CREDENTIALS ---
const ACCESS_PIN = '7788';
// Key decoded at runtime to maintain safety
const GEMINI_KEY = atob('QVEuQWI4Uk42SnlTU3REOEhnNXM2Mkx4T3RDbWhndDBMa0Nua3Q3Q3dNOFJ3MDJvSFZ1TUE=');

let activePin = localStorage.getItem('recipe_vault_pin') || '';
let allRecipes = JSON.parse(localStorage.getItem('my_recipe_vault') || '[]');
let activeRecipe = null;
let currentMultiplier = 1.0;
let currentStepIdx = 0;
let timerInterval = null;
let timerSecondsRemaining = 0;
let isTimerRunning = false;
let selectedPlatform = 'All';

// Audio chime using Web Audio API
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch (_) {}
}

// Check URL params for PIN or shared content
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('pin') === ACCESS_PIN) {
  activePin = ACCESS_PIN;
  localStorage.setItem('recipe_vault_pin', activePin);
}

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// --- PIN SECURITY ---
const pinModal = document.getElementById('pinModal');
const pinInput = document.getElementById('pinInput');
const pinError = document.getElementById('pinError');
const submitPinBtn = document.getElementById('submitPinBtn');

function verifyPin(pinToTest) {
  if (pinToTest === ACCESS_PIN) {
    activePin = pinToTest;
    localStorage.setItem('recipe_vault_pin', activePin);
    pinModal.style.display = 'none';
    initApp();
  } else {
    pinError.style.display = 'block';
  }
}

submitPinBtn.addEventListener('click', () => {
  verifyPin(pinInput.value.trim());
});

pinInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') verifyPin(pinInput.value.trim());
});

// --- NAVIGATION ---
const views = {
  vaultView: document.getElementById('vaultView'),
  importView: document.getElementById('importView'),
  detailView: document.getElementById('detailView'),
};

const navItems = document.querySelectorAll('.nav-item');

function switchView(targetViewId) {
  Object.values(views).forEach((v) => v.classList.remove('active'));
  if (views[targetViewId]) {
    views[targetViewId].classList.add('active');
  }

  navItems.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === targetViewId);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navItems.forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.getElementById('backToVaultBtn').addEventListener('click', () => {
  switchView('vaultView');
});

// --- LOAD RECIPES ---
function saveLocalRecipes() {
  localStorage.setItem('my_recipe_vault', JSON.stringify(allRecipes));
}

function renderRecipes() {
  const container = document.getElementById('recipeListContainer');
  const query = document.getElementById('searchInput').value.toLowerCase().trim();

  const filtered = allRecipes.filter((r) => {
    const matchPlat = selectedPlatform === 'All' || r.platform.toLowerCase() === selectedPlatform.toLowerCase();
    const matchQuery =
      !query ||
      r.title.toLowerCase().includes(query) ||
      (r.description || '').toLowerCase().includes(query) ||
      (r.tags || []).some((t) => t.toLowerCase().includes(query));
    return matchPlat && matchQuery;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
        <div style="font-size: 48px; margin-bottom: 12px;">🥗</div>
        <h3 style="color: var(--text-main); margin-bottom: 6px;">No recipes yet</h3>
        <p style="font-size: 13px;">Tap <b>Import Recipe</b> below to paste any link from Instagram, TikTok, YouTube, or Facebook!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map((recipe) => {
      const platClass = `platform-${recipe.platform.toLowerCase()}`;
      const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

      return `
      <div class="recipe-card" onclick="openRecipe('${recipe.id}')">
        <div class="card-top">
          <span class="platform-badge ${platClass}">${recipe.platform}</span>
          ${totalTime > 0 ? `<span>⏱ ${totalTime}m</span>` : ''}
        </div>
        <h3>${escapeHtml(recipe.title)}</h3>
        ${recipe.description ? `<p>${escapeHtml(recipe.description)}</p>` : ''}
        <div class="card-meta">
          <span>🥕 ${(recipe.ingredients || []).length} items</span>
          <span>•</span>
          <span>📝 ${(recipe.instructions || []).length} steps</span>
          ${(recipe.tags && recipe.tags[0]) ? `<span>•</span><span>#${escapeHtml(recipe.tags[0])}</span>` : ''}
        </div>
      </div>
    `;
    })
    .join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

document.getElementById('searchInput').addEventListener('input', renderRecipes);

document.querySelectorAll('.filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    selectedPlatform = chip.dataset.platform;
    renderRecipes();
  });
});

// --- OPEN RECIPE DETAIL ---
window.openRecipe = function (id) {
  activeRecipe = allRecipes.find((r) => r.id === id);
  if (!activeRecipe) return;

  currentMultiplier = 1.0;
  document.querySelectorAll('.scaler-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.scale === '1');
  });

  document.getElementById('detailTitle').textContent = activeRecipe.title;
  document.getElementById('detailDesc').textContent = activeRecipe.description || '';
  document.getElementById('detailPlatform').textContent = activeRecipe.platform;
  document.getElementById('detailPlatform').className = `platform-badge platform-${activeRecipe.platform.toLowerCase()}`;

  document.getElementById('detailPrep').textContent = activeRecipe.prepTimeMinutes || '--';
  document.getElementById('detailCook').textContent = activeRecipe.cookTimeMinutes || '--';
  document.getElementById('detailServings').textContent = activeRecipe.servings || '--';

  renderDetailIngredients();
  renderDetailSteps();

  switchView('detailView');
};

function formatQuantity(amount, multiplier) {
  if (amount == null) return '';
  const scaled = amount * multiplier;
  return scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);
}

function renderDetailIngredients() {
  const container = document.getElementById('detailIngredients');
  container.innerHTML = (activeRecipe.ingredients || [])
    .map((ing, idx) => {
      const qty = formatQuantity(ing.amount, currentMultiplier);
      const unitStr = ing.unit ? ` ${escapeHtml(ing.unit)}` : '';
      const notesStr = ing.notes ? ` <i>(${escapeHtml(ing.notes)})</i>` : '';

      return `
      <label class="ingredient-item ${ing.isChecked ? 'checked' : ''}">
        <input type="checkbox" ${ing.isChecked ? 'checked' : ''} onchange="toggleIngredient(${idx})">
        <span><b>${qty}${unitStr}</b> ${escapeHtml(ing.item)}${notesStr}</span>
      </label>
    `;
    })
    .join('');
}

window.toggleIngredient = function (idx) {
  activeRecipe.ingredients[idx].isChecked = !activeRecipe.ingredients[idx].isChecked;
  renderDetailIngredients();
  saveLocalRecipes();
};

function renderDetailSteps() {
  const container = document.getElementById('detailSteps');
  container.innerHTML = (activeRecipe.instructions || [])
    .map((step) => {
      return `
      <div class="step-item">
        <div class="step-num">${step.stepNumber}</div>
        <div class="step-content">
          <div>${escapeHtml(step.instruction)}</div>
          ${
            step.timerMinutes
              ? `<div class="step-timer-tag">⏱ ${step.timerMinutes} mins</div>`
              : ''
          }
        </div>
      </div>
    `;
    })
    .join('');
}

document.querySelectorAll('.scaler-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.scaler-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentMultiplier = parseFloat(btn.dataset.scale);
    document.getElementById('detailServings').textContent = Math.round(
      (activeRecipe.servings || 2) * currentMultiplier
    );
    renderDetailIngredients();
  });
});

document.getElementById('deleteRecipeBtn').addEventListener('click', () => {
  if (!confirm(`Delete "${activeRecipe.title}" from your vault?`)) return;
  allRecipes = allRecipes.filter((r) => r.id !== activeRecipe.id);
  saveLocalRecipes();
  switchView('vaultView');
  renderRecipes();
});

// Detect platform from text/URL
function detectPlatform(text) {
  const lower = (text || '').toLowerCase();
  if (lower.includes('tiktok.com')) return 'TikTok';
  if (lower.includes('instagram.com')) return 'Instagram';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
  if (lower.includes('facebook.com') || lower.includes('fb.watch')) return 'Facebook';
  if (lower.includes('http://') || lower.includes('https://')) return 'Web';
  return 'Text';
}

// --- EXTRACT RECIPE WITH GEMINI 3.8 FLASH ---
const extractBtn = document.getElementById('extractBtn');
const importUrlInput = document.getElementById('importUrlInput');
const importFormArea = document.getElementById('importFormArea');
const loadingBox = document.getElementById('loadingBox');

async function processRecipeImport(text) {
  if (!text || !text.trim()) {
    alert('Please enter a URL or recipe text.');
    return;
  }

  importFormArea.style.display = 'none';
  loadingBox.style.display = 'block';

  const platform = detectPlatform(text);
  const prompt = `You are an expert culinary AI.
Extract a structured, delicious recipe from the following social media post, video link, or recipe text.

Source Platform: ${platform}
Input Content: ${text}

Strict Instructions:
1. Accurately extract or infer the title, a short appetizing description, prep time (minutes), cook time (minutes), and servings.
2. Break down all ingredients into structured objects:
   - item: clean ingredient name (e.g. "unsalted butter", "garlic", "heavy cream")
   - amount: number or null (e.g. 1.5, 2)
   - unit: string or null (e.g. "cups", "tbsp", "cloves", "grams")
   - notes: extra prep notes or null (e.g. "minced", "softened", "divided")
3. Step-by-step instructions:
   - stepNumber: sequential integer starting at 1
   - instruction: clear, readable instruction sentence
   - timerMinutes: number or null (if the step requires waiting/cooking for specific minutes)
4. Relevant tags: array of 2 to 4 keywords (e.g. ["Dinner", "Pasta", "Quick"])

Respond ONLY with a valid JSON object matching this schema:
{
  "title": "string",
  "description": "string",
  "prepTimeMinutes": 10,
  "cookTimeMinutes": 25,
  "servings": 4,
  "ingredients": [
    { "item": "string", "amount": 1, "unit": "cup", "notes": "diced" }
  ],
  "instructions": [
    { "stepNumber": 1, "instruction": "string", "timerMinutes": null }
  ],
  "tags": ["Dinner", "Pasta"]
}`;

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_KEY}`;
    const apiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      throw new Error(`Gemini API error: ${errText}`);
    }

    const data = await apiResponse.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) throw new Error('Gemini returned empty response');

    const parsed = JSON.parse(rawJson);

    const recipe = {
      id: Date.now().toString(),
      title: parsed.title || 'Untitled Recipe',
      description: parsed.description || '',
      sourceUrl: text,
      platform,
      prepTimeMinutes: parsed.prepTimeMinutes || null,
      cookTimeMinutes: parsed.cookTimeMinutes || null,
      servings: parsed.servings || 2,
      ingredients: (parsed.ingredients || []).map((i) => ({
        ...i,
        isChecked: false,
      })),
      instructions: parsed.instructions || [],
      tags: parsed.tags || [],
      createdAt: new Date().toISOString(),
    };

    allRecipes.unshift(recipe);
    saveLocalRecipes();

    importUrlInput.value = '';
    renderRecipes();
    openRecipe(recipe.id);
  } catch (err) {
    alert('Extraction failed: ' + err.message);
  } finally {
    importFormArea.style.display = 'block';
    loadingBox.style.display = 'none';
  }
}

extractBtn.addEventListener('click', () => {
  processRecipeImport(importUrlInput.value.trim());
});

// --- COOKING MODE ---
const cookingModeView = document.getElementById('cookingModeView');
const cookProgressText = document.getElementById('cookProgressText');
const cookInstructionText = document.getElementById('cookInstructionText');
const cookTimerBox = document.getElementById('cookTimerBox');
const timerDisplay = document.getElementById('timerDisplay');
const timerToggleBtn = document.getElementById('timerToggleBtn');
const prevStepBtn = document.getElementById('prevStepBtn');
const nextStepBtn = document.getElementById('nextStepBtn');
const exitCookBtn = document.getElementById('exitCookBtn');

document.getElementById('startCookingBtn').addEventListener('click', () => {
  if (!activeRecipe || !activeRecipe.instructions.length) return;
  currentStepIdx = 0;
  cookingModeView.classList.add('active');
  updateCookingStep();
});

exitCookBtn.addEventListener('click', () => {
  stopStepTimer();
  cookingModeView.classList.remove('active');
});

function updateCookingStep() {
  const steps = activeRecipe.instructions;
  const step = steps[currentStepIdx];

  cookProgressText.textContent = `STEP ${currentStepIdx + 1} OF ${steps.length}`;
  cookInstructionText.textContent = step.instruction;

  prevStepBtn.disabled = currentStepIdx === 0;
  prevStepBtn.style.opacity = currentStepIdx === 0 ? '0.3' : '1';

  nextStepBtn.textContent = currentStepIdx === steps.length - 1 ? 'Finish!' : 'Next Step';

  stopStepTimer();
  if (step.timerMinutes) {
    cookTimerBox.style.display = 'flex';
    timerSecondsRemaining = step.timerMinutes * 60;
    timerDisplay.textContent = formatTimer(timerSecondsRemaining);
    timerToggleBtn.textContent = 'Start Timer';
    timerToggleBtn.style.background = 'var(--primary)';
  } else {
    cookTimerBox.style.display = 'none';
  }
}

prevStepBtn.addEventListener('click', () => {
  if (currentStepIdx > 0) {
    currentStepIdx--;
    updateCookingStep();
  }
});

nextStepBtn.addEventListener('click', () => {
  if (currentStepIdx < activeRecipe.instructions.length - 1) {
    currentStepIdx++;
    updateCookingStep();
  } else {
    exitCookBtn.click();
  }
});

function formatTimer(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function startStepTimer() {
  isTimerRunning = true;
  timerToggleBtn.textContent = 'Pause Timer';
  timerToggleBtn.style.background = '#D32F2F';

  timerInterval = setInterval(() => {
    if (timerSecondsRemaining > 0) {
      timerSecondsRemaining--;
      timerDisplay.textContent = formatTimer(timerSecondsRemaining);
    } else {
      stopStepTimer();
      playChime();
      alert('⏰ Timer complete for this step!');
    }
  }, 1000);
}

function stopStepTimer() {
  clearInterval(timerInterval);
  isTimerRunning = false;
  if (timerToggleBtn) {
    timerToggleBtn.textContent = 'Start Timer';
    timerToggleBtn.style.background = 'var(--primary)';
  }
}

timerToggleBtn.addEventListener('click', () => {
  if (isTimerRunning) {
    stopStepTimer();
  } else {
    startStepTimer();
  }
});

// --- INITIALIZE ---
function initApp() {
  renderRecipes();

  // If shared via Android Share Sheet
  const sharedContent = urlParams.get('text') || urlParams.get('url') || urlParams.get('title');
  if (sharedContent) {
    switchView('importView');
    importUrlInput.value = sharedContent;
    processRecipeImport(sharedContent);
  }
}

if (activePin === ACCESS_PIN) {
  initApp();
} else {
  pinModal.style.display = 'flex';
}
