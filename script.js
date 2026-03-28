/* =============================================
   MINDEASE – ACADEMIC WELLNESS CHATBOT
   script.js – All logic, API calls, guardrails
   ============================================= */

// -----------------------------------------------
// 🔑 CONFIG — REPLACE WITH YOUR GROQ API KEY
// -----------------------------------------------
const GROQ_API_KEY = "GROQ_API";
const GROQ_MODEL   = "llama3-8b-8192"; // or mixtral-8x7b-32768

// -----------------------------------------------
// 🧠 STATE
// -----------------------------------------------
let currentMood     = null;          // 'motivated' | 'okay' | 'stressed' | 'burnout'
let conversationHistory = [];        // stores last 5 turns
let sessionTopics   = [];            // for session insight
let crisisMode      = false;

// -----------------------------------------------
// ⚠️ CRISIS KEYWORDS
// -----------------------------------------------
const CRISIS_KEYWORDS = [
  "kill myself", "end my life", "want to die", "suicide", "self-harm",
  "self harm", "hurt myself", "no point living", "end it all",
  "don't want to exist", "rather be dead", "cut myself", "overdose"
];

// -----------------------------------------------
// 💬 FALLBACK REPLIES (if API fails)
// -----------------------------------------------
const FALLBACKS = [
  "I'm here with you. Want to tell me what's stressing you?",
  "Let's take this one step at a time. What's the biggest pressure right now?",
  "Even small progress counts. What's one tiny task you can start with?",
  "It sounds like a tough moment. You don't have to solve everything today.",
  "I hear you. Would it help to break things into smaller steps together?"
];

// -----------------------------------------------
// 🌿 STATIC QUICK-ACTION RESPONSES (no API call)
// -----------------------------------------------
const QUICK_ACTIONS = {
  focus: `⏱️ <strong>5-Minute Focus Sprint</strong><br>
1. Choose ONE task — the smallest next step.<br>
2. Put your phone face-down. Close extra tabs.<br>
3. Set a 5-minute timer and start. <em>Just start.</em><br>
4. When it rings, celebrate — that's a win!<br>
<br>Ready to begin?`,

  breathe: `🌬️ <strong>4-4-4 Box Breathing</strong><br>
Let's slow your nervous system down.<br>
<br>
• <strong>Inhale</strong> for 4 counts... 1, 2, 3, 4<br>
• <strong>Hold</strong> for 4 counts... 1, 2, 3, 4<br>
• <strong>Exhale</strong> for 4 counts... 1, 2, 3, 4<br>
<br>
Repeat 3–4 times. How do you feel after?`,

  ground: `🌱 <strong>5-4-3-2-1 Grounding</strong><br>
Notice around you right now:<br>
<br>
• 👁️ <strong>5 things</strong> you can see<br>
• ✋ <strong>4 things</strong> you can touch<br>
• 👂 <strong>3 things</strong> you can hear<br>
• 👃 <strong>2 things</strong> you can smell<br>
• 👅 <strong>1 thing</strong> you can taste<br>
<br>
This brings you back to the present. Take your time.`,

  motivate: `⚡ <strong>Motivation Boost</strong><br>
Here's the truth: motivation follows action, not the other way around.<br>
<br>
You don't need to feel ready — you just need to <em>start</em>. Even 2 minutes.<br>
<br>
Progress today, no matter how small, is real progress.<br>
What's one micro-step you could take in the next 60 seconds?`
};

// -----------------------------------------------
// 🤖 SYSTEM PROMPT (sent to Groq)
// -----------------------------------------------
function buildSystemPrompt() {
  const moodContext = currentMood
    ? `The user's current mood is: ${currentMood}. Adjust tone accordingly — for burnout, be gentle and reduce pressure; for motivated, be energising.`
    : "";

  return `You are MindEase, a supportive academic mental wellness assistant for students.
You help users manage study stress, exam anxiety, burnout, procrastination, and motivation.
You do NOT diagnose or give medical advice. You are NOT a therapist.
Respond with empathy, short messages (120 to 150) words), and practical small steps.
If unsure, say "I might be wrong, but it sounds like..." or "I'm not completely sure, but maybe..."
Include 1 reflective question when appropriate.
Avoid generic advice like "just relax". Be specific and human.
${moodContext}
If user shows signs of self-harm or crisis, do NOT respond normally — the app handles it separately.`;
}

// -----------------------------------------------
// 🚨 CRISIS DETECTION
// -----------------------------------------------
function detectCrisis(message) {
  const lower = message.toLowerCase();
  return CRISIS_KEYWORDS.some(kw => lower.includes(kw));
}

function activateCrisis() {
  crisisMode = true;
  document.getElementById("crisisOverlay").classList.remove("hidden");
  document.getElementById("userInput").disabled = true;
}

function dismissCrisis() {
  crisisMode = false;
  document.getElementById("crisisOverlay").classList.add("hidden");
  document.getElementById("userInput").disabled = false;
  addBotMessage("I'm glad you're still here. Whenever you're ready, I'm listening. 💙", false);
  document.getElementById("userInput").focus();
}

// -----------------------------------------------
// 💬 MESSAGE RENDERING
// -----------------------------------------------
function addBotMessage(html, isCrisis = false) {
  const feed = document.getElementById("messages");
  const wrap = document.createElement("div");
  wrap.className = "bubble-wrap bot";

  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  wrap.innerHTML = `
    <div class="bubble-avatar">🌿</div>
    <div class="bubble bot ${isCrisis ? 'crisis-bubble' : ''}">
      ${html}
      <span class="timestamp">${now}</span>
    </div>`;
  feed.appendChild(wrap);
  scrollToBottom();
}

function addUserMessage(text) {
  const feed = document.getElementById("messages");
  const wrap = document.createElement("div");
  wrap.className = "bubble-wrap user";

  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  wrap.innerHTML = `
    <div class="bubble user">
      ${escapeHtml(text)}
      <span class="timestamp">${now}</span>
    </div>
    <div class="bubble-avatar">🎓</div>`;
  feed.appendChild(wrap);
  scrollToBottom();
}

function scrollToBottom() {
  const feed = document.getElementById("messages");
  feed.scrollTop = feed.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// -----------------------------------------------
// 🔄 TYPING INDICATOR
// -----------------------------------------------
function showTyping()  { document.getElementById("typingIndicator").classList.remove("hidden"); }
function hideTyping()  { document.getElementById("typingIndicator").classList.add("hidden"); }

// -----------------------------------------------
// 📡 GROQ API CALL
// -----------------------------------------------
async function callGroqAPI(userMessage) {
  // Build last-5-messages context
  const contextMessages = conversationHistory.slice(-10); // last 5 turns = 10 messages

  const payload = {
    model: GROQ_MODEL,
    max_tokens: 500,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      ...contextMessages,
      { role: "user", content: userMessage }
    ]
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;

  } catch (err) {
    clearTimeout(timeout);
    console.warn("Groq API failed:", err.message);
    return null; // triggers fallback
  }
}

// -----------------------------------------------
// 🎯 MOOD SELECTION
// -----------------------------------------------
function setMood(mood) {
  currentMood = mood;
  document.querySelectorAll(".mood-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.mood === mood);
  });

  const responses = {
    motivated: "That's great to hear! 🌟 You've got energy — let's channel it well. What are you working on today?",
    okay: "Good to know. Sometimes 'okay' is perfectly enough. Is there anything on your mind you'd like to talk through?",
    stressed: "I hear you — stress is real, especially with academics. Would you like to unpack what's weighing on you most?",
    burnout: "Burnout is exhausting, and it's okay to feel that way. Let's go gently. What's one small thing we can lighten today?"
  };
  addBotMessage(responses[mood]);
  sessionTopics.push(mood);
}

// -----------------------------------------------
// ⚡ QUICK ACTIONS
// -----------------------------------------------
function quickAction(type) {
  const content = QUICK_ACTIONS[type];
  if (content) addBotMessage(content);
}

// -----------------------------------------------
// 📊 SESSION INSIGHT
// -----------------------------------------------
function showInsight() {
  const panel = document.getElementById("insightPanel");
  const text  = document.getElementById("insightText");

  if (conversationHistory.length < 2) {
    panel.style.display = "block";
    text.textContent = "Chat a little more and I'll share an insight about your session.";
    return;
  }

  // Simple heuristic insight
  const moods = { motivated: 0, okay: 0, stressed: 0, burnout: 0 };
  sessionTopics.forEach(t => { if (moods[t] !== undefined) moods[t]++; });

  let insight = "";
  if (moods.burnout > 0 || moods.stressed > 1) {
    insight = "You seemed stressed or burnt out today. Remember: smaller steps, regular breaks, and being kind to yourself go a long way. 🌿";
  } else if (moods.motivated > 0) {
    insight = "You came in with good energy! Keep building on small wins. Momentum is your friend. ⚡";
  } else {
    insight = "You showed up today — that matters. Even exploring your feelings is a step forward. 💙";
  }

  panel.style.display = "block";
  text.textContent = insight;

  // Scroll sidebar into view on mobile
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// -----------------------------------------------
// 📨 SEND MESSAGE
// -----------------------------------------------
async function sendMessage() {
  if (crisisMode) return;

  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  input.style.height = "auto";

  // Render user bubble
  addUserMessage(text);

  // ⚠️ Crisis check FIRST
  if (detectCrisis(text)) {
    activateCrisis();
    return;
  }

  // Track topics for insight
  if (text.toLowerCase().includes("exam") || text.toLowerCase().includes("test"))
    sessionTopics.push("exams");
  if (text.toLowerCase().includes("procrastinat"))
    sessionTopics.push("procrastination");

  // Update conversation history
  conversationHistory.push({ role: "user", content: text });

  // Show typing
  showTyping();

  // Artificial min delay (feels more human)
  const minDelay = new Promise(r => setTimeout(r, 800));

  let reply = null;

  // API call + min delay in parallel
  const [apiReply] = await Promise.all([
    callGroqAPI(text),
    minDelay
  ]);

  hideTyping();

  reply = apiReply || FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];

  // Store assistant reply in history
  conversationHistory.push({ role: "assistant", content: reply });

  // Trim history to last 10 entries (5 turns)
  if (conversationHistory.length > 10) conversationHistory = conversationHistory.slice(-10);

  addBotMessage(reply);
}

// -----------------------------------------------
// ⌨️ KEYBOARD HANDLER
// -----------------------------------------------
function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// -----------------------------------------------
// 📐 AUTO-RESIZE TEXTAREA
// -----------------------------------------------
function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

// -----------------------------------------------
// 🚀 INIT
// -----------------------------------------------
function init() {
  addBotMessage(`Hi there! I'm <strong>MindEase</strong> — your academic wellness companion. 🌿<br><br>
I'm here to help you navigate study stress, exam anxiety, and everything in between.<br><br>
<em>How are you feeling today?</em> Pick a mood on the left, or just tell me what's on your mind.`);
}

// Start on load
window.addEventListener("DOMContentLoaded", init);
