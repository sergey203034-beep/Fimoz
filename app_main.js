// 1. Конфигурация
const SUPABASE_URL = 'https://lzgwikzebvlrgzosgzbr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_e3P4SDhFiLMdj6z539dmng_lRym-gaG';

// 2. Инициализация
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Получаем данные текущего пользователя из сессии (которую создал login.js)
const session = JSON.parse(sessionStorage.getItem("proto_session"));

if (!session) {
    window.location.href = "./login.html"; // Если не залогинен — на выход
}

const messageForm = document.getElementById("messageForm"); // ID твоего поля ввода
const messageInput = document.getElementById("messageInput");
const messagesList = document.getElementById("messagesList"); // Куда вешать сообщения

// --- ФУНКЦИИ ---

// 1. Отрисовка сообщения на экране
function renderMessage(msg) {
    const div = document.createElement("div");
    div.className = "message-item"; // Твой старый класс из стилей
    div.innerHTML = `
        <span class="message-author"><b>${msg.username}</b></span>
        <span class="message-text">${msg.text}</span>
    `;
    messagesList.appendChild(div);
    messagesList.scrollTop = messagesList.scrollHeight; // Прокрутка вниз
}

// 2. Загрузка истории сообщений (из базы)
async function loadHistory() {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);

    if (data) {
        messagesList.innerHTML = ""; // Очистить статику
        data.forEach(renderMessage);
    }
}

// 3. ОТПРАВКА сообщения в базу
messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;

    const { error } = await supabase
        .from('messages')
        .insert([
            { text: text, username: session.username, user_id: session.userId }
        ]);

    if (!error) {
        messageInput.value = ""; // Очистить поле
    } else {
        console.error("Ошибка отправки:", error);
    }
});

// 4. REALTIME: Магия, чтобы друзья видели сообщения мгновенно
supabase
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        renderMessage(payload.new); // Как только в базе новое сообщение — оно летит всем!
    })
    .subscribe();

// Запуск при загрузке
loadHistory();