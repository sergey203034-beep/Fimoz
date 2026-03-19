const $ = (id) => document.getElementById(id);

const form = $("registerForm");
const submitBtn = $("submitBtn");
const toast = $("toast");

// Проверь каждую букву! 
// Правильно: l z g w i k z e b v l r g z o s g z b r
const SUPABASE_URL = 'https://lzgwikzebvlrgzosgzbr.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_e3P4SDhFiLMdj6z539dmng_lRym-gaG';

// Оставь эту функцию, она защищает от ошибок загрузки
const getSupabase = () => {
  if (!window.supabase) return null;
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
};
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
      if (value.length < 6) return "Минимум 6 символов."; // Supabase требует минимум 6
      return null;
    },
  }
};

function toastMessage(text, kind = "ok") {
  if (!toast) { alert(text); return; }
  toast.dataset.kind = kind;
  toast.textContent = text;
  toast.style.display = "block";
  window.clearTimeout(toast.__t);
  toast.__t = window.setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

function setHint(key, msg) {
  const f = fields[key];
  // ПРОВЕРКА: если поля или подсказки нет в HTML, просто выходим
  if (!f || !f.el || !f.hint) return; 

  if (!msg) {
    f.el.setAttribute("aria-invalid", "false");
    f.hint.textContent = "";
    f.hint.className = "hint";
  } else {
    f.el.setAttribute("aria-invalid", "true");
    f.hint.textContent = msg;
    f.hint.className = "hint hint--danger";
  }
}

function validateAll() {
  let ok = true;
  for (const k of Object.keys(fields)) {
    const err = fields[k].validate(fields[k].el.value);
    setHint(k, err);
    if (err) ok = false;
  }
  return ok;
}

function setBusy(busy) {
  if (!submitBtn) return;
  submitBtn.disabled = busy;
  submitBtn.textContent = busy ? "Создание..." : "Продолжить";
}

// Навешиваем обработчики ввода только на существующие поля
// Находим все ключи в объекте fields (email, username, password)
Object.keys(fields).forEach(key => {
  const field = fields[key];
  // ПРОВЕРКА: вешаем событие только если элемент реально найден на странице
  if (field && field.el) {
    field.el.addEventListener("input", () => setHint(key, null));
  }
});;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  if (!validateAll()) return;

  const payload = {
    email: fields.email.el.value.trim(),
    username: fields.username.el.value.trim(),
    password: fields.password.el.value,
  };

  try {
    setBusy(true);
    
    const supabase = getSupabase();
    if (!supabase) throw new Error("БИБЛИОТЕКА_НЕ_ЗАГРУЖЕНА");

    // Регистрация в Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          username: payload.username
        }
      }
    });

    if (error) throw error;

    // Сохраняем для совместимости с твоим текущим UI
    localStorage.setItem("proto_user", JSON.stringify({ 
        email: payload.email, 
        username: payload.username 
    }));

    toastMessage("Готово! Аккаунт создан. Теперь можно войти.", "ok");
    
    // Очистка формы
    form.reset();

    // Переход на логин через 2 секунды
    setTimeout(() => {
        window.location.href = "./login.html";
    }, 2000);

  } catch (err) {
    console.error("Ошибка регистрации:", err);
    let msg = "Что-то пошло не так. Попробуй ещё раз.";
    
    if (err.message.includes("already registered")) {
        msg = "Такая почта уже занята.";
    } else if (err.message === "БИБЛИОТЕКА_НЕ_ЗАГРУЖЕНА") {
        msg = "Ошибка: база данных не загрузилась.";
    } else {
        msg = err.message;
    }

    toastMessage(msg, "danger");
  } finally {
    setBusy(false);
  }
});