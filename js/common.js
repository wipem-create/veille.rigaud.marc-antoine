/* VEILLE//INFO — fonctions communes à toutes les pages */
(function () {
  const V = window.VEILLE || { articles: [], sources: [], kpi: {}, historique: [], config: { horizons: {} } };
  window.V = V;
  const HZ = {
    H1: { nom: "Cybersécurité", court: "CYBER", c: "var(--h1)" },
    H2: { nom: "Intelligence artificielle", court: "IA", c: "var(--h2)" },
    H3: { nom: "SecOps", court: "SECOPS", c: "var(--h3)" }
  };
  window.HZ = HZ;
  window.SRC = Object.fromEntries((V.sources || []).map(s => [s.id, s]));

  window.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  window.dateLongue = iso => { const d = new Date(iso + "T12:00:00"); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
  window.dateCourte = iso => { const [y, m, d] = iso.split("-"); return `${d}/${m}`; };
  window.heure = iso => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  window.moisNom = iso => { const d = new Date(iso + "T12:00:00"); return `${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
  window.scoreCls = s => s >= 65 ? "s-hi" : s >= 45 ? "s-mid" : "s-lo";
  window.noteCls = n => n >= 8 ? "n-hi" : n >= 6 ? "n-mid" : "n-lo";

  /* bornes de période (jour / semaine lun→dim / mois) en dates ISO */
  window.periode = (type, refIso) => {
    const d = new Date(refIso + "T12:00:00");
    const iso = x => x.toISOString().slice(0, 10);
    if (type === "jour") return [refIso, refIso];
    if (type === "semaine") { const l = new Date(d); l.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const di = new Date(l); di.setDate(l.getDate() + 6); return [iso(l), iso(di)]; }
    const p = new Date(d.getFullYear(), d.getMonth(), 1, 12), f = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12); return [iso(p), iso(f)];
  };

  /* prochaine collecte programmée */
  window.prochaineCollecte = () => {
    const p = (V.config && V.config.planification) || { premiere_collecte: "07:00", derniere_collecte: "19:00", intervalle_heures: 2 };
    const h0 = +p.premiere_collecte.slice(0, 2), h1 = +p.derniere_collecte.slice(0, 2), pas = +p.intervalle_heures;
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    for (let h = h0; h <= h1; h += pas) if (h > now.getHours()) return `aujourd'hui ${String(h).padStart(2, "0")}h00`;
    return `demain ${String(h0).padStart(2, "0")}h00`;
  };

  /* ================================================================
     COLLECTE DEPUIS LE SITE
     - Serveur local (serve.py) détecté      → collecte locale
     - Sinon, connexion GitHub activée       → lance le workflow GitHub Actions
     - Sinon                                 → « Mode hors-ligne » (clic = activer)
     Le jeton GitHub reste uniquement dans CE navigateur (localStorage).
     ================================================================ */
  const CLE = "veille_github";
  const GH_DEF = Object.assign({ owner: "wipem-create", repo: "veille.rigaud.marc-antoine", workflow: "veille.yml" }, (V.config && V.config.github) || {});
  const lireGH = () => { try { return JSON.parse(localStorage.getItem(CLE) || "null"); } catch (e) { return null; } };
  const ecrireGH = v => { try { v ? localStorage.setItem(CLE, JSON.stringify(v)) : localStorage.removeItem(CLE); return true; } catch (e) { return false; } };
  function depotDepuisURL() {             // https://<owner>.github.io/<repo>/...
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!m) return null;
    const seg = location.pathname.split("/").filter(Boolean)[0];
    return { owner: m[1], repo: seg && !seg.endsWith(".html") ? seg : `${m[1]}.github.io` };
  }
  const gh = (conf, chemin, opts = {}) => fetch(`https://api.github.com/repos/${conf.owner}/${conf.repo}${chemin}`, Object.assign({}, opts, {
    headers: { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${conf.token}`, "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}) }
  }));

  function initCollecte() {
    const btn = document.getElementById("btn-maj"), reg = document.getElementById("btn-reglage"), led = document.getElementById("led");
    const etat = (txt, mode, titre) => {
      btn.textContent = txt; btn.title = titre || ""; btn.disabled = false;
      btn.className = "btn " + (mode === "off" ? "btn-off" : "btn-on");
      led.classList.toggle("off", mode === "off");
      reg.hidden = mode !== "gh";
    };
    btn.onclick = null;

    // 1) serveur local ?
    fetch("api/status", { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(st => {
      etat("● Local · ▶ Collecter", "local", "Serveur local actif (serve.py) — lancer une collecte maintenant");
      if (st.en_cours) { btn.disabled = true; btn.textContent = "⏳ Collecte…"; suivreLocal(); }
      btn.onclick = () => { btn.disabled = true; btn.textContent = "⏳ Collecte…"; fetch("api/refresh", { method: "POST" }).then(suivreLocal); };
    }).catch(() => {
      // 2) connexion GitHub mémorisée ?
      const conf = lireGH();
      if (conf && conf.token) {
        etat("● En ligne · ▶ Collecter", "gh", `Collecte via GitHub Actions (${conf.owner}/${conf.repo})`);
        btn.onclick = () => lancerGH(conf);
        reg.onclick = () => ouvrirModale(conf);
        gh(conf, `/actions/workflows/${conf.workflow}/runs?per_page=1`).then(r => r.json()).then(j => {
          const run = j.workflow_runs && j.workflow_runs[0];
          if (run && run.status !== "completed") suivreGH(conf, run.id, Date.now());
        }).catch(() => {});
      } else {
        // 3) hors-ligne
        etat("○ Mode hors-ligne", "off", "Cliquer pour activer la collecte en ligne depuis le site");
        btn.onclick = () => ouvrirModale(null);
      }
    });

    function suivreLocal() {
      const t = setInterval(() => fetch("api/status", { cache: "no-store" }).then(r => r.json()).then(st => {
        if (!st.en_cours) { clearInterval(t); location.reload(); }
      }), 3000);
    }

    function lancerGH(conf) {
      btn.disabled = true; btn.textContent = "⏳ Démarrage…";
      const t0 = Date.now();
      gh(conf, `/actions/workflows/${conf.workflow}/dispatches`, { method: "POST", body: JSON.stringify({ ref: conf.branche || "main" }) })
        .then(r => {
          if (r.status === 401 || r.status === 403) throw new Error("Jeton refusé ou expiré : cliquez sur ⚙ pour le remplacer.");
          if (r.status === 404) throw new Error("Workflow introuvable : vérifiez que .github/workflows/veille.yml est bien poussé.");
          if (!r.ok) throw new Error("GitHub a répondu " + r.status);
          // retrouver l'exécution qu'on vient de créer
          let essais = 0;
          const cherche = setInterval(() => {
            gh(conf, `/actions/workflows/${conf.workflow}/runs?event=workflow_dispatch&per_page=3`).then(x => x.json()).then(j => {
              const run = (j.workflow_runs || []).find(w => new Date(w.created_at).getTime() >= t0 - 60000);
              if (run) { clearInterval(cherche); suivreGH(conf, run.id, t0); }
              else if (++essais > 12) { clearInterval(cherche); etat("● En ligne · ▶ Collecter", "gh"); alert("La collecte a été demandée mais n'apparaît pas encore. Regardez l'onglet Actions du dépôt."); }
            });
          }, 4000);
        })
        .catch(e => { etat("● En ligne · ▶ Collecter", "gh"); alert(e.message); });
    }

    function suivreGH(conf, runId, t0) {
      btn.disabled = true;
      const iterAvant = V.iteration || 0;
      const tic = setInterval(() => {
        const s = Math.round((Date.now() - t0) / 1000);
        gh(conf, `/actions/runs/${runId}`).then(r => r.json()).then(run => {
          if (run.status !== "completed") { btn.textContent = `⏳ Collecte en cours · ${s}s`; return; }
          clearInterval(tic);
          if (run.conclusion !== "success") {
            etat("● En ligne · ▶ Collecter", "gh");
            if (confirm(`La collecte a échoué (${run.conclusion}). Ouvrir le détail sur GitHub ?`)) window.open(run.html_url, "_blank");
            return;
          }
          if (!/\.github\.io$/i.test(location.hostname)) {          // site ouvert en local (fichier)
            btn.textContent = "✔ Collecte terminée"; btn.disabled = false;
            alert("Collecte terminée sur GitHub.\nPour voir les nouvelles news ici : faites « git pull » dans le dossier, ou ouvrez le site en ligne.");
            return;
          }
          // attendre que GitHub Pages serve les nouvelles données puis recharger
          btn.textContent = "⏳ Publication…";
          let n = 0;
          const att = setInterval(() => {
            fetch(`data/site-data.json?t=${Date.now()}`, { cache: "no-store" }).then(r => r.json()).then(d => {
              if ((d.iteration || 0) > iterAvant || ++n > 24) { clearInterval(att); location.reload(); }
            }).catch(() => { if (++n > 24) { clearInterval(att); location.reload(); } });
          }, 5000);
        }).catch(() => {});
      }, 5000);
    }
  }

  /* ---------- fenêtre d'activation ---------- */
  function ouvrirModale(conf) {
    const def = conf || Object.assign({}, GH_DEF, depotDepuisURL() || {});
    const m = document.createElement("div");
    m.className = "modale-fond";
    m.innerHTML = `<div class="modale panel" role="dialog" aria-modal="true" aria-labelledby="mt">
      <div class="bandeau bg-H2"><span id="mt">${conf ? "COLLECTE EN LIGNE ACTIVÉE" : "ACTIVER LA COLLECTE EN LIGNE"}</span><button class="x" aria-label="Fermer">✕</button></div>
      <p>Le bouton lancera la collecte sur <b>GitHub Actions</b> (aucune commande à taper, PC éteint ou non).
        Le jeton reste <b>uniquement dans ce navigateur</b>.</p>
      <ol class="petit">
        <li>Ouvrez <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → nouveau jeton « fine-grained »</a>.</li>
        <li><b>Repository access</b> : <i>Only select repositories</i> → <b>${esc(def.repo)}</b>.</li>
        <li><b>Permissions → Actions</b> : <i>Read and write</i>. Générez et copiez le jeton.</li>
      </ol>
      <div class="champs">
        <label>Propriétaire<input id="gh-o" value="${esc(def.owner)}"></label>
        <label>Dépôt<input id="gh-r" value="${esc(def.repo)}"></label>
        <label class="large">Jeton GitHub<input id="gh-t" type="password" placeholder="github_pat_…" value="${conf ? "••••••••••••" : ""}" autocomplete="off"></label>
      </div>
      <div class="msg" id="gh-msg"></div>
      <div class="actions">
        ${conf ? `<button class="btn btn-off" id="gh-off">Désactiver</button>` : ""}
        <button class="btn" id="gh-ok">${conf ? "Enregistrer" : "▶ Activer"}</button>
      </div></div>`;
    document.body.appendChild(m);
    const fermer = () => m.remove();
    m.querySelector(".x").onclick = fermer;
    m.addEventListener("click", e => { if (e.target === m) fermer(); });
    const msg = t => (m.querySelector("#gh-msg").innerHTML = t);
    if (conf) m.querySelector("#gh-off").onclick = () => { ecrireGH(null); fermer(); initCollecte(); };
    m.querySelector("#gh-ok").onclick = async () => {
      let token = m.querySelector("#gh-t").value.trim();
      if (conf && /^•+$/.test(token)) token = conf.token;
      const c = { owner: m.querySelector("#gh-o").value.trim(), repo: m.querySelector("#gh-r").value.trim(), workflow: GH_DEF.workflow, token };
      if (!c.owner || !c.repo || !c.token) return msg("⚠ Remplissez les trois champs.");
      msg("⏳ Vérification du jeton…");
      try {
        const r1 = await gh(c, "");
        if (r1.status === 401) return msg("⚠ Jeton invalide ou expiré.");
        if (r1.status === 404) return msg("⚠ Dépôt introuvable, ou le jeton n'a pas accès à ce dépôt.");
        c.branche = (await r1.json()).default_branch || "main";
        const r2 = await gh(c, `/actions/workflows/${c.workflow}`);
        if (r2.status === 404) return msg(`⚠ Le workflow <kbd>.github/workflows/${c.workflow}</kbd> n'est pas dans le dépôt : poussez la dernière version du dossier.`);
        if (!r2.ok) return msg("⚠ Le jeton n'a pas la permission « Actions : Read and write ».");
        if (!ecrireGH(c)) return msg("⚠ Ce navigateur bloque le stockage local (navigation privée ?).");
        fermer(); initCollecte();
      } catch (e) { msg("⚠ Impossible de joindre GitHub (connexion internet ?)."); }
    };
  }

  const PAGES = [["index.html", "Accueil"], ["pipeline.html", "Pipeline"], ["actualites.html", "Actus live"], ["sources.html", "Sources"], ["kpi.html", "Fiches KPI"]];
  const ici = (location.pathname.split("/").pop() || "index.html");

  document.addEventListener("DOMContentLoaded", () => {
    const h = document.getElementById("entete");
    if (h) {
      h.innerHTML = `
      <div class="bandes"><i></i><i></i><i></i><i></i><i></i></div>
      <header class="top"><div class="top-in">
        <a class="logo" href="index.html"><span class="cart"></span><span><b>VEILLE//INFO</b><small>pilotage de veille · H1 H2 H3</small></span></a>
        <nav class="menu">${PAGES.map(([u, l]) => `<a href="${u}" class="${u === ici ? "actif" : ""}">${l}</a>`).join("")}</nav>
      </div></header>
      <div class="statusbar"><div class="wrap">
        <span><i class="led" id="led"></i>MAJ <b>${esc(V.genere_paris || "—")}</b></span>
        <span>ITÉRATION <b>#${V.iteration || 0}</b></span>
        <span>ARTICLES <b>${(V.articles || []).length}</b></span>
        <span>SOURCES OK <b>${(V.sources || []).filter(s => s.stats && s.stats.flux_ok).length}/${(V.sources || []).length}</b></span>
        <span>PROCHAINE COLLECTE <b>${prochaineCollecte()}</b></span>
        <span class="collecte-zone"><button class="btn" id="btn-maj">…</button><button class="btn btn-reglage" id="btn-reglage" title="Réglages de la collecte en ligne" hidden>⚙</button></span>
      </div></div>`;
      initCollecte();
    }
    const f = document.getElementById("pied");
    if (f) f.innerHTML = `<div class="bande-diag"></div><footer><div class="wrap">
      <div><b>VEILLE//INFO</b><br>Données générées par <kbd>veille.py</kbd> le ${esc(V.genere_paris || "—")} (heure de Paris).<br>Archives : <kbd>data/archive/AAAA-MM/</kbd> · Export tableur : <kbd>data/export/*.csv</kbd></div>
      <div>H1 Cybersécurité — hebdo, collecte quotidienne dès 7h<br>H2 Intelligence artificielle — hebdo (lun→dim)<br>H3 SecOps — mensuel (1er→fin du mois)</div>
    </div><div class="bandes fines"><i></i><i></i><i></i><i></i><i></i></div></footer>`;
  });
})();
