const $ = (id) => document.getElementById(id);
const form = $("registerForm");
const submitBtn = $("submitBtn");
const toast = $("toast");

// Настройка Supabase (убедись, что библиотека подключена в HTML)
const SUPABASE_URL = 'https://lgzwikzebvrlgosgzbr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_e3P4SDhFiLMdj6z539dmng_lRym-gaG';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function toastMessage(text, kind = "ok") {
  toast.dataset.kind = kind;
  toast.textContent = text;
  toast.style.display = "block";
  window.clearTimeout(toast.__t);
  toast.__t = window.setTimeout(() => { toast.style.display = "none"; }, 3000);
}

function setBusy(busy) {
  submitBtn.disabled = busy;
  submitBtn.textContent = busy ? "Создание..." : "Продолжить";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  const username = $("username").value.trim();
  const password = $("password").value;

  if (!email || !username || password.length < 6) {
    toastMessage("Заполни все поля (пароль от 6 символов)", "danger");
    return;
  }

  try {
    setBusy(true);

    // Регистрация в Supabase
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: { username: username } // сохраняем никнейм
      }
    });

    if (error) throw error;

    toastMessage("Аккаунт создан! Теперь войди под своими данными.", "ok");
    setTimeout(() => { window.location.href = "./login.html"; }, 2000);

  } catch (err) {
    toastMessage("Ошибка: " + err.message, "danger");
  } finally {
    setBusy(false);
  }
});