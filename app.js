document.addEventListener("DOMContentLoaded", () => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];

  document.title = `${SITE_CONFIG.brand.name} | Digital Services`;
  $$("[data-brand]").forEach(el => el.textContent = SITE_CONFIG.brand.name);
  $$("[data-tagline]").forEach(el => el.textContent = SITE_CONFIG.brand.tagline);

  $("#phoneDisplay").textContent = SITE_CONFIG.contact.phoneDisplay;
  $("#phoneLink").href = `tel:${SITE_CONFIG.contact.phoneLink}`;
  $("#emailDisplay").textContent = SITE_CONFIG.contact.email;
  $("#emailLink").href = `mailto:${SITE_CONFIG.contact.email}`;
  $("#addressDisplay").textContent = SITE_CONFIG.contact.address;
  $("#mapAddress").textContent = SITE_CONFIG.contact.address;
  $("#mapLink").href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SITE_CONFIG.contact.mapQuery)}`;
  $("#footerPhone").textContent = SITE_CONFIG.contact.phoneDisplay;
  $("#footerPhone").href = `tel:${SITE_CONFIG.contact.phoneLink}`;
  $("#footerEmail").textContent = SITE_CONFIG.contact.email;
  $("#footerEmail").href = `mailto:${SITE_CONFIG.contact.email}`;
  $("#year").textContent = new Date().getFullYear();

  const waBase = `https://wa.me/${SITE_CONFIG.contact.whatsappNumber}`;
  $("#whatsappFloat").href = `${waBase}?text=${encodeURIComponent("Hello DHRUVA ONLINE AND STUDIO, I need assistance.")}`;

  ["facebook","instagram","youtube","telegram"].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.href = SITE_CONFIG.social[k];
  });

  const servicesGrid = $("#servicesGrid");
  const select = $("#serviceSelect");
  const footerServices = $("#footerServices");

  SITE_CONFIG.services.forEach((service, index) => {
    servicesGrid.insertAdjacentHTML("beforeend", `
      <article class="service-card reveal ${index % 4 === 1 ? "delay-1" : ""}">
        <div class="service-icon">${service.icon}</div>
        <h3>${escapeHtml(service.title)}</h3>
        <p>${escapeHtml(service.short)}</p>
        <button class="service-link" data-service="${escapeHtml(service.id)}" aria-label="View ${escapeHtml(service.title)} details">↗</button>
      </article>
    `);
    select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(service.id)}">${escapeHtml(service.title)}</option>`);
    footerServices.insertAdjacentHTML("beforeend", `<a href="#services" data-service="${escapeHtml(service.id)}">${escapeHtml(service.title)}</a>`);
  });

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[ch]));
  }

  const modal = $("#serviceModal");
  function openService(id) {
    const s = SITE_CONFIG.services.find(x => x.id === id);
    if (!s) return;
    $("#modalIcon").textContent = s.icon;
    $("#modalTitle").textContent = s.title;
    $("#modalDescription").textContent = s.description;
    $("#modalProcess").textContent = s.process;
    $("#modalDocs").innerHTML = s.documents.map(d => `<li>${escapeHtml(d)}</li>`).join("");
    $("#modalContact").href = `${waBase}?text=${encodeURIComponent(`Hello DHRUVA ONLINE AND STUDIO, I want assistance with: ${s.title}`)}`;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open");
  }
  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-open");
  }
  document.addEventListener("click", e => {
    const trigger = e.target.closest("[data-service]");
    if (trigger) { e.preventDefault(); openService(trigger.dataset.service); }
    if (e.target.matches("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  const menuToggle = $(".menu-toggle");
  const nav = $(".nav");
  menuToggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });
  $$(".nav a").forEach(a => a.addEventListener("click", () => {
    nav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded","false");
  }));

  $("#contactForm").addEventListener("submit", e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const service = SITE_CONFIG.services.find(s => s.id === form.get("service"));
    const text = [
      "Hello DHRUVA ONLINE AND STUDIO,",
      "",
      `Name: ${form.get("name")}`,
      `Mobile: ${form.get("phone")}`,
      `Service: ${service ? service.title : "General enquiry"}`,
      `Message: ${form.get("message")}`
    ].join("\n");
    window.open(`${waBase}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .12 });
  $$(".reveal").forEach(el => observer.observe(el));

  // Support direct service links such as #services?service=form-filling
  const params = new URLSearchParams(location.search);
  if (params.get("service")) setTimeout(() => openService(params.get("service")), 150);
});