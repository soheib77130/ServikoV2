const SUPABASE_URL = "https://skfqoyyoahuaffshimnc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_yxLCOU94zhGck9yvGYch5Q_ePCPd9Yq";
const sb = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage }
});

let currentUserId = null;
let currentRequest = null;
let selectedRating = 0;
let realtimeChannel = null;

// DOM refs
const welcomeTitle = document.getElementById("welcomeTitle");
const kpiRequests = document.getElementById("kpiRequests");
const kpiBudget = document.getElementById("kpiBudget");
const kpiRating = document.getElementById("kpiRating");
const requestList = document.getElementById("requestList");
const completedList = document.getElementById("completedList");
const chatList = document.getElementById("chatList");
const chatTitle = document.getElementById("chatTitle");
const chatStatus = document.getElementById("chatStatus");
const chatHint = document.getElementById("chatHint");
const chatMessages = document.getElementById("chatMessages");
const chatActions = document.getElementById("chatActions");
const chatInputArea = document.getElementById("chatInputArea");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const relaunchBtn = document.getElementById("relaunchBtn");
const supportBtn = document.getElementById("supportBtn");
const paymentModal = document.getElementById("paymentModal");
const paymentPrice = document.getElementById("paymentPrice");
const confirmPayment = document.getElementById("confirmPayment");
const cancelPayment = document.getElementById("cancelPayment");
const ratingModal = document.getElementById("ratingModal");
const ratingStars = document.getElementById("ratingStars");
const ratingComment = document.getElementById("ratingComment");
const submitRating = document.getElementById("submitRating");
const skipRating = document.getElementById("skipRating");

// ---- AUTH ----
async function init() {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) { window.location.href = "login.html"; return; }
  if (user.user_metadata?.role && user.user_metadata.role !== "client") {
    await sb.auth.signOut(); window.location.href = "login.html"; return;
  }
  currentUserId = user.id;
  const { data: profile } = await sb.from("clients").select("firstname,lastname").eq("user_id", user.id).maybeSingle();
  const name = [profile?.firstname, profile?.lastname].filter(Boolean).join(" ");
  if (welcomeTitle) welcomeTitle.textContent = name ? `Bonjour ${name}` : "Tableau de bord client";
  await refreshAll();
  await attemptAutoMatch();
  setupRealtime();
}
init();

// ---- LOGOUT ----
document.querySelectorAll("[data-logout]").forEach(b => b.addEventListener("click", async e => {
  e.preventDefault();
  try { await sb?.auth.signOut(); } catch (_) {}
  Object.keys(localStorage).forEach(k => { if (k.includes("sb-") && k.includes("-auth-token")) localStorage.removeItem(k); });
  window.location.href = "index.html";
}));

// ---- REFRESH ----
async function refreshAll() {
  // Run independently so one failure doesn't block others
  await loadRequests().catch(() => {});
  await loadKPIs().catch(() => {});
  await loadRating().catch(() => {});
}

async function loadKPIs() {
  try {
    const { data, error } = await sb.from("requests").select("id,status,negotiated_price,budget").eq("client_user_id", currentUserId);
    if (error || !data) return;
    const active = data.filter(r => !["confirme", "termine", "annule", "livre"].includes(r.status));
    if (kpiRequests) kpiRequests.textContent = active.length;
    const totalBudget = data.reduce((s, r) => s + Number(r.negotiated_price || r.budget || 0), 0);
    if (kpiBudget) kpiBudget.textContent = totalBudget + " €";
  } catch (_) {}
}

async function loadRating() {
  try {
    const { data, error } = await sb.from("ratings").select("score").eq("rated_user_id", currentUserId);
    if (error || !data || data.length === 0) { if (kpiRating) kpiRating.textContent = "—"; return; }
    const avg = data.reduce((s, r) => s + Number(r.score), 0) / data.length;
    if (kpiRating) kpiRating.textContent = avg.toFixed(1) + " / 10";
  } catch (_) { if (kpiRating) kpiRating.textContent = "—"; }
}

function formatStatus(s) {
  const m = { nouveau: "Nouveau", en_attente: "En attente", match_en_cours: "Match en cours", negociation: "Négociation", confirme: "Confirmé", paye: "Payé", en_cours: "En cours", termine: "Terminé", livre: "Livré" };
  return m[s] || s || "Nouveau";
}

function statusPillClass(s) {
  if (["confirme", "paye", "en_cours"].includes(s)) return "green";
  if (["negociation", "match_en_cours"].includes(s)) return "yellow";
  if (["termine", "livre"].includes(s)) return "green";
  return "";
}

async function loadRequests() {
  try {
  const { data, error } = await sb.from("requests")
    .select("id,title,status,created_at,negotiated_price,budget,assigned_indep_user_id,category,skills,match_summary,deadline")
    .eq("client_user_id", currentUserId).order("created_at", { ascending: false }).limit(20);
  if (error || !data) {
    if (requestList) requestList.innerHTML = '<li class="hint">Aucune demande trouvée.</li>';
    if (chatList) chatList.innerHTML = '<li class="hint">Aucune conversation.</li>';
    if (completedList) completedList.innerHTML = '<li class="hint">Aucune mission terminée.</li>';
    return;
  }

  const active = data.filter(r => !["termine", "livre"].includes(r.status));
  const done = data.filter(r => ["termine", "livre"].includes(r.status));

  if (active.length === 0) {
    requestList.innerHTML = '<li class="hint">Aucune demande en cours.</li>';
  } else {
    requestList.innerHTML = active.map(r => `<li class="req-item" data-id="${r.id}"><div><div class="title">${r.title}</div><div class="meta">${r.category || ""} · ${r.budget ? r.budget + " €" : ""}</div></div><span class="pill ${statusPillClass(r.status)}">${formatStatus(r.status)}</span></li>`).join("");
  }

  if (done.length === 0) {
    completedList.innerHTML = '<li class="hint">Aucune mission terminée.</li>';
  } else {
    completedList.innerHTML = done.map(r => `<li class="req-item" data-id="${r.id}"><div><div class="title">${r.title}</div></div><span class="pill green">Terminé</span></li>`).join("");
  }

  // Chat sidebar
  const withIndep = data.filter(r => r.assigned_indep_user_id);
  if (withIndep.length === 0) {
    chatList.innerHTML = '<li class="hint">Aucune conversation.</li>';
  } else {
    chatList.innerHTML = withIndep.map(r => `<li class="req-item" data-chat="${r.id}"><div class="title">${r.title}</div><span class="pill ${statusPillClass(r.status)}" style="font-size:10px">${formatStatus(r.status)}</span></li>`).join("");
  }

  // Bind clicks
  document.querySelectorAll("[data-id]").forEach(el => el.addEventListener("click", () => openConversation(Number(el.dataset.id))));
  document.querySelectorAll("[data-chat]").forEach(el => el.addEventListener("click", () => openConversation(Number(el.dataset.chat))));
  } catch (err) {
    console.error("loadRequests error:", err);
    if (requestList) requestList.innerHTML = '<li class="hint">Erreur de connexion. Rechargez la page.</li>';
    if (chatList) chatList.innerHTML = '<li class="hint">Aucune conversation.</li>';
  }
}

// ---- CONVERSATION ----
async function openConversation(requestId) {
  const { data: req } = await sb.from("requests")
    .select("id,title,status,spec_checklist,negotiated_price,match_summary,assigned_indep_user_id,budget,deadline")
    .eq("id", requestId).eq("client_user_id", currentUserId).maybeSingle();
  if (!req) return;
  currentRequest = req;

  // Highlight active
  document.querySelectorAll("[data-chat]").forEach(el => el.classList.toggle("active", Number(el.dataset.chat) === requestId));

  chatTitle.textContent = req.title || "Discussion";
  chatStatus.textContent = formatStatus(req.status);
  chatInputArea.style.display = "flex";

  // Actions
  let actionsHtml = "";
  if (req.status === "negociation") {
    actionsHtml += `<button class="btn sm primary" id="payBtn">Accepter & Payer</button>`;
  }
  if (["termine", "livre"].includes(req.status)) {
    actionsHtml += `<button class="btn sm" id="rateBtn">Noter</button>`;
  }
  chatActions.innerHTML = actionsHtml;
  document.getElementById("payBtn")?.addEventListener("click", openPaymentModal);
  document.getElementById("rateBtn")?.addEventListener("click", () => openRatingModal());

  if (req.status === "negociation") {
    chatHint.textContent = "Chat direct — Négociez le prix avec l'indépendant.";
  } else if (["confirme", "paye", "en_cours"].includes(req.status)) {
    chatHint.textContent = "Fil de messages — La mission est en cours.";
  } else if (["termine", "livre"].includes(req.status)) {
    chatHint.textContent = "Mission terminée — Pensez à noter l'indépendant !";
  } else {
    chatHint.textContent = req.match_summary || "En attente d'un indépendant.";
  }

  await loadMessages();
  subscribeMessages(requestId);
}

async function loadMessages() {
  if (!currentRequest) return;
  const channel = ["confirme", "paye", "en_cours", "termine", "livre"].includes(currentRequest.status) ? "fil" : "instant";
  const { data: msgs } = await sb.from("request_messages")
    .select("sender_role,body,created_at").eq("request_id", currentRequest.id).eq("channel", channel)
    .order("created_at", { ascending: true });
  if (!msgs || msgs.length === 0) {
    chatMessages.innerHTML = '<div class="hint" style="text-align:center;margin:auto">Aucun message pour le moment.</div>';
    return;
  }
  chatMessages.innerHTML = msgs.map(m => {
    const time = new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `<div class="msg ${m.sender_role}"><div>${m.body}</div><div class="time">${time}</div></div>`;
  }).join("");
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ---- SEND MESSAGE ----
sendBtn?.addEventListener("click", sendMessage);
msgInput?.addEventListener("keydown", e => { if (e.key === "Enter") sendMessage(); });

async function sendMessage() {
  if (!currentRequest || !msgInput.value.trim()) return;
  const channel = ["confirme", "paye", "en_cours", "termine", "livre"].includes(currentRequest.status) ? "fil" : "instant";
  await sb.from("request_messages").insert({
    request_id: currentRequest.id,
    sender_user_id: currentUserId,
    sender_role: "client",
    channel,
    body: msgInput.value.trim()
  });
  msgInput.value = "";
  await loadMessages();
}

// ---- REALTIME ----
function setupRealtime() {
  sb.channel("client-requests-" + currentUserId)
    .on("postgres_changes", { event: "*", schema: "public", table: "requests", filter: `client_user_id=eq.${currentUserId}` },
      () => { refreshAll(); if (currentRequest) openConversation(currentRequest.id); })
    .subscribe();
}

function subscribeMessages(requestId) {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel("chat-" + requestId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "request_messages", filter: `request_id=eq.${requestId}` },
      () => loadMessages())
    .subscribe();
}

// ---- PAYMENT ----
function openPaymentModal() {
  if (!currentRequest) return;
  const price = currentRequest.negotiated_price || currentRequest.budget || 0;
  paymentPrice.textContent = price + " €";
  paymentModal.classList.add("show");
}

cancelPayment?.addEventListener("click", () => paymentModal.classList.remove("show"));

confirmPayment?.addEventListener("click", async () => {
  if (!currentRequest) return;
  const price = currentRequest.negotiated_price || currentRequest.budget || 0;
  // Create payment (silently fails if payments table not yet created)
  await sb.from("payments").insert({
    request_id: currentRequest.id,
    client_user_id: currentUserId,
    indep_user_id: currentRequest.assigned_indep_user_id,
    amount: price,
    status: "paid",
    paid_at: new Date().toISOString()
  }).catch(() => {});
  // Update request status (paid column may not exist yet, try with fallback)
  const { error: upErr } = await sb.from("requests").update({ status: "paye", paid: true }).eq("id", currentRequest.id);
  if (upErr) await sb.from("requests").update({ status: "paye" }).eq("id", currentRequest.id);
  // System message
  await sb.from("request_messages").insert({
    request_id: currentRequest.id,
    sender_user_id: currentUserId,
    sender_role: "system",
    channel: "fil",
    body: `Paiement de ${price} € confirmé. La mission peut commencer !`
  });
  paymentModal.classList.remove("show");
  await refreshAll();
  await openConversation(currentRequest.id);
});

// ---- RATING ----
function initRatingStars() {
  ratingStars.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const star = document.createElement("div");
    star.className = "star";
    star.textContent = i;
    star.addEventListener("click", () => {
      selectedRating = i;
      ratingStars.querySelectorAll(".star").forEach((s, idx) => s.classList.toggle("active", idx < i));
    });
    ratingStars.appendChild(star);
  }
}
initRatingStars();

function openRatingModal() {
  selectedRating = 0;
  ratingComment.value = "";
  ratingStars.querySelectorAll(".star").forEach(s => s.classList.remove("active"));
  ratingModal.classList.add("show");
}

skipRating?.addEventListener("click", () => ratingModal.classList.remove("show"));

submitRating?.addEventListener("click", async () => {
  if (!currentRequest || selectedRating === 0) { alert("Choisissez une note."); return; }
  await sb.from("ratings").insert({
    request_id: currentRequest.id,
    rater_user_id: currentUserId,
    rated_user_id: currentRequest.assigned_indep_user_id,
    rater_role: "client",
    score: selectedRating,
    comment: ratingComment.value.trim() || null
  });
  ratingModal.classList.remove("show");
  alert("Merci pour votre évaluation !");
  await loadRating();
});

// ---- MATCHING ----
function normalizeSkills(s) {
  if (!s) return [];
  return s.toLowerCase().split(",").map(x => x.trim()).filter(Boolean);
}

function computeScore(request, indep) {
  const rSkills = normalizeSkills(request.skills).concat(normalizeSkills(request.category));
  const iSkills = normalizeSkills(indep.skills);
  const shared = rSkills.filter(s => iSkills.includes(s));
  const skillScore = shared.length * 15;
  const expScore = indep.experience?.toLowerCase().includes("senior") ? 12 : 6;
  const budget = Number(request.budget || 0);
  const rate = Number(indep.daily_rate || 0);
  const budgetFit = rate ? Math.max(0, 20 - Math.abs(budget - rate * 5) / 50) : 5;
  return Math.round(skillScore + expScore + budgetFit);
}

async function attemptAutoMatch() {
  try {
    const { data: pending } = await sb.from("requests")
      .select("id,title,status,budget,skills,category,assigned_indep_user_id")
      .eq("client_user_id", currentUserId).in("status", ["en_attente", "match_en_cours"]);
    if (!pending) return;
    const unmatched = pending.filter(r => !r.assigned_indep_user_id);
    for (const req of unmatched) await runMatching(req).catch(() => {});
    if (unmatched.length > 0) await refreshAll();
  } catch (_) {}
}

async function runMatching(request) {
  const { data: indeps } = await sb.from("independants")
    .select("user_id,firstname,lastname,skills,daily_rate,status,experience")
    .in("status", ["en_ligne", "disponible", "online"]);
  if (!indeps || indeps.length === 0) {
    await sb.from("requests").update({ status: "en_attente", match_summary: "Aucun indépendant disponible. Votre demande reste en attente." }).eq("id", request.id);
    return;
  }
  const ranked = indeps.map(i => ({ indep: i, score: computeScore(request, i) })).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const price = Number(request.budget || 0) || null;
  await sb.from("requests").update({
    assigned_indep_user_id: top.indep.user_id,
    status: "negociation",
    match_score: top.score,
    match_summary: `Match: ${top.indep.firstname || ""} ${top.indep.lastname || ""} (${top.score} pts)`,
    negotiated_price: price
  }).eq("id", request.id);
  // Notify indep (silently fails if notifications table not yet created)
  await sb.from("notifications").insert({
    recipient_user_id: top.indep.user_id,
    request_id: request.id,
    type: "new_request",
    title: "Nouvelle mission",
    body: `${request.title} — ${request.budget ? request.budget + " €" : "Budget à définir"}`,
    expires_at: new Date(Date.now() + 60000).toISOString()
  }).catch(() => {});
  if (price) {
    await sb.from("request_messages").insert({
      request_id: request.id, sender_user_id: currentUserId, sender_role: "system", channel: "instant",
      body: `Proposition initiale : ${price} € (ajustable avant validation).`
    });
  }
  // Save matches
  const matchesPayload = ranked.slice(0, 3).map((e, i) => ({
    request_id: request.id, indep_user_id: e.indep.user_id, score: e.score, rank: i + 1
  }));
  await sb.from("request_matches").insert(matchesPayload);
}

relaunchBtn?.addEventListener("click", async () => {
  if (!currentUserId) return;
  relaunchBtn.textContent = "Recherche en cours...";
  relaunchBtn.disabled = true;
  try {
    const { data } = await sb.from("requests")
      .select("id,title,status,budget,skills,category").eq("client_user_id", currentUserId)
      .in("status", ["nouveau", "en_attente", "match_en_cours"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) { alert("Aucune demande en attente à relancer."); return; }
    await runMatching(data);
    alert("Matching relancé !");
    await refreshAll();
  } catch (_) {
    alert("Erreur lors du matching.");
  } finally {
    relaunchBtn.textContent = "Relancer le matching";
    relaunchBtn.disabled = false;
  }
});

supportBtn?.addEventListener("click", () => alert("Support contacté (démo). Réponse sous 24h."));
