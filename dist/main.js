import { scooters } from "./data.js";
import { clearSavedBookings, loadBookings, saveBookings } from "./storage.js";

const $ = (selector) => document.querySelector(selector);
const state = { selectedId: null, type: "all", maxPrice: 500, bookings: [] };
const els = {
  map: $("#scooter-markers"), list: $("#scooter-list"), details: $("#detail-panel"),
  type: $("#type-filter"), price: $("#price-filter"), priceValue: $("#price-value"),
  count: $("#result-count"), freeCount: $("#map-free-count"), bookings: $("#bookings-list"), navCount: $("#nav-count"),
  toast: $("#toast"), clear: $("#clear-bookings"),
};
let toastTimer;
let cityMap;
const revealObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    }), { rootMargin: "0px 0px -35px 0px", threshold: 0.08 })
  : null;

function observeRevealElements() {
  if (!revealObserver) return;
  document.querySelectorAll(".section-heading, .map-layout, .fleet-header, .scooter-card, .how-steps article, .booking-card, .no-bookings")
    .forEach((element) => {
      if (element.dataset.revealObserved) return;
      element.dataset.revealObserved = "true";
      element.classList.add("reveal-in");
      revealObserver.observe(element);
    });
}

function updateCarouselControls() {
  const cards = [...els.list.querySelectorAll(".scooter-card")];
  const prev = $("#carousel-prev");
  const next = $("#carousel-next");
  const counter = $("#carousel-counter");
  if (!cards.length) {
    counter.textContent = "Нет самокатов";
    prev.disabled = true;
    next.disabled = true;
    return;
  }
  const step = cards[0].getBoundingClientRect().width + Number.parseFloat(getComputedStyle(els.list).columnGap || "0");
  const first = Math.min(cards.length - 1, Math.round(els.list.scrollLeft / step));
  const shown = Math.max(1, Math.floor((els.list.clientWidth + 12) / step));
  const last = Math.min(cards.length, first + shown);
  counter.textContent = `${first + 1}–${last} из ${cards.length}`;
  prev.disabled = els.list.scrollLeft <= 2;
  next.disabled = els.list.scrollLeft + els.list.clientWidth >= els.list.scrollWidth - 2;
}

function isBooked(id) { return state.bookings.some((booking) => booking.scooterId === id); }
function isOccupied(scooter) { return scooter.initialStatus === "busy" || isBooked(scooter.id); }
function visibleScooters() {
  return scooters.filter((scooter) => (state.type === "all" || scooter.type === state.type) && scooter.pricePerHour <= state.maxPrice);
}
function formatPrice(value) { return new Intl.NumberFormat("ru-RU").format(value); }
function modelTone(scooter) { return scooter.type === "City Pop" ? "acid" : scooter.type === "Volt S" ? "pink" : "cyan"; }
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3600);
}

function renderFilters() {
  const types = [...new Set(scooters.map((scooter) => scooter.type))];
  els.type.innerHTML = `<option value="all">Любой тип</option>${types.map((type) => `<option value="${type}">${type}</option>`).join("")}`;
}

function positionMapMarkers() {
  if (!cityMap) return;
  for (const marker of els.map.children) {
    const scooter = scooters.find(({ id }) => id === marker.dataset.scooter);
    const point = cityMap.latLngToContainerPoint(scooter.coordinates);
    marker.style.setProperty("--x", `${point.x}px`);
    marker.style.setProperty("--y", `${point.y}px`);
  }
}

function initCityMap() {
  if (!window.L) return;
  const map = $("#city-map");
  const status = $("#map-status");
  map.parentElement.classList.add("has-city-map");
  cityMap = window.L.map(map, { scrollWheelZoom: false, zoomAnimation: false, attributionControl: false });
  cityMap.fitBounds(scooters.map(({ coordinates }) => coordinates), { padding: [38, 44], maxZoom: 14 });
  const tiles = window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  });
  window.L.control.attribution({ prefix: false }).addTo(cityMap);
  tiles.on("tileerror", () => {
    status.hidden = false;
    status.textContent = "Часть карты не загрузилась. Самокаты доступны в каталоге.";
  });
  tiles.on("load", () => { status.hidden = Boolean(map.querySelector(".leaflet-tile-loaded")); });
  status.textContent = "Загружаем карту Санкт-Петербурга…";
  tiles.addTo(cityMap);
  cityMap.on("move resize", positionMapMarkers);
  requestAnimationFrame(() => cityMap.invalidateSize());
}

function renderMap(items) {
  els.map.innerHTML = items.map((scooter) => {
    const occupied = isOccupied(scooter);
    const selected = state.selectedId === scooter.id;
    const status = occupied ? "Занят" : selected ? "Выбран" : "Свободен";
    return `<button class="map-scooter ${occupied ? "is-busy" : ""} ${selected ? "is-selected" : ""}" style="--x:${scooter.x}%;--y:${scooter.y}%" type="button" data-scooter="${scooter.id}" aria-label="${scooter.name}, ${status}, ${formatPrice(scooter.pricePerHour)} рублей в час" aria-pressed="${selected}" ${occupied ? "disabled" : ""}><span class="scooter-glyph" aria-hidden="true">⌁</span><span class="marker-label">${scooter.name}</span></button>`;
  }).join("");
  positionMapMarkers();
}

function renderList(items) {
  els.list.innerHTML = items.map((scooter, index) => {
    const occupied = isOccupied(scooter);
    const selected = state.selectedId === scooter.id;
    const status = occupied ? "Занят" : selected ? "Выбран" : "Свободен";
    return `<button class="scooter-card model-${modelTone(scooter)} ${selected ? "is-selected" : ""} ${occupied ? "is-busy" : ""}" style="--card-order:${index}" type="button" data-scooter="${scooter.id}" aria-pressed="${selected}" ${occupied ? "disabled" : ""}><span class="card-media"><img src="${scooter.image}" alt="" loading="lazy" /><span class="media-index">${index + 1}</span><span class="media-signal">✳</span></span><span class="card-number"><i class="status-dot"></i> ${status}</span><span class="card-name">${scooter.name}</span><span class="card-model">${scooter.model}</span><span class="card-specs">↗ ${scooter.range} км <span>⌁ до ${scooter.speed} км/ч</span></span><span class="card-bottom"><strong>${formatPrice(scooter.pricePerHour)} ₽ <small>/ час</small></strong><span class="card-arrow">↗</span></span></button>`;
  }).join("");
}

function renderDetails() {
  const scooter = scooters.find((item) => item.id === state.selectedId);
  if (!scooter) {
    els.details.innerHTML = `<div class="detail-empty"><span class="empty-symbol">↙</span><p class="eyebrow">ТВОЙ ВЫБОР</p><h3>Выбери<br />самокат</h3><p>Нажми на свободную точку на карте или карточку ниже — здесь появятся детали и расчёт.</p><span class="detail-hint">СВОБОДНЫХ САМОКАТОВ: ${scooters.filter((item) => !isOccupied(item)).length}</span></div>`;
    return;
  }
  els.details.innerHTML = `<div class="detail-top"><span class="eyebrow">БРОНЬ САМОКАТА</span><button class="detail-close" type="button" id="deselect-scooter" aria-label="Снять выбор">×</button></div><div class="detail-media model-${modelTone(scooter)}"><img src="${scooter.image}" alt="Самокат ${scooter.name}" /></div><span class="detail-edition">${scooter.type.toUpperCase()} · ${formatPrice(scooter.pricePerHour)} ₽ / ЧАС</span><p class="detail-id"><span><i></i> СВОБОДЕН СЕЙЧАС</span><span>ЗАПАС ${scooter.range} КМ</span></p><h3>${scooter.name}</h3><p class="detail-model">${scooter.model} <span>·</span> до ${scooter.speed} км/ч</p><p class="detail-description">${scooter.description}</p><form id="booking-form" novalidate><label class="hours-label" for="hours-input">СКОЛЬКО ЕХАТЬ <span>максимум 12 часов</span></label><div class="hours-control"><button type="button" class="hours-adjust" data-step="-1" aria-label="Уменьшить время">−</button><input id="hours-input" name="hours" type="number" value="1" min="1" max="12" inputmode="numeric" required /><span>час</span><button type="button" class="hours-adjust" data-step="1" aria-label="Увеличить время">+</button></div><p class="field-error" id="hours-error" aria-live="polite"></p><div class="price-total"><span>${formatPrice(scooter.pricePerHour)} ₽ × <span id="hours-summary">1</span> час</span><strong><span id="total-price">${formatPrice(scooter.pricePerHour)}</span> ₽</strong></div><button class="book-button" type="submit">Забронировать</button><p class="demo-inline">Демо-бронирование · только в этом браузере</p></form>`;
  const input = $("#hours-input");
  const total = $("#total-price");
  const updateTotal = () => {
    const hours = Number(input.value);
    total.textContent = formatPrice(Number.isInteger(hours) && hours > 0 && hours <= 12 ? scooter.pricePerHour * hours : 0);
    $("#hours-summary").textContent = Number.isInteger(hours) && hours > 0 && hours <= 12 ? String(hours) : "—";
    $("#hours-error").textContent = "";
    input.setAttribute("aria-invalid", "false");
  };
  input.addEventListener("input", updateTotal);
  els.details.querySelectorAll(".hours-adjust").forEach((button) => button.addEventListener("click", () => {
    input.value = Math.min(12, Math.max(1, Number(input.value || 1) + Number(button.dataset.step)));
    updateTotal();
    input.focus();
  }));
  $("#booking-form").addEventListener("submit", (event) => createBooking(event, scooter, input));
  $("#deselect-scooter").addEventListener("click", () => { state.selectedId = null; render(); });
}

function renderBookings() {
  els.navCount.textContent = state.bookings.length;
  els.clear.hidden = state.bookings.length === 0;
  if (!state.bookings.length) {
    els.bookings.innerHTML = `<div class="no-bookings"><span>✳</span><p>Пока без планов. Выбери самокат и забронируй свою первую поездку.</p><a href="#rides">Найти самокат <b>↑</b></a></div>`;
    return;
  }
  els.bookings.innerHTML = state.bookings.map((booking) => {
    const scooter = scooters.find((item) => item.id === booking.scooterId);
    return `<article class="booking-card"><div class="booking-symbol model-${modelTone(scooter)}"><img src="${scooter.image}" alt="" /></div><div class="booking-info"><span class="eyebrow">БРОНЬ ${booking.bookingId.slice(-6).toUpperCase()}</span><h3>${scooter.name}</h3><p>${booking.hours} ${booking.hours === 1 ? "час" : booking.hours < 5 ? "часа" : "часов"} · ${scooter.model}</p></div><strong class="booking-price">${formatPrice(booking.price)} ₽</strong><button class="cancel-button" type="button" data-cancel="${booking.bookingId}">Отменить <span>×</span></button></article>`;
  }).join("");
}

function render() {
  const items = visibleScooters();
  if (state.selectedId && !items.some((item) => item.id === state.selectedId)) {
    state.selectedId = null;
    toast("Выбранный самокат скрыт фильтрами. Выбери другой из списка.");
  }
  renderMap(items);
  renderList(items);
  renderDetails();
  renderBookings();
  observeRevealElements();
  const countEnding = items.length % 10 === 1 && items.length % 100 !== 11 ? "самокат" : items.length % 10 >= 2 && items.length % 10 <= 4 && (items.length % 100 < 12 || items.length % 100 > 14) ? "самоката" : "самокатов";
  els.count.textContent = `${items.length} ${countEnding}`;
  const free = items.filter((scooter) => !isOccupied(scooter)).length;
  els.freeCount.textContent = `${free} ${free === 1 ? "свободный" : "свободных"}`;
  updateCarouselControls();
}

function createBooking(event, scooter, input) {
  event.preventDefault();
  const hours = Number(input.value);
  const error = $("#hours-error");
  if (!Number.isInteger(hours) || hours < 1 || hours > 12) {
    error.textContent = "Укажи целое число от 1 до 12 часов.";
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  if (isOccupied(scooter)) {
    state.selectedId = null;
    render();
    toast("Этот самокат уже занят. Выбери свободный.");
    return;
  }
  const booking = { bookingId: globalThis.crypto?.randomUUID?.() ?? `booking-${Date.now()}`, scooterId: scooter.id, hours, price: scooter.pricePerHour * hours, createdAt: new Date().toISOString() };
  const next = [...state.bookings, booking];
  if (!saveBookings(next)) {
    toast("Не удалось сохранить бронь. Проверь, разрешено ли хранилище в браузере.");
    return;
  }
  state.bookings = next;
  state.selectedId = null;
  render();
  toast("Самокат забронирован. Хорошей поездки!");
  $("#my-bookings").scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector(`[data-cancel="${booking.bookingId}"]`)?.focus();
}

function cancelBooking(bookingId) {
  const next = state.bookings.filter((booking) => booking.bookingId !== bookingId);
  if (next.length === state.bookings.length) return;
  if (!saveBookings(next)) { toast("Не удалось сохранить отмену. Проверь настройки хранилища."); return; }
  state.bookings = next;
  render();
  toast("Бронь отменена — самокат снова свободен.");
  $(".bookings-heading h2").focus();
}

function init() {
  renderFilters();
  const stored = loadBookings();
  state.bookings = stored.bookings;
  if (stored.error) toast(stored.error);
  els.type.addEventListener("change", () => { state.type = els.type.value; render(); });
  els.price.addEventListener("input", () => { state.maxPrice = Number(els.price.value); els.priceValue.textContent = els.price.value; render(); });
  $("#reset-filters").addEventListener("click", () => { state.type = "all"; state.maxPrice = 500; els.type.value = "all"; els.price.value = "500"; els.priceValue.textContent = "500"; render(); });
  $("#carousel-prev").addEventListener("click", () => els.list.scrollBy({ left: -els.list.clientWidth * 0.82, behavior: "smooth" }));
  $("#carousel-next").addEventListener("click", () => els.list.scrollBy({ left: els.list.clientWidth * 0.82, behavior: "smooth" }));
  els.list.addEventListener("scroll", updateCarouselControls, { passive: true });
  window.addEventListener("resize", updateCarouselControls);
  const backTop = $("#back-top");
  const updateBackTop = () => backTop.classList.toggle("is-visible", window.scrollY > 420);
  window.addEventListener("scroll", updateBackTop, { passive: true });
  backTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  updateBackTop();
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-scooter]");
    if (target && !target.disabled) {
      const scooterId = target.dataset.scooter;
      const origin = target.matches(".scooter-card") ? ".scooter-card" : ".map-scooter";
      state.selectedId = scooterId;
      render();
      document.querySelector(`${origin}[data-scooter="${scooterId}"]`)?.focus();
    }
    const cancel = event.target.closest("[data-cancel]");
    if (cancel) cancelBooking(cancel.dataset.cancel);
  });
  els.clear.addEventListener("click", () => {
    if (!window.confirm("Отменить все свои учебные брони?")) return;
    if (!clearSavedBookings()) { toast("Не удалось очистить брони в хранилище браузера."); return; }
    state.bookings = [];
    render();
    toast("Все брони отменены.");
  });
  render();
  updateCarouselControls();
}

window.addEventListener("DOMContentLoaded", () => {
  initCityMap();
  init();
});
