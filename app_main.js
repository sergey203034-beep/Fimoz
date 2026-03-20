const SUPABASE_URL = 'https://lzgwikzebvlrgzosgzbr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_e3P4SDhFiLMdj6z539dmng_lRym-gaG';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const session = JSON.parse(sessionStorage.getItem("proto_session"));

if (!session) { window.location.href = "./login.html"; }

// ПРОВЕРЬ ЭТИ ID: они должны совпадать с твоим HTML
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const messagesList = document.querySelector(".messages__list") || document.getElementById("messagesList");

// Функция отрисовки (шаблон Discord)
function renderMessage(msg) {
    if (!messagesList) return;
    
    // Проверка: не отрисовываем ли мы дубликат?
    if (document.getElementById(`msg-${msg.id}`)) return;

    const div = document.createElement("div");
    div.id = `msg-${msg.id}`;
    div.className = "message"; // Твой класс из styles.css
    div.innerHTML = `
        <div class="message__content">
            <span class="message__author" style="color: #5865f2; font-weight: bold;">${msg.username}</span>
            <span class="message__time" style="font-size: 0.7em; color: #72767d; margin-left: 8px;">
                ${new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </span>
            <div class="message__text" style="color: #dcddde; margin-top: 4px;">${msg.text}</div>
        </div>
    `;
    messagesList.appendChild(div);
    messagesList.scrollTop = messagesList.scrollHeight;
}

// Загрузка истории
async function loadHistory() {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100);

    if (data) {
        messagesList.innerHTML = ""; 
        data.forEach(renderMessage);
    }
}

// Отправка
messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;

    const { data, error } = await supabase
        .from('messages')
        .insert([{ text: text, username: session.username, user_id: session.userId }])
        .select(); // Возвращаем созданную строку для мгновенного показа

    if (!error && data) {
        messageInput.value = "";
        renderMessage(data[0]); // Сразу показываем себе, не дожидаясь Realtime
    }
});

// Подписка на обновления (чтобы видели друзья)
supabase
    .channel('schema-db-changes')
    .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages' }, 
        (payload) => {
            console.log('Новое сообщение от друга:', payload.new);
            renderMessage(payload.new);
        }
    )
    .subscribe();

loadHistory();