const $ = (id) => document.getElementById(id);

const toast = $("toast");

function toastMessage(text, kind = "ok") {
  toast.dataset.kind = kind;
  toast.textContent = text;
  toast.style.display = "block";
  window.clearTimeout(toast.__t);
  toast.__t = window.setTimeout(() => {
    toast.style.display = "none";
  }, 2600);
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const session = safeJsonParse(sessionStorage.getItem("proto_session") || "null");
const user = safeJsonParse(localStorage.getItem("proto_user") || "null");

const username = (session && session.username) || (user && user.username) || null;
if (!username) {
  toastMessage("Сессия не найдена. Верну на вход.", "danger");
  window.setTimeout(() => {
    window.location.href = "./login.html";
  }, 700);
} else {
  $("who").textContent = `Ты вошёл как ${username}`;
}

$("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("proto_session");
  toastMessage("Вышли из аккаунта.", "ok");
  window.setTimeout(() => {
    window.location.href = "./login.html";
  }, 500);
});

