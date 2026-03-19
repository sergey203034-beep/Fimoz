/**
 * ПОЛНЫЙ КОД ДЛЯ login.js
 * Исправлены конфликты переменных и ошибки загрузки
 */
(function() {
    // 1. Настройки подключения
    const CONFIG = {
        URL: 'https://lgzwikzebvrlgosgzbr.supabase.co',
        KEY: 'sb_publishable_e3P4SDhFiLMdj6z539dmng_lRym-gaG' // Твой публичный ключ
    };

    let supabase = null;

    // Внутренняя функция поиска элементов (чтобы не конфликтовать с $)
    const getById = (id) => document.getElementById(id);

    // Функция инициализации
    function init() {
        // Проверяем, загружена ли библиотека из HTML
        if (!window.supabase) {
            console.log("Ожидание загрузки Supabase...");
            setTimeout(init, 100); // Пробуем снова через 0.1 сек
            return;
        }

        // Создаем клиент
        supabase = window.supabase.createClient(CONFIG.URL, CONFIG.KEY);
        console.log("Supabase готов к работе.");

        const form = getById("loginForm");
        const submitBtn = getById("submitBtn");
        const toast = getById("toast");

        if (!form) {
            console.error("Форма loginForm не найдена в HTML!");
            return;
        }

        // Обработка отправки формы
        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const emailInput = getById("identifier");
            const passInput = getById("password");

            const email = emailInput.value.trim();
            const password = passInput.value;

            if (!email || !password) {
                showToast("Введите почту и пароль", "danger");
                return;
            }

            try {
                setLoading(true);

                // Попытка входа
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password,
                });

                if (error) throw error;

                // Если вход успешен, сохраняем данные сессии
                const sessionData = {
                    userId: data.user.id,
                    username: data.user.user_metadata.username || data.user.email,
                    signedInAt: new Date().toISOString()
                };

                sessionStorage.setItem("proto_session", JSON.stringify(sessionData));

                // Перенаправляем в мессенджер
                window.location.href = "./app.html";

            } catch (err) {
                console.error("Ошибка авторизации:", err);
                showToast(err.message === "Failed to fetch" 
                    ? "Ошибка сети: не удалось связаться с базой данных" 
                    : "Ошибка: " + err.message, "danger"
                );
            } finally {
                setLoading(false);
            }
        });

        function setLoading(isLoading) {
            if (!submitBtn) return;
            submitBtn.disabled = isLoading;
            submitBtn.textContent = isLoading ? "Вход..." : "Войти";
        }

        function showToast(text, kind) {
            if (!toast) {
                alert(text);
                return;
            }
            toast.textContent = text;
            toast.dataset.kind = kind;
            toast.style.display = "block";
            setTimeout(() => { toast.style.display = "none"; }, 4000);
        }
    }

    // Запускаем процесс
    init();
})();