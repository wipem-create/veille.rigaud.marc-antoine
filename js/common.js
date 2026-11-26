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
        <button class="btn" id="btn-maj" title="Lancer une collecte (nécessite serve.py)">▶ Collecter</button>
      </div></div>`;
      const btn = document.getElementById("btn-maj");
      fetch("api/status", { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(st => {
        btn.title = "Serveur local actif — lancer une collecte maintenant";
        if (st.en_cours) { btn.disabled = true; btn.textContent = "⏳ En cours"; }
      }).catch(() => { btn.textContent = "Mode hors-ligne"; btn.disabled = true; btn.title = "Lancez « python serve.py » pour activer la collecte depuis le site"; });
      btn.addEventListener("click", () => {
        btn.disabled = true; btn.textContent = "⏳ Collecte…";
        fetch("api/refresh", { method: "POST" }).then(() => {
          const t = setInterval(() => fetch("api/status", { cache: "no-store" }).then(r => r.json()).then(st => {
            if (!st.en_cours) { clearInterval(t); location.reload(); }
          }), 3000);
        });
      });
    }
    const f = document.getElementById("pied");
    if (f) f.innerHTML = `<div class="bande-diag"></div><footer><div class="wrap">
      <div><b>VEILLE//INFO</b><br>Données générées par <kbd>veille.py</kbd> le ${esc(V.genere_paris || "—")} (heure de Paris).<br>Archives : <kbd>data/archive/AAAA-MM/</kbd> · Export tableur : <kbd>data/export/*.csv</kbd></div>
      <div>H1 Cybersécurité — hebdo, collecte quotidienne dès 7h<br>H2 Intelligence artificielle — hebdo (lun→dim)<br>H3 SecOps — mensuel (1er→fin du mois)</div>
    </div><div class="bandes fines"><i></i><i></i><i></i><i></i><i></i></div></footer>`;
  });
})();
