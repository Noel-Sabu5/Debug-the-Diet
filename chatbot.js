// chatbot.js — Noa: Groq-powered (Llama 3.3 70B) nutrition & sleep assistant
// Depends on: firebase.js, auth.js, storage.js (window._db, window._auth, window.Storage)

(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     CONFIGURATION
  ───────────────────────────────────────────── */
  const GROQ_KEY      = (window.CONFIG && window.CONFIG.GROQ_KEY) || '';
  const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
  const GROQ_MODEL    = 'llama-3.3-70b-versatile';
  const BOT_AVATAR      = 'AI chatbot.png';
  const MAX_HISTORY     = 20;   // max conversation turns kept in memory
  const THROTTLE_MS     = 2500; // min ms between user messages

  /* ─────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────── */
  let conversationHistory = []; // OpenAI format: { role: 'user'|'assistant', content: string }[]
  let isOpen              = false;
  let isTyping            = false;
  let lastSentAt          = 0;
  let currentUser         = null;

  /* ─────────────────────────────────────────────
     CONTEXT BUILDER
     Injects user's real health data into the system prompt
  ───────────────────────────────────────────── */
  async function buildSystemPrompt() {
    let mealsText = 'No meals logged yet.';
    let sleepText = 'No sleep data logged yet.';
    let userName  = 'the user';

    try {
      // User name
      if (currentUser) {
        userName = currentUser.displayName
          || currentUser.email.split('@')[0].replace(/[._-]/g, ' ')
              .replace(/\b\w/g, c => c.toUpperCase());
      }

      // Meal context — last 12 meals from Firestore
      if (window.Storage && window.Storage.getAllMeals) {
        const meals = await window.Storage.getAllMeals();
        const recent = meals.slice(0, 12);
        if (recent.length > 0) {
          mealsText = recent.map(m => {
            const n = m.nutrition || {};
            const ts = m.date ? new Date(m.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Unknown date';
            return `• ${m.meal} | Score: ${m.score}/100 | ${ts}`
              + (n.calories ? ` | ${Math.round(n.calories)} kcal` : '')
              + (n.protein  ? `, ${Math.round(n.protein)}g protein` : '')
              + (n.carbs    ? `, ${Math.round(n.carbs)}g carbs` : '')
              + (n.fat      ? `, ${Math.round(n.fat)}g fat` : '');
          }).join('\n');
        }
      }

      // Sleep context — from localStorage (dual-write pattern matches sleep page)
      try {
        const sleepLog = JSON.parse(localStorage.getItem('dtd_sleep_log') || '[]');
        if (sleepLog.length > 0) {
          sleepText = sleepLog.slice(0, 5).map(s => {
            const ts = s.date ? new Date(s.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Unknown';
            return `• ${ts}: ${s.sleep} hrs | Score: ${s.score}/100 | ${s.category}`;
          }).join('\n');
        }
      } catch (_) {}

    } catch (err) {
      console.warn('[Chatbot] Context build error:', err.message);
    }

    // Current page
    const pageName = document.title.replace(' - Debug the Diet', '').trim();

    return `You are Noa, a clinical nutrition and sleep assistant for "Debug the Diet" — a precision health tracking application.

You are talking to ${userName}. Here is their recent health data:

=== RECENT MEALS (last 12) ===
${mealsText}

=== RECENT SLEEP LOG (last 5) ===
${sleepText}

=== CURRENT CONTEXT ===
The user is currently on the "${pageName}" page.

=== YOUR ROLE ===
- Answer questions about nutrition, meals, sleep, health scores, and wellness.
- Reference the user's actual data above when relevant (don't make up data).
- Be concise, warm, and clinically precise. Use bullet points for lists.
- If asked something outside health/nutrition/sleep, politely redirect.
- Do NOT add markdown headers (##). Keep responses under 150 words unless asked for detail.
- Address the user by first name occasionally to feel personal.`;
  }

  /* ─────────────────────────────────────────────
     GROQ API CALL (Llama 3.3 70B via Groq Cloud)
  ───────────────────────────────────────────── */
  async function callGroq(userMessage) {
    const systemPrompt = await buildSystemPrompt();

    // Groq uses OpenAI chat format with proper system messages
    // History already in { role, content } format — just prepend system + append current msg
    const messages = [
      { role: 'system',  content: systemPrompt },
      ...conversationHistory.slice(0, -1),          // prior exchanges
      { role: 'user',    content: userMessage },     // current message
    ];

    const res = await fetch(GROQ_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + GROQ_KEY,
      },
      body: JSON.stringify({
        model:       GROQ_MODEL,
        messages,
        temperature: 0.6,
        max_tokens:  400,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `Groq API error ${res.status}`);
    }

    const data  = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error('Empty response from Groq');
    return reply.trim();
  }

  /* ─────────────────────────────────────────────
     QUICK REPLY CHIPS
  ───────────────────────────────────────────── */
  const QUICK_REPLIES = [
    'How was my nutrition today?',
    'Analyze my sleep pattern',
    'What should I eat next?',
    'Show my best meal this week',
    'How can I improve my score?',
  ];

  /* ─────────────────────────────────────────────
     UI HELPERS
  ───────────────────────────────────────────── */
  function getMessages() { return document.getElementById('chatbot-messages'); }
  function getInput()    { return document.getElementById('chatbot-input'); }

  function scrollToBottom() {
    const el = getMessages();
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  function formatTime() {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  /* ─────────────────────────────────────────────
     RENDER A BOT MESSAGE
  ───────────────────────────────────────────── */
  function appendBotMessage(text, chips) {
    const messages = getMessages();
    if (!messages) return;

    const chipsHtml = chips && chips.length
      ? `<div class="mt-3 flex flex-wrap gap-2">
          ${chips.map(c => `<button onclick="window.HealthBot.sendQuick('${c.replace(/'/g, "\\'")}')
            " class="chatbot-chip text-xs bg-surface-container-lowest dark:bg-neutral-800 border border-primary/20 dark:border-primary-fixed/20 text-primary dark:text-primary-fixed px-3 py-1.5 rounded-full font-medium hover:bg-primary-container dark:hover:bg-primary-fixed/10 transition-colors">${c}</button>`).join('')}
        </div>`
      : '';

    const el = document.createElement('div');
    el.className = 'flex gap-3 max-w-[85%] self-start chatbot-message-in';
    el.innerHTML = `
      <div class="mt-1 flex-shrink-0">
        <img src="${BOT_AVATAR}" alt="Noa" class="w-6 h-6 rounded-full object-cover opacity-80">
      </div>
      <div class="bg-surface-container-low dark:bg-neutral-800 p-4 rounded-xl rounded-tl-none shadow-sm">
        <p class="text-sm text-on-surface dark:text-neutral-200 leading-relaxed">${escapeHtml(text)}</p>
        ${chipsHtml}
        <p class="text-[10px] text-on-surface-variant dark:text-neutral-500 mt-2 font-medium">${formatTime()}</p>
      </div>`;
    messages.appendChild(el);
    scrollToBottom();
  }

  /* ─────────────────────────────────────────────
     RENDER A USER MESSAGE
  ───────────────────────────────────────────── */
  function appendUserMessage(text) {
    const messages = getMessages();
    if (!messages) return;

    const el = document.createElement('div');
    el.className = 'flex gap-3 max-w-[85%] self-end chatbot-message-in';
    el.innerHTML = `
      <div class="bg-primary dark:bg-primary-fixed text-on-primary dark:text-on-primary-fixed p-4 rounded-xl rounded-tr-none shadow-md">
        <p class="text-sm leading-relaxed">${escapeHtml(text)}</p>
        <p class="text-[10px] text-on-primary/70 dark:text-on-primary-fixed/60 mt-2 font-medium text-right uppercase">Sent</p>
      </div>`;
    messages.appendChild(el);
    scrollToBottom();
  }

  /* ─────────────────────────────────────────────
     TYPING INDICATOR
  ───────────────────────────────────────────── */
  function showTyping() {
    const messages = getMessages();
    if (!messages || document.getElementById('chatbot-typing')) return;
    const el = document.createElement('div');
    el.id = 'chatbot-typing';
    el.className = 'flex gap-3 max-w-[85%] self-start';
    el.innerHTML = `
      <div class="mt-1 flex-shrink-0">
        <img src="${BOT_AVATAR}" alt="Noa" class="w-6 h-6 rounded-full object-cover opacity-80">
      </div>
      <div class="bg-surface-container-low dark:bg-neutral-800 px-5 py-4 rounded-xl rounded-tl-none shadow-sm flex items-center gap-1.5">
        <span class="chatbot-dot w-2 h-2 bg-primary dark:bg-primary-fixed rounded-full"></span>
        <span class="chatbot-dot w-2 h-2 bg-primary dark:bg-primary-fixed rounded-full" style="animation-delay:.2s"></span>
        <span class="chatbot-dot w-2 h-2 bg-primary dark:bg-primary-fixed rounded-full" style="animation-delay:.4s"></span>
      </div>`;
    messages.appendChild(el);
    scrollToBottom();
  }

  function hideTyping() {
    const el = document.getElementById('chatbot-typing');
    if (el) el.remove();
  }

  /* ─────────────────────────────────────────────
     SEND MESSAGE FLOW
  ───────────────────────────────────────────── */
  async function sendMessage(text) {
    text = (text || '').trim();
    if (!text || isTyping) return;

    // Throttle
    const now = Date.now();
    if (now - lastSentAt < THROTTLE_MS) { return; }
    lastSentAt = now;

    isTyping = true;
    setSendState(false);

    // Render user message
    appendUserMessage(text);
    clearInput();

    // Add to history
    conversationHistory.push({ role: 'user', content: text });
    if (conversationHistory.length > MAX_HISTORY) {
      conversationHistory = conversationHistory.slice(-MAX_HISTORY);
    }

    // Show typing
    showTyping();

    try {
      const reply = await callGroq(text);
      hideTyping();

      // Add model reply to history
      conversationHistory.push({ role: 'assistant', content: reply });

      appendBotMessage(reply);
    } catch (err) {
      hideTyping();
      console.error('[Chatbot] Groq error:', err);
      appendBotMessage('Sorry, I ran into a connection issue. Please try again in a moment.');
    } finally {
      isTyping = false;
      setSendState(true);
    }
  }

  /* ─────────────────────────────────────────────
     INPUT HELPERS
  ───────────────────────────────────────────── */
  function clearInput() {
    const inp = getInput();
    if (inp) inp.value = '';
  }

  function setSendState(enabled) {
    const btn = document.getElementById('chatbot-send-btn');
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '1' : '0.5';
  }

  /* ─────────────────────────────────────────────
     SPEECH BUBBLE HELPERS
  ───────────────────────────────────────────── */
  function dismissBubble() {
    const b = document.getElementById('noa-bubble');
    if (!b || b.dataset.dismissed) return;
    b.dataset.dismissed = '1';
    b.classList.add('hiding');
    setTimeout(() => b.remove(), 350);
  }

  /* ─────────────────────────────────────────────
     OPEN / CLOSE PANEL
  ───────────────────────────────────────────── */
  function openChat() {
    const panel = document.getElementById('chatbot-panel');
    const fab   = document.getElementById('chatbot-fab');
    if (!panel) return;
    dismissBubble();
    isOpen = true;
    panel.classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none');
    panel.classList.add('translate-y-0', 'opacity-100');
    if (fab) fab.classList.add('scale-0');
    setTimeout(() => { const inp = getInput(); if (inp) inp.focus(); }, 300);
  }

  function closeChat() {
    const panel = document.getElementById('chatbot-panel');
    const fab   = document.getElementById('chatbot-fab');
    if (!panel) return;
    isOpen = false;
    panel.classList.remove('translate-y-0', 'opacity-100');
    panel.classList.add('translate-y-full', 'opacity-0', 'pointer-events-none');
    if (fab) fab.classList.remove('scale-0');
  }

  /* ─────────────────────────────────────────────
     INJECT WIDGET HTML
  ───────────────────────────────────────────── */
  function injectWidget() {
    const wrapper = document.createElement('div');
    wrapper.id = 'chatbot-root';
    wrapper.innerHTML = `
      <!-- Styles -->
      <style>
        @keyframes chatbot-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%           { transform: translateY(-6px); }
        }
        .chatbot-dot { animation: chatbot-bounce 1.2s infinite ease-in-out; }
        @keyframes chatbot-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .chatbot-message-in { animation: chatbot-in .25s ease-out; }
        #chatbot-panel { transition: transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease; }
        #chatbot-fab   { transition: transform 0.25s cubic-bezier(0.4,0,0.2,1), filter 0.2s; }
        #chatbot-fab:hover { transform: scale(1.12) !important; filter: drop-shadow(0 6px 20px rgba(0,0,0,0.35)); }
        #chatbot-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(0,110,47,0.2); }
        /* Speech bubble */
        @keyframes bubble-in {
          0%   { opacity: 0; transform: translateY(6px) scale(0.92); }
          60%  { transform: translateY(-2px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bubble-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to   { opacity: 0; transform: translateY(4px) scale(0.92); }
        }
        #noa-bubble { animation: bubble-in 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.8s both; }
        #noa-bubble.hiding { animation: bubble-out 0.3s ease forwards; }
      </style>

      <!-- Speech bubble tooltip -->
      <div id="noa-bubble"
        class="fixed z-[92] flex flex-col items-end bottom-[10.5rem] md:bottom-[6.5rem] right-6"
        aria-hidden="true">
        <div class="bg-white dark:bg-neutral-800 text-slate-800 dark:text-neutral-100
                    text-xs font-semibold px-3.5 py-2 rounded-2xl rounded-br-sm
                    shadow-lg border border-slate-100 dark:border-neutral-700
                    whitespace-nowrap max-w-[180px] leading-snug">
          Hi! I'm Noa&nbsp;👋<br>
          <span class="font-normal text-slate-500 dark:text-neutral-400">Your health assistant</span>
        </div>
        <!-- Tail -->
        <svg width="14" height="8" viewBox="0 0 14 8" class="mr-4 -mt-px text-white dark:text-neutral-800 drop-shadow-sm">
          <path d="M0 0 L7 8 L14 0 Z" fill="currentColor"/>
        </svg>
      </div>

      <!-- FAB trigger button -->
      <button id="chatbot-fab"
        class="fixed bottom-24 md:bottom-8 right-6 z-[90] bg-transparent border-none p-0 cursor-pointer active:scale-95"
        style="filter: drop-shadow(0 4px 16px rgba(0,0,0,0.25));"
        aria-label="Open Noa">
        <img src="AI chatbot.png" alt="Noa" class="w-16 h-16 object-contain rounded-full">
      </button>

      <!-- Chat Panel -->
      <div id="chatbot-panel"
        class="fixed bottom-24 md:bottom-8 right-6 z-[91] w-full max-w-sm md:max-w-md h-[620px] flex flex-col rounded-xl overflow-hidden shadow-2xl border border-outline-variant/20 dark:border-neutral-800 translate-y-full opacity-0 pointer-events-none">

        <!-- Header -->
        <header class="bg-slate-50/95 dark:bg-neutral-900/95 backdrop-blur-md flex justify-between items-center px-4 py-3 shadow-sm flex-shrink-0 border-b border-slate-200 dark:border-neutral-800">
          <div class="flex items-center gap-3">
            <div class="relative flex-shrink-0">
              <img src="AI chatbot.png" alt="Noa" class="w-10 h-10 rounded-full object-cover border-2 border-primary/20 dark:border-primary-fixed/20">
              <div class="absolute bottom-0 right-0 w-3 h-3 bg-primary dark:bg-primary-fixed border-2 border-slate-50 dark:border-neutral-900 rounded-full"></div>
            </div>
            <div class="flex flex-col">
              <span class="font-headline text-base font-bold text-slate-900 dark:text-neutral-50 leading-tight">Noa</span>
              <span class="text-[10px] uppercase tracking-widest text-primary dark:text-primary-fixed font-bold">Clinical Assistant · Online</span>
            </div>
          </div>
          <button id="chatbot-close-btn"
            class="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-all"
            aria-label="Close Noa">
            <span class="material-symbols-outlined text-xl">close</span>
          </button>
        </header>

        <!-- Messages -->
        <div id="chatbot-messages"
          class="flex-1 overflow-y-auto p-5 space-y-5 flex flex-col bg-surface-bright dark:bg-neutral-950 scroll-smooth">
        </div>

        <!-- Input area -->
        <div class="p-4 bg-surface-container-lowest dark:bg-neutral-900 border-t border-outline-variant/10 dark:border-neutral-800 flex-shrink-0">
          <div class="relative flex items-center">
            <input id="chatbot-input"
              type="text"
              placeholder="Ask Noa anything…"
              autocomplete="off"
              class="w-full bg-surface-container-low dark:bg-neutral-800 border border-outline-variant/20 dark:border-neutral-700 rounded-lg pl-4 pr-14 py-3 text-sm text-on-surface dark:text-neutral-100 placeholder:text-on-surface-variant/50 dark:placeholder:text-neutral-600 transition-all">
            <button id="chatbot-send-btn"
              class="absolute right-2 w-9 h-9 flex items-center justify-center bg-primary dark:bg-primary-fixed text-on-primary dark:text-on-primary-fixed rounded-lg shadow-sm hover:brightness-110 active:scale-95 transition-all"
              aria-label="Send message">
              <span class="material-symbols-outlined text-lg" style="font-variation-settings:'FILL' 1;">send</span>
            </button>
          </div>
          <div class="mt-2.5 flex justify-between items-center px-0.5">
            <div id="chatbot-chips-row" class="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <!-- Quick reply chips rendered here on first load -->
            </div>
            <p class="text-[9px] font-bold text-on-surface-variant/40 dark:text-neutral-700 tracking-widest uppercase flex-shrink-0 ml-2">Secured</p>
          </div>
        </div>
      </div>`;

    document.body.appendChild(wrapper);
  }

  /* ─────────────────────────────────────────────
     RENDER QUICK REPLY CHIPS IN FOOTER
  ───────────────────────────────────────────── */
  function renderFooterChips() {
    const row = document.getElementById('chatbot-chips-row');
    if (!row) return;
    row.innerHTML = QUICK_REPLIES.map(q =>
      `<button onclick="window.HealthBot.sendQuick('${q.replace(/'/g, "\\'")}')
        " class="chatbot-chip flex-shrink-0 text-[10px] bg-surface-container-low dark:bg-neutral-800 border border-outline-variant/20 dark:border-neutral-700 text-on-surface-variant dark:text-neutral-400 px-2.5 py-1 rounded-full font-medium hover:border-primary/40 hover:text-primary dark:hover:text-primary-fixed transition-colors whitespace-nowrap">${q}</button>`
    ).join('');
  }

  /* ─────────────────────────────────────────────
     WIRE EVENTS
  ───────────────────────────────────────────── */
  function wireEvents() {
    // FAB → open
    const fab = document.getElementById('chatbot-fab');
    if (fab) fab.addEventListener('click', openChat);

    // Close button
    const closeBtn = document.getElementById('chatbot-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeChat);

    // Send button
    const sendBtn = document.getElementById('chatbot-send-btn');
    if (sendBtn) sendBtn.addEventListener('click', () => {
      const inp = getInput();
      if (inp) sendMessage(inp.value);
    });

    // Enter key
    const inp = getInput();
    if (inp) {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage(inp.value);
        }
      });
    }

    // ESC key → close
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isOpen) closeChat();
    });
  }

  /* ─────────────────────────────────────────────
     BOOT GREETING
  ───────────────────────────────────────────── */
  function showGreeting(user) {
    const name = user
      ? (user.displayName || user.email.split('@')[0].replace(/[._-]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())).split(' ')[0]
      : 'there';

    const hour = new Date().getHours();
    const tod  = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    appendBotMessage(
      `Good ${tod}, ${name}! I'm Noa — your clinical nutrition and sleep assistant.\n\nI have access to your recent meals and sleep data. Ask me anything about your health patterns, or tap a quick reply below to get started.`,
      QUICK_REPLIES.slice(0, 3)
    );
  }

  /* ─────────────────────────────────────────────
     INIT — called after auth resolves
  ───────────────────────────────────────────── */
  function init(user) {
    currentUser = user;
    injectWidget();
    wireEvents();
    renderFooterChips();
    showGreeting(user);
    // Auto-dismiss the speech bubble after 5 seconds
    setTimeout(dismissBubble, 5000);
    console.log('[Chatbot] Noa initialized ✓');
  }

  /* ─────────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────────── */
  window.HealthBot = {
    init,
    open:      openChat,
    close:     closeChat,
    sendQuick: (text) => sendMessage(text),
  };

})();

