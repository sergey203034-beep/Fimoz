const $ = (id) => document.getElementById(id);
const form = $("loginForm");
const submitBtn = $("submitBtn");
const toast = $("toast");

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
  submitBtn.textContent = busy ? "Входим..." : "Войти";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("identifier").value.trim(); // В Supabase входим по Email
  const password = $("password").value;

  try {
    setBusy(true);

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) throw error;

    // Сохраняем сессию, которую будет читать app_main.js
    sessionStorage.setItem("proto_session", JSON.stringify({
      userId: data.user.id,
      username: data.user.user_metadata.username || data.user.email,
      signedInAt: new Date().toISOString()
    }));

    window.location.href = "./app.html";

  } catch (err) {
    toastMessage("Ошибка входа: " + err.message, "danger");
  } finally {
    setBusy(false);
  }
});