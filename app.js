const $ = (id) => document.getElementById(id);

const form = $("registerForm");
const submitBtn = $("submitBtn");
const toast = $("toast");

const fields = {
  email: {
    el: $("email"),
    hint: $("emailHint"),
    validate(value) {
      if (!value) return "Укажи почту.";
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      if (!ok) return "Похоже, это невалидная почта.";
      return null;
    },
  },
  username: {
    el: $("username"),
    hint: $("usernameHint"),
    validate(value) {
      if (!value) return "Укажи имя пользователя.";
      const trimmed = value.trim();
      if (trimmed.length < 2) return "Минимум 2 символа.";
      if (trimmed.length > 32) return "Максимум 32 символа.";
      const ok = /^[a-zA-Z0-9._-]+$/.test(trimmed);
      if (!ok) return "Можно только латиницу, цифры и символы . _ -";
      return null;
    },
  },
  password: {
    el: $("password"),
    hint: $("passwordHint"),
    validate(value) {
      if (!value) return "Придумай пароль.";
      if (value.length < 8) return "Минимум 8 символов.";
      const strength = scorePassword(value);
      if (strength < 2) return "Слишком простой пароль. Добавь буквы разного регистра и цифры/символы.";
      return null;
    },
  },
  confirm: {
    el: $("confirm"),
    hint: $("confirmHint"),
    validate(value) {
      if (!value) return "Повтори пароль.";
      if (value !== fields.password.el.value) return "Пароли не совпадают.";
      return null;
    },
  },
  dob: {
    el: $("dob"),
    hint: $("dobHint"),
    validate(value) {
      if (!value) return null;
      const date = new Date(value + "T00:00:00");
      if (Number.isNaN(date.getTime())) return "Неверная дата.";
      const age = getAge(date);
      if (age < 13) return "Минимальный возраст — 13 лет.";
      return null;
    },
  },
};

function scorePassword(pw) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  return s;
}

function getAge(dob) {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function setHint(fieldKey, message) {
  const { el, hint } = fields[fieldKey];
  if (!message) {
    el.setAttribute("aria-invalid", "false");
    hint.textContent = "";
    hint.className = "hint";
    return;
  }
  el.setAttribute("aria-invalid", "true");
  hint.textContent = message;
  hint.className = "hint hint--danger";
}

function validateAll() {
  let ok = true;
  for (const k of Object.keys(fields)) {
    const value = fields[k].el.value;
    const msg = fields[k].validate(value);
    setHint(k, msg);
    if (msg) ok = false;
  }
  const terms = $("terms");
  if (!terms.checked) {
    toastMessage("Нужно принять условия, чтобы продолжить.", "danger");
    ok = false;
  }
  return ok;
}

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
  submitBtn.textContent = busy ? "Создаём аккаунт..." : "Продолжить";
}

for (const k of Object.keys(fields)) {
  const f = fields[k];
  f.el.addEventListener("input", () => {
    const msg = f.validate(f.el.value);
    setHint(k, msg);
  });
  f.el.addEventListener("blur", () => {
    const msg = f.validate(f.el.value);
    setHint(k, msg);
  });
}

$("togglePassword").addEventListener("click", () => {
  const pw = fields.password.el;
  const btn = $("togglePassword");
  const showing = pw.type === "text";
  pw.type = showing ? "password" : "text";
  btn.textContent = showing ? "Показать" : "Скрыть";
  btn.setAttribute("aria-label", showing ? "Показать пароль" : "Скрыть пароль");
});

$("loginLink").addEventListener("click", () => {
  // обычная ссылка, обработчик не обязателен; оставляем для будущей аналитики/телеметрии
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  toast.style.display = "none";

  if (!validateAll()) return;

  const payload = {
    email: fields.email.el.value.trim(),
    username: fields.username.el.value.trim(),
    password: fields.password.el.value,
    dob: fields.dob.el.value || null,
    createdAt: new Date().toISOString(),
  };

  try {
    setBusy(true);
    await fakeNetwork(650, 1100);

    if (!window.UserDB) throw new Error("NO_DB");
    const user = await window.UserDB.createUser({
      email: payload.email,
      username: payload.username,
      password: payload.password,
    });

    // Удобный "быстрый доступ" для текущего UI (источник истины — IndexedDB).
    localStorage.setItem("proto_user", JSON.stringify({ email: user.email, username: user.username }));
    toastMessage("Готово! Аккаунт создан. Теперь можно войти.", "ok");
    form.reset();
    for (const k of Object.keys(fields)) setHint(k, null);
  } catch (err) {
    const msg =
      err && err.message === "EMAIL_EXISTS"
        ? "Такая почта уже зарегистрирована."
        : err && err.message === "USERNAME_EXISTS"
          ? "Такой username уже занят."
          : err && err.message === "NO_DB"
            ? "База данных недоступна в этом браузере."
            : null;
    toastMessage(msg || "Что-то пошло не так. Попробуй ещё раз.", "danger");
  } finally {
    setBusy(false);
  }
});

function fakeNetwork(minMs, maxMs) {
  const t = Math.floor(minMs + Math.random() * (maxMs - minMs));
  return new Promise((resolve) => setTimeout(resolve, t));
}

