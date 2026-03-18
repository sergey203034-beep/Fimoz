{
  const SUPABASE_URL = 'https://lgzwikzebvrlgosgzbr.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_e3P4SDhFiLMdj6z539dmng_lRym-gaG';

  // Ждем, пока библиотека загрузится, прежде чем создавать клиента
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const $ = (id) => document.getElementById(id);
  const form = $("loginForm");
  const submitBtn = $("submitBtn");
  const toast = $("toast");

  function toastMessage(text, kind = "ok") {
    toast.dataset.kind = kind;
    toast.textContent = text;
    toast.style.display = "block";
    window.clearTimeout(toast.__t);
    toast.__t = window.setTimeout(() => { toast.style.display = "none"; }, 3000);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const email = $("identifier").value.trim(); 
    const password = $("password").value;

    if (!email || !password) {
      toastMessage("Введите данные", "danger");
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Входим...";

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) throw error;

      // Сохраняем сессию для главного экрана
      sessionStorage.setItem("proto_session", JSON.stringify({
        userId: data.user.id,
        username: data.user.user_metadata.username || data.user.email,
        signedInAt: new Date().toISOString()
      }));

      window.location.href = "./app.html";

    } catch (err) {
      toastMessage("Ошибка: " + err.message, "danger");
      submitBtn.disabled = false;
      submitBtn.textContent = "Войти";
    }
  });
}