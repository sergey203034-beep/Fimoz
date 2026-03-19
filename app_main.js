// В файлах login.js и app_main.js
const CONFIG = {
    // ВОЗЬМИ ЭТО ИЗ SETTINGS -> API в Supabase
    URL: 'https://lzgwikzebvlrgzosgzbr.supabase.co', 
    KEY: 'sb_publishable_e3P4SDhFiLMdj6z539dmng_lRym-gaG'
};


const $ = (id) => document.getElementById(id);

const toast = $("toast");
const guildListEl = $("guildList");
const channelListEl = $("channelList");
const messagesEl = $("messages");
const composer = $("composer");
const messageInput = $("messageInput");
const guildNameEl = $("guildName");
const channelNameEl = $("channelName");
const memberListEl = $("memberList");
const membersEl = $("members");
const homeViewEl = $("homeView");
const homeBodyEl = $("homeBody");
const voicePaneEl = $("voicePane");
const voicePeersEl = $("voicePeers");
const filePicker = $("filePicker");
const attachBtn = $("attachBtn");
const searchBarEl = $("searchBar");
const searchInput = $("searchInput");
const searchMeta = $("searchMeta");

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem("proto_settings") || "null") || {};
  } catch {
    return {};
  }
}

function toastMessage(text, kind = "ok") {
  toast.dataset.kind = kind;
  toast.textContent = text;
  toast.style.display = "block";
  window.clearTimeout(toast.__t);
  toast.__t = window.setTimeout(() => {
    toast.style.display = "none";
  }, 2400);
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timeHHMM(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function initials(name) {
  const n = String(name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  const a = (parts[0] || "").slice(0, 1).toUpperCase();
  const b = (parts[1] || "").slice(0, 1).toUpperCase();
  return (a + b) || a;
}

const state = {
  me: null,
  guilds: [],
  channels: [],
  activeGuildId: null,
  activeChannelId: null,
  mode: "guild", // guild | home | voice
  activeChannelType: "text",
  voiceRoom: null,
  scope: { kind: "channel", id: null }, // channel | dm
  dm: { threadId: null, peerUserId: null, peerName: null },
  replyTo: null, // { kind, id, author, content }
  search: { q: "", hits: [], idx: -1 },
};

function requireSession() {
  const session = safeJsonParse(sessionStorage.getItem("proto_session") || "null");
  const username = session && session.username ? session.username : null;
  if (!username) return null;
  return { username, userId: session && session.userId ? session.userId : null };
}

async function ensureUserId() {
  if (state.me.userId) return;
  if (!window.UserDB) return;
  const u = await window.UserDB.findUserByIdentifier(state.me.username);
  if (!u) return;
  state.me.userId = u.id;
  const session = safeJsonParse(sessionStorage.getItem("proto_session") || "null") || {};
  session.userId = u.id;
  session.username = state.me.username;
  sessionStorage.setItem("proto_session", JSON.stringify(session));
}

async function boot() {
  state.me = requireSession();
  if (!state.me) {
    toastMessage("Сессия не найдена. Верну на вход.", "danger");
    window.setTimeout(() => (window.location.href = "./login.html"), 600);
    return;
  }

  await ensureUserId();

  $("meName").textContent = state.me.username;
  $("avatar").textContent = initials(state.me.username);

  if (!window.ChatDB) {
    toastMessage("База чатов недоступна.", "danger");
    return;
  }

  if (window.SettingsUI) {
    await window.SettingsUI.init({
      session: { username: state.me.username, userId: state.me.userId },
      onLogout: () => {
        sessionStorage.removeItem("proto_session");
        window.location.href = "./login.html";
      },
      onSessionUpdate: ({ username }) => {
        if (username) {
          state.me.username = username;
          $("meName").textContent = username;
          $("avatar").textContent = initials(username);
        }
      },
    });
  }

  await window.ChatDB.ensureSeed({ username: state.me.username });
  state.guilds = await window.ChatDB.listGuilds();
  renderGuilds();

  const firstGuild = state.guilds[0];
  if (firstGuild) await setActiveGuild(firstGuild.id);
}

async function setActiveGuild(guildId) {
  await leaveVoiceIfNeeded();
  state.activeGuildId = guildId;
  const g = state.guilds.find((x) => x.id === guildId);
  guildNameEl.textContent = g ? g.name : "Сервер";

  if (window.RoleDB && state.me.userId) {
    await window.RoleDB.ensureOwner({ guildId, userId: state.me.userId });
  }

  state.channels = await window.ChatDB.listChannels(guildId);
  renderChannels();

  const firstChan = state.channels[0];
  if (firstChan) await setActiveChannel(firstChan.id);
}

async function setActiveChannel(channelId) {
  state.activeChannelId = channelId;
  const c = state.channels.find((x) => x.id === channelId);
  channelNameEl.textContent = c ? c.name : "канал";
  state.activeChannelType = (c && c.type) || "text";

  if (state.activeChannelType === "voice") {
    await enterVoiceChannel(c);
    return;
  }

  state.mode = "guild";
  state.scope = { kind: "channel", id: channelId };
  state.dm = { threadId: null, peerUserId: null, peerName: null };
  applyMode();
  await renderMessages();
  renderMembers();
}

function renderGuilds() {
  guildListEl.innerHTML = "";
  for (const g of state.guilds) {
    const btn = document.createElement("button");
    btn.className = "srvBtn";
    btn.type = "button";
    btn.title = g.name;
    btn.textContent = g.iconText || initials(g.name);
    if (g.id === state.activeGuildId) btn.classList.add("srvBtn--active");
    btn.addEventListener("click", () => setActiveGuild(g.id));
    guildListEl.appendChild(btn);
  }
}

function renderChannels() {
  channelListEl.innerHTML = "";
  for (const c of state.channels) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "chanRow";
    if (c.id === state.activeChannelId) row.classList.add("chanRow--active");
    const iconHtml =
      c.type === "voice"
        ? `<svg class="chanIcon" viewBox="0 0 24 24" aria-hidden="true">
             <path fill="currentColor" d="M11 5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h4Z"/>
             <path fill="currentColor" d="M14.6 7.2a1 1 0 0 1 1.05.1l3.7 2.78a2 2 0 0 1 0 3.19l-3.7 2.78A1 1 0 0 1 14 15.25V8.75a1 1 0 0 1 .6-1.55Z"/>
           </svg>`
        : `<span class="chanHash">#</span>`;
    row.innerHTML = `<span class="chanRow__hash">${iconHtml}</span><span class="chanRow__name">${escapeHtml(c.name)}</span>`;
    row.addEventListener("click", () => setActiveChannel(c.id));
    channelListEl.appendChild(row);
  }
}

async function renderMessages() {
  const list =
    state.scope.kind === "dm"
      ? await window.DMDB.listMessages({ threadId: state.dm.threadId, limit: 120 })
      : await window.ChatDB.listMessages(state.activeChannelId, 120);
  messagesEl.innerHTML = "";

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "msgEmpty";
    empty.textContent = state.scope.kind === "dm" ? "Пока нет сообщений. Напиши первым!" : "Пока нет сообщений. Напиши первое!";
    messagesEl.appendChild(empty);
  } else {
    const byId = new Map(list.map((m) => [m.id, m]));
    for (const m of list) {
      const el = document.createElement("article");
      el.className = "msg";
      el.dataset.mid = m.id;
      const whoRaw = m.author || "user";
      const who = escapeHtml(whoRaw);
      const deleted = !!m.deletedAt;
      const rawContent = m.content || "";
      const txt = deleted ? "Сообщение удалено" : escapeHtml(rawContent);
      const edited = !deleted && m.editedAt ? ` <span class="msg__time">(edited)</span>` : "";

      let replyHtml = "";
      if (m.replyTo) {
        const ref = byId.get(m.replyTo);
        if (ref) {
          replyHtml = `<div class="msgReply">↪ ${escapeHtml(ref.author || "user")}: ${escapeHtml(
            (ref.content || "").slice(0, 70),
          )}</div>`;
        } else {
          replyHtml = `<div class="msgReply">↪ reply</div>`;
        }
      }

      const reactions = m.reactions && typeof m.reactions === "object" ? m.reactions : {};
      const reactKeys = Object.keys(reactions);
      const reactHtml = reactKeys.length
        ? `<div class="msgReactions">${reactKeys
            .map((k) => `<button class="reactPill" type="button" data-react="${escapeHtml(k)}">${escapeHtml(k)} ${escapeHtml(String(reactions[k]))}</button>`)
            .join("")}</div>`
        : "";

      const actionHtml = `
        <div class="msgActions">
          <button class="actBtn" type="button" data-act="reply" title="Reply">↩</button>
          <button class="actBtn" type="button" data-act="react" title="React">☺</button>
          ${
            whoRaw === state.me.username && !deleted
              ? `<button class="actBtn" type="button" data-act="edit" title="Edit">✎</button>
                 <button class="actBtn actBtn--danger" type="button" data-act="delete" title="Delete">🗑</button>`
              : ""
          }
        </div>
      `;

      const contentHtml = deleted ? txt : highlightText(rawContent, state.search.q);

      el.innerHTML = `
        <div class="msg__avatar">${escapeHtml(initials(who))}</div>
        <div class="msg__body">
          <div class="msg__meta">
            <span class="msg__author">${who}</span>
            <span class="msg__time">${escapeHtml(timeHHMM(m.createdAt))}${edited}</span>
          </div>
          ${replyHtml}
          <div class="msg__text ${deleted ? "msg__text--deleted" : ""}">${contentHtml}</div>
          <div class="attachGrid" data-att="1"></div>
          ${reactHtml}
        </div>
        ${actionHtml}
      `;
      messagesEl.appendChild(el);

      // attachments
      const msgKey = state.scope.kind === "dm" ? `dm:${m.id}` : `ch:${m.id}`;
      const attList = await window.AttDB.list({ messageKey: msgKey });
      const grid = el.querySelector('[data-att="1"]');
      if (grid && attList.length) {
        for (const a of attList) {
          const item = document.createElement("div");
          item.className = "attachItem";
          if (a.type && a.type.startsWith("image/")) {
            const url = URL.createObjectURL(a.blob);
            item.innerHTML = `<img class="attachImg" src="${url}" alt="" /><div class="attachName">${escapeHtml(
              a.name,
            )}</div>`;
          } else {
            item.innerHTML = `<div class="attachName">${escapeHtml(a.name)}</div>`;
          }
          grid.appendChild(item);
        }
      }
    }

    // wire message actions (event delegation)
    messagesEl.querySelectorAll(".msgActions .actBtn").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        const act = b.dataset.act;
        const root = b.closest(".msg");
        const mid = root && root.dataset.mid;
        const listNow =
          state.scope.kind === "dm"
            ? await window.DMDB.listMessages({ threadId: state.dm.threadId, limit: 200 })
            : await window.ChatDB.listMessages(state.activeChannelId, 200);
        const msg = listNow.find((x) => x.id === mid);
        if (!msg) return;

        if (act === "reply") {
          state.replyTo = { kind: state.scope.kind, id: msg.id, author: msg.author, content: msg.content || "" };
          toastMessage(`Reply: ${msg.author}`, "ok");
          messageInput.focus();
          return;
        }
        if (act === "react") {
          const emoji = prompt("Реакция (например 👍 😂 ❤️):", "👍");
          if (!emoji) return;
          if (state.scope.kind === "dm") await window.DMDB.react({ messageId: msg.id, emoji });
          else await window.ChatDB.react({ messageId: msg.id, emoji });
          await renderMessages();
          return;
        }
        if (act === "edit") {
          const next = prompt("Изменить сообщение:", msg.content || "");
          if (next == null) return;
          if (state.scope.kind === "dm") await window.DMDB.editMessage({ messageId: msg.id, author: state.me.username, content: next });
          else await window.ChatDB.editMessage({ messageId: msg.id, author: state.me.username, content: next });
          await renderMessages();
          return;
        }
        if (act === "delete") {
          const ok = confirm("Удалить сообщение?");
          if (!ok) return;
          if (state.scope.kind === "dm") await window.DMDB.deleteMessage({ messageId: msg.id, author: state.me.username });
          else await window.ChatDB.deleteMessage({ messageId: msg.id, author: state.me.username });
          await renderMessages();
        }
      });
    });

    messagesEl.querySelectorAll(".msgReactions .reactPill").forEach((b) => {
      b.addEventListener("click", async () => {
        const root = b.closest(".msg");
        const mid = root && root.dataset.mid;
        const emoji = b.dataset.react;
        if (!mid || !emoji) return;
        if (state.scope.kind === "dm") await window.DMDB.react({ messageId: mid, emoji });
        else await window.ChatDB.react({ messageId: mid, emoji });
        await renderMessages();
      });
    });
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function highlightText(raw, q) {
  const s = String(raw || "");
  const needle = String(q || "").trim();
  if (!needle) return escapeHtml(s);
  const low = s.toLowerCase();
  const nlow = needle.toLowerCase();
  const i = low.indexOf(nlow);
  if (i < 0) return escapeHtml(s);
  const before = escapeHtml(s.slice(0, i));
  const mid = escapeHtml(s.slice(i, i + needle.length));
  const after = escapeHtml(s.slice(i + needle.length));
  return `${before}<span class="hl">${mid}</span>${after}`;
}

async function computeSearchHits(q) {
  const needle = String(q || "").trim().toLowerCase();
  if (!needle) return [];
  const list =
    state.scope.kind === "dm"
      ? await window.DMDB.listMessages({ threadId: state.dm.threadId, limit: 500 })
      : await window.ChatDB.listMessages(state.activeChannelId, 500);
  return list
    .filter((m) => !m.deletedAt)
    .filter((m) => String(m.content || "").toLowerCase().includes(needle))
    .map((m) => m.id);
}

async function applySearch(q) {
  state.search.q = q;
  state.search.hits = await computeSearchHits(q);
  state.search.idx = state.search.hits.length ? 0 : -1;
  searchMeta.textContent = state.search.hits.length ? `1 / ${state.search.hits.length}` : "0";
  await renderMessages();
  jumpToSearchHit();
}

function jumpToSearchHit() {
  if (state.search.idx < 0) return;
  const mid = state.search.hits[state.search.idx];
  const el = messagesEl.querySelector(`.msg[data-mid="${CSS.escape(mid)}"]`);
  if (el) el.scrollIntoView({ block: "center" });
  searchMeta.textContent = `${state.search.idx + 1} / ${state.search.hits.length}`;
}

$("searchBtn").addEventListener("click", () => {
  const hidden = searchBarEl.classList.contains("searchBar--hidden");
  searchBarEl.classList.toggle("searchBar--hidden", !hidden ? true : false);
  if (hidden) {
    searchBarEl.classList.remove("searchBar--hidden");
    searchInput.focus();
  } else {
    searchBarEl.classList.add("searchBar--hidden");
  }
});

$("searchClose").addEventListener("click", async () => {
  searchBarEl.classList.add("searchBar--hidden");
  searchInput.value = "";
  await applySearch("");
});

$("searchPrev").addEventListener("click", () => {
  if (!state.search.hits.length) return;
  state.search.idx = (state.search.idx - 1 + state.search.hits.length) % state.search.hits.length;
  jumpToSearchHit();
});
$("searchNext").addEventListener("click", () => {
  if (!state.search.hits.length) return;
  state.search.idx = (state.search.idx + 1) % state.search.hits.length;
  jumpToSearchHit();
});

let searchT = null;
searchInput.addEventListener("input", () => {
  window.clearTimeout(searchT);
  const q = searchInput.value;
  searchT = window.setTimeout(() => applySearch(q), 180);
});

function renderMembers() {
  // MVP: участники = ты + system
  const members = [
    { name: state.me.username, status: "online" },
    { name: "system", status: "idle" },
  ];
  memberListEl.innerHTML = "";
  for (const m of members) {
    const row = document.createElement("div");
    row.className = "memRow";
    row.innerHTML = `
      <div class="memRow__avatar">${escapeHtml(initials(m.name))}</div>
      <div class="memRow__name">${escapeHtml(m.name)}</div>
      <div class="memRow__dot memRow__dot--${escapeHtml(m.status)}"></div>
    `;
    memberListEl.appendChild(row);
  }
}

function applyMode() {
  const isHome = state.mode === "home";
  const isVoice = state.mode === "voice";
  homeViewEl.classList.toggle("homeView--hidden", !isHome);
  voicePaneEl.classList.toggle("voicePane--hidden", !isVoice);
  messagesEl.style.display = isHome || isVoice ? "none" : "";
  composer.style.display = isHome || isVoice ? "none" : "";
}

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = "";
  try {
    if (state.scope.kind === "dm") {
      await window.DMDB.addMessage({
        threadId: state.dm.threadId,
        author: state.me.username,
        content: text,
        replyTo: state.replyTo ? state.replyTo.id : null,
      });
    } else {
      await window.ChatDB.addMessage({
        channelId: state.activeChannelId,
        author: state.me.username,
        content: text,
        replyTo: state.replyTo ? state.replyTo.id : null,
      });
    }
    state.replyTo = null;
    await renderMessages();
  } catch {
    toastMessage("Не удалось отправить сообщение.", "danger");
  }
});

attachBtn.addEventListener("click", () => filePicker.click());
filePicker.addEventListener("change", async () => {
  const files = Array.from(filePicker.files || []);
  filePicker.value = "";
  if (!files.length) return;
  // Вложения в MVP добавляем к "последнему" сообщению пользователя: создаём пустое сообщение и цепляем файлы к нему.
  try {
    let msg;
    if (state.scope.kind === "dm") {
      msg = await window.DMDB.addMessage({ threadId: state.dm.threadId, author: state.me.username, content: "(attachment)" });
      await window.AttDB.add({ messageKey: `dm:${msg.id}`, files });
    } else {
      msg = await window.ChatDB.addMessage({ channelId: state.activeChannelId, author: state.me.username, content: "(attachment)" });
      await window.AttDB.add({ messageKey: `ch:${msg.id}`, files });
    }
    await renderMessages();
  } catch {
    toastMessage("Не удалось добавить вложение.", "danger");
  }
});

async function leaveVoiceIfNeeded() {
  if (state.voiceRoom) {
    try {
      state.voiceRoom.close();
    } catch {}
    state.voiceRoom = null;
  }
  if (state.mode === "voice") {
    state.mode = "guild";
    applyMode();
  }
}

async function enterVoiceChannel(chan) {
  state.mode = "voice";
  applyMode();
  $("voiceTitle").textContent = chan ? chan.name : "Voice";
  $("voiceSub").textContent = "Подключение...";
  voicePeersEl.innerHTML = "";

  await leaveVoiceIfNeeded();

  if (!window.Voice) {
    toastMessage("Голосовой модуль недоступен.", "danger");
    return;
  }
  const roomKey = `${state.activeGuildId}_${chan.id}`;
  const room = window.Voice.createRoom({
    roomKey,
    displayName: state.me.username,
    onPeers: ({ peers }) => {
      voicePeersEl.innerHTML = "";
      const me = document.createElement("div");
      me.className = "voicePeer";
      me.innerHTML = `<div class="msg__avatar" style="width:30px;height:30px;border-radius:12px">${escapeHtml(
        initials(state.me.username),
      )}</div><div class="voicePeer__name">${escapeHtml(state.me.username)} (you)</div>`;
      voicePeersEl.appendChild(me);
      for (const p of peers) {
        const el = document.createElement("div");
        el.className = "voicePeer";
        el.innerHTML = `<div class="msg__avatar" style="width:30px;height:30px;border-radius:12px">${escapeHtml(
          initials(p.name),
        )}</div><div class="voicePeer__name">${escapeHtml(p.name)}${
          p.muted ? ` <span class="msg__time">(muted)</span>` : ""
        }</div>`;
        voicePeersEl.appendChild(el);
      }
      $("voiceSub").textContent = peers.length ? `Подключено: ${peers.length + 1} участ.` : "Ожидание других...";
    },
    onState: (st) => {
      if (st && st.state === "connected") $("voiceSub").textContent = "Ожидание других...";
    },
  });
  state.voiceRoom = room;

  try {
    const s = getSettings();
    await room.join({ micDeviceId: s.micDeviceId || "", outputVolume: typeof s.outputVolume === "number" ? s.outputVolume : 1 });
    $("voiceSub").textContent = "Ожидание других...";
    if (s.ptt) {
      // PTT: по умолчанию mute, говорим только при удержании пробела
      state.voiceRoom.setMuted(true);
      $("voiceMute").textContent = "Unmute";
    }
  } catch (e) {
    toastMessage("Не удалось подключиться к микрофону/голосу.", "danger");
    $("voiceSub").textContent = "Ошибка подключения";
  }
}

$("logoutBtn").addEventListener("click", () => {
  leaveVoiceIfNeeded();
  sessionStorage.removeItem("proto_session");
  toastMessage("Вышли из аккаунта.", "ok");
  window.setTimeout(() => (window.location.href = "./login.html"), 450);
});

$("membersToggle").addEventListener("click", () => {
  membersEl.classList.toggle("members--hidden");
});

$("addGuildBtn").addEventListener("click", () => {
  (async () => {
    const name = prompt("Название сервера:", "Новый сервер");
    if (!name) return;
    try {
      const g = await window.ChatDB.createGuild({ name: name.trim() });
      if (window.RoleDB && state.me.userId) {
        await window.RoleDB.ensureOwner({ guildId: g.id, userId: state.me.userId });
      }
      state.guilds = await window.ChatDB.listGuilds();
      renderGuilds();
      await setActiveGuild(g.id);
    } catch {
      toastMessage("Не удалось создать сервер.", "danger");
    }
  })();
});

$("settingsBtn").addEventListener("click", () => {
  if (window.SettingsUI) window.SettingsUI.open();
  else toastMessage("Настройки недоступны.", "danger");
});

$("guildMenuBtn").addEventListener("click", () => {
  (async () => {
    if (!state.activeGuildId) return;
    const choice = prompt(
      "Меню сервера:\n1) Добавить текстовый канал\n2) Добавить голосовой канал\n3) Удалить сервер\n4) Роли/права (прототип)",
      "1",
    );
    if (!choice) return;
    try {
      if (choice === "1") {
        if (window.RoleDB && state.me.userId) {
          const okPerm = await window.RoleDB.hasPerm({ guildId: state.activeGuildId, userId: state.me.userId, perm: "manageChannels" });
          if (!okPerm) return toastMessage("Нет прав: manageChannels", "danger");
        }
        const name = prompt("Название канала:", "новый-канал");
        if (!name) return;
        await window.ChatDB.createChannel({ guildId: state.activeGuildId, name: name.trim(), type: "text" });
        state.channels = await window.ChatDB.listChannels(state.activeGuildId);
        renderChannels();
        return;
      }
      if (choice === "2") {
        if (window.RoleDB && state.me.userId) {
          const okPerm = await window.RoleDB.hasPerm({ guildId: state.activeGuildId, userId: state.me.userId, perm: "manageChannels" });
          if (!okPerm) return toastMessage("Нет прав: manageChannels", "danger");
        }
        const name = prompt("Название голосового канала:", "Voice");
        if (!name) return;
        await window.ChatDB.createChannel({ guildId: state.activeGuildId, name: name.trim(), type: "voice" });
        state.channels = await window.ChatDB.listChannels(state.activeGuildId);
        renderChannels();
        return;
      }
      if (choice === "3") {
        if (window.RoleDB && state.me.userId) {
          const okPerm = await window.RoleDB.hasPerm({ guildId: state.activeGuildId, userId: state.me.userId, perm: "manageGuild" });
          if (!okPerm) return toastMessage("Нет прав: manageGuild", "danger");
        }
        const ok = confirm("Удалить сервер? Это удалит каналы и сообщения (локально).");
        if (!ok) return;
        const delId = state.activeGuildId;
        await window.ChatDB.deleteGuild({ guildId: delId });
        state.guilds = await window.ChatDB.listGuilds();
        renderGuilds();
        const first = state.guilds[0];
        if (first) await setActiveGuild(first.id);
        else {
          guildNameEl.textContent = "Сервер";
          channelListEl.innerHTML = "";
          messagesEl.innerHTML = "";
        }
        return;
      }
      if (choice === "4") {
        if (!window.RoleDB || !state.me.userId) return toastMessage("Роли недоступны.", "danger");
        const sub = prompt("Роли/права:\n1) Показать мои права\n2) Создать роль (admin)\n3) Назначить себе роль по roleId", "1");
        if (!sub) return;
        if (sub === "1") {
          const a = await window.RoleDB.hasPerm({ guildId: state.activeGuildId, userId: state.me.userId, perm: "manageGuild" });
          const b = await window.RoleDB.hasPerm({ guildId: state.activeGuildId, userId: state.me.userId, perm: "manageChannels" });
          const c = await window.RoleDB.hasPerm({ guildId: state.activeGuildId, userId: state.me.userId, perm: "manageRoles" });
          alert(`manageGuild=${a}\nmanageChannels=${b}\nmanageRoles=${c}`);
          return;
        }
        if (sub === "2") {
          const name = prompt("Название роли:", "Admin");
          if (!name) return;
          const okPerm = await window.RoleDB.hasPerm({ guildId: state.activeGuildId, userId: state.me.userId, perm: "manageRoles" });
          if (!okPerm) return toastMessage("Нет прав: manageRoles", "danger");
          const r = await window.RoleDB.create({
            guildId: state.activeGuildId,
            name: name.trim(),
            perms: { manageGuild: true, manageChannels: true, manageRoles: true },
          });
          await window.RoleDB.assignToMe({ guildId: state.activeGuildId, userId: state.me.userId, roleId: r.roleId });
          toastMessage(`Роль создана и назначена: ${r.roleId}`, "ok");
          return;
        }
        if (sub === "3") {
          const roleId = prompt("roleId:", "");
          if (!roleId) return;
          const okPerm = await window.RoleDB.hasPerm({ guildId: state.activeGuildId, userId: state.me.userId, perm: "manageRoles" });
          if (!okPerm) return toastMessage("Нет прав: manageRoles", "danger");
          await window.RoleDB.assignToMe({ guildId: state.activeGuildId, userId: state.me.userId, roleId: roleId.trim() });
          toastMessage("Ок.", "ok");
        }
        return;
      }
    } catch {
      toastMessage("Операция не удалась.", "danger");
    }
  })();
});


function setHomeTab(activeId) {
  $("tabFriends").classList.toggle("homeTab--active", activeId === "friends");
  $("tabPending").classList.toggle("homeTab--active", activeId === "pending");
  $("tabAdd").classList.toggle("homeTab--active", activeId === "add");
  $("tabDMs").classList.toggle("homeTab--active", activeId === "dms");
}

async function renderHome(tab) {
  if (!window.FriendsDB || !state.me.userId) {
    homeBodyEl.innerHTML = `<p class="note">Друзья недоступны.</p>`;
    return;
  }

  if (tab === "friends") {
    const fr = await window.FriendsDB.listFriends({ userId: state.me.userId });
    if (!fr.length) {
      homeBodyEl.innerHTML = `<p class="note">Пока нет друзей. Добавь кого-нибудь во вкладке “Добавить”.</p>`;
      return;
    }
    const allUsers = await window.FriendsDB.listUsers();
    homeBodyEl.innerHTML = "";
    for (const f of fr) {
      const otherId = f.users[0] === state.me.userId ? f.users[1] : f.users[0];
      const u = allUsers.find((x) => x.id === otherId);
      const name = u ? u.username : otherId;
      const row = document.createElement("div");
      row.className = "friendRow";
      row.innerHTML = `
        <div class="friendRow__left">
          <div class="msg__avatar" style="width:34px;height:34px;border-radius:12px">${escapeHtml(initials(name))}</div>
          <div>
            <div class="friendRow__name">${escapeHtml(name)}</div>
            <div class="friendRow__sub">friend</div>
          </div>
        </div>
        <div class="friendRow__actions">
          <button class="pillBtn" data-act="dm">DM</button>
          <button class="pillBtn" data-act="remove">Remove</button>
        </div>
      `;
      row.querySelector('[data-act="dm"]').addEventListener("click", async (e) => {
        e.stopPropagation();
        await openDM(otherId, name);
      });
      row.querySelector('[data-act="remove"]').addEventListener("click", async () => {
        await window.FriendsDB.removeFriend({ userId: state.me.userId, friendUserId: otherId });
        renderHome("friends");
      });
      homeBodyEl.appendChild(row);
    }
    return;
  }

  if (tab === "pending") {
    const inc = await window.FriendsDB.listIncoming({ userId: state.me.userId });
    const out = await window.FriendsDB.listOutgoing({ userId: state.me.userId });
    const allUsers = await window.FriendsDB.listUsers();
    homeBodyEl.innerHTML = "";

    const sec1 = document.createElement("div");
    sec1.className = "setCard";
    sec1.innerHTML = `<div class="setTitle">Входящие</div>`;
    if (!inc.length) sec1.innerHTML += `<p class="note">Нет входящих заявок.</p>`;
    for (const r of inc) {
      const u = allUsers.find((x) => x.id === r.fromUserId);
      const name = u ? u.username : r.fromUserId;
      const row = document.createElement("div");
      row.className = "friendRow";
      row.innerHTML = `
        <div class="friendRow__left">
          <div class="msg__avatar" style="width:34px;height:34px;border-radius:12px">${escapeHtml(initials(name))}</div>
          <div>
            <div class="friendRow__name">${escapeHtml(name)}</div>
            <div class="friendRow__sub">request</div>
          </div>
        </div>
        <div class="friendRow__actions">
          <button class="pillBtn" data-act="accept">Accept</button>
          <button class="pillBtn" data-act="deny">Deny</button>
        </div>
      `;
      row.querySelector('[data-act="accept"]').addEventListener("click", async () => {
        await window.FriendsDB.accept({ userId: state.me.userId, requestId: r.id });
        renderHome("pending");
      });
      row.querySelector('[data-act="deny"]').addEventListener("click", async () => {
        await window.FriendsDB.deny({ userId: state.me.userId, requestId: r.id });
        renderHome("pending");
      });
      sec1.appendChild(row);
    }
    homeBodyEl.appendChild(sec1);

    const sec2 = document.createElement("div");
    sec2.className = "setCard";
    sec2.innerHTML = `<div class="setTitle">Исходящие</div>`;
    if (!out.length) sec2.innerHTML += `<p class="note">Нет исходящих заявок.</p>`;
    for (const r of out) {
      const u = allUsers.find((x) => x.id === r.toUserId);
      const name = u ? u.username : r.toUserId;
      const row = document.createElement("div");
      row.className = "friendRow";
      row.innerHTML = `
        <div class="friendRow__left">
          <div class="msg__avatar" style="width:34px;height:34px;border-radius:12px">${escapeHtml(initials(name))}</div>
          <div>
            <div class="friendRow__name">${escapeHtml(name)}</div>
            <div class="friendRow__sub">pending</div>
          </div>
        </div>
        <div class="friendRow__actions">
          <button class="pillBtn" data-act="cancel">Cancel</button>
        </div>
      `;
      row.querySelector('[data-act="cancel"]').addEventListener("click", async () => {
        await window.FriendsDB.cancel({ userId: state.me.userId, requestId: r.id });
        renderHome("pending");
      });
      sec2.appendChild(row);
    }
    homeBodyEl.appendChild(sec2);
    return;
  }

  if (tab === "dms") {
    homeBodyEl.innerHTML = "";
    const threads = await window.DMDB.listThreads({ userId: state.me.userId });
    const allUsers = await window.FriendsDB.listUsers();
    if (!threads.length) {
      homeBodyEl.innerHTML = `<p class="note">Пока нет личных сообщений. Открой диалог из списка друзей.</p>`;
      return;
    }
    for (const t of threads) {
      const otherId = t.users[0] === state.me.userId ? t.users[1] : t.users[0];
      const u = allUsers.find((x) => x.id === otherId);
      const name = u ? u.username : otherId;
      const row = document.createElement("div");
      row.className = "dmRow";
      row.innerHTML = `
        <div class="dmRow__left">
          <div class="msg__avatar" style="width:34px;height:34px;border-radius:12px">${escapeHtml(initials(name))}</div>
          <div>
            <div class="dmRow__name">${escapeHtml(name)}</div>
            <div class="dmRow__sub">DM</div>
          </div>
        </div>
      `;
      row.addEventListener("click", async () => openDM(otherId, name));
      homeBodyEl.appendChild(row);
    }
    return;
  }

  // add
  homeBodyEl.innerHTML = `
    <div class="setCard">
      <div class="setTitle">Добавить друга</div>
      <p class="note">Введи username или email пользователя, зарегистрированного в этом браузере.</p>
      <div class="miniForm__row">
        <input class="input" id="addFriendInput" placeholder="username или email" />
        <button class="primaryBtn" style="width:auto" id="addFriendBtn" type="button">Отправить</button>
      </div>
      <p class="note" id="addFriendNote"></p>
    </div>
  `;
  $("addFriendBtn").addEventListener("click", async () => {
    const val = $("addFriendInput").value.trim();
    if (!val) return;
    try {
      await window.FriendsDB.sendRequest({ fromUserId: state.me.userId, toIdentifier: val });
      $("addFriendNote").textContent = "Заявка отправлена.";
      $("addFriendInput").value = "";
    } catch (e) {
      const m = e && e.message;
      $("addFriendNote").textContent =
        m === "USER_NOT_FOUND"
          ? "Пользователь не найден."
          : m === "CANT_ADD_SELF"
            ? "Нельзя добавить самого себя."
            : m === "ALREADY_FRIENDS"
              ? "Вы уже друзья."
              : m === "REQUEST_EXISTS"
                ? "Заявка уже существует."
                : "Не удалось отправить заявку.";
    }
  });
}

async function openDM(peerUserId, peerName) {
  await leaveVoiceIfNeeded();
  if (!state.me.userId) return;
  const thread = await window.DMDB.ensureThread({ userA: state.me.userId, userB: peerUserId });
  state.scope = { kind: "dm", id: thread.id };
  state.dm = { threadId: thread.id, peerUserId, peerName };
  state.mode = "guild";
  applyMode();
  guildNameEl.textContent = "Личные сообщения";
  channelNameEl.textContent = peerName;
  await renderMessages();
  renderMembers();
}

$("homeBtn").addEventListener("click", async () => {
  await leaveVoiceIfNeeded();
  state.mode = "home";
  applyMode();
  setHomeTab("friends");
  await renderHome("friends");
});

$("tabFriends").addEventListener("click", async () => {
  setHomeTab("friends");
  await renderHome("friends");
});
$("tabPending").addEventListener("click", async () => {
  setHomeTab("pending");
  await renderHome("pending");
});
$("tabAdd").addEventListener("click", async () => {
  setHomeTab("add");
  await renderHome("add");
});

$("tabDMs").addEventListener("click", async () => {
  setHomeTab("dms");
  await renderHome("dms");
});

$("voiceLeave").addEventListener("click", async () => {
  await leaveVoiceIfNeeded();
});
$("voiceMute").addEventListener("click", () => {
  if (!state.voiceRoom) return;
  state.voiceRoom.setMuted(!state.voiceRoom.muted);
  $("voiceMute").textContent = state.voiceRoom.muted ? "Unmute" : "Mute";
});
$("voiceDeafen").addEventListener("click", () => {
  if (!state.voiceRoom) return;
  state.voiceRoom.setDeafened(!state.voiceRoom.deafened);
  $("voiceDeafen").textContent = state.voiceRoom.deafened ? "Undeafen" : "Deafen";
});

let pttDown = false;
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  if (e.repeat) return;
  const s = getSettings();
  if (!s.ptt) return;
  if (!state.voiceRoom) return;
  if (pttDown) return;
  pttDown = true;
  state.voiceRoom.setMuted(false);
  $("voiceMute").textContent = "Mute";
});
window.addEventListener("keyup", (e) => {
  if (e.code !== "Space") return;
  const s = getSettings();
  if (!s.ptt) return;
  if (!state.voiceRoom) return;
  if (!pttDown) return;
  pttDown = false;
  state.voiceRoom.setMuted(true);
  $("voiceMute").textContent = "Unmute";
});

window.addEventListener("proto_settings_changed", (e) => {
  const s = (e && e.detail) || {};
  if (state.voiceRoom && typeof s.outputVolume === "number") {
    state.voiceRoom.setOutputVolume(s.outputVolume);
  }
});

boot();

