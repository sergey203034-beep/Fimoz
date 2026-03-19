(function() {
    const CONFIG = {
        URL: 'https://lgzwikzebvrlgosgzbr.supabase.co',
        KEY: 'sb_publishable_e3P4SDhFiLMdj6z539dmng_lRym-gaG'
    };

    let supabase = null;

    // Безопасный поиск элементов
    const getEl = (id) => document.getElementById(id);

    function initializeApp() {
        // ПРОВЕРКА 1: Ждем саму библиотеку Supabase
        if (!window.supabase) {
            console.warn("Библиотека Supabase еще не подгрузилась, ждем 100мс...");
            setTimeout(initializeApp, 100);
            return;
        }

        // Если библиотека на месте — создаем клиента
        if (!supabase) {
            supabase = window.supabase.createClient(CONFIG.URL, CONFIG.KEY);
            console.log("Supabase успешно инициализирован!");
        }

        const form = getEl("loginForm");
        const submitBtn = getEl("submitBtn");
        const toast = getEl("toast");

        if (!form) {
            console.error("Ошибка: Форма loginForm не найдена в HTML!");
            return;
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const emailInput = getEl("identifier");
            const passInput = getEl("password");

            const email = emailInput.value.trim();
            const password = passInput.value;

            if (!email || !password) {
                alert("Введите почту и пароль!");
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

                // Сохраняем сессию
                sessionStorage.setItem("proto_session", JSON.stringify({
                    userId: data.user.id,
                    username: data.user.user_metadata.username || data.user.email,
                    signedInAt: new Date().toISOString()
                }));

                window.location.href = "./app.html";

            } catch (err) {
                console.error("Ошибка входа:", err);
                alert("Ошибка: " + err.message);
                submitBtn.disabled = false;
                submitBtn.textContent = "Войти";
            }
        });
    }

    // ПРОВЕРКА 2: Ждем, пока прогрузится сам HTML (DOM)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }
})();