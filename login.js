const $ = (id) => document.getElementById(id);

const form = $("loginForm");
const submitBtn = $("submitBtn");
const toast = $("toast");

const identifier = $("identifier");
const password = $("password");

// --- КОНФИГ SUPABASE (тот же, что в app.js) ---
const SUPABASE_URL = 'https://lzgwikzebvlrgzosgzbr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_e3P4SDhFiLMdj6z539dmng_lRym-gaG';

// Инициализация клиента
const getSupabase = () => {
  if (!window.supabase) return null;
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
};

function toastMessage(text, kind = "ok") {
  if (!toast) { alert(text); return; }
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const email = identifier.value.trim();
  const pw = password.value;

  if (!email || !pw) {
    toastMessage("Введите почту и пароль", "danger");
    return;
  }

  try {
    setBusy(true);
    const supabase = getSupabase();
    if (!supabase) throw new Error("База данных не загружена");

    // ВХОД ЧЕРЕЗ SUPABASE
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: pw,
    });

    if (error) throw error;

    // Сохраняем сессию (как и раньше, для совместимости с твоим app.html)
    const sessionData = {
      userId: data.user.id,
      username: data.user.user_metadata.username || data.user.email,
      signedInAt: new Date().toISOString()
    };
    
    sessionStorage.setItem("proto_session", JSON.stringify(sessionData));
    localStorage.setItem("proto_user", JSON.stringify({ 
      email: data.user.email, 
      username: sessionData.username 
    }));

    toastMessage("Успешный вход! Переходим в чат...", "ok");

    setTimeout(() => {
      window.location.href = "./app.html";
    }, 1000);

  } catch (err) {
    console.error("Ошибка входа:", err);
    let msg = "Не удалось войти. Проверь почту и пароль.";
    
    if (err.message.includes("Invalid login credentials")) {
        msg = "Неверная почта или пароль.";
    } else {
        msg = err.message;
    }

    toastMessage(msg, "danger");
  } finally {
    setBusy(false);
  }
});