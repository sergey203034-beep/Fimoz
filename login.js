const $ = (id) => document.getElementById(id);

const form = $("loginForm");
const submitBtn = $("submitBtn");
const toast = $("toast");

const identifier = $("identifier");
const password = $("password");

const hints = {
  identifier: $("identifierHint"),
  password: $("passwordHint"),
};

function toastMessage(text, kind = "ok") {
  toast.dataset.kind = kind;
  toast.textContent = text;
  toast.style.display = "block";
  window.clearTimeout(toast.__t);
  toast.__t = window.setTimeout(() => {
    toast.style.display = "none";
  }, 3200);
}

function setBusy(busy) {
  submitBtn.disabled = busy;
  submitBtn.textContent = busy ? "Входим..." : "Войти";
}

function setInvalid(el, hintEl, msg) {
  if (!msg) {
    el.setAttribute("aria-invalid", "false");
    hintEl.textContent = "";
    hintEl.className = "hint";
    return;
  }
  el.setAttribute("aria-invalid", "true");
  hintEl.textContent = msg;
  hintEl.className = "hint hint--danger";
}

function validate() {
  let ok = true;

  const id = identifier.value.trim();
  const pw = password.value;

  if (!id) {
    setInvalid(identifier, hints.identifier, "Укажи почту или имя пользователя.");
    ok = false;
  } else {
    setInvalid(identifier, hints.identifier, null);
  }

  if (!pw) {
    setInvalid(password, hints.password, "Укажи пароль.");
    ok = false;
  } else {
    setInvalid(password, hints.password, null);
  }

  return ok;
}

$("togglePassword").addEventListener("click", () => {
  const showing = password.type === "text";
  password.type = showing ? "password" : "text";
  const btn = $("togglePassword");
  btn.textContent = showing ? "Показать" : "Скрыть";
  btn.setAttribute("aria-label", showing ? "Показать пароль" : "Скрыть пароль");
});

identifier.addEventListener("input", () => validate());
password.addEventListener("input", () => validate());

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  toast.style.display = "none";

  if (!validate()) return;

  try {
    setBusy(true);
    await fakeNetwork(450, 900);
    if (!window.UserDB) throw new Error("NO_DB");
    const res = await window.UserDB.login({ identifier: identifier.value, password: password.value });
    if (!res.ok) {
      if (res.code === "NOT_FOUND") {
        toastMessage("Аккаунт не найден. Нажми «Создать аккаунт».", "danger");
      } else if (res.code === "BAD_PASSWORD") {
        toastMessage("Неверный пароль.", "danger");
      } else {
        toastMessage("Не удалось войти. Попробуй ещё раз.", "danger");
      }
      return;
    }

    sessionStorage.setItem(
      "proto_session",
      JSON.stringify({ userId: res.user.id, username: res.user.username, signedInAt: new Date().toISOString() }),
    );
    localStorage.setItem("proto_user", JSON.stringify({ email: res.user.email, username: res.user.username }));
    window.location.href = "./app.html";
  } catch (err) {
    const msg = err && err.message === "NO_DB" ? "База данных недоступна в этом браузере." : null;
    toastMessage(msg || "Не удалось войти. Попробуй ещё раз.", "danger");
  } finally {
    setBusy(false);
  }
});

function fakeNetwork(minMs, maxMs) {
  const t = Math.floor(minMs + Math.random() * (maxMs - minMs));
  return new Promise((resolve) => setTimeout(resolve, t));
}

