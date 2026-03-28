const SUPABASE_URL = "https://skfqoyyoahuaffshimnc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_yxLCOU94zhGck9yvGYch5Q_ePCPd9Yq";
const sb = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage }
});

let currentUserId = null;
let currentIndep = null;
let currentRequest = null;
let isOnline = false;
let notifTimer = null;
let notifInterval = null;
let realtimeChannel = null;
let selectedRating = 0;
let deadlineInterval = null;

// DOM
const welcomeTitle = document.getElementById("welcomeTitle");
const statusBadge = document.getElementById("statusBadge");
const kpiRevenue = document.getElementById("kpiRevenue");
const kpiRate = document.getElementById("kpiRate");
const kpiMissions = document.getElementById("kpiMissions");
const kpiRating = document.getElementById("kpiRating");
const categorySelect = document.getElementById("categorySelect");
const toggleOnline = document.getElementById("toggleOnline");
const searchBtn = document.getElementById("searchBtn");
const availFeedback = document.getElementById("availFeedback");
const profileCity = document.getElementById("profileCity");
const profileExp = document.getElementById("profileExp");
const profileSkills = document.getElementById("profileSkills");
const profileSiret = document.getElementById("profileSiret");
const missionList = document.getElementById("missionList");
const missionDetailCard = document.getElementById("missionDetailCard");
const missionDetail = document.getElementById("missionDetail");
const deadlineCountdown = document.getElementById("deadlineCountdown");
const fileZone = document.getElementById("fileZone");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const deliverBtn = document.getElementById("deliverBtn");
const chatList = document.getElementById("chatList");
const chatTitle = document.getElementById("chatTitle");
const chatStatusText = document.getElementById("chatStatusText");
const chatHint = document.getElementById("chatHint");
const chatMessages = document.getElementById("chatMessages");
const chatHeaderActions = document.getElementById("chatHeaderActions");
const chatInputArea = document.getElementById("chatInputArea");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const negoBar = document.getElementById("negoBar");
const priceInput = document.getElementById("priceInput");
const proposePriceBtn = document.getElementById("proposePriceBtn");
const acceptPriceBtn = document.getElementById("acceptPriceBtn");
const notifPopup = document.getElementById("notifPopup");
const notifDetails = document.getElementById("notifDetails");
const notifTimerBar = document.getElementById("notifTimer");
const notifCountdownEl = document.getElementById("notifCountdown");
const notifAccept = document.getElementById("notifAccept");
const notifDecline = document.getElementById("notifDecline");
const ratingModal = document.getElementById("ratingModal");
const ratingStarsEl = document.getElementById("ratingStars");
const ratingComment = document.getElementById("ratingComment");
const submitRatingBtn = document.getElementById("submitRating");
const skipRatingBtn = document.getElementById("skipRating");
const availableRequests = document.getElementById("availableRequests");
const applyModal = document.getElementById("applyModal");
const applyPriceInput = document.getElementById("applyPriceInput");
const applyMessageInput = document.getElementById("applyMessageInput");
const confirmApplyBtn = document.getElementById("confirmApplyBtn");
const cancelApplyBtn = document.getElementById("cancelApplyBtn");
const applyMissionDetails = document.getElementById("applyMissionDetails");
const applyStatusText = document.getElementById("applyStatusText");
let pendingApplyRequest = null;
let availableRequestMap = {};

async function ensureIndepProfile(user, forceRefresh) {
  if (!sb) return null;

  var resolvedUser = user || null;
  if (!resolvedUser) {
    var authUserResult = await sb.auth.getUser();
    resolvedUser = authUserResult && authUserResult.data ? authUserResult.data.user : null;
  }
  if (!resolvedUser?.id) return null;
  if (currentIndep && !forceRefresh) return currentIndep;

  var profileResult = await sb.from("independants")
    .select("firstname,lastname,city,experience,skills,daily_rate,status,siret,phone")
    .eq("user_id", resolvedUser.id).maybeSingle();

  if (!profileResult.error && profileResult.data) {
    currentIndep = profileResult.data;
    return currentIndep;
  }

  var meta = resolvedUser.user_metadata || {};
  var fallbackProfile = {
    firstname: meta.firstname || "",
    lastname: meta.lastname || "",
    city: "",
    experience: "",
    skills: "",
    daily_rate: null,
    status: "hors_ligne",
    siret: "",
    phone: ""
  };

  // Tentative de création non bloquante : on continue même si RLS la refuse.
  var createResult = await sb.from("independants").upsert({
    user_id: resolvedUser.id,
    firstname: fallbackProfile.firstname,
    lastname: fallbackProfile.lastname,
    email: resolvedUser.email || "",
    status: "hors_ligne"
  }, { onConflict: "user_id" });

  if (createResult.error) {
    console.warn("Profil indépendant absent (création automatique refusée):", createResult.error.message);
    currentIndep = fallbackProfile;
    return currentIndep;
  }

  var refetch = await sb.from("independants")
    .select("firstname,lastname,city,experience,skills,daily_rate,status,siret,phone")
    .eq("user_id", resolvedUser.id).maybeSingle();

  currentIndep = refetch.data || fallbackProfile;
  return currentIndep;
}

// ---- INIT ----
async function init() {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) { window.location.href = "indep-login.html"; return; }
  if (user.user_metadata?.role && user.user_metadata.role !== "independant") {
    await sb.auth.signOut(); window.location.href = "indep-login.html"; return;
  }
  currentUserId = user.id;
  const data = await ensureIndepProfile(user);
  const name = [data?.firstname, data?.lastname].filter(Boolean).join(" ");
  if (welcomeTitle) welcomeTitle.textContent = name ? "Bonjour " + name : "Tableau de bord";

  if (profileCity) profileCity.textContent = data?.city || "—";
  if (profileExp) profileExp.textContent = data?.experience || "—";
  if (profileSkills) profileSkills.textContent = data?.skills || "—";
  if (profileSiret) profileSiret.textContent = data?.siret || "—";
  if (kpiRate) kpiRate.textContent = data?.daily_rate ? data.daily_rate + " \u20ac/j" : "—";

  var stored = localStorage.getItem("indep-category");
  if (stored && categorySelect) categorySelect.value = stored;

  isOnline = data?.status === "en_ligne";
  updateStatusUI();
  await refreshAll();
  setupRealtime();
}
init();

// ---- LOGOUT ----
document.querySelectorAll("[data-logout]").forEach(function(b) {
  b.addEventListener("click", async function(e) {
    e.preventDefault();
    if (isOnline) await updateStatus("hors_ligne");
    try { await sb.auth.signOut(); } catch (err) {}
    Object.keys(localStorage).forEach(function(k) {
      if (k.indexOf("sb-") !== -1 && k.indexOf("-auth-token") !== -1) localStorage.removeItem(k);
    });
    window.location.href = "index.html";
  });
});

document.addEventListener("visibilitychange", function() {
  if (document.hidden && isOnline) updateStatus("hors_ligne");
});
window.addEventListener("beforeunload", function() {
  if (isOnline) updateStatus("hors_ligne");
});

// ---- STATUS ----
function updateStatusUI() {
  var dot = statusBadge ? statusBadge.querySelector(".status-dot") : null;
  if (dot) dot.className = "status-dot " + (isOnline ? "online" : "offline");
  if (statusBadge && statusBadge.childNodes[1]) statusBadge.childNodes[1].textContent = isOnline ? " En ligne" : " Hors ligne";
  if (toggleOnline) {
    toggleOnline.textContent = isOnline ? "Se mettre hors ligne" : "Se mettre en ligne";
    toggleOnline.className = isOnline ? "btn danger" : "btn primary";
    toggleOnline.style.flex = "1";
  }
  if (availFeedback) availFeedback.textContent = isOnline ? "Vous recevez les demandes en temps r\u00e9el." : "Passez en ligne pour recevoir des demandes.";
}

async function updateStatus(status) {
  if (!sb || !currentUserId) return;
  await sb.from("independants").update({ status: status }).eq("user_id", currentUserId);
}

if (toggleOnline) {
  toggleOnline.addEventListener("click", async function() {
    if (!categorySelect.value && !isOnline) { alert("Choisissez une cat\u00e9gorie."); return; }
    if (categorySelect.value) localStorage.setItem("indep-category", categorySelect.value);
    var next = isOnline ? "hors_ligne" : "en_ligne";
    await updateStatus(next);
    isOnline = !isOnline;
    updateStatusUI();
    if (isOnline) checkPendingNotifications();
  });
}

if (searchBtn) {
  searchBtn.addEventListener("click", async function() {
    if (!categorySelect.value) { alert("Choisissez une cat\u00e9gorie."); return; }
    localStorage.setItem("indep-category", categorySelect.value);
    if (availFeedback) availFeedback.textContent = "Recherche en cours...";
    await runMatching();
    await refreshAll();
    if (availFeedback) availFeedback.textContent = "Recherche termin\u00e9e.";
  });
}

// ---- DATA ----
async function refreshAll() {
  await loadMissions().catch(function(){});
  await loadKPIs().catch(function(){});
  await loadUserRating().catch(function(){});
  await loadAvailableRequests().catch(function(){});
}

async function loadKPIs() {
  var result = await sb.from("requests")
    .select("id,status,negotiated_price").eq("assigned_indep_user_id", currentUserId)
    .in("status", ["paye", "en_cours", "termine", "livre", "confirme", "negociation"]);
  var data = result.data || [];
  var active = data.filter(function(r) { return ["paye", "en_cours", "negociation", "confirme"].indexOf(r.status) !== -1; });
  if (kpiMissions) kpiMissions.textContent = active.length;
  var rev = data.filter(function(r) { return ["paye", "en_cours", "termine", "livre"].indexOf(r.status) !== -1; })
    .reduce(function(s, r) { return s + Number(r.negotiated_price || 0); }, 0);
  if (kpiRevenue) kpiRevenue.textContent = rev + " \u20ac";
}

async function loadUserRating() {
  var result = await sb.from("ratings").select("score").eq("rated_user_id", currentUserId);
  var data = result.data;
  if (!data || data.length === 0) { if (kpiRating) kpiRating.textContent = "—"; return; }
  var avg = data.reduce(function(s, r) { return s + Number(r.score); }, 0) / data.length;
  if (kpiRating) kpiRating.textContent = avg.toFixed(1) + " / 10";
}

function formatStatus(s) {
  var m = { nouveau: "Nouveau", en_attente: "En attente", match_en_cours: "Match en cours", negociation: "N\u00e9gociation", confirme: "Confirm\u00e9", paye: "Pay\u00e9", en_cours: "En cours", termine: "Termin\u00e9", livre: "Livr\u00e9" };
  return m[s] || s || "Nouveau";
}
function statusPillClass(s) {
  if (["confirme", "paye", "en_cours"].indexOf(s) !== -1) return "green";
  if (["negociation", "match_en_cours"].indexOf(s) !== -1) return "yellow";
  if (["termine", "livre"].indexOf(s) !== -1) return "green";
  return "";
}

async function loadMissions() {
  var result = await sb.from("requests")
    .select("id,title,status,created_at,negotiated_price,budget,category,skills,match_summary,deadline,deadline_at,delivered,client_user_id")
    .eq("assigned_indep_user_id", currentUserId).order("created_at", { ascending: false }).limit(20);
  var data = result.data;
  if (result.error || !data) { if (missionList) missionList.innerHTML = '<li class="hint">Erreur.</li>'; return; }
  if (data.length === 0) {
    if (missionList) missionList.innerHTML = '<li class="hint">Aucune mission.</li>';
    if (chatList) chatList.innerHTML = '<li class="hint">Aucune conversation.</li>';
    return;
  }
  if (missionList) missionList.innerHTML = data.map(function(r) {
    return '<li class="req-item" data-mission="' + r.id + '"><div><div class="title">' + r.title + '</div><div class="meta">' + (r.category || "") + ' \u00b7 ' + (r.negotiated_price || r.budget || "?") + ' \u20ac</div></div><span class="pill ' + statusPillClass(r.status) + '">' + formatStatus(r.status) + '</span></li>';
  }).join("");
  if (chatList) chatList.innerHTML = data.map(function(r) {
    return '<li class="req-item" data-chat="' + r.id + '"><div class="title">' + r.title + '</div><span class="pill ' + statusPillClass(r.status) + '" style="font-size:10px">' + formatStatus(r.status) + '</span></li>';
  }).join("");

  document.querySelectorAll("[data-mission]").forEach(function(el) {
    el.addEventListener("click", function() { openMissionDetail(Number(el.dataset.mission)); });
  });
  document.querySelectorAll("[data-chat]").forEach(function(el) {
    el.addEventListener("click", function() { openConversation(Number(el.dataset.chat)); });
  });
}

// ---- AVAILABLE REQUESTS ----
async function loadAvailableRequests() {
  if (!availableRequests) return;
  try {
    var result = await sb.from("requests")
      .select("id,title,category,budget,skills,status,deadline,description,created_at")
      .is("assigned_indep_user_id", null)
      .in("status", ["en_attente", "match_en_cours", "nouveau"])
      .order("created_at", { ascending: false }).limit(15);
    var data = result.data;
    if (result.error || !data || data.length === 0) {
      availableRequests.innerHTML = '<li class="hint">Aucune demande disponible pour le moment.</li>';
      return;
    }
    // Filter by category if selected
    var cat = categorySelect ? categorySelect.value : "";
    var filtered = cat ? data.filter(function(r) { return r.category && r.category.trim() === cat; }) : data;
    if (filtered.length === 0) {
      availableRequests.innerHTML = '<li class="hint">Aucune demande pour la cat\u00e9gorie "' + cat + '". <span style="color:var(--accent2);cursor:pointer" id="showAllBtn">Voir toutes</span></li>';
      var showAll = document.getElementById("showAllBtn");
      if (showAll) showAll.addEventListener("click", function() {
        renderAvailableList(data);
      });
      return;
    }
    renderAvailableList(filtered);
  } catch (err) {
    availableRequests.innerHTML = '<li class="hint">Erreur de chargement.</li>';
  }
}

function renderAvailableList(items) {
  if (!availableRequests) return;
  availableRequestMap = {};
  items.forEach(function(r) {
    availableRequestMap[String(r.id)] = r;
  });
  availableRequests.innerHTML = items.map(function(r) {
    var date = new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return '<li class="req-item" style="flex-wrap:wrap">' +
      '<div style="flex:1"><div class="title">' + r.title + '</div>' +
      '<div class="meta">' + (r.category || "") + ' \u00b7 ' + (r.budget ? r.budget + ' \u20ac' : 'Budget \u00e0 d\u00e9finir') + ' \u00b7 ' + date + '</div>' +
      '<div class="meta">' + (r.skills || '') + '</div></div>' +
      '<button class="btn sm primary" data-apply="' + r.id + '" data-budget="' + (r.budget || "") + '">Postuler</button></li>';
  }).join("");
  // Bind apply buttons
  document.querySelectorAll("[data-apply]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      openApplyModal(btn.dataset.apply, btn.dataset.budget, btn);
    });
  });
}

function openApplyModal(requestId, budget, btn) {
  var req = availableRequestMap[String(requestId)] || null;
  pendingApplyRequest = { requestId: requestId, budget: Number(budget || 0), btn: btn, request: req };
  if (applyPriceInput) applyPriceInput.value = pendingApplyRequest.budget > 0 ? String(pendingApplyRequest.budget) : "";
  if (applyMessageInput) applyMessageInput.value = req && req.skills ? ("Bonjour, je suis disponible pour cette mission. Je couvre : " + req.skills + ".") : "";
  if (applyMissionDetails) {
    var deadline = req && req.deadline ? req.deadline : "À définir";
    var budgetText = req && req.budget ? req.budget + " €" : "Budget à définir";
    applyMissionDetails.innerHTML =
      '<div class="detail-row"><span class="dl">Titre</span><span class="dd">' + (req && req.title ? req.title : "Mission") + '</span></div>' +
      '<div class="detail-row"><span class="dl">Catégorie</span><span class="dd">' + (req && req.category ? req.category : "—") + '</span></div>' +
      '<div class="detail-row"><span class="dl">Budget client</span><span class="dd">' + budgetText + '</span></div>' +
      '<div class="detail-row"><span class="dl">Deadline</span><span class="dd">' + deadline + '</span></div>' +
      '<div class="detail-row"><span class="dl">Compétences</span><span class="dd">' + (req && req.skills ? req.skills : "—") + '</span></div>' +
      '<div class="detail-row"><span class="dl">Description</span><span class="dd">' + (req && req.description ? req.description : "Non renseignée") + '</span></div>';
  }
  if (applyStatusText) applyStatusText.textContent = "";
  if (applyModal) applyModal.classList.add("show");
}

function closeApplyModal() {
  pendingApplyRequest = null;
  if (applyStatusText) applyStatusText.textContent = "";
  if (applyModal) applyModal.classList.remove("show");
}

if (cancelApplyBtn) cancelApplyBtn.addEventListener("click", closeApplyModal);
if (applyModal) {
  applyModal.addEventListener("click", function(e) {
    if (e.target === applyModal) closeApplyModal();
  });
}

if (confirmApplyBtn) {
  confirmApplyBtn.addEventListener("click", async function() {
    if (!pendingApplyRequest) return;
    var price = Number(applyPriceInput ? applyPriceInput.value : 0);
    var message = applyMessageInput ? applyMessageInput.value.trim() : "";
    await applyForRequest(pendingApplyRequest.requestId, pendingApplyRequest.btn, price, message);
  });
}

async function applyForRequest(requestId, btn, proposedPrice, customMessage) {
  if (!currentUserId) { alert("Session expirée. Merci de vous reconnecter."); return; }

  var sessionResult = await sb.auth.getSession();
  var user = sessionResult && sessionResult.data && sessionResult.data.session ? sessionResult.data.session.user : null;
  var profile = await ensureIndepProfile(user, true) || {
    firstname: user?.user_metadata?.firstname || "",
    lastname: user?.user_metadata?.lastname || "",
    skills: ""
  };
  if (!isFinite(proposedPrice) || proposedPrice <= 0) {
    alert("Merci de renseigner un prix valide (nombre supérieur à 0).");
    return;
  }
  if (!customMessage) {
    alert("Le message personnalisé est obligatoire.");
    return;
  }
  if (!btn) return;
  btn.textContent = "En cours...";
  btn.disabled = true;
  if (confirmApplyBtn) confirmApplyBtn.disabled = true;
  if (applyStatusText) applyStatusText.textContent = "Envoi de votre candidature...";
  try {
    // Assign self to this request
    var result = await sb.from("requests").update({
      assigned_indep_user_id: currentUserId,
      status: "negociation",
      match_score: computeScore({ skills: "", category: "", budget: 0 }, profile),
      match_summary: "Candidature de " + (profile.firstname || "") + " " + (profile.lastname || ""),
      negotiated_price: proposedPrice
    }).eq("id", requestId).is("assigned_indep_user_id", null).select("id").maybeSingle();

    if (result.error || !result.data) {
      alert("Impossible de postuler. " + (result.error && result.error.message ? result.error.message : "Cette demande a peut-\u00eatre d\u00e9j\u00e0 \u00e9t\u00e9 prise."));
      if (applyStatusText) applyStatusText.textContent = "Échec : candidature non envoyée.";
      return;
    }

    var msgResult = await sb.from("request_messages").insert({
      request_id: requestId,
      sender_user_id: currentUserId,
      sender_role: "independant",
      channel: "fil",
      body: customMessage
    });

    if (msgResult.error) {
      throw new Error("Message non envoyé: " + msgResult.error.message);
    }

    var systemMsgResult = await sb.from("request_messages").insert({
      request_id: requestId, sender_user_id: currentUserId,
      sender_role: "system", channel: "fil",
      body: (profile.firstname || "Ind\u00e9pendant") + " propose " + proposedPrice + " \u20ac pour cette mission."
    });

    if (systemMsgResult.error) {
      throw new Error("Message système non envoyé: " + systemMsgResult.error.message);
    }

    alert("Candidature envoy\u00e9e avec votre prix et votre message.");
    if (applyStatusText) applyStatusText.textContent = "Candidature envoyée ✅";
    closeApplyModal();
    await refreshAll();
  } catch (err) {
    alert("Erreur lors de la candidature : " + (err && err.message ? err.message : "inconnue"));
    if (applyStatusText) applyStatusText.textContent = "Erreur: " + (err && err.message ? err.message : "inconnue");
  } finally {
    btn.textContent = "Postuler";
    btn.disabled = false;
    if (confirmApplyBtn) confirmApplyBtn.disabled = false;
  }
}

// ---- MISSION DETAIL ----
async function openMissionDetail(requestId) {
  var result = await sb.from("requests")
    .select("id,title,status,negotiated_price,budget,category,skills,deadline,deadline_at,delivered,description,client_user_id")
    .eq("id", requestId).eq("assigned_indep_user_id", currentUserId).maybeSingle();
  var req = result.data;
  if (!req) return;
  currentRequest = req;
  if (missionDetailCard) missionDetailCard.style.display = "block";
  document.querySelectorAll("[data-mission]").forEach(function(el) {
    el.classList.toggle("active", Number(el.dataset.mission) === requestId);
  });
  if (missionDetail) missionDetail.innerHTML =
    '<div class="detail-row"><span class="dl">Titre</span><span class="dd">' + req.title + '</span></div>' +
    '<div class="detail-row"><span class="dl">Cat\u00e9gorie</span><span class="dd">' + (req.category || "—") + '</span></div>' +
    '<div class="detail-row"><span class="dl">Budget initial</span><span class="dd">' + (req.budget || "—") + ' \u20ac</span></div>' +
    '<div class="detail-row"><span class="dl">Prix n\u00e9goci\u00e9</span><span class="dd">' + (req.negotiated_price || "—") + ' \u20ac</span></div>' +
    '<div class="detail-row"><span class="dl">Comp\u00e9tences</span><span class="dd">' + (req.skills || "—") + '</span></div>' +
    '<div class="detail-row"><span class="dl">Statut</span><span class="dd"><span class="pill ' + statusPillClass(req.status) + '">' + formatStatus(req.status) + '</span></span></div>' +
    '<div class="detail-row"><span class="dl">Livr\u00e9</span><span class="dd">' + (req.delivered ? "Oui" : "Non") + '</span></div>';
  updateDeadline(req);
  await loadDeliverables(requestId);
  if (deliverBtn) deliverBtn.style.display = (["paye", "en_cours"].indexOf(req.status) !== -1) ? "block" : "none";
}

function updateDeadline(req) {
  if (deadlineInterval) clearInterval(deadlineInterval);
  var dl = req.deadline_at || req.deadline;
  if (!dl) { if (deadlineCountdown) deadlineCountdown.textContent = "Pas de deadline"; return; }
  var target = new Date(dl);
  if (isNaN(target.getTime())) { if (deadlineCountdown) deadlineCountdown.textContent = dl; return; }
  function tick() {
    var diff = target - Date.now();
    if (diff <= 0) { if (deadlineCountdown) { deadlineCountdown.textContent = "Deadline d\u00e9pass\u00e9e !"; deadlineCountdown.className = "countdown urgent"; } return; }
    var d = Math.floor(diff / 86400000);
    var h = Math.floor((diff % 86400000) / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    if (deadlineCountdown) {
      deadlineCountdown.textContent = d + "j " + h + "h " + m + "min restants";
      deadlineCountdown.className = diff < 86400000 ? "countdown urgent" : "countdown";
    }
  }
  tick();
  deadlineInterval = setInterval(tick, 60000);
}

// ---- FILES ----
if (fileZone) fileZone.addEventListener("click", function() { if (fileInput) fileInput.click(); });
if (fileInput) fileInput.addEventListener("change", handleFileUpload);

async function handleFileUpload() {
  if (!currentRequest || !fileInput.files.length) return;
  for (var i = 0; i < fileInput.files.length; i++) {
    var file = fileInput.files[i];
    await sb.from("deliverables").insert({
      request_id: currentRequest.id, indep_user_id: currentUserId,
      file_name: file.name, file_url: "simulated://" + file.name, file_size: file.size
    });
  }
  fileInput.value = "";
  await loadDeliverables(currentRequest.id);
}

async function loadDeliverables(requestId) {
  var result = await sb.from("deliverables").select("id,file_name,file_size,uploaded_at")
    .eq("request_id", requestId).order("uploaded_at", { ascending: false });
  var data = result.data;
  if (!data || data.length === 0) { if (fileList) fileList.innerHTML = '<div class="hint">Aucun fichier.</div>'; return; }
  if (fileList) fileList.innerHTML = data.map(function(f) {
    var size = f.file_size ? (f.file_size / 1024).toFixed(1) + " Ko" : "";
    return '<div class="file-item"><span>' + f.file_name + '</span><span class="hint">' + size + '</span></div>';
  }).join("");
}

if (deliverBtn) {
  deliverBtn.addEventListener("click", async function() {
    if (!currentRequest) return;
    await sb.from("requests").update({ delivered: true, delivered_at: new Date().toISOString(), status: "livre" }).eq("id", currentRequest.id);
    await sb.from("request_messages").insert({
      request_id: currentRequest.id, sender_user_id: currentUserId, sender_role: "system", channel: "fil",
      body: "L'ind\u00e9pendant a livr\u00e9 les fichiers."
    });
    alert("Mission marqu\u00e9e comme livr\u00e9e !");
    await refreshAll();
    openMissionDetail(currentRequest.id);
  });
}

// ---- CONVERSATION ----
async function openConversation(requestId) {
  var result = await sb.from("requests")
    .select("id,title,status,negotiated_price,budget,match_summary,assigned_indep_user_id,client_user_id,deadline")
    .eq("id", requestId).eq("assigned_indep_user_id", currentUserId).maybeSingle();
  var req = result.data;
  if (!req) return;
  currentRequest = req;
  document.querySelectorAll("[data-chat]").forEach(function(el) {
    el.classList.toggle("active", Number(el.dataset.chat) === requestId);
  });
  if (chatTitle) chatTitle.textContent = req.title;
  if (chatStatusText) chatStatusText.textContent = formatStatus(req.status);
  if (chatInputArea) chatInputArea.style.display = "flex";

  if (req.status === "negociation") {
    if (negoBar) negoBar.style.display = "block";
    if (priceInput) priceInput.value = req.negotiated_price || "";
    if (chatHint) chatHint.textContent = "Chat direct — N\u00e9gociez le prix et les d\u00e9tails.";
  } else {
    if (negoBar) negoBar.style.display = "none";
    if (chatHint) {
      if (["confirme", "paye", "en_cours"].indexOf(req.status) !== -1) chatHint.textContent = "Fil de messages — Mission en cours.";
      else if (req.status === "livre" || req.status === "termine") chatHint.textContent = "Mission termin\u00e9e.";
      else chatHint.textContent = "";
    }
  }

  var actionsHtml = "";
  if (["termine", "livre"].indexOf(req.status) !== -1) actionsHtml = '<button class="btn sm" id="rateClientBtn">Noter le client</button>';
  if (chatHeaderActions) chatHeaderActions.innerHTML = actionsHtml;
  var rateBtn = document.getElementById("rateClientBtn");
  if (rateBtn) rateBtn.addEventListener("click", openRatingModal);

  await loadMessages();
  subscribeMessages(requestId);
}

async function loadMessages() {
  if (!currentRequest) return;
  var channel = "fil";
  var result = await sb.from("request_messages")
    .select("sender_role,body,created_at").eq("request_id", currentRequest.id)
    .order("created_at", { ascending: true });
  var msgs = result.data;
  if (!msgs || msgs.length === 0) {
    if (chatMessages) chatMessages.innerHTML = '<div class="hint" style="text-align:center;margin:auto">Aucun message.</div>';
    return;
  }
  if (chatMessages) chatMessages.innerHTML = msgs.map(function(m) {
    var time = new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return '<div class="msg ' + m.sender_role + '"><div>' + m.body + '</div><div class="time">' + time + '</div></div>';
  }).join("");
  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Send
if (sendBtn) sendBtn.addEventListener("click", sendMessage);
if (msgInput) msgInput.addEventListener("keydown", function(e) { if (e.key === "Enter") sendMessage(); });

async function sendMessage() {
  if (!currentRequest || !msgInput || !msgInput.value.trim()) return;
  var channel = "fil";
  await sb.from("request_messages").insert({
    request_id: currentRequest.id, sender_user_id: currentUserId,
    sender_role: "independant", channel: channel, body: msgInput.value.trim()
  });
  msgInput.value = "";
  await loadMessages();
}

// Price
if (proposePriceBtn) {
  proposePriceBtn.addEventListener("click", async function() {
    if (!currentRequest || !priceInput || !priceInput.value) return;
    var price = Number(priceInput.value);
    await sb.from("requests").update({ negotiated_price: price }).eq("id", currentRequest.id);
    await sb.from("request_messages").insert({
      request_id: currentRequest.id, sender_user_id: currentUserId, sender_role: "system", channel: "fil",
      body: "Nouveau prix propos\u00e9 par l'ind\u00e9pendant : " + price + " \u20ac"
    });
    await loadMessages();
  });
}

if (acceptPriceBtn) {
  acceptPriceBtn.addEventListener("click", async function() {
    if (!currentRequest) return;
    var price = currentRequest.negotiated_price || (priceInput ? priceInput.value : null);
    if (!price) { alert("Aucun prix d\u00e9fini."); return; }
    await sb.from("requests").update({ status: "confirme", negotiated_price: Number(price) }).eq("id", currentRequest.id);
    await sb.from("request_messages").insert({
      request_id: currentRequest.id, sender_user_id: currentUserId, sender_role: "system", channel: "fil",
      body: "Prix accept\u00e9 : " + price + " \u20ac. En attente du paiement."
    });
    await sb.from("request_messages").insert({
      request_id: currentRequest.id, sender_user_id: currentUserId, sender_role: "system", channel: "fil",
      body: "Mission confirm\u00e9e \u00e0 " + price + " \u20ac. Le chat passe en fil de messages."
    });
    if (negoBar) negoBar.style.display = "none";
    await refreshAll();
    await openConversation(currentRequest.id);
  });
}

// ---- REALTIME ----
function setupRealtime() {
  sb.channel("indep-requests-" + currentUserId)
    .on("postgres_changes", { event: "*", schema: "public", table: "requests", filter: "assigned_indep_user_id=eq." + currentUserId }, function() { refreshAll(); })
    .subscribe();
  sb.channel("indep-notifs-" + currentUserId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "recipient_user_id=eq." + currentUserId }, function(payload) { if (isOnline) showNotification(payload.new); })
    .subscribe();
}

function subscribeMessages(requestId) {
  if (realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel = sb.channel("indep-chat-" + requestId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "request_messages", filter: "request_id=eq." + requestId }, function() { loadMessages(); })
    .subscribe();
}

// ---- NOTIFICATIONS ----
async function checkPendingNotifications() {
  var result = await sb.from("notifications")
    .select("*").eq("recipient_user_id", currentUserId).eq("seen", false)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1);
  if (result.data && result.data.length > 0) showNotification(result.data[0]);
}

function showNotification(notif) {
  if (!notif || notif.type !== "new_request") return;
  var expiresAt = new Date(notif.expires_at);
  if (expiresAt <= new Date()) return;
  if (notifDetails) notifDetails.innerHTML = '<div><strong>' + (notif.title || "Nouvelle mission") + '</strong></div><div>' + (notif.body || "") + '</div>';
  if (notifPopup) notifPopup.classList.add("show");
  if (notifInterval) clearInterval(notifInterval);
  if (notifTimer) clearTimeout(notifTimer);
  var totalMs = expiresAt - Date.now();
  notifInterval = setInterval(function() {
    var remaining = Math.max(0, expiresAt - Date.now());
    var pct = (remaining / totalMs) * 100;
    if (notifTimerBar) notifTimerBar.style.width = pct + "%";
    if (notifCountdownEl) notifCountdownEl.textContent = "Expire dans " + Math.ceil(remaining / 1000) + "s";
    if (remaining <= 0) { clearInterval(notifInterval); hideNotification(); }
  }, 500);
  notifTimer = setTimeout(function() { hideNotification(); }, totalMs);

  if (notifAccept) notifAccept.onclick = async function() {
    await sb.from("notifications").update({ seen: true }).eq("id", notif.id);
    hideNotification();
    await refreshAll();
    if (notif.request_id) openConversation(notif.request_id);
  };
  if (notifDecline) notifDecline.onclick = async function() {
    await sb.from("notifications").update({ seen: true }).eq("id", notif.id);
    if (notif.request_id) {
      await sb.from("requests").update({ assigned_indep_user_id: null, status: "en_attente", match_summary: "Ind\u00e9pendant a refus\u00e9. En attente." }).eq("id", notif.request_id);
    }
    hideNotification();
  };
}

function hideNotification() {
  if (notifPopup) notifPopup.classList.remove("show");
  if (notifInterval) clearInterval(notifInterval);
  if (notifTimer) clearTimeout(notifTimer);
}

// ---- MATCHING ----
function normalizeSkills(s) {
  if (!s) return [];
  return s.toLowerCase().split(",").map(function(x) { return x.trim(); }).filter(Boolean);
}
function computeScore(request, indep) {
  var rSkills = normalizeSkills(request.skills).concat(normalizeSkills(request.category));
  var iSkills = normalizeSkills(indep.skills);
  var shared = rSkills.filter(function(s) { return iSkills.indexOf(s) !== -1; });
  var skillScore = shared.length * 15;
  var budget = Number(request.budget || 0);
  var rate = Number(indep.daily_rate || 0);
  var budgetFit = rate ? Math.max(0, 20 - Math.abs(budget - rate * 5) / 50) : 5;
  return Math.round(skillScore + budgetFit);
}

async function runMatching() {
  if (!currentIndep) return;
  var cat = categorySelect ? categorySelect.value : "";
  var result = await sb.from("requests")
    .select("id,title,category,skills,budget,status")
    .is("assigned_indep_user_id", null).in("status", ["en_attente", "match_en_cours"]);
  var requests = result.data;
  if (!requests || requests.length === 0) { alert("Aucune demande disponible."); return; }
  var filtered = cat ? requests.filter(function(r) { return r.category && r.category.trim() === cat; }) : requests;
  if (filtered.length === 0) { alert("Aucune demande pour cette cat\u00e9gorie."); return; }
  var ranked = filtered.map(function(r) { return { request: r, score: computeScore(r, currentIndep) }; }).sort(function(a, b) { return b.score - a.score; });
  var best = ranked[0];
  var price = Number(best.request.budget || 0) || null;
  await sb.from("requests").update({
    assigned_indep_user_id: currentUserId, status: "negociation",
    match_score: best.score, match_summary: "Match: " + best.score + " pts", negotiated_price: price
  }).eq("id", best.request.id);
  if (price) {
    await sb.from("request_messages").insert({
      request_id: best.request.id, sender_user_id: currentUserId, sender_role: "system", channel: "fil",
      body: "Proposition initiale : " + price + " \u20ac (ajustable)."
    });
  }
  alert("Mission assign\u00e9e : " + best.request.title);
}

// ---- RATING ----
function initRatingStars() {
  if (!ratingStarsEl) return;
  ratingStarsEl.innerHTML = "";
  for (var i = 1; i <= 10; i++) {
    (function(idx) {
      var star = document.createElement("div");
      star.className = "star";
      star.textContent = idx;
      star.addEventListener("click", function() {
        selectedRating = idx;
        ratingStarsEl.querySelectorAll(".star").forEach(function(s, j) { s.classList.toggle("active", j < idx); });
      });
      ratingStarsEl.appendChild(star);
    })(i);
  }
}
initRatingStars();

function openRatingModal() {
  selectedRating = 0;
  if (ratingComment) ratingComment.value = "";
  if (ratingStarsEl) ratingStarsEl.querySelectorAll(".star").forEach(function(s) { s.classList.remove("active"); });
  if (ratingModal) ratingModal.classList.add("show");
}

if (skipRatingBtn) skipRatingBtn.addEventListener("click", function() { if (ratingModal) ratingModal.classList.remove("show"); });
if (submitRatingBtn) {
  submitRatingBtn.addEventListener("click", async function() {
    if (!currentRequest || selectedRating === 0) { alert("Choisissez une note."); return; }
    await sb.from("ratings").insert({
      request_id: currentRequest.id, rater_user_id: currentUserId,
      rated_user_id: currentRequest.client_user_id, rater_role: "independant",
      score: selectedRating, comment: (ratingComment ? ratingComment.value.trim() : null) || null
    });
    if (ratingModal) ratingModal.classList.remove("show");
    alert("Merci pour votre \u00e9valuation !");
    await loadUserRating();
  });
}
