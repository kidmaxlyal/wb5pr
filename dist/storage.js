import { scooters, STORAGE_KEY } from "./data.js";

const validBooking = (booking) => {
  if (!booking || typeof booking !== "object") return false;
  const scooter = scooters.find((item) => item.id === booking.scooterId);
  return Boolean(
    scooter && scooter.initialStatus !== "busy" &&
    typeof booking.bookingId === "string" && booking.bookingId.length > 0 &&
    Number.isInteger(booking.hours) && booking.hours >= 1 && booking.hours <= 12 &&
    booking.price === booking.hours * scooter.pricePerHour &&
    typeof booking.createdAt === "string"
  );
};

export function loadBookings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { bookings: [], error: "" };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((booking) => !validBooking(booking)) || new Set(parsed.map((booking) => booking.scooterId)).size !== parsed.length || new Set(parsed.map((booking) => booking.bookingId)).size !== parsed.length) {
      return { bookings: [], error: "Сохранённые брони повреждены. Они не загружены; можно начать заново." };
    }
    return { bookings: parsed, error: "" };
  } catch {
    return { bookings: [], error: "Не удалось прочитать сохранённые брони. Проверьте настройки хранилища браузера." };
  }
}

export function saveBookings(bookings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedBookings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
