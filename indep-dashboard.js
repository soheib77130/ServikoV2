const SUPABASE_URL = "https://skfqoyyoahuaffshimnc.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_yxLCOU94zhGck9yvGYch5Q_ePCPd9Yq";
    const supportBtn = document.getElementById("supportBtn");
    const logoutButtons = Array.from(document.querySelectorAll("[data-logout]"));
    const headline = document.getElementById("indepHeadline");
    const revenue = document.getElementById("indepRevenue");
    const rate = document.getElementById("indepRate");
    const city = document.getElementById("indepCity");
    const exp = document.getElementById("indepExperience");
    const skills = document.getElementById("indepSkills");
    const indepRequests = document.getElementById("indepRequests");
    const openRequests = document.getElementById("openRequests");
    const toggleAvailability = document.getElementById("toggleAvailability");
    const searchRequest = document.getElementById("searchRequest");
    const availabilityStatus = document.getElementById("availabilityStatus");
    const availabilityCategory = document.getElementById("availabilityCategory");
    const availabilityNote = document.getElementById("availabilityNote");
    const availabilityFeedback = document.getElementById("availabilityFeedback");
    const conversationList = document.getElementById("conversationList");
    const conversationTitle = document.getElementById("conversationTitle");
    const conversationStatus = document.getElementById("conversationStatus");
    const conversationHint = document.getElementById("conversationHint");
    const specChecklist = document.getElementById("specChecklist");
    const negotiatedPrice = document.getElementById("negotiatedPrice");
    const saveSpecBtn = document.getElementById("saveSpecBtn");
    const confirmSpecBtn = document.getElementById("confirmSpecBtn");
    const messageList = document.getElementById("messageList");
    const messageInput = document.getElementById("messageInput");
    const sendMessage = document.getElementById("sendMessage");
    const activityLog = document.getElementById("activityLog");
    const jsWarning = document.getElementById("jsWarning");
    const supabaseClient = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: window.localStorage
      }
    });
    let currentRequest = null;
    let currentIndep = null;
    let currentUserId = null;
    let profileReady = false;
    let hasGoneOffline = false;

    function logActivity(message){
      if (!activityLog) return;
      const item = document.createElement("li");
      item.textContent = message;
      activityLog.prepend(item);
    }

    if (jsWarning){
      jsWarning.style.display = "none";
    }

    logActivity("JavaScript chargé.");

    document.addEventListener("click", (event) => {
      const label = event.target?.textContent?.trim();
      if (label){
        logActivity(`Clic détecté : ${label}`);
      }
    });

    window.addEventListener("error", (event) => {
      logActivity(`Erreur script : ${event.message}`);
    });

    window.addEventListener("unhandledrejection", (event) => {
      logActivity(`Promesse rejetée : ${event.reason?.message || event.reason}`);
    });

    async function hydrateProfile(){
      logActivity("Chargement du profil...");
      if (!supabaseClient) return;
      const { data: { session } } = await supabaseClient.auth.getSession();
      const user = session?.user;
      if (!user){
        logActivity("Session absente, redirection vers la connexion.");
        window.location.href = "indep-login.html";
        return;
      }
      currentUserId = user.id;
      if (user.user_metadata?.role && user.user_metadata.role !== "independant"){
        await supabaseClient.auth.signOut();
        window.location.href = "indep-login.html";
        return;
      }
      const { data } = await supabaseClient
        .from("independants")
        .select("firstname, lastname, city, experience, skills, daily_rate")
        .eq("user_id", user.id)
        .maybeSingle();
      currentIndep = data;
      const name = [data?.firstname, data?.lastname].filter(Boolean).join(" ");
      if (headline){
        headline.textContent = name ? `Bienvenue ${name}, voici votre activité.` : "Suivi des missions et revenus.";
      }
      if (rate){
        rate.textContent = data?.daily_rate ? `€${data.daily_rate} / jour` : "—";
      }
      if (city){
        city.textContent = data?.city ? `Ville : ${data.city}` : "Ville : —";
      }
      if (exp){
        exp.textContent = data?.experience ? `Expérience : ${data.experience}` : "Expérience : —";
      }
      if (skills){
        const value = data?.skills ? data.skills.split(",")[0].trim() : "—";
        skills.textContent = value ? `Compétence phare : ${value}` : "Compétence phare : —";
      }
      if (revenue){
        const base = Number(data?.daily_rate || 0);
        const estimate = base ? Math.round(base * 8.5) : 0;
        revenue.textContent = `€${estimate}`;
      }
      if (availabilityCategory){
        const storedCategory = window.localStorage.getItem("indep-category");
        if (storedCategory){
          availabilityCategory.value = storedCategory;
        }
      }
      await loadAssignedRequests(user.id);
      await hydrateAvailability(user.id);
      await loadOpenRequests({ filterByCategory: true });
      profileReady = true;
      setAvailabilityControlsReady(true);
      logActivity("Profil chargé, actions activées.");
      await attemptAutoMatch(user.id);
    }

    hydrateProfile();

    if (supabaseClient){
      logActivity("Supabase initialisé.");
    } else {
      logActivity("Supabase indisponible (script CDN bloqué ?).");
    }

    async function updateIndepStatus(statusValue, { silent } = {}){
      if (!supabaseClient || !currentUserId) return;
      try {
        await supabaseClient
          .from("independants")
          .update({ status: statusValue })
          .eq("user_id", currentUserId);
        if (!silent){
          logActivity(`Statut mis à jour (auto) : ${statusValue}.`);
        }
      } catch (error) {
        if (!silent){
          logActivity("Erreur lors de la mise à jour auto du statut.");
        }
      }
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && !hasGoneOffline){
        hasGoneOffline = true;
        updateIndepStatus("hors_ligne", { silent: true });
      }
    });

    window.addEventListener("beforeunload", () => {
      if (!hasGoneOffline){
        hasGoneOffline = true;
        updateIndepStatus("hors_ligne", { silent: true });
      }
    });

    function setAvailabilityControlsReady(isReady){
      if (toggleAvailability) toggleAvailability.disabled = false;
      if (searchRequest) searchRequest.disabled = false;
      if (availabilityFeedback){
        availabilityFeedback.textContent = isReady
          ? availabilityFeedback.textContent
          : "Chargement du profil...";
      }
    }

    setAvailabilityControlsReady(false);
    logActivity("Scripts chargés, attente du profil.");

    if (availabilityCategory){
      availabilityCategory.addEventListener("change", () => {
        if (availabilityNote){
          const categoryValue = availabilityCategory.value.trim();
          availabilityNote.textContent = categoryValue
            ? `Catégorie : ${categoryValue}`
            : "Sélectionnez une catégorie";
        }
        if (availabilityFeedback){
          availabilityFeedback.textContent = "Prêt pour la recherche.";
        }
      });
    }

    if (supportBtn){
      supportBtn.addEventListener("click", () => {
        logActivity("Contact support cliqué.");
        alert("Support contacté (démo). Nous revenons vers vous rapidement.");
      });
    }

    async function handleLogout(){
      try {
        logActivity("Déconnexion demandée.");
        if (supabaseClient){
          await supabaseClient.auth.signOut();
        }
      } catch (error){
        console.warn("Erreur de déconnexion", error);
        logActivity("Erreur lors de la déconnexion.");
      } finally {
        Object.keys(window.localStorage || {}).forEach((key) => {
          if (key.includes("sb-") && key.includes("-auth-token")){
            window.localStorage.removeItem(key);
          }
        });
        alert("Vous êtes déconnecté.");
        window.location.href = "index.html";
      }
    }

    if (logoutButtons.length){
      logoutButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          handleLogout();
        });
      });
    }

    async function hydrateAvailability(userId){
      const { data } = await supabaseClient
        .from("independants")
        .select("status")
        .eq("user_id", userId)
        .maybeSingle();
      const statusValue = data?.status || "hors_ligne";
      if (availabilityStatus) availabilityStatus.textContent = statusValue === "en_ligne" ? "En ligne" : "Hors ligne";
      if (toggleAvailability){
        toggleAvailability.textContent = statusValue === "en_ligne" ? "Se mettre hors ligne" : "Se mettre en ligne";
      }
      if (availabilityNote){
        const categoryValue = availabilityCategory?.value?.trim();
        availabilityNote.textContent = categoryValue
          ? `Catégorie : ${categoryValue}`
          : "Sélectionnez une catégorie";
      }
      if (availabilityFeedback){
        availabilityFeedback.textContent = statusValue === "en_ligne"
          ? "En ligne : recherche active."
          : "En attente d'action";
      }
    }

    async function loadAssignedRequests(userId){
      if (!indepRequests) return;
      const { data: requests, error } = await supabaseClient
        .from("requests")
        .select("id, title, status, created_at, match_summary")
        .eq("assigned_indep_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error){
        indepRequests.innerHTML = "<li>Impossible de charger les missions.</li>";
        return;
      }
      if (!requests || requests.length === 0){
        indepRequests.innerHTML = "<li>Aucune mission assignée pour le moment.</li>";
        if (conversationList){
          conversationList.innerHTML = "<li>Aucune mission active.</li>";
        }
        return;
      }
      indepRequests.innerHTML = requests.map((item) => (
        `<li><strong>${item.title}</strong> — ${formatStatus(item.status)}</li>`
      )).join(\"\\n\");
      if (conversationList){
        conversationList.innerHTML = requests.map((item) => (
          `<li><button class="btn" data-request="${item.id}">${item.title}</button><div class="hint">${item.match_summary || formatStatus(item.status)}</div></li>`
        )).join(\"\\n\");
        conversationList.querySelectorAll("button[data-request]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const requestId = Number(btn.dataset.request);
            loadConversation(requestId, userId);
          });
        });
      }
    }

    function renderOpenRequests(items){
      if (!openRequests) return;
      if (!items || items.length === 0){
        openRequests.innerHTML = "<li>Aucune demande en attente actuellement.</li>";
        return;
      }
      openRequests.innerHTML = items.map((item) => (
        `<li><strong>${item.title}</strong> — ${item.category || "Sans catégorie"} · ${item.budget ? `€${item.budget}` : "Budget à définir"}</li>`
      )).join(\"\\n\");
    }

    function renderChecklist(items){
      if (!specChecklist) return;
      if (!items || items.length === 0){
        specChecklist.textContent = "Aucun cahier des charges enregistré.";
        return;
      }
      specChecklist.innerHTML = items.map((item, index) => (
        `<label style="display:flex; gap:8px; align-items:center;">
          <input type="checkbox" data-index="${index}" ${item.checked ? "checked" : ""}/>
          ${item.label}
        </label>`
      )).join("");
    }

    async function loadConversation(requestId, userId){
      const { data: request } = await supabaseClient
        .from("requests")
        .select("id, title, status, spec_checklist, negotiated_price, match_summary")
        .eq("id", requestId)
        .eq("assigned_indep_user_id", userId)
        .maybeSingle();
      if (!request) return;
      currentRequest = request;
      if (conversationTitle) conversationTitle.textContent = request.title || "Discussion";
      if (conversationStatus) conversationStatus.textContent = request.status || "nouveau";
      if (conversationHint){
        if (request.status === "en_attente"){
          conversationHint.textContent = "Demande en attente. Relancez la recherche de clients en ligne.";
        } else if (request.status === "negociation"){
          conversationHint.textContent = request.match_summary || "Messagerie instantanée pour cadrer le prix et le cahier des charges.";
        } else {
          conversationHint.textContent = "Fil principal après validation du cahier des charges.";
        }
      }
      renderChecklist(request.spec_checklist || []);
      if (negotiatedPrice) negotiatedPrice.value = request.negotiated_price || "";
      await loadMessages(request.id, request.status);
    }

    async function loadMessages(requestId, status){
      if (!messageList) return;
      const channel = status === "confirme" ? "fil" : "instant";
      const { data: messages, error } = await supabaseClient
        .from("request_messages")
        .select("sender_role, body, created_at")
        .eq("request_id", requestId)
        .eq("channel", channel)
        .order("created_at", { ascending: true });
      if (error){
        messageList.innerHTML = "<div class='hint'>Impossible de charger les messages.</div>";
        return;
      }
      if (!messages || messages.length === 0){
        messageList.innerHTML = "<div class='hint'>Aucun message pour le moment.</div>";
        return;
      }
      messageList.innerHTML = messages.map((msg) => (
        `<div><strong>${msg.sender_role}</strong> — ${msg.body}</div>`
      )).join("");
    }

    if (toggleAvailability){
      toggleAvailability.addEventListener("click", async () => {
        logActivity("Action : se mettre en ligne/hors ligne.");
        if (!profileReady){
          if (availabilityFeedback){
            availabilityFeedback.textContent = "Chargement en cours, merci de patienter.";
          }
          logActivity("Profil pas prêt, action bloquée.");
          return;
        }
        if (!supabaseClient){
          alert("Supabase n'est pas configuré.");
          logActivity("Supabase indisponible.");
          return;
        }
        const { data: { session } } = await supabaseClient.auth.getSession();
        const user = session?.user;
        if (!user){
          alert("Veuillez vous reconnecter.");
          logActivity("Session manquante, redirection.");
          window.location.href = "indep-login.html";
          return;
        }
        const categoryValue = availabilityCategory?.value?.trim();
        if (!categoryValue){
          alert("Merci de choisir une catégorie avant de passer en ligne.");
          logActivity("Catégorie manquante.");
          return;
        }
        if (availabilityFeedback){
          availabilityFeedback.textContent = "Mise à jour de votre statut...";
        }
        window.localStorage.setItem("indep-category", categoryValue);
        const { data, error } = await supabaseClient
          .from("independants")
          .select("status")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error){
          alert("Impossible de récupérer votre statut.");
          logActivity("Erreur de lecture du statut.");
          return;
        }
        const nextStatus = data?.status === "en_ligne" ? "hors_ligne" : "en_ligne";
        const { data: updatedRows, error: updateError } = await supabaseClient
          .from("independants")
          .update({ status: nextStatus })
          .eq("user_id", user.id)
          .select("user_id");
        if (updateError){
          alert("Impossible de mettre à jour votre disponibilité.");
          if (availabilityFeedback){
            availabilityFeedback.textContent = "Erreur lors de la mise à jour.";
          }
          logActivity("Erreur de mise à jour du statut.");
          return;
        }
        if (!updatedRows || updatedRows.length === 0){
          const { error: insertError } = await supabaseClient
            .from("independants")
            .insert({ user_id: user.id, status: nextStatus });
          if (insertError){
            alert("Impossible d'initialiser votre profil indépendant.");
            if (availabilityFeedback){
              availabilityFeedback.textContent = "Erreur lors de l'initialisation.";
            }
            logActivity("Erreur d'initialisation du profil.");
            return;
          }
        }
        await hydrateAvailability(user.id);
        logActivity(`Statut mis à jour : ${nextStatus}.`);
        if (nextStatus === "en_ligne"){
          const result = await runMatching(user.id);
          if (result?.message){
            alert(result.message);
            if (availabilityFeedback){
              availabilityFeedback.textContent = result.message;
            }
            logActivity(result.message);
          }
          await loadOpenRequests({ filterByCategory: true });
        }
      });
    }

    if (searchRequest){
      searchRequest.addEventListener("click", async () => {
        logActivity("Action : rechercher une demande.");
        if (!profileReady){
          if (availabilityFeedback){
            availabilityFeedback.textContent = "Chargement en cours, merci de patienter.";
          }
          logActivity("Profil pas prêt, action bloquée.");
          return;
        }
        if (!currentUserId){
          alert("Veuillez vous reconnecter.");
          logActivity("Session manquante, redirection.");
          window.location.href = "indep-login.html";
          return;
        }
        if (!availabilityCategory?.value?.trim()){
          alert("Merci de choisir une catégorie avant de rechercher.");
          logActivity("Catégorie manquante.");
          return;
        }
        if (availabilityFeedback){
          availabilityFeedback.textContent = "Recherche de demandes en cours...";
        }
        const result = await runMatching(currentUserId);
        const message = result?.message || "Recherche terminée.";
        alert(message);
        if (availabilityFeedback){
          availabilityFeedback.textContent = message;
        }
        logActivity(message);
        await loadOpenRequests({ filterByCategory: false });
      });
    }

    function normalizeSkills(skills){
      if (!skills) return [];
      return skills.toLowerCase().split(",").map((skill) => skill.trim()).filter(Boolean);
    }

    function computeScore(request, indep){
      const requestSkills = normalizeSkills(request.skills).concat(normalizeSkills(request.category));
      const indepSkills = normalizeSkills(indep.skills);
      const shared = requestSkills.filter((skill) => indepSkills.includes(skill));
      const skillScore = shared.length * 15;
      const budget = Number(request.budget || 0);
      const rate = Number(indep.daily_rate || 0);
      const budgetFit = rate ? Math.max(0, 20 - Math.abs(budget - rate * 5) / 50) : 5;
      return Math.round(skillScore + budgetFit);
    }

    function formatStatus(status){
      const map = {
        match_en_cours: "Match en cours",
        en_attente: "En attente",
        negociation: "Négociation",
        confirme: "Confirmé"
      };
      return map[status] || status || "nouveau";
    }

    async function runMatching(userId){
      if (!supabaseClient) return;
      const categoryValue = availabilityCategory?.value?.trim();
      const { data: requests, error } = await supabaseClient
        .from("requests")
        .select("id, title, category, skills, budget, status")
        .is("assigned_indep_user_id", null)
        .in("status", ["en_attente", "match_en_cours"]);
      if (error){
        return { message: "Impossible de charger les demandes (droits d'accès Supabase)." };
      }
      if (!requests || requests.length === 0){
        return { message: "Aucune demande en attente pour le moment." };
      }
      const filtered = categoryValue
        ? requests.filter((request) => request.category?.trim() === categoryValue)
        : requests;
      if (filtered.length === 0){
        return { message: "Aucune demande ne correspond à cette catégorie." };
      }
      const ranked = filtered.map((request) => ({
        request,
        score: computeScore(request, currentIndep || {})
      })).sort((a, b) => b.score - a.score);
      renderOpenRequests(ranked.slice(0, 5).map((item) => item.request));
      const best = ranked[0];
      const initialPrice = Number(best.request.budget || 0) || null;
      const { error: assignError } = await supabaseClient
        .from("requests")
        .update({
          assigned_indep_user_id: userId,
          status: "negociation",
          match_score: best.score,
          match_summary: `Match basé sur ${best.score} points (compétences et budget).`,
          negotiated_price: initialPrice
        })
        .eq("id", best.request.id);
      if (assignError){
        return { message: "Impossible d'assigner la mission (droits d'accès Supabase)." };
      }
      if (initialPrice){
        const { error: messageError } = await supabaseClient.from("request_messages").insert({
          request_id: best.request.id,
          sender_user_id: userId,
          sender_role: "system",
          channel: "instant",
          body: `Proposition initiale : ${initialPrice} € (ajustable avant validation).`
        });
        if (messageError){
          return { message: "Mission assignée, mais le message système n'a pas pu être ajouté." };
        }
      }
      await loadAssignedRequests(userId);
      return { message: `Mission assignée : ${best.request.title}` };
    }

    async function loadOpenRequests({ filterByCategory } = {}){
      if (!supabaseClient) return;
      const { data: requests, error } = await supabaseClient
        .from("requests")
        .select("id, title, category, budget, status")
        .is("assigned_indep_user_id", null)
        .in("status", ["en_attente", "match_en_cours"])
        .order("created_at", { ascending: false })
        .limit(10);
      if (error){
        renderOpenRequests([]);
        return;
      }
      let list = requests || [];
      if (filterByCategory){
        const categoryValue = availabilityCategory?.value?.trim();
        if (categoryValue){
          list = list.filter((request) => request.category?.trim() === categoryValue);
        }
      }
      renderOpenRequests(list);
    }

    async function attemptAutoMatch(userId){
      if (!supabaseClient || !availabilityCategory?.value?.trim()) return;
      const { data } = await supabaseClient
        .from("independants")
        .select("status")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.status !== "en_ligne") return;
      await runMatching(userId);
    }

    if (saveSpecBtn){
      saveSpecBtn.addEventListener("click", async () => {
        if (!currentRequest || !supabaseClient) return;
        const checklist = Array.from(specChecklist?.querySelectorAll("input[type='checkbox']") || [])
          .map((checkbox) => ({
            label: checkbox.parentElement?.textContent?.trim() || "",
            checked: checkbox.checked
          }));
        const price = negotiatedPrice?.value ? Number(negotiatedPrice.value) : null;
        await supabaseClient
          .from("requests")
          .update({ spec_checklist: checklist, negotiated_price: price })
          .eq("id", currentRequest.id);
        alert("Cahier des charges mis à jour.");
      });
    }

    if (confirmSpecBtn){
      confirmSpecBtn.addEventListener("click", async () => {
        if (!currentRequest || !supabaseClient) return;
        const agreedPrice = negotiatedPrice?.value ? Number(negotiatedPrice.value) : null;
        if (!agreedPrice){
          alert("Merci d'indiquer un prix convenu avant de confirmer.");
          return;
        }
        await supabaseClient
          .from("requests")
          .update({ status: "confirme", negotiated_price: agreedPrice })
          .eq("id", currentRequest.id);
        currentRequest.status = "confirme";
        if (conversationStatus) conversationStatus.textContent = "confirme";
        await loadMessages(currentRequest.id, currentRequest.status);
        alert("Cahier des charges confirmé. La conversation passe au fil principal.");
      });
    }

    if (sendMessage){
      sendMessage.addEventListener("click", async () => {
        if (!currentRequest || !supabaseClient || !messageInput?.value) return;
        const channel = currentRequest.status === "confirme" ? "fil" : "instant";
        const { data: { session } } = await supabaseClient.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const { error } = await supabaseClient
          .from("request_messages")
          .insert({
            request_id: currentRequest.id,
            sender_user_id: user.id,
            sender_role: "independant",
            channel,
            body: messageInput.value.trim()
          });
        if (!error){
          messageInput.value = "";
          await loadMessages(currentRequest.id, currentRequest.status);
        }
      });
    }
  
