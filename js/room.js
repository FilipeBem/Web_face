// ---------------------------------------------------------
// Estado geral
// ---------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const codigoSala = params.get("sala") || "sala-sem-nome";
const meuNome = params.get("nome") || "Convidado";

let meuPeer = null;
let meuSlot = null;
let meuStream = null;
let micLigado = true;
let camLigada = true;

// Compartilhamento de tela
let streamTela = null;
let compartilhandoTela = false;

// slotId -> { mediaConn, dataConn, nome }
const participantes = new Map();

// ---------------------------------------------------------
// Elementos da tela
// ---------------------------------------------------------
const grid = document.getElementById("video-grid");
const statusEl = document.getElementById("room-status");
const tituloEl = document.getElementById("room-title");
const subtituloEl = document.getElementById("room-sub");
const copyBtn = document.getElementById("copy-link-btn");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const screenBtn = document.getElementById("screenshare-btn");
const leaveBtn = document.getElementById("leave-btn");

tituloEl.textContent = `Sala: ${codigoSala}`;
subtituloEl.textContent = `Você entrou como ${meuNome}`;

function mostrarStatus(msg, tipo) {
  statusEl.textContent = msg;
  statusEl.classList.remove("hidden", "error");
  if (tipo === "error") statusEl.classList.add("error");
}
function esconderStatus() {
  statusEl.classList.add("hidden");
}

// ---------------------------------------------------------
// Iniciais / avatar de fallback
// ---------------------------------------------------------
function iniciais(nome) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

// ---------------------------------------------------------
// Criação dos tiles de vídeo
// ---------------------------------------------------------
function criarTile({ id, nome, stream, local }) {
  const tile = document.createElement("div");
  tile.className = "video-tile" + (local ? " is-local" : "");
  tile.dataset.tileId = id;

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  if (local) video.muted = true;
  if (stream) video.srcObject = stream;
  tile.appendChild(video);

  const nameTag = document.createElement("span");
  nameTag.className = "tile-name-tag";
  nameTag.textContent = local ? `${nome} (você)` : nome;
  tile.appendChild(nameTag);

  const micBadge = document.createElement("div");
  micBadge.className = "tile-mic-badge";
  micBadge.innerHTML = svgMic();
  tile.appendChild(micBadge);

  grid.appendChild(tile);
  return tile;
}

function removerTile(id) {
  const tile = grid.querySelector(`[data-tile-id="${CSS.escape(id)}"]`);
  if (tile) tile.remove();
}

function svgMic() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"/>
    <path d="M19 11a7 7 0 0 1-14 0"/>
    <path d="M12 18v3"/>
  </svg>`;
}

// ---------------------------------------------------------
// 1) Pega câmera/microfone locais
// ---------------------------------------------------------
async function iniciarMidiaLocal() {
  try {
    meuStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
  } catch (err) {
    mostrarStatus(
      "Não consegui acessar sua câmera/microfone. Verifique as permissões do navegador e recarregue a página.",
      "error"
    );
    throw err;
  }
  criarTile({ id: "local", nome: meuNome, stream: meuStream, local: true });
}

// ---------------------------------------------------------
// 2) Registra meu Peer numa vaga livre da sala
// ---------------------------------------------------------
function registrarNaSala(slot = 1) {
  if (slot > MAX_PARTICIPANTES) {
    mostrarStatus("Essa sala já está cheia (máximo de 8 participantes).", "error");
    return;
  }

  const idTentativa = slotParaId(codigoSala, slot);
  const peer = new Peer(idTentativa);

  peer.on("open", () => {
    meuPeer = peer;
    meuSlot = slot;
    esconderStatus();
    conectarComOutros();
    escutarConexoesRecebidas();
  });

  peer.on("error", (err) => {
    if (err.type === "unavailable-id") {
      peer.destroy();
      registrarNaSala(slot + 1);
    } else if (err.type === "peer-unavailable") {
      // Esperado: tentamos falar com uma vaga vazia. Ignora.
    } else {
      console.warn("Erro de conexão:", err);
    }
  });
}

// ---------------------------------------------------------
// 3) Ao entrar, tenta se conectar com quem já está na sala
// ---------------------------------------------------------
function conectarComOutros() {
  for (let slot = 1; slot <= MAX_PARTICIPANTES; slot++) {
    if (slot === meuSlot) continue;
    const idAlvo = slotParaId(codigoSala, slot);

    const chamada = meuPeer.call(idAlvo, meuStream, {
      metadata: { nome: meuNome },
    });
    if (chamada) {
      chamada.on("stream", (streamRemoto) => {
        adicionarParticipante(idAlvo, meuNome, chamada, streamRemoto);
      });
      aplicarTrackAtual(chamada);
    }

    const conexaoDados = meuPeer.connect(idAlvo, {
      metadata: { nome: meuNome },
      reliable: true,
    });
    configurarConexaoDados(idAlvo, conexaoDados);
  }
}

// ---------------------------------------------------------
// 4) Escuta quem chega depois e se conecta comigo
// ---------------------------------------------------------
function escutarConexoesRecebidas() {
  meuPeer.on("call", (chamada) => {
    const nomeRemoto = chamada.metadata?.nome || "Participante";
    chamada.answer(meuStream);
    chamada.on("stream", (streamRemoto) => {
      adicionarParticipante(chamada.peer, nomeRemoto, chamada, streamRemoto);
    });
    aplicarTrackAtual(chamada);
  });

  meuPeer.on("connection", (conexao) => {
    configurarConexaoDados(conexao.peer, conexao);
  });
}

function configurarConexaoDados(idRemoto, conexao) {
  conexao.on("open", () => {
    const info = participantes.get(idRemoto) || {};
    info.dataConn = conexao;
    participantes.set(idRemoto, info);
  });

  conexao.on("data", (dado) => {
    if (dado && dado.tipo === "chat") {
      const nomeRemoto = participantes.get(idRemoto)?.nome || dado.nome || "Participante";
      renderizarMensagem({ nome: nomeRemoto, texto: dado.texto, own: false });
    }
  });

  conexao.on("close", () => {
    participantes.delete(idRemoto);
    removerTile(idRemoto);
  });
}

function adicionarParticipante(idRemoto, nome, mediaConn, stream) {
  const existente = participantes.get(idRemoto);
  if (existente && existente.tileCriado) return; // evita tile duplicado

  criarTile({ id: idRemoto, nome, stream, local: false });
  participantes.set(idRemoto, {
    ...(existente || {}),
    mediaConn,
    nome,
    tileCriado: true,
  });
}

// ---------------------------------------------------------
// Compartilhamento de tela
// ---------------------------------------------------------

// Retorna a faixa de vídeo que devemos estar enviando agora:
// a da tela (se estiver compartilhando) ou a da câmera.
function trackDeVideoAtual() {
  if (compartilhandoTela && streamTela) {
    return streamTela.getVideoTracks()[0];
  }
  return meuStream.getVideoTracks()[0];
}

// Troca a faixa de vídeo enviada numa chamada específica, sem
// precisar refazer a conexão (renegociação silenciosa do WebRTC).
function aplicarTrackAtual(mediaConn) {
  const pc = mediaConn?.peerConnection;
  if (!pc) return;
  const remetente = pc.getSenders().find((s) => s.track && s.track.kind === "video");
  const novaTrack = trackDeVideoAtual();
  if (remetente && novaTrack) {
    remetente.replaceTrack(novaTrack).catch((err) => console.warn("Falha ao trocar vídeo:", err));
  }
}

function aplicarTrackParaTodos() {
  participantes.forEach((info) => {
    if (info.mediaConn) aplicarTrackAtual(info.mediaConn);
  });
}

function atualizarTileLocal(stream, rotulo) {
  const video = document.querySelector('.video-tile[data-tile-id="local"] video');
  if (video) video.srcObject = stream;
  const nameTag = document.querySelector('.video-tile[data-tile-id="local"] .tile-name-tag');
  if (nameTag) nameTag.textContent = rotulo;
}

async function iniciarCompartilhamento() {
  try {
    streamTela = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch {
    // Usuário cancelou a seleção de tela/janela. Não faz nada.
    return;
  }

  compartilhandoTela = true;
  screenBtn.classList.add("active");
  camBtn.disabled = true;

  atualizarTileLocal(streamTela, "Você (compartilhando tela)");
  aplicarTrackParaTodos();

  // Se o usuário parar pelo botão nativo do navegador ("Parar compartilhamento"),
  // detectamos aqui e voltamos pra câmera automaticamente.
  streamTela.getVideoTracks()[0].addEventListener("ended", pararCompartilhamento);
}

function pararCompartilhamento() {
  if (!compartilhandoTela) return;

  if (streamTela) streamTela.getTracks().forEach((t) => t.stop());
  streamTela = null;
  compartilhandoTela = false;
  screenBtn.classList.remove("active");
  camBtn.disabled = false;

  atualizarTileLocal(meuStream, `${meuNome} (você)`);
  aplicarTrackParaTodos();
}

screenBtn.addEventListener("click", () => {
  if (compartilhandoTela) {
    pararCompartilhamento();
  } else {
    iniciarCompartilhamento();
  }
});

// ---------------------------------------------------------
// Chat
// ---------------------------------------------------------
const chatPanel = document.getElementById("chat-panel");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatCloseBtn = document.getElementById("chat-close-btn");
const chatBtnEl = document.getElementById("chat-btn");
const chatBadge = document.getElementById("chat-badge");

let chatAberto = false;
let naoLidas = 0;

function formatarHora() {
  const agora = new Date();
  return agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function renderizarMensagem({ nome, texto, own }) {
  const li = document.createElement("li");
  li.className = "chat-msg" + (own ? " own" : "");

  const meta = document.createElement("span");
  meta.className = "chat-msg-meta";
  meta.textContent = `${own ? "Você" : nome} · ${formatarHora()}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-msg-bubble";
  bubble.textContent = texto;

  li.appendChild(meta);
  li.appendChild(bubble);
  chatMessages.appendChild(li);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (!own && !chatAberto) {
    naoLidas++;
    chatBadge.textContent = naoLidas > 9 ? "9+" : String(naoLidas);
    chatBadge.classList.remove("hidden");
  }
}

function abrirChat() {
  chatAberto = true;
  chatPanel.classList.remove("hidden");
  chatBtnEl.classList.add("active");
  naoLidas = 0;
  chatBadge.classList.add("hidden");
  chatInput.focus();
}

function fecharChat() {
  chatAberto = false;
  chatPanel.classList.add("hidden");
  chatBtnEl.classList.remove("active");
}

chatBtnEl.addEventListener("click", () => {
  chatAberto ? fecharChat() : abrirChat();
});
chatCloseBtn.addEventListener("click", fecharChat);

chatForm.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const texto = chatInput.value.trim();
  if (!texto) return;

  participantes.forEach((info) => {
    if (info.dataConn && info.dataConn.open) {
      info.dataConn.send({ tipo: "chat", nome: meuNome, texto });
    }
  });

  renderizarMensagem({ nome: meuNome, texto, own: true });
  chatInput.value = "";
  chatInput.focus();
});

// ---------------------------------------------------------
// Controles (mic / câmera / sair)
// ---------------------------------------------------------
micBtn.addEventListener("click", () => {
  if (!meuStream) return;
  micLigado = !micLigado;
  meuStream.getAudioTracks().forEach((t) => (t.enabled = micLigado));
  micBtn.classList.toggle("off", !micLigado);
});

camBtn.addEventListener("click", () => {
  if (!meuStream) return;
  camLigada = !camLigada;
  meuStream.getVideoTracks().forEach((t) => (t.enabled = camLigada));
  camBtn.classList.toggle("off", !camLigada);
});

leaveBtn.addEventListener("click", () => {
  encerrarTudo();
  window.location.href = "index.html";
});

window.addEventListener("beforeunload", encerrarTudo);

function encerrarTudo() {
  if (meuStream) meuStream.getTracks().forEach((t) => t.stop());
  if (streamTela) streamTela.getTracks().forEach((t) => t.stop());
  if (meuPeer) meuPeer.destroy();
}

// ---------------------------------------------------------
// Copiar link da sala
// ---------------------------------------------------------
copyBtn.addEventListener("click", async () => {
  const url = `${window.location.origin}${window.location.pathname.replace(
    "room.html",
    "index.html"
  )}?sala=${encodeURIComponent(codigoSala)}`;
  try {
    await navigator.clipboard.writeText(
      `${window.location.origin}${window.location.pathname}?sala=${encodeURIComponent(codigoSala)}`
    );
    const textoOriginal = copyBtn.textContent;
    copyBtn.textContent = "Link copiado!";
    setTimeout(() => (copyBtn.textContent = textoOriginal), 1800);
  } catch {
    prompt("Copie o link da sala:", window.location.href);
  }
});

// ---------------------------------------------------------
// Start
// ---------------------------------------------------------
(async function start() {
  mostrarStatus("Pedindo acesso à câmera e microfone...");
  try {
    await iniciarMidiaLocal();
  } catch {
    return; // erro já exibido
  }
  mostrarStatus("Procurando outros participantes na sala...");
  registrarNaSala(1);
})();
