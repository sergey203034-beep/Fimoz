(function() {
    // ВСТАВЬ СВОИ ДАННЫЕ ИЗ SUPABASE (Settings -> API)
    const SUPABASE_URL = 'https://lgzwikzebvrlgosgzbr.supabase.co'; 
    const SUPABASE_KEY = 'sb_publishable_e3P4SDhFiLMdj6z539dmng_lRym-gaG';

    let supabase = null;

    async function init() {
        if (!window.supabase) {
            setTimeout(init, 100);
            return;
        }
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        const form = document.getElementById("registerForm");
        const btn = document.getElementById("submitBtn");

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value;
            const username = document.getElementById("username").value.trim();

            try {
                btn.disabled = true;
                btn.textContent = "Создание...";

                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: { username: username } // Сохраняем ник в метаданные
                    }
                });

                if (error) throw error;

                alert("Успех! Теперь войди под этими данными.");
                window.location.href = "./login.html";

            } catch (err) {
                alert("Ошибка: " + err.message);
                btn.disabled = false;
                btn.textContent = "Зарегистрироваться";
            }
        });
    }

    init();
})();