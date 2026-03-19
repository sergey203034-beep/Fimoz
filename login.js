/**
 * ПОЛНЫЙ ИСПРАВЛЕННЫЙ login.js
 */
(function() {
    // 1. Константы (проверь, чтобы URL был именно твой)
    const CONFIG = {
        URL: 'https://lgzwikzebvrlgosgzbr.supabase.co',
        KEY: 'sb_publishable_e3P4SDhFiLMdj6z539dmng_lRym-gaG'
    };

    let supabase = null;

    // Внутренняя функция для поиска элементов, чтобы не было конфликтов
    const getEl = (id) => document.getElementById(id);

    // Функция, которая инициализирует всё после загрузки страницы и библиотек
    function startApp() {
        // ПРОВЕРКА: Если библиотека еще не загрузилась, ждем 100мс и пробуем снова
        if (!window.supabase) {
            console.warn("Supabase еще не загружен, ждем...");
            setTimeout(startApp, 100);
            return;
        }

        // Если библиотека на месте, создаем клиента
        supabase = window.supabase.createClient(CONFIG.URL, CONFIG.KEY);
        console.log("Supabase успешно подключен!");

        const form = getEl("loginForm");
        const submitBtn = getEl("submitBtn");
        const toast = getEl("toast");

        if (!form) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const emailInput = getEl("identifier"); // id="identifier" в HTML
            const passInput = getEl("password");   // id="password" в HTML

            const email = emailInput.value.trim();
            const password = passInput.value;

            if (!email || !password) {
                alert("Пожалуйста, введите почту и пароль");
                return;
            }

            try {
                submitBtn.disabled = true;
                submitBtn.textContent = "Вход...";

                // Попытка авторизации
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password,
                });

                if (error) throw error;

                // Сохраняем сессию (userId и никнейм из метаданных)
                const sessionData = {
                    userId: data.user.id,
                    username: data.user.user_metadata.username || data.user.email,
                    signedInAt: new Date().toISOString()
                };

                sessionStorage.setItem("proto_session", JSON.stringify(sessionData));

                // Уходим на главную
                window.location.href = "./app.html";

            } catch (err) {
                console.error("Ошибка:", err);
                alert("Ошибка входа: " + err.message);
                submitBtn.disabled = false;
                submitBtn.textContent = "Войти";
            }
        });
    }

    // Запускаем проверку готовности
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApp);
    } else {
        startApp();
    }
})();